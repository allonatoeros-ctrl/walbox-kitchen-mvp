import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './_lib/sumupProviderRefRecovery.js';

// Kitchen Payment Hub V1 — Payment Cancel Hardening.
//
// Staff-facing dedicated cancel endpoint. Reuses the existing resolver/reconcile logic and RPCs
// instead of duplicating any of it — see api/kitchen-staff-sumup-reconcile.js for the sibling
// endpoint this one shares its auth/lookup pattern and provider_ref-recovery/GET logic with.
//
// Problem this closes: the client's previous cancel path (kitchen_order_cancel RPC, called directly
// from src/hooks/useKitchenOrders.js) only checks kitchen_orders.payment_status='paid' — it never
// looks at a live SumUp charge attempt still 'initiated'/'pending'. Cancelling while the customer's
// hosted checkout page is still open let the order become 'cancelled' while SumUp could still
// capture money on that checkout underneath it.
//
// Flow (design approved by Eros):
//   1. Look up the order + the live charge attempt (if any). No live attempt, or a non-sumup
//      attempt -> nothing to check remotely, go straight to the atomic cancel RPC.
//   2. Live sumup attempt -> GET the checkout from SumUp (authoritative, never trust local state).
//   3. checkout.status === 'PAID' -> resolve it via the SAME shared resolver the webhook/reconcile
//      endpoints use (applySumupCheckoutResult) and STOP: the order is never cancelled once the
//      money has actually landed.
//   4. Not paid -> DELETE the checkout. A clean delete (204/404) proceeds straight to cancel. A
//      delete REJECTED by SumUp (4xx — e.g. the checkout is no longer in a cancellable state, which
//      can mean it just turned PAID) is treated as a signal to re-verify, not ignore: one more
//      authoritative GET + the same shared resolver, and STOP if that resolves to PAID. A network
//      error or 5xx on the delete call is FAIL-CLOSED (P0 fix), not best-effort: it tells us
//      nothing about whether the checkout got deactivated, so it may still be live and payable —
//      never proceed to cancel on that uncertainty. The caller gets a retryable/blocked error
//      instead, order/attempt state is left untouched.
//   5. Atomic DB cancel: kitchen_order_cancel_with_payment_attempt (see the Payment Cancel
//      Hardening migration) locks the live attempt row before the order row — same lock order as
//      kitchen_payment_confirm — cancels the attempt and the order in one transaction, and re-checks
//      the attempt is still initiated/pending at lock time (closes the confirm-vs-cancel race: if a
//      webhook/reconcile call won that race first, this RPC raises payment_attempt_not_cancelable
//      instead of silently overriding a payment that just succeeded).
//   6. kitchen_payment_confirm itself (same migration) never lets a late PAID resolution create
//      order.status='cancelled' + payment_status='paid' — see that migration's header.
//
// Called via TWO Supabase clients on purpose (same split as kitchen-staff-sumup-reconcile.js /
// kitchen-sumup-refund.js): supabaseAdmin (service_role) for the SumUp secret + lookups + the shared
// resolver (which calls kitchen_payment_confirm, service_role_only); supabaseAsStaff (anon key + the
// caller's own JWT) for the actual cancel RPC, so auth.uid()/is_staff_for_venue resolve to the real
// staff member inside it — never evaluated by service_role, which would bypass that check entirely.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { order_id, reason } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ error: 'missing_order_id' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'missing_session' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-cancel-with-payment-check] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'invalid_session' });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, venue_id, payment_status, status')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    console.error('[kitchen-cancel-with-payment-check] order lookup failed', orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }

  // Acts as the calling staff member (their own JWT), not service_role — same pattern as
  // kitchen-staff-sumup-reconcile.js / kitchen-sumup-refund.js.
  const supabaseAsStaff = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: isStaff, error: staffCheckError } = await supabaseAsStaff.rpc('is_staff_for_venue', {
    p_venue_id: order.venue_id,
  });
  if (staffCheckError) {
    console.error('[kitchen-cancel-with-payment-check] staff check failed', staffCheckError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!isStaff) {
    return res.status(403).json({ error: 'not_staff_for_venue' });
  }

  // Idempotent: already cancelled, nothing left to do — mirrors kitchen_order_cancel's own
  // idempotent branch, checked here too so a double-click never even reaches SumUp.
  if (order.status === 'cancelled') {
    return res.status(200).json({ outcome: 'already_cancelled' });
  }

  // Same guard as kitchen_order_cancel: a currently succeeded, unrefunded charge must never be
  // silently cancelled — staff must refund first. Checked before any SumUp call: if the order is
  // already fully paid there is by definition no live attempt to reconcile.
  if (order.payment_status === 'paid') {
    return res.status(409).json({ error: 'order_already_paid_cannot_cancel' });
  }

  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, amount, provider, status, provider_ref')
    .eq('order_id', order_id)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    console.error('[kitchen-cancel-with-payment-check] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  // No live attempt, or a live attempt on a provider we never check remotely (e.g. a stray
  // counter-channel 'initiated' row — cash/manual counter payments settle synchronously and never
  // stay 'initiated' in normal operation): nothing to verify against SumUp, go straight to the
  // atomic cancel RPC, which re-locks and re-checks everything authoritatively anyway.
  if (!attempt || attempt.provider !== 'sumup') {
    return runAtomicCancel({ res, supabaseAsStaff, order_id, reason });
  }

  let providerRef = attempt.provider_ref;
  if (!providerRef) {
    const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id });
    if (!recovery.checkout) {
      // Never guess: can't verify this attempt against SumUp at all, never cancel blind.
      return res.status(200).json({
        outcome: 'unknown',
        needs_manual_reconciliation: recovery.reason === 'ambiguous',
      });
    }
    providerRef = recovery.checkout.id;
    await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
      p_attempt_id: attempt.id,
      p_provider_ref: providerRef,
    });
  }

  const checkout = await getSumupCheckout({ sumupApiKey, providerRef, attempt });
  if (checkout.outcome === 'unknown') {
    return res.status(200).json({ outcome: 'unknown' });
  }

  if (checkout.data.status === 'PAID') {
    return resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout: checkout.data });
  }

  // Not paid: best-effort DELETE, but "best-effort" only covers a SumUp-side rejection that
  // itself carries a clear signal (4xx — see 'rejected' below). A network error or 5xx tells us
  // NOTHING about whether the checkout got deactivated: it may still be live and payable on
  // SumUp's side while we go on to cancel locally — a customer could still complete payment on an
  // already-open hosted checkout page after the order shows 'cancelled'. Fail-closed policy
  // (P0 fix): when the delete's outcome is genuinely indeterminate, never proceed to cancel.
  let deleteOutcome;
  try {
    const delRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    if (delRes.ok || delRes.status === 404) {
      deleteOutcome = 'deleted';
    } else if (delRes.status >= 400 && delRes.status < 500) {
      // SumUp rejected the delete — the checkout may have just moved to a terminal state
      // (possibly PAID) underneath us. Never proceed blind: re-verify authoritatively.
      deleteOutcome = 'rejected';
    } else {
      // 5xx: SumUp's own infra hiccup — we don't know if the delete landed or not. Indeterminate,
      // fail-closed (never "best-effort proceed" — that was the P0 bug: a live, still-payable
      // checkout could be left behind while the order/attempt show cancelled).
      console.error('[kitchen-cancel-with-payment-check] SumUp DELETE checkout returned 5xx — fail-closed', delRes.status);
      deleteOutcome = 'indeterminate';
    }
  } catch (err) {
    // Network error: same indeterminate/fail-closed outcome as 5xx above — we cannot tell whether
    // the checkout was deactivated, so we never assume it's safe to cancel.
    console.error('[kitchen-cancel-with-payment-check] SumUp DELETE checkout errored — fail-closed', err);
    deleteOutcome = 'indeterminate';
  }

  if (deleteOutcome === 'indeterminate') {
    return res.status(502).json({ error: 'sumup_delete_indeterminate', retryable: true });
  }

  if (deleteOutcome === 'rejected') {
    const recheck = await getSumupCheckout({ sumupApiKey, providerRef, attempt });
    if (recheck.outcome === 'unknown') {
      return res.status(200).json({ outcome: 'unknown' });
    }
    if (recheck.data.status === 'PAID') {
      return resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout: recheck.data });
    }
    // Genuinely not paid (FAILED/EXPIRED/CANCELLED/still PENDING) despite the delete rejection:
    // proceed to cancel — the atomic RPC's own re-check under FOR UPDATE is the final authority.
  }

  return runAtomicCancel({ res, supabaseAsStaff, order_id, reason });
}

// Authoritative GET, same defensive checkout_reference check as api/kitchen-sumup-reconcile.js —
// never resolve/act on an unverified reference.
async function getSumupCheckout({ sumupApiKey, providerRef, attempt }) {
  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error('[kitchen-cancel-with-payment-check] SumUp GET checkout failed', sumupRes.status, checkout);
      return { outcome: 'unknown' };
    }
  } catch (err) {
    console.error('[kitchen-cancel-with-payment-check] unexpected error fetching checkout', err);
    return { outcome: 'unknown' };
  }

  if (checkout.checkout_reference !== attempt.id) {
    console.error('[kitchen-cancel-with-payment-check] checkout_reference mismatch', {
      attemptId: attempt.id, expected: attempt.id, got: checkout.checkout_reference,
    });
    return { outcome: 'unknown' };
  }

  return { outcome: 'ok', data: checkout };
}

// Design step 3: PAID -> resolve via the shared resolver (same confirm/fail decision the
// webhook/reconcile endpoints apply) and STOP. Never cancels the order once money has landed.
async function resolveAsPaidAndStop({ res, supabaseAdmin, attempt, checkout }) {
  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
    return res.status(409).json({ error: 'cannot_cancel_already_paid', outcome: result.outcome });
  } catch (err) {
    console.error('[kitchen-cancel-with-payment-check] confirm RPC failed while resolving PAID checkout', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}

// Design step 5: the atomic DB cancel, via the caller's own staff JWT so auth.uid()/
// is_staff_for_venue resolve correctly inside kitchen_order_cancel_with_payment_attempt.
async function runAtomicCancel({ res, supabaseAsStaff, order_id, reason }) {
  try {
    const { data, error } = await supabaseAsStaff.rpc('kitchen_order_cancel_with_payment_attempt', {
      p_order_id: order_id,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    return res.status(200).json({ outcome: 'cancelled', order: data });
  } catch (err) {
    const code = err?.message || 'cancel_failed';
    if (code.includes('order_already_paid_cannot_cancel')) {
      return res.status(409).json({ error: 'order_already_paid_cannot_cancel' });
    }
    if (code.includes('payment_attempt_not_cancelable')) {
      // Confirm-vs-cancel race: a webhook/reconcile call resolved the attempt between our SumUp
      // check and this RPC's lock. Never force-cancel over that outcome — caller should re-check.
      return res.status(409).json({ error: 'payment_attempt_not_cancelable' });
    }
    if (code.includes('not_staff_for_venue')) {
      return res.status(403).json({ error: 'not_staff_for_venue' });
    }
    if (code.includes('order_not_found')) {
      return res.status(404).json({ error: 'order_not_found' });
    }
    console.error('[kitchen-cancel-with-payment-check] cancel RPC failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}
