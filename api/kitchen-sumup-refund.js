import { createClient } from '@supabase/supabase-js';

// Kitchen Payment Hub V1 — SumUp Online — Real Refund — FASE 3/4.
//
// The real refund happens on SumUp BEFORE the ledger is ever marked 'refunded'/'succeeded'. A
// successful RPC call alone is never proof a refund happened: kitchen_payment_refund (see
// 20260830120000_kitchen_payment_refund_lifecycle_v1.sql) only opens/reuses an 'initiated' attempt —
// kitchen_payment_refund_confirm is the sole path to 'succeeded', and this handler only calls it
// after SumUp itself returns 204 for the real refund call below.
//
// Amount is never accepted from the client: kitchen_payment_refund derives it server-side from the
// original succeeded charge (V1: full refund only, unchanged scope from the pre-existing RPC).
// Only staff can trigger a refund — enforced by is_staff_for_venue INSIDE the RPC, evaluated against
// the caller's own JWT (this handler calls the RPC as the staff member, not as service_role, so
// auth.uid()/auth.role() resolve correctly — service_role would bypass that check entirely).
//
// Refund API reference (developer.sumup.com/docs/refund, developer.sumup.com/online-payments/guides/refund):
//   POST https://api.sumup.com/v0.1/me/refund/{txn_id}, empty body = full refund, 204 No Content on
//   success. {txn_id} comes from the `id` field of the `transactions[]` entry SumUp returns on the
//   original checkout once it reached PAID — persisted verbatim in kitchen_payments.raw_last_event by
//   kitchen_payment_confirm (the checkout object IS the raw payload it stores).
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
    console.error('[kitchen-sumup-refund] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  // Acts as the calling staff member (their own JWT), not service_role, so is_staff_for_venue /
  // auth.uid() resolve correctly inside kitchen_payment_refund — this handler never re-implements
  // the staff-authorization check, the RPC owns it.
  const supabaseAsStaff = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  let refund;
  try {
    const { data, error } = await supabaseAsStaff.rpc('kitchen_payment_refund', {
      p_order_id: order_id,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    refund = data;
  } catch (err) {
    const code = err?.message || err?.error || 'refund_start_failed';
    const status = code.includes('not_staff_for_venue') || code.includes('not_authorized') ? 403
      : code.includes('order_not_found') ? 404
      : code.includes('no_succeeded_charge_to_refund') ? 409
      : 400;
    return res.status(status).json({ error: code });
  }

  if (!refund) {
    return res.status(500).json({ error: 'internal_server_error' });
  }

  if (refund.status === 'succeeded') {
    // kitchen_payment_refund never returns an already-succeeded row in practice, kept only as a
    // safe passthrough — never re-triggers a provider call for an already-settled refund.
    return res.status(200).json({ outcome: 'already_refunded' });
  }

  if (refund.provider !== 'sumup') {
    // Cash/manual/other non-online providers: no provider-side call to make, same ledger-only
    // behavior that already existed for these before this session — SumUp is never involved.
    try {
      const { error } = await supabaseAdmin.rpc('kitchen_payment_refund_confirm', {
        p_refund_id: refund.id,
        p_provider_ref: null,
        p_raw_payload: {},
      });
      if (error) throw error;
      return res.status(200).json({ outcome: 'refunded' });
    } catch (err) {
      console.error('[kitchen-sumup-refund] non-provider confirm failed', err);
      return res.status(500).json({ error: 'internal_server_error' });
    }
  }

  // Claim the real provider call atomically (row-locked inside the RPC) so a duplicate/concurrent
  // request for the same live refund attempt never issues a second real SumUp refund call.
  try {
    const { error } = await supabaseAdmin.rpc('kitchen_payment_refund_claim_provider_call', {
      p_refund_id: refund.id,
    });
    if (error) throw error;
  } catch (err) {
    const code = err?.message || '';
    if (code.includes('refund_call_already_claimed')) {
      return res.status(200).json({ outcome: 'in_progress', retryable: false });
    }
    console.error('[kitchen-sumup-refund] claim failed', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  const { data: charge, error: chargeError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, raw_last_event')
    .eq('order_id', order_id)
    .eq('direction', 'charge')
    .eq('status', 'succeeded')
    .maybeSingle();

  const txnId = charge?.raw_last_event?.transactions?.[0]?.id;

  if (chargeError || !charge || !txnId) {
    // Fail closed: never guess a transaction id. Staff sees this on
    // kitchen_payments_provider_drift_candidates (refund_stuck_initiated would NOT apply here since
    // we explicitly fail it — this is the "charge non trovata" chaos case, an explicit failure, not
    // a silent stuck state).
    console.error('[kitchen-sumup-refund] original charge/transaction id not found', chargeError, refund.id);
    await supabaseAdmin.rpc('kitchen_payment_refund_fail', {
      p_refund_id: refund.id,
      p_reason: 'sumup_transaction_id_missing',
      p_raw_payload: {},
    });
    return res.status(502).json({ error: 'sumup_transaction_id_missing', retryable: false });
  }

  let sumupRes;
  try {
    sumupRes = await fetch(`https://api.sumup.com/v0.1/me/refund/${txnId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sumupApiKey}` },
    });
  } catch (err) {
    // Network error/timeout: inconclusive — never mark failed (would allow an unsafe retry that
    // could double-refund), never mark succeeded. The claimed 'initiated' attempt stays live and
    // blocking; surfaced to staff via kitchen_payments_provider_drift_candidates
    // ('refund_stuck_initiated') for manual reconciliation against the SumUp merchant dashboard.
    console.error('[kitchen-sumup-refund] SumUp refund call errored', err);
    return res.status(200).json({ outcome: 'unknown', retryable: false });
  }

  if (sumupRes.status === 204) {
    try {
      const { error } = await supabaseAdmin.rpc('kitchen_payment_refund_confirm', {
        p_refund_id: refund.id,
        p_provider_ref: txnId,
        p_raw_payload: { sumup_status: 204 },
      });
      if (error) throw error;
      return res.status(200).json({ outcome: 'refunded' });
    } catch (err) {
      // SumUp already refunded the customer at this point — never re-attempt (that would be a real
      // double refund on SumUp's side), never lose that fact silently. The attempt stays 'initiated'
      // (blocking, not falsely 'failed') and is surfaced via kitchen_payments_provider_drift_candidates
      // for manual reconciliation — a declared V1 residual risk, see session report.
      console.error('[kitchen-sumup-refund] confirm RPC failed after SumUp already refunded', err);
      return res.status(500).json({ error: 'internal_server_error', sumup_refunded: true });
    }
  }

  if (sumupRes.status >= 400 && sumupRes.status < 500) {
    let body = {};
    try { body = await sumupRes.json(); } catch { /* no/invalid JSON body */ }
    try {
      await supabaseAdmin.rpc('kitchen_payment_refund_fail', {
        p_refund_id: refund.id,
        p_reason: `sumup_refund_rejected_${sumupRes.status}`,
        p_raw_payload: body,
      });
    } catch (err) {
      console.error('[kitchen-sumup-refund] fail RPC failed after SumUp rejection', err);
    }
    return res.status(409).json({ outcome: 'failed', retryable: true });
  }

  // 5xx or any other unexpected status: inconclusive, never guess — same "stays initiated,
  // blocking, manual reconciliation" outcome as the network-error branch above.
  console.error('[kitchen-sumup-refund] SumUp refund returned unexpected status', sumupRes.status);
  return res.status(200).json({ outcome: 'unknown', retryable: false });
}
