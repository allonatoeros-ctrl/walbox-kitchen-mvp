import { supabase } from './supabaseClient';

// "Passa al pagamento al banco" — chiusura esplicita di un checkout SumUp online non concluso.
//
// Estratto qui (non importato da PaymentsView.jsx, decommissionato in b696070) cosi' che
// /kitchen/solo possa riusare esattamente lo stesso endpoint/semantica gia' validati
// (api/kitchen-staff-sumup-close-for-counter.js) senza dipendere da una pagina non montata.
// Testo/label identici a quelli gia' scritti e approvati per il Payment Hub — nessuna nuova
// decisione di prodotto qui, solo riuso.

export const CLOSE_FOR_COUNTER_CONFIRM_MESSAGE = 'Confermi che il cliente vuole pagare al banco? Il checkout online in corso verrà chiuso.';

export const CLOSE_FOR_COUNTER_ERROR_LABELS = {
  missing_session: 'Sessione scaduta — ricarica la pagina.',
  invalid_session: 'Sessione scaduta — ricarica la pagina.',
  not_staff_for_venue: 'Non autorizzato per questo locale.',
  order_not_found: 'Ordine non trovato.',
  order_cancelled: 'Ordine annullato — nulla da chiudere.',
  order_already_paid: 'Risulta già pagato.',
  cannot_close_already_paid: 'Il cliente ha già pagato online — verificato ora.',
  sumup_delete_indeterminate: 'Esito non determinabile — riprova.',
  payment_attempt_not_found: 'Pagamento non trovato.',
  invalid_attempt_status: 'Lo stato del pagamento è cambiato — verifica prima di riprovare.',
  internal_server_error: 'Errore del server — riprova.',
  server_configuration_error: 'Errore di configurazione server.',
};

const CLOSE_FOR_COUNTER_OUTCOME_LABELS = {
  closed_for_counter: 'Checkout online chiuso — ora puoi incassare al banco.',
  no_pending_attempt: 'Nessun pagamento online in sospeso per questo ordine.',
  unknown: 'Esito non determinabile — verifica manualmente.',
};

const CLOSE_FOR_COUNTER_OUTCOME_TONE = {
  closed_for_counter: 'ok',
  no_pending_attempt: 'neutral',
  unknown: 'warn',
};

function closeForCounterOutcomeMessage(body) {
  return {
    text: CLOSE_FOR_COUNTER_OUTCOME_LABELS[body.outcome] ?? 'Esito sconosciuto.',
    tone: CLOSE_FOR_COUNTER_OUTCOME_TONE[body.outcome] ?? 'neutral',
  };
}

/**
 * Predicato puro di eleggibilita' per "PASSA AL BANCO" — stessa regola gia' validata nel
 * Payment Hub (PaymentsView.jsx): un checkout SumUp ancora aperto (initiated/pending), oppure
 * gia' 'failed' ma ancora nella same-checkout retry window di F03
 * (failure_reason='sumup_failed' — carta rifiutata, checkout ancora riattivabile). Un 'failed'
 * con un altro motivo (gia' chiuso, scaduto, annullato) non e' eleggibile.
 */
export function isCloseForCounterEligible(payment) {
  if (!payment) return false;
  if (payment.direction !== 'charge' || payment.provider !== 'sumup') return false;
  if (payment.status === 'initiated' || payment.status === 'pending') return true;
  return payment.status === 'failed' && payment.failure_reason === 'sumup_failed';
}

/**
 * Lookup mirata per un singolo ordine — MAI la lista aggregata "ultimi 30" di
 * useKitchenPayments (recentPayments), che su un venue attivo puo' non contenere l'attempt di
 * un ordine piu' vecchio (root cause del bug: bottone invisibile proprio quando serve). Stesso
 * predicato server-side di api/kitchen-staff-sumup-close-for-counter.js (righe 123-132) e stessa
 * RLS staff (`staff_select_venue_payments`) gia' sfruttata da useKitchenPayments.js — nessuna
 * nuova query aggregata, nessuna nuova policy.
 *
 * Ordinato per `created_at` decrescente prima del limit(1): se per qualunque motivo esistesse
 * piu' di un attempt charge in questi stati per lo stesso ordine, la scelta deterministica e'
 * sempre il piu' recente — stesso criterio dell'endpoint.
 */
export async function fetchCloseForCounterEligibility(orderId) {
  if (!orderId) return null;
  const { data, error } = await supabase
    .from('kitchen_payments')
    .select('id, order_id, provider, status, failure_reason, direction, created_at')
    .eq('order_id', orderId)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[Walbox] fetchCloseForCounterEligibility failed', error);
    return null;
  }
  return isCloseForCounterEligible(data) ? data : null;
}

// "Passa al pagamento al banco" reale di produzione: sessione staff + endpoint dedicato. Stesso
// fetch gia' scritto e validato in PaymentsView.jsx (eaee5ea/e642c5e), copiato verbatim qui.
export async function liveCloseForCounterAction(orderId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: 'missing_session' };
  }

  const res = await fetch('/api/kitchen-staff-sumup-close-for-counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await res.json();

  if (!res.ok) {
    return { ok: false, error: body.error, message: CLOSE_FOR_COUNTER_ERROR_LABELS[body.error] };
  }
  return { ok: true, ...closeForCounterOutcomeMessage(body) };
}
