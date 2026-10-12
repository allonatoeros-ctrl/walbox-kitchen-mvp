import { applySumupCheckoutResult } from './sumupPaymentResolution.js';
import { closeSumupAttempt } from './sumupCloseAttempt.js';

// S6 (docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md §S6) — chiusura automatica degli ordini online non pagati entro 5 minuti.
//
// Lavora gli ordini `pending_online_payment` (POP) con created_at piu' vecchio di 5 minuti, i piu' recenti prima
// (un ordine bloccato da tempo non deve togliere il posto a una scadenza nuova), al massimo 20 per giro.
// Ordine obbligato D4 per ciascuno:
//   1. chiude ogni checkout SumUp vivo (closeSumupAttempt: recupero riferimento I-3, GET, DELETE + GET di verifica);
//   2. PAID scoperto in qualunque punto -> confirm (POP -> received) e stop: mai annullare soldi presi;
//   3. tutti chiusi (o nessun attempt) -> RPC kitchen_order_mark_payment_abandoned (POP -> payment_abandoned);
//   4. qualunque incertezza -> nessun cambio, riprova al giro dopo. Oltre 15 minuti (o subito se ci sono soldi da
//      riconciliare) -> log back-office `online_abandon_stuck` via RPC (deduplicato nel DB), l'ordine resta nascosto.
// Tutto e' idempotente: due sweep in parallelo o un passaggio al banco a meta' giro finiscono in una RPC che rifiuta
// o non fa nulla.

export const ABANDON_AFTER_MS = 5 * 60 * 1000;
export const STUCK_AFTER_MS = 15 * 60 * 1000;
export const MAX_ORDERS_PER_RUN = 20;
// Oltre questo tempo non si inizia un nuovo ordine: il resto lo prende il giro dopo (1 minuto).
export const RUN_BUDGET_MS = 25 * 1000;

const LOG_TAG = 'kitchen-online-abandon-sweep';

export async function runOnlineAbandonSweep({ supabaseAdmin, sumupApiKey, now = () => Date.now() }) {
  const startedMs = now();
  const cutoffIso = new Date(startedMs - ABANDON_AFTER_MS).toISOString();

  const { data: orders, error } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, created_at')
    .eq('status', 'pending_online_payment')
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(MAX_ORDERS_PER_RUN);
  if (error) throw error;

  const summary = { scanned: (orders || []).length, abandoned: [], paid: [], uncertain: [], skipped: [], stuck_logged: [], errors: [], deferred: 0 };

  for (const order of orders || []) {
    if (now() - startedMs > RUN_BUDGET_MS) {
      summary.deferred += 1;
      continue;
    }

    let result;
    try {
      result = await sweepOrder({ supabaseAdmin, sumupApiKey, orderId: order.id });
    } catch (err) {
      console.error(`[${LOG_TAG}] order sweep failed`, { orderId: order.id, err });
      summary.errors.push(order.id);
      continue;
    }

    if (result.outcome === 'abandoned') summary.abandoned.push(order.id);
    else if (result.outcome === 'paid') summary.paid.push(order.id);
    else if (result.outcome === 'skipped') summary.skipped.push({ order_id: order.id, reason: result.reason });
    else {
      summary.uncertain.push({ order_id: order.id, reason: result.reason });
      const ageMs = now() - Date.parse(order.created_at);
      if (result.stuckNow || ageMs >= STUCK_AFTER_MS) {
        const logged = await logStuck({ supabaseAdmin, orderId: order.id, reason: result.reason });
        if (logged) summary.stuck_logged.push(order.id);
      }
    }
  }

  return summary;
}

async function sweepOrder({ supabaseAdmin, sumupApiKey, orderId }) {
  // Stesso predicato "attempt vivo" di attempt_start, switch e mark_payment_abandoned.
  const { data: attempts, error } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, amount, provider, status, failure_reason, provider_ref, checkout_claim_at')
    .eq('order_id', orderId)
    .eq('direction', 'charge')
    .in('status', ['initiated', 'pending', 'failed'])
    .or('status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  let firstUncertain = null;
  for (const attempt of attempts || []) {
    // Canali non SumUp: nessuna verifica remota possibile, la RPC li chiude.
    if (attempt.provider !== 'sumup') continue;

    const closed = await closeSumupAttempt({ supabaseAdmin, sumupApiKey, attempt, logTag: LOG_TAG });
    if (closed.kind === 'paid') {
      return resolvePaid({ supabaseAdmin, attempt, checkout: closed.data });
    }
    if (closed.kind !== 'closed' && !firstUncertain) {
      // Si continua con gli altri attempt: chiuderli tutti ora accorcia il giro dopo e scopre un PAID nascosto.
      firstUncertain = { outcome: 'uncertain', reason: closed.reason, stuckNow: closed.needs_manual_reconciliation === true };
    }
  }
  if (firstUncertain) return firstUncertain;

  const { error: rpcError } = await supabaseAdmin.rpc('kitchen_order_mark_payment_abandoned', { p_order_id: orderId });
  if (!rpcError) return { outcome: 'abandoned' };

  const code = rpcError.message || '';
  if (code.includes('checkout_claim_in_progress')) return { outcome: 'uncertain', reason: 'checkout_claim_in_progress' };
  // Passato al banco o pagato mentre lo sweep girava: non e' un abbandono.
  if (code.includes('order_not_pending_online_payment')) return { outcome: 'skipped', reason: 'order_not_pending_online_payment' };
  // Orologio Vercel avanti rispetto al DB: il DB decide, si riprova al giro dopo.
  if (code.includes('online_payment_not_expired')) return { outcome: 'skipped', reason: 'online_payment_not_expired' };
  // Un charge riuscito su un POP non dovrebbe esistere: mai annullare, riconciliazione manuale.
  if (code.includes('order_has_succeeded_charge')) return { outcome: 'uncertain', reason: 'order_has_succeeded_charge', stuckNow: true };
  throw rpcError;
}

// PAID -> confirm via il resolver condiviso (su POP: ordine -> received). Se il pagamento non diventa il charge
// dell'ordine (lost_race / amount_mismatch) ci sono soldi da riconciliare: incerto e log subito.
async function resolvePaid({ supabaseAdmin, attempt, checkout }) {
  const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
  if (result.outcome === 'confirmed') return { outcome: 'paid' };
  console.error(`[${LOG_TAG}] PAID checkout not confirmed as order payment`, { attemptId: attempt.id, outcome: result.outcome });
  return { outcome: 'uncertain', reason: `paid_needs_reconciliation_${result.outcome}`, stuckNow: true };
}

// Best-effort: un log mancato non deve fermare lo sweep. La RPC scrive al massimo una riga per ordine.
async function logStuck({ supabaseAdmin, orderId, reason }) {
  const { data, error } = await supabaseAdmin.rpc('kitchen_order_log_online_abandon_stuck', {
    p_order_id: orderId,
    p_reason: reason ?? 'unknown',
  });
  if (error) {
    console.error(`[${LOG_TAG}] stuck log failed`, { orderId, error });
    return false;
  }
  return data === true;
}
