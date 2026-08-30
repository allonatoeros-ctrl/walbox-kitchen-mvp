// Kitchen Payment Hub V1 — SumUp Online Payment Reliability Hardening — shared resolution logic.
//
// Extracted from api/kitchen-sumup-webhook.js so the webhook handler and the reconciliation
// endpoint (api/kitchen-sumup-reconcile.js, lost-webhook recovery) apply the exact same
// amount/provider re-check and the exact same confirm/fail decision, instead of two independently
// maintained copies of the same authoritative-outcome logic.
//
// Contract (see ai-ops/reports/sumup-payment-reliability-contract-v1-audit.md):
//   SUCCESS   -> retry NO   (confirm, terminal)
//   FAILED    -> retry YES  (fail, terminal)
//   CANCELLED -> retry YES  (fail, terminal)
//   PENDING   -> retry NO   (blocking, non-terminal)
//   UNKNOWN   -> retry NO   (blocking, non-terminal — caller could not get an authoritative answer)
//
// This function NEVER creates a new payment attempt and NEVER decides PENDING/UNKNOWN are safe to
// resolve on its own — it only applies an authoritative SumUp checkout status already fetched by
// the caller via GET /v0.1/checkouts/{id}.
//
// LONG SESSION F (same-checkout retry fix): a charge attempt already 'failed' is now also eligible
// here, not just 'initiated'/'pending' — a SumUp hosted checkout can go FAILED and still be retried
// by the customer with a different card on the SAME checkout, later reporting PAID. The actual
// eligibility restriction (provider='sumup' AND failure_reason='sumup_failed' only — NOT
// 'sumup_expired'/'sumup_cancelled'/'sumup_amount_mismatch') is enforced authoritatively inside
// kitchen_payment_confirm itself (defense in depth, see 20260830130000); callers additionally
// pre-filter which 'failed' rows they even fetch (reconcile.js/sumupReconcileSweep.js) so a
// genuinely terminal 'failed' attempt is never even offered to this function in the batch/sweep
// path. The PAID+mismatch branch below is self-protecting regardless: checkout.amount is immutable
// per checkout, so an attempt that mismatched once always mismatches again and is routed to fail,
// never to confirm.

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin service-role client
 * @param {{id: string, amount: number|string, provider: string, status: string}} attempt
 *   row from kitchen_payments, must be the pre-resolution row (status checked by the caller)
 * @param {{status: string, amount: number|string, id?: string}} checkout
 *   authoritative SumUp checkout object from GET /v0.1/checkouts/{id} (status: PENDING|PAID|FAILED|EXPIRED)
 * @returns {Promise<{outcome: 'confirmed'|'failed'|'pending'|'already_resolved', reason?: string}>}
 */
export async function applySumupCheckoutResult(supabaseAdmin, attempt, checkout) {
  if (attempt.status !== 'initiated' && attempt.status !== 'pending' && attempt.status !== 'failed') {
    // Already resolved terminally ('succeeded'/'cancelled') by a prior call — idempotent no-op,
    // never re-apply confirm/fail. 'failed' is deliberately NOT in this early-exit anymore (see
    // header): it may still need re-checking for the same-checkout retry case, and re-applying
    // fail on it is now itself idempotent (kitchen_payment_fail, 20260830130000).
    return { outcome: 'already_resolved' };
  }

  const status = checkout.status;

  if (status === 'PAID') {
    if (attempt.provider !== 'sumup' || Number(attempt.amount) !== Number(checkout.amount)) {
      const { error } = await supabaseAdmin.rpc('kitchen_payment_fail', {
        p_attempt_id: attempt.id,
        p_reason: 'sumup_amount_mismatch',
        p_raw_payload: checkout,
      });
      if (error) throw error;
      return { outcome: 'failed', reason: 'amount_mismatch' };
    }

    const { error } = await supabaseAdmin.rpc('kitchen_payment_confirm', {
      p_attempt_id: attempt.id,
      p_provider_ref: checkout.id ?? attempt.id,
      p_raw_payload: checkout,
    });
    if (error) throw error;
    return { outcome: 'confirmed' };
  }

  if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') {
    const { error } = await supabaseAdmin.rpc('kitchen_payment_fail', {
      p_attempt_id: attempt.id,
      p_reason: `sumup_${status.toLowerCase()}`,
      p_raw_payload: checkout,
    });
    if (error) throw error;
    return { outcome: 'failed', reason: status.toLowerCase() };
  }

  // PENDING or any other transitional/unrecognized status: nothing to resolve yet, never guess.
  return { outcome: 'pending' };
}
