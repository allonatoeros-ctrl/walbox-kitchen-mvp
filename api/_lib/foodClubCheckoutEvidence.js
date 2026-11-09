// Food Club Passo 2b — evidenza dei checkout SumUp di un ordine con buono. SOLA LETTURA.
//
// Legge (solo GET / List) lo stato di TUTTI i tentativi SumUp di un ordine e ne ricava un verdetto:
//   'paid'        almeno un checkout PAID (vince su tutto, qualunque status DB dell'attempt);
//   'not_payable' prova positiva che nessun checkout dell'ordine puo piu essere pagato;
//   'uncertain'   tutto il resto (default: nel dubbio il buono resta trattenuto).
//
// Vincoli (Passo 2): nessuna scrittura DB, nessuna RPC, nessun client Supabase, nessun DELETE/POST su SumUp,
// nessun dato carta nell'evidenza. Nessun codice qui rilascia buoni: il verdetto lo consumera il Passo 3.

import { getCheckoutVerified, SUMUP_GET_TIMEOUT_MS } from './sumupCheckout.js';
import { recoverSumupProviderRef } from './sumupProviderRefRecovery.js';

// EXPIRED/FAILED non autorizzano ancora il rilascio finche la sandbox SumUp non prova che un
// checkout in quello stato non e piu pagabile (R1.2). Con false: soli checkout terminali -> 'uncertain'.
// Stati del CHECKOUT documentati da SumUp (create/get/list/deactivate): solo PENDING, FAILED, PAID, EXPIRED.
// CANCELLED esiste solo per le transazioni (transactions[].status), non per il checkout: qualunque altro valore
// (CANCELLED compreso) e' 'unknown' -> verdetto 'uncertain' (fix fase A, 2026-11-08).
export const TERMINAL_STATES_SANDBOX_VERIFIED = false;

const MIN = 60 * 1000;
export const CHECKOUT_VALIDITY_MS = 15 * MIN; // valid_until atteso = created_at + 15 min
export const CREATE_WINDOW_MS = 4 * MIN + 30 * 1000; // nessun checkout nasce dopo created_at + 4:30
export const CLAIM_SAFETY_MS = 60 * 1000; // margine oltre la finestra: nessuna claim ancora possibile
export const NOT_PAYABLE_AFTER_MS = 17 * MIN; // D-T1: scadenza + 2 min di margine orologi
export const VALID_UNTIL_TOLERANCE_MS = 1000;

const LOG_TAG = 'food-club-checkout-evidence';

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value) return Date.parse(value);
  return NaN;
}

// Wrapper di sicurezza: qualsiasi metodo diverso da GET viene rifiutato (la libreria non scrive mai).
function readOnlyFetch(fetchImpl) {
  return (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    if (method !== 'GET') throw new Error(`foodClubCheckoutEvidence: metodo ${method} vietato (sola lettura)`);
    return fetchImpl(url, { ...opts, signal: opts.signal ?? AbortSignal.timeout(SUMUP_GET_TIMEOUT_MS) });
  };
}

// true solo se il campo esiste nella riga (proprieta propria) e vale esattamente null.
function hasExplicitNull(row, field) {
  return row !== null && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, field) && row[field] === null;
}

function entry(attempt, state, reason, validUntil = null) {
  return {
    attempt_id: attempt?.id ?? null,
    provider_ref: attempt?.provider_ref ?? null,
    state,
    valid_until: validUntil,
    reason,
  };
}

// Classifica il JSON di un GET gia verificato (id e checkout_reference controllati prima). Pura.
export function classifyCheckoutData(attempt, data, expectedValidUntilMs) {
  const validUntil = typeof data?.valid_until === 'string' ? data.valid_until : null;
  if (data?.status === 'PAID') return entry(attempt, 'paid', 'sumup_paid', validUntil);

  // Mappa chiusa sui soli stati documentati; Object.hasOwn evita chiavi ereditate (es. 'constructor').
  const DOCUMENTED = { EXPIRED: 'expired', FAILED: 'failed', PENDING: 'pending' };
  const base = typeof data?.status === 'string' && Object.hasOwn(DOCUMENTED, data.status) ? DOCUMENTED[data.status] : null;
  if (!base) return entry(attempt, 'unknown', 'unknown_status', validUntil);

  const vuMs = validUntil ? Date.parse(validUntil) : NaN;
  if (!validUntil || Number.isNaN(vuMs)) return entry(attempt, 'unknown', 'valid_until_missing', validUntil);
  if (!Number.isFinite(expectedValidUntilMs) || Math.abs(vuMs - expectedValidUntilMs) > VALID_UNTIL_TOLERANCE_MS) {
    return entry(attempt, 'unknown', 'valid_until_mismatch', validUntil);
  }
  return entry(attempt, base, `sumup_${base}`, validUntil);
}

// Verdetto d'ordine da evidenze gia lette. Pura, senza rete.
export function classifyOrderEvidence({ order, checkouts, now = new Date(), terminalStatesVerified = TERMINAL_STATES_SANDBOX_VERIFIED }) {
  const nowMs = toMs(now);
  const createdMs = toMs(order?.created_at);
  const list = Array.isArray(checkouts) ? checkouts : [];

  if (list.some((c) => c.state === 'paid')) return 'paid';
  if (list.length === 0) return 'uncertain';
  if (Number.isNaN(nowMs) || Number.isNaN(createdMs)) return 'uncertain';
  if (nowMs <= createdMs + NOT_PAYABLE_AFTER_MS) return 'uncertain';

  const releasable = (c) => {
    if (c.state === 'never_created') return true; // la prova (niente claim, finestra chiusa, List vuota) e gia nella lettura
    if (!terminalStatesVerified) return false;
    if (c.state === 'expired') return true; // 'cancelled' non e' uno stato di checkout documentato: mai releasable
    if (c.state === 'failed') {
      const vu = c.valid_until ? Date.parse(c.valid_until) : NaN;
      return !Number.isNaN(vu) && nowMs > vu;
    }
    return false; // pending, unknown
  };
  return list.every(releasable) ? 'not_payable' : 'uncertain';
}

async function readOneAttempt({ attempt, createdMs, nowMs, sumupApiKey, getFetch, expectedValidUntilMs }) {
  const getVerified = async (providerRef) => {
    const verified = await getCheckoutVerified({
      sumupApiKey, providerRef, attemptId: attempt.id, logTag: LOG_TAG, fetchImpl: getFetch,
    });
    if (verified.outcome !== 'ok') return entry({ ...attempt, provider_ref: providerRef }, 'unknown', 'sumup_get_unverified');
    if (verified.data?.id !== providerRef) return entry({ ...attempt, provider_ref: providerRef }, 'unknown', 'checkout_id_mismatch');
    return classifyCheckoutData({ ...attempt, provider_ref: providerRef }, verified.data, expectedValidUntilMs);
  };

  if (attempt.provider_ref) return getVerified(attempt.provider_ref);

  const lookup = await recoverSumupProviderRef({ sumupApiKey, attemptId: attempt.id, fetchImpl: getFetch });
  if (lookup.reason === 'ambiguous') return entry(attempt, 'unknown', 'list_ambiguous');
  if (lookup.reason === 'not_found') {
    // Prova che nessuna creazione e (o sara) in corso: nessuna claim, nessun provider_ref, finestra chiusa + margine.
    // Fix B: "assenti" solo se ENTRAMBI i campi sono presenti nella riga ed esplicitamente null. Campo mancante o
    // undefined (es. colonna non selezionata dal chiamante) = non provato -> 'unknown' (verdetto 'uncertain').
    if (!hasExplicitNull(attempt, 'checkout_claim_at') || !hasExplicitNull(attempt, 'provider_ref')) {
      const claimPresent = attempt.checkout_claim_at !== null && attempt.checkout_claim_at !== undefined;
      return entry(attempt, 'unknown', claimPresent ? 'list_not_found_claim_present' : 'list_not_found_fields_missing');
    }
    const provenNever = nowMs > createdMs + CREATE_WINDOW_MS + CLAIM_SAFETY_MS;
    return provenNever
      ? entry(attempt, 'never_created', 'list_not_found_no_claim')
      : entry(attempt, 'unknown', 'list_not_found_window_open');
  }
  if (lookup.reason) return entry(attempt, 'unknown', 'list_lookup_failed');
  const foundId = lookup.checkout?.id;
  if (typeof foundId !== 'string' || !foundId) return entry(attempt, 'unknown', 'list_match_without_id');
  return getVerified(foundId);
}

// Legge TUTTI gli attempt SumUp passati (qualunque status) e ritorna verdetto + evidenza per checkout.
export async function readFoodClubCheckoutEvidence({
  order,
  attempts,
  now = new Date(),
  sumupApiKey,
  fetchImpl = fetch,
  terminalStatesVerified = TERMINAL_STATES_SANDBOX_VERIFIED,
}) {
  const readAt = (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).toISOString();
  const list = Array.isArray(attempts) ? attempts : [];
  const createdMs = toMs(order?.created_at);
  const nowMs = toMs(now);
  const invalidTime = Number.isNaN(createdMs) || Number.isNaN(nowMs);
  const getFetch = readOnlyFetch(fetchImpl);
  const expectedValidUntilMs = createdMs + CHECKOUT_VALIDITY_MS;

  const checkouts = await Promise.all(list.map(async (attempt) => {
    if (invalidTime) return entry(attempt, 'unknown', 'invalid_time_input');
    try {
      return await readOneAttempt({ attempt, createdMs, nowMs, sumupApiKey, getFetch, expectedValidUntilMs });
    } catch (err) {
      console.error(`[${LOG_TAG}] attempt read failed`, { attemptId: attempt?.id, message: err?.message });
      return entry(attempt, 'unknown', 'read_error');
    }
  }));

  const verdict = classifyOrderEvidence({ order, checkouts, now, terminalStatesVerified });
  return { verdict, checkouts, read_at: readAt };
}
