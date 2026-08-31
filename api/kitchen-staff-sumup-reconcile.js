import { createClient } from '@supabase/supabase-js';
import { applySumupCheckoutResult } from './_lib/sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './_lib/sumupProviderRefRecovery.js';

// Kitchen Payment Hub V1 — Staff-facing on-demand reconcile ("VERIFICA STATO").
//
// Same lost-webhook recovery as api/kitchen-sumup-reconcile.js (the customer-facing endpoint), but
// callable by a staff member on behalf of a customer who is stuck at the counter — the customer
// endpoint only accepts a caller whose JWT owns the order, so staff gets a hard 403 there. This is
// a deliberate separate file (Option B, see
// ai-ops/reports/staff-reconcile-endpoint-v1-audit.md#OPTION_A_VS_B) rather than an OR-branch on the
// customer endpoint, matching the existing staff/customer split (kitchen-sumup-refund.js vs the
// customer reconcile). Never creates a new payment attempt. Never trusts anything from the client
// except order_id — customer_id/venue_id are always read from the order row, authorization is
// always resolved server-side from the staff JWT via is_staff_for_venue.
//
// Authorization pattern mirrors kitchen-sumup-refund.js: a second Supabase client
// (`supabaseAsStaff`, anon key + the caller's own Bearer token) calls is_staff_for_venue(venue_id)
// directly as RPC so auth.uid() resolves to the actual staff member inside that SECURITY DEFINER
// function — never reimplemented as a kitchen_staff_members query in Node, and never evaluated by
// service_role (which would bypass the check entirely). The confirm/fail decision itself always
// runs on supabaseAdmin (service_role), exactly like the customer endpoint and the webhook —
// kitchen_payment_confirm has no staff-callable branch (see audit AUTH_GAP), so this handler is the
// only place staff authorization is enforced, strictly before applySumupCheckoutResult.
//
// Response shape mirrors the customer endpoint — never a raw SumUp payload, never provider_ref.

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
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-staff-sumup-reconcile] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Resolve the caller's identity server-side from the bearer token instead of trusting any
  // client-supplied id — same invariant as the customer endpoint.
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
    console.error('[kitchen-staff-sumup-reconcile] order lookup failed', orderError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!order) {
    return res.status(404).json({ error: 'order_not_found' });
  }

  // Acts as the calling staff member (their own JWT), not service_role, so auth.uid() resolves
  // correctly inside is_staff_for_venue — never reimplemented as a direct table query here.
  const supabaseAsStaff = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: isStaff, error: staffCheckError } = await supabaseAsStaff.rpc('is_staff_for_venue', {
    p_venue_id: order.venue_id,
  });
  if (staffCheckError) {
    console.error('[kitchen-staff-sumup-reconcile] staff check failed', staffCheckError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!isStaff) {
    return res.status(403).json({ error: 'not_staff_for_venue' });
  }

  if (order.payment_status === 'paid') {
    return res.status(200).json({ outcome: 'already_paid', retryable: false });
  }

  // Same filter as the customer endpoint: a 'failed' attempt is only live here when it is still
  // same-checkout-retry-eligible (see kitchen-sumup-reconcile.js for the full rationale).
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
    console.error('[kitchen-staff-sumup-reconcile] attempt lookup failed', attemptError);
    return res.status(500).json({ error: 'internal_server_error' });
  }
  if (!attempt) {
    return res.status(200).json({ outcome: 'no_pending_attempt', retryable: true });
  }
  if (attempt.provider !== 'sumup') {
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  let providerRef = attempt.provider_ref;

  if (!providerRef) {
    const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id });
    if (!recovery.checkout) {
      return res.status(200).json({
        outcome: 'unknown',
        retryable: false,
        needs_manual_reconciliation: recovery.reason === 'ambiguous',
      });
    }
    providerRef = recovery.checkout.id;
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
      console.error('[kitchen-staff-sumup-reconcile] SumUp GET checkout failed', sumupRes.status, checkout);
      return res.status(200).json({ outcome: 'unknown', retryable: false });
    }
  } catch (err) {
    console.error('[kitchen-staff-sumup-reconcile] unexpected error fetching checkout', err);
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  if (checkout.checkout_reference !== attempt.id) {
    console.error('[kitchen-staff-sumup-reconcile] checkout_reference mismatch', {
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
      return res.status(200).json({
        outcome: 'failed',
        reason: result.reason,
        retryable: RETRYABLE_FAILURE_OUTCOMES.has(result.reason),
      });
    }
    if (result.outcome === 'already_resolved') {
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
      return res.status(200).json({ outcome: 'pending', retryable: false });
    }
    // 'pending'
    return res.status(200).json({ outcome: 'pending', retryable: false });
  } catch (err) {
    console.error('[kitchen-staff-sumup-reconcile] confirm/fail RPC failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
}
