import { recoverSumupProviderRef } from './sumupProviderRefRecovery.js';
import { deactivateAndVerify, getCheckoutVerified, sumupGetFetchWithTimeout } from './sumupCheckout.js';

// S6 (docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md): estratta da api/kitchen-customer-switch-to-counter.js (S4) a parita' di
// comportamento, cosi' "Paga al banco" del cliente e lo sweep dei 5 minuti chiudono un attempt SumUp con la stessa
// matrice fail-closed.
//
// Porta un attempt sumup a "checkout sicuramente non pagabile". Ritorna { kind: 'closed' }, { kind: 'paid', data }
// oppure { kind: 'uncertain', reason, needs_manual_reconciliation? }.
// Recupero del riferimento (List per checkout_reference, logica I-3 per i claim senza provider_ref) -> GET verificato
// -> PAID: paid -> EXPIRED/CANCELLED: gia' chiuso -> altro: DELETE + GET di verifica. Qualunque incertezza: uncertain.
export async function closeSumupAttempt({ supabaseAdmin, sumupApiKey, attempt, logTag }) {
  let providerRef = attempt.provider_ref;
  if (!providerRef) {
    const recovery = await recoverSumupProviderRef({
      sumupApiKey, attemptId: attempt.id, fetchImpl: sumupGetFetchWithTimeout,
    });
    if (!recovery.checkout) {
      // I-3: claim NULL (nessuna POST mai partita) + List not_found = due prove indipendenti che nessun checkout
      // esiste. === null stretto: una riga letta senza la colonna resta fail-closed. Claim presente + not_found
      // resta incerto (NEEDS_DECISION aperta, ai-ops/reports/sumup-401-incident-2026-10-12.md §3).
      if (recovery.reason === 'not_found' && attempt.checkout_claim_at === null) {
        return { kind: 'closed' };
      }
      return {
        kind: 'uncertain',
        reason: `provider_ref_${recovery.reason}`,
        needs_manual_reconciliation: recovery.reason === 'ambiguous',
      };
    }
    providerRef = recovery.checkout.id;
    await supabaseAdmin.rpc('kitchen_payment_attempt_set_provider_ref', {
      p_attempt_id: attempt.id,
      p_provider_ref: providerRef,
    });
  }

  const checkout = await getCheckoutVerified({ sumupApiKey, providerRef, attemptId: attempt.id, logTag });
  if (checkout.outcome === 'unknown') {
    return { kind: 'uncertain', reason: 'checkout_unverifiable' };
  }
  if (checkout.data.status === 'PAID') {
    return { kind: 'paid', data: checkout.data };
  }
  if (checkout.data.status === 'EXPIRED' || checkout.data.status === 'CANCELLED') {
    return { kind: 'closed' };
  }

  // PENDING, FAILED (non terminale su SumUp) o altro: DELETE + verifica, fail-closed.
  const deactivation = await deactivateAndVerify({ sumupApiKey, providerRef, attemptId: attempt.id, logTag });
  if (deactivation.kind === 'paid') return { kind: 'paid', data: deactivation.data };
  if (deactivation.kind === 'closed') return { kind: 'closed' };
  const reasons = { indeterminate: 'sumup_delete_indeterminate', unknown: 'checkout_unverifiable', unverified: 'checkout_close_unverified' };
  return { kind: 'uncertain', reason: reasons[deactivation.kind] };
}
