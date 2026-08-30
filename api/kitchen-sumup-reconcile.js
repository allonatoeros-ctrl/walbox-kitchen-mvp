import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './_lib/sumupProviderRefRecovery.js';

// Kitchen Payment Hub V1 — SumUp Online Payment Reliability Hardening — FASE 2/3.
//
// Lost-webhook recovery: the client redirect back from SumUp (`/kitchen/status?...&sumup=return`)
// is never trusted as proof of payment — it only tells us to ask the authoritative source. This
// endpoint re-checks the live SumUp checkout status for the order's current unresolved attempt and
// applies the exact same confirm/fail decision the webhook uses (api/_lib/sumupPaymentResolution.js),
// so a payment that succeeded but whose webhook never arrived (network blip, outage, firewall) still
// gets reflected in Walbox without staff intervention.
//
// Contract (see ai-ops/reports/sumup-payment-reliability-contract-v1-audit.md):
//   SUCCESS   -> retry NO   (confirmed)
//   FAILED    -> retry NO   (failed — LONG SESSION F: the same checkout may still turn PAID if the
//                             customer retries with a different card; kitchen_payment_attempt_start
//                             blocks a new attempt in this exact case, retryable must match)
//   EXPIRED   -> retry YES  (failed — the checkout itself can never turn PAID again)
//   CANCELLED -> retry YES  (failed)
//   AMOUNT MISMATCH -> retry NO (failed — Walbox-side data problem, never assumed safe)
//   PENDING   -> retry NO   (blocking)
//   UNKNOWN   -> retry NO   (blocking — no authoritative answer available, never guess)
//
// Never creates a new payment attempt. Never trusts the browser return as evidence — always calls
// GET /v0.1/checkouts/{id} against SumUp before touching any state.

// Explicit allowlist (not a denylist): retryable is true ONLY for these two genuinely-terminal
// outcomes. Everything else defaults to false — matches this codebase's "block by default, never
// guess" posture. Two vocabularies because applySumupCheckoutResult's return value (result.reason)
// is unprefixed ('expired'/'cancelled'/'failed'/'amount_mismatch') while the DB-persisted
// kitchen_payments.failure_reason column is prefixed ('sumup_expired'/'sumup_cancelled'/...).
const RETRYABLE_FAILURE_OUTCOMES = new Set(['expired', 'cancelled']);
const RETRYABLE_FAILURE_REASONS = new Set(['sumup_expired', 'sumup_cancelled']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const { order_id } = req.body || {};
  if (!order_id) {
    return res.status(400).json({ error: 'missing_order_id' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!accessToken) {
    return res.status(401).json({ error: 'missing_session' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-sumup-reconcile] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Resolve the caller's identity server-side from the bearer token instead of trusting any
  // client-supplied customer/user id — this is the ownership check for FASE 3 ("risolvi lato
  // server usando order/ownership").
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'invalid_session' });
  }
  const callerId = userData.user.id;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, customer_id, payment_status, status')
    .eq('id', order_id)
    .maybeSingle();

  if (orderError) {
    console.error('[kitchen-sumup-reconcile] order lookup failed', orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }
  if (order.customer_id !== callerId) {
    return res.status(403).json({ error: 'not_order_owner' });
  }

  if (order.payment_status === 'paid') {
    return res.status(200).json({ outcome: 'already_paid', retryable: false });
  }

  // LONG SESSION F (same-checkout retry fix): a 'failed' attempt is now also live here, but ONLY
  // when it is still same-checkout-retry-eligible (provider='sumup' AND
  // failure_reason='sumup_failed') — the exact condition kitchen_payment_attempt_start blocks on
  // and kitchen_payment_confirm allows to promote (20260830130000). A 'failed' attempt for any
  // other reason ('sumup_expired'/'sumup_cancelled'/'sumup_amount_mismatch') is genuinely terminal
  // and stays excluded here, so this endpoint never asks SumUp to re-verify something that can no
  // longer resolve to PAID.
  const { data: attempt, error: attemptError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, amount, provider, status, provider_ref')
    .eq('order_id', order_id)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    console.error('[kitchen-sumup-reconcile] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!attempt) {
    // No live attempt to reconcile: either nothing was ever started, or a prior webhook/
    // reconciliation call already resolved it (order.payment_status would then be 'paid', already
    // handled above) or failed it. Nothing blocking — client can start a fresh attempt.
    return res.status(200).json({ outcome: 'no_pending_attempt', retryable: true });
  }
  if (attempt.provider !== 'sumup') {
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  let providerRef = attempt.provider_ref;

  if (!providerRef) {
    // FASE 2: create-checkout never persisted a checkout id (SumUp 5xx, timeout, or the write
    // itself failed) — try to recover it via SumUp's own checkout_reference lookup (same id we
    // always set as checkout_reference) before giving up. Never guesses: zero/ambiguous matches
    // stay unknown/blocking, exactly like a lookup failure.
    const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id });
    if (!recovery.checkout) {
      return res.status(200).json({
        outcome: 'unknown',
        retryable: false,
        needs_manual_reconciliation: recovery.reason === 'ambiguous',
      });
    }
    providerRef = recovery.checkout.id;
    // Persist so future calls (and the autonomous sweep) don't need to recover it again — silent
    // no-op if the attempt was resolved in the meantime (see RPC header).
    await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
      p_attempt_id: attempt.id,
      p_provider_ref: providerRef,
    });
  }

  let checkout;
  try {
    const sumupRes = await fetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
    checkout = await sumupRes.json();
    if (!sumupRes.ok) {
      console.error('[kitchen-sumup-reconcile] SumUp GET checkout failed', sumupRes.status, checkout);
      return res.status(200).json({ outcome: 'unknown', retryable: false });
    }
  } catch (err) {
    console.error('[kitchen-sumup-reconcile] unexpected error fetching checkout', err);
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  if (checkout.checkout_reference !== attempt.id) {
    // Reference doesn't match what we expect for this attempt — never confirm on an unverified
    // reference, treat exactly like an inconclusive lookup.
    console.error('[kitchen-sumup-reconcile] checkout_reference mismatch', {
      attemptId: attempt.id, expected: attempt.id, got: checkout.checkout_reference,
    });
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  try {
    const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
    if (result.outcome === 'confirmed') {
      return res.status(200).json({ outcome: 'confirmed', retryable: false });
    }
    if (result.outcome === 'failed') {
      // Explicit allowlist (LONG SESSION F): only a genuinely terminal SumUp outcome is retryable.
      // 'expired'/'cancelled' -> the checkout itself can never turn PAID again, safe to start a
      // fresh attempt. 'failed' -> the SAME checkout may still be retried by the customer with a
      // different card and turn PAID later (the bug this task fixes) — kitchen_payment_attempt_start
      // now blocks a new attempt in that exact case, so this must report retryable:false to match.
      // 'amount_mismatch' -> a Walbox-side data problem, not a SumUp checkout state — deliberately
      // not allowlisted either, never assumed safe.
      return res.status(200).json({
        outcome: 'failed',
        reason: result.reason,
        retryable: RETRYABLE_FAILURE_OUTCOMES.has(result.reason),
      });
    }
    if (result.outcome === 'already_resolved') {
      // Idempotent duplicate reconciliation call (or a webhook that resolved it in the meantime):
      // re-read the settled attempt status to answer correctly instead of guessing.
      const { data: settled } = await supabaseAdmin
        .from('kitchen_payments')
        .select('status, failure_reason')
        .eq('id', attempt.id)
        .maybeSingle();
      if (settled?.status === 'succeeded') {
        return res.status(200).json({ outcome: 'confirmed', retryable: false });
      }
      if (settled?.status === 'failed') {
        return res.status(200).json({
          outcome: 'failed',
          retryable: RETRYABLE_FAILURE_REASONS.has(settled.failure_reason),
        });
      }
      // Still initiated/pending (race with a concurrent call) or an unexpected state: never guess,
      // treat like an inconclusive lookup rather than claiming it's safe to retry.
      return res.status(200).json({ outcome: 'pending', retryable: false });
    }
    // 'pending'
    return res.status(200).json({ outcome: 'pending', retryable: false });
  } catch (err) {
    console.error('[kitchen-sumup-reconcile] confirm/fail RPC failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}
