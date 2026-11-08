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
  const status = checkout.status;

  // K2 lato api (Passo 4, 2026-11-08): un attempt `cancelled` (annullo staff) resta confermabile SOLO
  // con un PAID SumUp reale: kitchen_payment_confirm (migration K2 20261108130000) lo registra
  // (ordine annullato -> payment_confirmed_after_cancel; banco gia incassato -> lost_race), cosi
  // l'incasso non sparisce. Ogni altro stato su `cancelled` e un no-op: kitchen_payment_fail rifiuta
  // `cancelled` (invalid_attempt_status) e non va mai riaperto.
  const cancelledPaid = attempt.status === 'cancelled' && status === 'PAID';
  if (attempt.status !== 'initiated' && attempt.status !== 'pending' && attempt.status !== 'failed' && !cancelledPaid) {
    // Already resolved terminally ('succeeded', or 'cancelled' without PAID) by a prior call —
    // idempotent no-op, never re-apply confirm/fail. 'failed' is deliberately NOT in this early-exit
    // anymore (see header): it may still need re-checking for the same-checkout retry case, and
    // re-applying fail on it is now itself idempotent (kitchen_payment_fail, 20260830130000).
    return { outcome: 'already_resolved' };
  }

  if (status === 'PAID') {
    if (attempt.provider !== 'sumup' || Number(attempt.amount) !== Number(checkout.amount)) {
      if (attempt.status === 'cancelled') {
        // Passo 4: kitchen_payment_fail rifiuta `cancelled`. PAID con importo diverso su un attempt
        // annullato = anomalia: nessuna RPC, errore al chiamante (la riga webhook_ingest resta come prova).
        console.error('[sumupPaymentResolution] PAID amount mismatch on cancelled attempt — needs manual reconciliation', {
          attemptId: attempt.id,
        });
        throw new Error('sumup_amount_mismatch_on_cancelled');
      }
      const { error } = await supabaseAdmin.rpc('kitchen_payment_fail', {
        p_attempt_id: attempt.id,
        p_reason: 'sumup_amount_mismatch',
        p_raw_payload: checkout,
      });
      if (error) throw error;
      return { outcome: 'failed', reason: 'amount_mismatch' };
    }

    // K2 lato api (Passo 4): la conferma richiede la prova del provider. L'id del checkout deve venire
    // dalla risposta SumUp, descrivere questo attempt (checkout_reference) e, se l'attempt ha gia un
    // provider_ref, coincidere con esso. Nessun fallback: ne attempt.id ne attempt.provider_ref sono
    // prove di un incasso. Senza corrispondenza: niente confirm, niente fail, errore al chiamante;
    // l'attempt resta aperto come anomalia da riconciliare.
    const checkoutId = typeof checkout.id === 'string' ? checkout.id.trim() : '';
    const providerRefMismatch = attempt.provider_ref != null && attempt.provider_ref !== checkout.id;
    if (!checkoutId || checkoutId !== checkout.id || checkout.checkout_reference !== attempt.id || providerRefMismatch) {
      console.error('[sumupPaymentResolution] PAID without verifiable SumUp checkout id — not confirmed, needs manual reconciliation', {
        attemptId: attempt.id,
        hasCheckoutId: Boolean(checkoutId),
        referenceMatches: checkout.checkout_reference === attempt.id,
        providerRefMatches: !providerRefMismatch,
      });
      throw new Error('sumup_checkout_unverified');
    }

    const { data, error } = await supabaseAdmin.rpc('kitchen_payment_confirm', {
      p_attempt_id: attempt.id,
      p_provider_ref: checkout.id,
      p_raw_payload: checkout,
    });
    if (error) throw error;

    // F03: `error === null` alone is not proof that THIS attempt got confirmed. When a counter
    // cash/card payment already won the "one succeeded charge per order" race (kitchen_payments_
    // one_succeeded_charge_per_order, kitchen_payment_confirm's unique_violation branch,
    // migration 20260913120000), the RPC still returns success but hands back the WINNING row, not
    // this attempt's own row — SumUp really did capture money on this checkout, but Walbox never
    // recorded it as the succeeded charge. Never report 'confirmed' for that case: the caller must
    // not tell the customer/staff "paid" when this specific attempt is still unresolved.
    if (!data || data.id !== attempt.id) {
      return { outcome: 'lost_race', winning_payment_id: data?.id ?? null };
    }
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
