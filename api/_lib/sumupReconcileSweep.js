import { applySumupCheckoutResult } from './sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './sumupProviderRefRecovery.js';

// Kitchen Payment Hub V1 — SumUp Online — Autonomous Reconciliation — FASE 1.
//
// api/kitchen-sumup-reconcile.js only runs when a specific customer's browser comes back to
// /kitchen/status — a customer who never returns (closes the tab, loses connectivity, pays and
// leaves) leaves their attempt stuck 'initiated'/'pending' forever with no trigger to re-check it.
// This module is the venue-wide sweep: find every live SumUp charge attempt, ask SumUp
// authoritatively, and apply the exact same confirm/fail decision as the webhook/on-demand
// reconcile (api/_lib/sumupPaymentResolution.js) — zero duplicated verification logic, third
// caller of the same function.
//
// Contract (unchanged from the webhook/reconcile endpoints):
//   PAID                -> confirm (terminal)
//   FAILED/EXPIRED/CANCELLED -> fail (terminal, retryable)
//   PENDING             -> stays blocking, no action
//   lookup failure/unknown -> stays blocking, no action, never guessed
// Never creates a new payment attempt — only reads kitchen_payments/SumUp and calls the existing
// confirm/fail RPCs on rows that are already 'initiated'/'pending'.
//
// LONG SESSION F (same-checkout retry fix): the batch also now picks up 'failed' attempts, but
// ONLY when provider='sumup' AND failure_reason='sumup_failed' (the exact same-checkout-retry-
// eligible state kitchen_payment_attempt_start blocks new attempts on). This is a deliberate,
// narrow addition — NOT every historical failed attempt: 'sumup_expired'/'sumup_cancelled'/
// 'sumup_amount_mismatch' are genuinely terminal and stay excluded, so this venue-wide autonomous
// sweep never re-checks SumUp forever for something that can no longer resolve to PAID.

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseAdmin service-role client
 * @param {string} opts.sumupApiKey
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.limit] max attempts processed in one sweep run (default 200 — keeps a single
 *   run bounded regardless of how it ends up being invoked/scheduled).
 * @returns {Promise<{checked:number, confirmed:number, failed:number, pending:number, unknown:number,
 *   needsManualReconciliation:string[], errors:{attemptId:string, error:string}[]}>}
 */
export async function runReconcileSweep({ supabaseAdmin, sumupApiKey, fetchImpl = fetch, limit = 200 }) {
  const summary = {
    checked: 0,
    confirmed: 0,
    failed: 0,
    pending: 0,
    unknown: 0,
    needsManualReconciliation: [],
    errors: [],
  };

  const { data: attempts, error: listError } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, order_id, amount, provider, method, status, provider_ref')
    .eq('direction', 'charge')
    .eq('provider', 'sumup')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,failure_reason.eq.sumup_failed')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (listError) {
    summary.errors.push({ attemptId: null, error: `list_failed:${listError.message || listError}` });
    return summary;
  }

  for (const attempt of attempts || []) {
    summary.checked += 1;
    try {
      let providerRef = attempt.provider_ref;

      if (!providerRef) {
        const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id, fetchImpl });
        if (!recovery.checkout) {
          summary.unknown += 1;
          if (recovery.reason === 'ambiguous') summary.needsManualReconciliation.push(attempt.id);
          continue;
        }
        providerRef = recovery.checkout.id;
        await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
          p_attempt_id: attempt.id,
          p_provider_ref: providerRef,
        });
      }

      let checkoutRes;
      let checkout;
      try {
        checkoutRes = await fetchImpl(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
          headers: { Authorization: `Bearer ${sumupApiKey}` },
        });
        checkout = await checkoutRes.json();
      } catch {
        summary.unknown += 1;
        continue;
      }
      if (!checkoutRes.ok) {
        summary.unknown += 1;
        continue;
      }
      if (checkout.checkout_reference !== attempt.id) {
        // Never confirm on an unverified reference — same conservative rule as reconcile.js.
        summary.unknown += 1;
        summary.needsManualReconciliation.push(attempt.id);
        continue;
      }

      const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
      if (result.outcome === 'confirmed') summary.confirmed += 1;
      else if (result.outcome === 'failed') summary.failed += 1;
      else if (result.outcome === 'pending') summary.pending += 1;
      else summary.unknown += 1; // already_resolved (race with webhook/on-demand reconcile mid-sweep)
    } catch (err) {
      summary.errors.push({ attemptId: attempt.id, error: err?.message || String(err) });
    }
  }

  return summary;
}
