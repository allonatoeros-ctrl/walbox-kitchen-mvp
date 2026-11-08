import { applySumupCheckoutResult } from './sumupPaymentResolution.js';
import { recoverSumupProviderRef } from './sumupProviderRefRecovery.js';
import { SUMUP_GET_TIMEOUT_MS } from './sumupCheckout.js';

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

// R3 (ai-ops/current/KITCHEN_R3_PIANO.md, 2026-11-08) — recupero dei PAID SumUp non notificati.
// Gli attempt chiusi (annullo staff `cancelled`; `failed` con customer_switched_to_counter /
// staff_closed_for_counter / abandoned_timeout) non sono riletti da nessun controllo automatico: se il
// webhook si perde, un PAID arrivato dopo la chiusura resta solo su SumUp. La "finestra tardiva" li
// rilegge per LATE_WINDOW (default 72 h), i piu' recenti prima, e agisce SOLO su PAID verificato
// (id checkout = provider_ref, checkout_reference = attempt.id, importo uguale) -> stesso resolver,
// stessa RPC kitchen_payment_confirm (K2 registra after_cancel / after_abandon / lost_race).
// Qualunque altro esito (FAILED/EXPIRED/CANCELLED/PENDING, timeout, 5xx, risposta non verificabile)
// = nessuna RPC: un attempt chiuso non si riscrive mai su un "non pagato" o "non trovato".
// Limiti: timeout per chiamata SumUp, budget di tempo per giro, massimo di attempt per lista.
// La frequenza resta quella del cron esistente (vercel.json, non toccato): i limiti per giro rendono
// sicuro alzarla in futuro senza cambiare questo codice.

export const SWEEP_DEFAULTS = Object.freeze({
  limit: 200, // lista attuale (attempt aperti), invariata
  lateLimit: 50, // finestra tardiva
  lateWindowHours: 72,
  runBudgetMs: 25 * 1000, // come la sweep dei 5 minuti (onlineAbandonSweep.js RUN_BUDGET_MS)
  sumupTimeoutMs: SUMUP_GET_TIMEOUT_MS,
});

export const LATE_FAILURE_REASONS = Object.freeze(['customer_switched_to_counter', 'staff_closed_for_counter', 'abandoned_timeout']);

function positiveInt(raw, fallback, max) {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Configurazione da env (opzionale): valori assenti o non validi -> default; tetti massimi fissi, cosi'
// un env sbagliato non puo' produrre un giro illimitato.
export function readSweepConfig(env = {}) {
  return {
    limit: positiveInt(env.SUMUP_SWEEP_LIMIT, SWEEP_DEFAULTS.limit, 500),
    lateLimit: positiveInt(env.SUMUP_SWEEP_LATE_LIMIT, SWEEP_DEFAULTS.lateLimit, 200),
    lateWindowHours: positiveInt(env.SUMUP_SWEEP_LATE_WINDOW_HOURS, SWEEP_DEFAULTS.lateWindowHours, 24 * 14),
    runBudgetMs: positiveInt(env.SUMUP_SWEEP_RUN_BUDGET_MS, SWEEP_DEFAULTS.runBudgetMs, 240 * 1000),
    sumupTimeoutMs: positiveInt(env.SUMUP_SWEEP_TIMEOUT_MS, SWEEP_DEFAULTS.sumupTimeoutMs, 10 * 1000),
  };
}

function withTimeout(fetchImpl, timeoutMs) {
  return (url, opts = {}) => fetchImpl(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * @param {object} opts
 * @param {import('@supabase/supabase-js').SupabaseClient} opts.supabaseAdmin service-role client
 * @param {string} opts.sumupApiKey
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.limit] max attempt aperti per giro (default 200).
 * @param {number} [opts.lateLimit] max attempt chiusi per giro (default 50).
 * @param {number} [opts.lateWindowHours] finestra tardiva in ore (default 72).
 * @param {number} [opts.runBudgetMs] oltre questo tempo non si inizia un nuovo attempt (default 25 s).
 * @param {number} [opts.sumupTimeoutMs] timeout di ogni chiamata SumUp (default 5 s).
 * @param {() => number} [opts.now]
 */
export async function runReconcileSweep({
  supabaseAdmin,
  sumupApiKey,
  fetchImpl = fetch,
  limit = SWEEP_DEFAULTS.limit,
  lateLimit = SWEEP_DEFAULTS.lateLimit,
  lateWindowHours = SWEEP_DEFAULTS.lateWindowHours,
  runBudgetMs = SWEEP_DEFAULTS.runBudgetMs,
  sumupTimeoutMs = SWEEP_DEFAULTS.sumupTimeoutMs,
  now = () => Date.now(),
}) {
  const startedMs = now();
  const timedFetch = withTimeout(fetchImpl, sumupTimeoutMs);
  const budgetExhausted = () => now() - startedMs > runBudgetMs;

  const summary = {
    checked: 0,
    confirmed: 0,
    failed: 0,
    pending: 0,
    unknown: 0,
    deferred: 0,
    budgetExhausted: false,
    sumupCalls: 0,
    needsManualReconciliation: [],
    errors: [],
    late: {
      checked: 0,
      paidRecorded: 0,
      paidOnCancelled: 0,
      lostRace: 0,
      notPaid: 0,
      unverified: 0,
      alreadyResolved: 0,
      flagged: 0, // K6-b: segnalazioni scritte in kitchen_action_log (una per attempt)
      flagErrors: 0,
      deferred: 0,
      errors: 0,
    },
  };
  const countedFetch = (url, opts) => {
    summary.sumupCalls += 1;
    return timedFetch(url, opts);
  };

  // 1. Finestra tardiva prima: soldi gia' presi su attempt chiusi (rari, ma urgenti per il banco).
  await runLateWindow({ supabaseAdmin, sumupApiKey, fetchWithTimeout: countedFetch, lateLimit, lateWindowHours, startedMs, budgetExhausted, summary });

  // 2. Lista attuale (attempt aperti + failed/sumup_failed): comportamento invariato.
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
    if (budgetExhausted()) {
      summary.budgetExhausted = true;
      summary.deferred += 1;
      continue;
    }
    summary.checked += 1;
    try {
      let providerRef = attempt.provider_ref;

      if (!providerRef) {
        const recovery = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id, fetchImpl: countedFetch });
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
        checkoutRes = await countedFetch(`https://api.sumup.com/v0.1/checkouts/${providerRef}`, {
          headers: { Authorization: `Bearer ${sumupApiKey}` },
        });
        checkout = await checkoutRes.json();
      } catch {
        // Rete, timeout o JSON illeggibile: incerto, mai "non pagato".
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
      else if (result.outcome === 'lost_race') {
        // F03: SumUp captured money on this checkout, but a counter payment already won the
        // succeeded-charge slot for this order — never count as 'confirmed', flag for staff review
        // same as the other manual-reconciliation cases above.
        summary.unknown += 1;
        summary.needsManualReconciliation.push(attempt.id);
      }
      else summary.unknown += 1; // already_resolved (race with webhook/on-demand reconcile mid-sweep)
    } catch (err) {
      summary.errors.push({ attemptId: attempt.id, error: err?.message || String(err) });
    }
  }

  return summary;
}

async function runLateWindow({ supabaseAdmin, sumupApiKey, fetchWithTimeout, lateLimit, lateWindowHours, startedMs, budgetExhausted, summary }) {
  const late = summary.late;
  const cutoffIso = new Date(startedMs - lateWindowHours * 3600 * 1000).toISOString();

  const { data: closed, error } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, order_id, venue_id, amount, provider, method, status, failure_reason, provider_ref, updated_at')
    .eq('direction', 'charge')
    .eq('provider', 'sumup')
    .not('provider_ref', 'is', null)
    .in('status', ['cancelled', 'failed'])
    .or(`status.eq.cancelled,failure_reason.in.(${LATE_FAILURE_REASONS.join(',')})`)
    .gte('updated_at', cutoffIso)
    .order('updated_at', { ascending: false })
    .limit(lateLimit);

  if (error) {
    summary.errors.push({ attemptId: null, error: `late_list_failed:${error.message || error}` });
    return;
  }

  for (const attempt of closed || []) {
    if (budgetExhausted()) {
      summary.budgetExhausted = true;
      late.deferred += 1;
      continue;
    }
    late.checked += 1;
    try {
      // Difesa in profondita' (la query li esclude gia'): mai una GET senza riferimento verificabile.
      if (!attempt.provider_ref) {
        late.unverified += 1;
        continue;
      }

      let res;
      let checkout;
      try {
        res = await fetchWithTimeout(`https://api.sumup.com/v0.1/checkouts/${attempt.provider_ref}`, {
          headers: { Authorization: `Bearer ${sumupApiKey}` },
        });
        checkout = await res.json();
      } catch {
        late.unverified += 1; // timeout / rete / JSON illeggibile: si riprova al giro dopo
        continue;
      }
      if (!res.ok || !checkout || typeof checkout !== 'object') {
        late.unverified += 1;
        continue;
      }

      // Su un attempt chiuso solo un PAID conta. Qualunque altro stato: nessuna RPC (mai un fail che
      // riscriva il motivo di chiusura, vedi KITCHEN_R3_PIANO.md §1.3).
      if (checkout.status !== 'PAID') {
        late.notPaid += 1;
        continue;
      }

      // Prova del provider: id del checkout = provider_ref dell'attempt, checkout_reference = attempt.id.
      if (typeof checkout.id !== 'string' || checkout.id !== attempt.provider_ref || checkout.checkout_reference !== attempt.id) {
        late.unverified += 1;
        summary.needsManualReconciliation.push(attempt.id);
        await flagLateUnverified(supabaseAdmin, attempt, 'reference_mismatch', checkout, late);
        console.error('[sumupReconcileSweep] late PAID not verifiable — no action', {
          attemptId: attempt.id,
          idMatches: checkout.id === attempt.provider_ref,
          referenceMatches: checkout.checkout_reference === attempt.id,
        });
        continue;
      }

      // Importo diverso su attempt chiuso: anomalia, nessuna RPC (il resolver farebbe un fail).
      if (Number(attempt.amount) !== Number(checkout.amount)) {
        late.errors += 1;
        summary.needsManualReconciliation.push(attempt.id);
        summary.errors.push({ attemptId: attempt.id, error: 'sumup_amount_mismatch_on_closed' });
        await flagLateUnverified(supabaseAdmin, attempt, 'amount_mismatch_on_closed', checkout, late);
        console.error('[sumupReconcileSweep] late PAID amount mismatch on closed attempt — needs manual reconciliation', { attemptId: attempt.id });
        continue;
      }

      const result = await applySumupCheckoutResult(supabaseAdmin, attempt, checkout);
      if (result.outcome === 'confirmed') {
        late.paidRecorded += 1;
        if (attempt.status === 'cancelled') late.paidOnCancelled += 1;
        summary.needsManualReconciliation.push(attempt.id); // PAID dopo chiusura: lo staff deve saperlo
        console.warn('[sumupReconcileSweep] late PAID recorded on closed attempt', {
          attemptId: attempt.id, orderId: attempt.order_id, closedAs: attempt.status, reason: attempt.failure_reason ?? null,
        });
      } else if (result.outcome === 'lost_race') {
        // Ordine gia' incassato (banco o altro charge): K2 classifica e logga una volta per attempt.
        late.lostRace += 1;
        summary.needsManualReconciliation.push(attempt.id);
        console.warn('[sumupReconcileSweep] late PAID lost race — possible double collection', {
          attemptId: attempt.id, orderId: attempt.order_id, winningPaymentId: result.winning_payment_id,
        });
      } else if (result.outcome === 'already_resolved') {
        late.alreadyResolved += 1;
      } else {
        // 'failed'/'pending' non sono attesi con i controlli sopra: anomalia da guardare.
        late.errors += 1;
        summary.errors.push({ attemptId: attempt.id, error: `late_unexpected_outcome:${result.outcome}` });
      }
    } catch (err) {
      const message = err?.message || String(err);
      if (message === 'sumup_checkout_unverified') {
        late.unverified += 1;
        summary.needsManualReconciliation.push(attempt.id);
        await flagLateUnverified(supabaseAdmin, attempt, 'resolver_unverified', null, late);
      } else {
        late.errors += 1;
        summary.errors.push({ attemptId: attempt.id, error: message });
      }
    }
  }
}

// K6-b (ai-ops/current/KITCHEN_K6_PIANO.md §7): un PAID su attempt chiuso che non si puo' registrare
// (riferimento non verificabile, importo diverso, resolver che rifiuta la prova) oggi lasciava traccia solo
// nei log Vercel. Ora diventa UNA riga `payment_late_unverified` in kitchen_action_log, con
// needs_manual_reconciliation=true, letta dalla sezione "Da riconciliare". Una sola riga per attempt
// (controllo di esistenza prima dell'insert): i giri successivi non creano duplicati ne' notifiche.
// Timeout/5xx/stati non PAID NON vengono scritti: sono incerti e si riprovano al giro dopo.
// Nessun dato di carta: solo importi, ultime cifre dei riferimenti nella UI, motivo.
// Un errore qui non ferma mai la sweep (conteggiato in late.flagErrors).
async function flagLateUnverified(supabaseAdmin, attempt, reason, checkout, late) {
  try {
    const { data: existing, error: readError } = await supabaseAdmin
      .from('kitchen_action_log')
      .select('id')
      .eq('action', 'payment_late_unverified')
      .eq('order_id', attempt.order_id)
      .eq('metadata->>attempt_id', attempt.id)
      .limit(1);
    if (readError) throw readError;
    if (existing && existing.length > 0) return;

    const sumupAmount = checkout && typeof checkout === 'object' && Number.isFinite(Number(checkout.amount)) ? Number(checkout.amount) : null;
    const { error: insertError } = await supabaseAdmin.from('kitchen_action_log').insert({
      order_id: attempt.order_id,
      venue_id: attempt.venue_id ?? 'walrus-main',
      action: 'payment_late_unverified',
      actor_type: 'system',
      metadata: {
        attempt_id: attempt.id,
        provider: 'sumup',
        provider_ref: attempt.provider_ref ?? null,
        amount: Number(attempt.amount),
        sumup_amount: sumupAmount,
        closed_as: attempt.status,
        closed_reason: attempt.failure_reason ?? null,
        reason,
        needs_manual_reconciliation: true,
      },
    });
    if (insertError) throw insertError;
    late.flagged += 1;
  } catch (err) {
    late.flagErrors += 1;
    console.error('[sumupReconcileSweep] K6-b flag write failed', { attemptId: attempt.id, error: err?.message || String(err) });
  }
}
