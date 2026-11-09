// Food Club Passo 3B — fase di rilascio dei buoni trattenuti (sigillo -> evidenze SumUp -> rilascio).
//
// Gira in coda alla sweep di abbandono Kitchen (api/kitchen-online-abandon-sweep.js), SOLO con
// FOOD_CLUB_RELEASE_ENABLED === 'true'. Il verdetto lo calcola SEMPRE l'SQL (migration 20261109104000):
// qui si raccolgono solo campi grezzi e si chiamano le 3 RPC Club. Nessuna scrittura diretta su tabelle.
//
// Garanzie:
//   * runFoodClubReleasePhase non lancia mai eccezioni (try/catch globale + per ordine) e ritorna un riepilogo;
//   * SumUp solo in lettura: URL da costante, encodeURIComponent, redirect 'error', timeout breve, wrapper che
//     rifiuta qualunque metodo diverso da GET;
//   * evidenza = solo campi del tipo giusto (campo strano -> omesso); errore di rete/timeout -> nessuna evidenza;
//     mai un'evidenza "pulita" da una risposta che non lo e (non-2xx o corpo illeggibile -> solo http_status + hash);
//   * nessun dato carta o personale nell'evidenza (whitelist di campi tecnici).

import { createHash } from 'node:crypto';
import process from 'node:process';

export const FOOD_CLUB_RELEASE_ENV = 'FOOD_CLUB_RELEASE_ENABLED';
export const SUMUP_CHECKOUTS_URL = 'https://api.sumup.com/v0.1/checkouts';
export const SUMUP_READ_TIMEOUT_MS = 4000;
export const PHASE_BUDGET_MS = 10 * 1000;
export const MAX_ORDERS_PER_PHASE = 5;
export const CANDIDATE_MIN_AGE_MS = 17 * 60 * 1000;
export const SEAL_WAIT_MS = 60 * 1000;
export const SEAL_WAIT_MARGIN_MS = 2000;
// Buoni riservati letti per giro (sono pochi: uno per ordine con buono ancora aperto o trattenuto).
export const MAX_RESERVED_VOUCHERS_SCAN = 200;
// Ordini candidati letti prima della rotazione (vedi selectCandidates).
export const MAX_CANDIDATE_ORDERS_SCAN = 50;

const LOG_TAG = 'food-club-voucher-release';
const CLOSED_STATUSES = ['cancelled', 'payment_abandoned'];
const CHECKOUT_ID_SHAPE = /^[A-Za-z0-9_-]{1,100}$/;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;
const AMOUNT_TEXT = /^\d{1,8}(\.\d{1,2})?$/;

export function isFoodClubReleaseEnabled(env = process.env) {
  return env?.[FOOD_CLUB_RELEASE_ENV] === 'true';
}

// ---------------------------------------------------------------------------------------------------------------
// Lettura SumUp (sola GET)
// ---------------------------------------------------------------------------------------------------------------

// Wrapper: qualunque metodo diverso da GET viene rifiutato prima di toccare la rete.
export function makeReadOnlySumupFetch(fetchImpl, sumupApiKey) {
  return async (url, opts = {}) => {
    const method = String(opts.method || 'GET').toUpperCase();
    if (method !== 'GET') throw new Error(`${LOG_TAG}: metodo ${method} vietato (sola lettura)`);
    if (typeof url !== 'string' || !url.startsWith(`${SUMUP_CHECKOUTS_URL}`)) throw new Error(`${LOG_TAG}: URL non ammesso`);
    if (opts.body !== undefined) throw new Error(`${LOG_TAG}: corpo vietato in lettura`);
    return fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${sumupApiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(SUMUP_READ_TIMEOUT_MS),
    });
  };
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

// Ritorna { ok: true, status, sha256, json, jsonOk } oppure { ok: false } (rete/timeout/lettura corpo fallita).
async function readSumup(getFetch, url) {
  let res;
  let text;
  try {
    res = await getFetch(url);
    text = await res.text();
  } catch (err) {
    console.error(`[${LOG_TAG}] SumUp read failed`, { message: String(err?.name || 'error') });
    return { ok: false };
  }
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  const parsed = parseJson(text);
  return { ok: true, status: res.status, sha256, json: parsed.value, jsonOk: parsed.ok };
}

// ---------------------------------------------------------------------------------------------------------------
// Normalizzazione (pura): solo campi del tipo giusto, gli altri omessi
// ---------------------------------------------------------------------------------------------------------------

const isShortString = (v) => typeof v === 'string' && v.length <= 200;
const isSmallInt = (v) => Number.isInteger(v) && v >= 0 && v <= 100000;
function isAmount(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && AMOUNT_TEXT.test(String(v));
}
function isTimestamp(v) {
  return typeof v === 'string' && v.length <= 40 && ISO_TS.test(v) && !Number.isNaN(Date.parse(v));
}

// Campi del checkout SumUp -> campi evidenza. Mai dati carta/personali (transactions, card, customer: esclusi).
export function checkoutFields(item) {
  const out = {};
  if (!item || typeof item !== 'object' || Array.isArray(item)) return out;
  if (isShortString(item.id)) out.checkout_id = item.id;
  if (isShortString(item.checkout_reference)) out.checkout_reference = item.checkout_reference;
  if (isShortString(item.status)) out.sumup_status = item.status;
  if (isAmount(item.amount)) out.amount = item.amount;
  if (isShortString(item.currency)) out.currency = item.currency;
  if (isShortString(item.merchant_code)) out.merchant_code = item.merchant_code;
  if (isTimestamp(item.valid_until)) out.valid_until = item.valid_until;
  return out;
}

function baseFields(read) {
  const out = {};
  if (isSmallInt(read.status)) out.http_status = read.status;
  if (/^[0-9a-f]{64}$/.test(read.sha256)) out.body_sha256 = read.sha256;
  return out;
}

// List per checkout_reference. list_count = elementi con checkout_reference === attemptId (solo se body array);
// esattamente 1 -> anche i campi di quell'elemento. Non-2xx o corpo illeggibile -> solo http_status + hash.
// Fix fase A (SB-4): zero match ma corpo con ALTRI elementi (filtro per reference non applicato da SumUp, elementi non
// oggetto) -> list_count omesso: una List non filtrata (senza paginazione documentata) non prova che il checkout manchi.
// L'SQL tratta list_count assente come 'list_unexpected_count' (uncertain). Con >= 1 match il conteggio resta quello dei match.
export function listEvidenceFields(read, attemptId) {
  const out = baseFields(read);
  if (read.status < 200 || read.status > 299 || !read.jsonOk || !Array.isArray(read.json)) return out;
  const matches = read.json.filter((c) => c && typeof c === 'object' && c.checkout_reference === attemptId);
  if (matches.length === 0 && read.json.length > 0) return out;
  if (!isSmallInt(matches.length)) return out;
  out.list_count = matches.length;
  if (matches.length === 1) Object.assign(out, checkoutFields(matches[0]));
  return out;
}

// GET di un checkout. Non-2xx o corpo non oggetto -> solo http_status + hash.
export function getEvidenceFields(read) {
  const out = baseFields(read);
  if (read.status < 200 || read.status > 299 || !read.jsonOk) return out;
  return Object.assign(out, checkoutFields(read.json));
}

// ---------------------------------------------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------------------------------------------

function rpcMessage(error) {
  return String(error?.message || error || '');
}

// Registra un'evidenza. Se l'SQL rifiuta un campo (evidence_bad_field: <campo>), riprova UNA volta senza quel campo:
// un PAID non deve perdersi per un campo strano. Ritorna 'recorded' | 'too_early' | 'error'.
async function recordEvidence({ supabaseAdmin, attemptId, kind, fields }) {
  let current = { ...fields };
  for (let i = 0; i < 2; i += 1) {
    const { error } = await supabaseAdmin.rpc('food_club_record_checkout_evidence', {
      p_attempt_id: attemptId, p_kind: kind, p_fields: current,
    });
    if (!error) return 'recorded';
    const msg = rpcMessage(error);
    if (msg.includes('evidence_too_early')) return 'too_early';
    const bad = msg.match(/evidence_bad_field: ([a-z_0-9]+)/);
    if (i === 0 && bad && Object.prototype.hasOwnProperty.call(current, bad[1])) {
      current = { ...current };
      delete current[bad[1]];
      continue;
    }
    console.error(`[${LOG_TAG}] evidence RPC failed`, { attemptId, kind, message: msg.slice(0, 120) });
    return 'error';
  }
  return 'error';
}

// ---------------------------------------------------------------------------------------------------------------
// Candidati
// ---------------------------------------------------------------------------------------------------------------

// Buoni riservati -> ordini chiusi da oltre 17 min. Rotazione: prima i NON sigillati (piu vecchi prima), poi i
// sigillati meno controllati di recente (last_check_at piu vecchio / mai). Senza rotazione un ordine che resta
// 'uncertain' (oggi P-B/P-C con costanti false) occuperebbe per sempre i posti del giro.
async function selectCandidates({ supabaseAdmin, nowMs, maxOrders }) {
  const { data: vouchers, error: vErr } = await supabaseAdmin
    .from('food_club_vouchers')
    .select('reserved_order_id')
    .eq('status', 'reserved')
    .not('reserved_order_id', 'is', null)
    .limit(MAX_RESERVED_VOUCHERS_SCAN);
  if (vErr) throw vErr;
  const ids = [...new Set((vouchers || []).map((v) => v.reserved_order_id).filter((id) => typeof id === 'string' && id))];
  if (ids.length === 0) return [];

  const cutoffIso = new Date(nowMs - CANDIDATE_MIN_AGE_MS).toISOString();
  const { data: orders, error: oErr } = await supabaseAdmin
    .from('kitchen_orders')
    .select('id, created_at, status')
    .in('id', ids)
    .in('status', CLOSED_STATUSES)
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: true })
    .limit(MAX_CANDIDATE_ORDERS_SCAN);
  if (oErr) throw oErr;
  const list = orders || [];
  if (list.length === 0) return [];

  const { data: seals, error: sErr } = await supabaseAdmin
    .from('food_club_release_seals')
    .select('order_id, sealed_at, last_check_at')
    .in('order_id', list.map((o) => o.id));
  if (sErr) throw sErr;
  const sealById = new Map((seals || []).map((s) => [s.order_id, s]));

  const unsealed = list.filter((o) => !sealById.has(o.id));
  const sealed = list.filter((o) => sealById.has(o.id));
  const checkMs = (o) => {
    const t = Date.parse(sealById.get(o.id)?.last_check_at ?? '');
    return Number.isNaN(t) ? -Infinity : t;
  };
  sealed.sort((a, b) => checkMs(a) - checkMs(b) || Date.parse(a.created_at) - Date.parse(b.created_at));
  return [...unsealed, ...sealed].slice(0, maxOrders);
}

// ---------------------------------------------------------------------------------------------------------------
// Ordine singolo
// ---------------------------------------------------------------------------------------------------------------

async function processOrder({ supabaseAdmin, getFetch, orderId, now, overBudget, summary }) {
  const { data: seal, error: sealErr } = await supabaseAdmin.rpc('food_club_seal_order_for_release', { p_order_id: orderId });
  if (sealErr) throw sealErr;
  if (!seal || seal.ok !== true) {
    return { outcome: 'not_released', reason: `seal_${seal?.reason ?? 'unknown'}` };
  }
  if (seal.already_sealed === false) summary.sealed += 1;

  const sealedMs = Date.parse(seal.sealed_at ?? '');
  if (Number.isNaN(sealedMs)) return { outcome: 'not_released', reason: 'seal_invalid_sealed_at' };
  if (now() < sealedMs + SEAL_WAIT_MS + SEAL_WAIT_MARGIN_MS) return { outcome: 'waiting', reason: 'sealed_recently' };

  const { data: attempts, error: aErr } = await supabaseAdmin
    .from('kitchen_payments')
    .select('id, provider, provider_ref, checkout_claim_at, amount, status')
    .eq('order_id', orderId)
    .eq('direction', 'charge')
    .order('id', { ascending: true });
  if (aErr) throw aErr;

  for (const attempt of attempts || []) {
    if (attempt?.provider !== 'sumup') continue; // banco: nessuna lettura; l'SQL lo ignora o lo marca uncertain
    const hasRef = typeof attempt.provider_ref === 'string' && attempt.provider_ref.length > 0;
    const hasClaim = attempt.checkout_claim_at !== null && attempt.checkout_claim_at !== undefined;
    if (!hasRef && !hasClaim) continue; // P-A: prova solo DB, nessuna chiamata SumUp
    if (typeof attempt.id !== 'string' || !attempt.id) throw new Error('attempt_without_id');

    // 1) List per checkout_reference = attempt.id
    if (overBudget()) return { outcome: 'deferred', reason: 'budget' };
    const listRead = await readSumup(getFetch, `${SUMUP_CHECKOUTS_URL}?checkout_reference=${encodeURIComponent(attempt.id)}`);
    let listFoundId = null;
    if (listRead.ok) {
      const fields = listEvidenceFields(listRead, attempt.id);
      if (fields.list_count === 1 && typeof fields.checkout_id === 'string') listFoundId = fields.checkout_id;
      const r = await recordEvidence({ supabaseAdmin, attemptId: attempt.id, kind: 'list', fields });
      if (r === 'too_early') return { outcome: 'waiting', reason: 'evidence_too_early' };
      if (r === 'error') return { outcome: 'error', reason: 'evidence_rpc_failed' };
      summary.evidence_recorded += 1;
    }

    // 2) Una GET per attempt per giro: provider_ref, oppure l'unico id trovato dalla List.
    const getId = hasRef ? attempt.provider_ref : listFoundId;
    if (getId && CHECKOUT_ID_SHAPE.test(getId)) {
      if (overBudget()) return { outcome: 'deferred', reason: 'budget' };
      const getRead = await readSumup(getFetch, `${SUMUP_CHECKOUTS_URL}/${encodeURIComponent(getId)}`);
      if (getRead.ok) {
        const r = await recordEvidence({ supabaseAdmin, attemptId: attempt.id, kind: 'get', fields: getEvidenceFields(getRead) });
        if (r === 'too_early') return { outcome: 'waiting', reason: 'evidence_too_early' };
        if (r === 'error') return { outcome: 'error', reason: 'evidence_rpc_failed' };
        summary.evidence_recorded += 1;
      }
    } else if (getId) {
      console.error(`[${LOG_TAG}] checkout id with unexpected shape, GET skipped`, { attemptId: attempt.id });
    }
  }

  const { data: rel, error: relErr } = await supabaseAdmin.rpc('food_club_release_voucher_after_evidence', { p_order_id: orderId });
  if (relErr) throw relErr;
  if (rel?.ok === true && rel.released === true) return { outcome: 'released' };
  return { outcome: 'not_released', reason: rel?.reason ?? rel?.result ?? 'unknown' };
}

// ---------------------------------------------------------------------------------------------------------------
// Fase
// ---------------------------------------------------------------------------------------------------------------

export async function runFoodClubReleasePhase({
  supabaseAdmin,
  sumupApiKey,
  now = () => Date.now(),
  fetchImpl = fetch,
  budgetMs = PHASE_BUDGET_MS,
  maxOrders = MAX_ORDERS_PER_PHASE,
} = {}) {
  const summary = {
    scanned: 0, sealed: 0, waiting: [], evidence_recorded: 0, released: [], not_released: [], errors: [], deferred: 0,
  };
  try {
    const startedMs = now();
    const overBudget = () => now() - startedMs > budgetMs;
    const getFetch = makeReadOnlySumupFetch(fetchImpl, sumupApiKey);
    const candidates = await selectCandidates({ supabaseAdmin, nowMs: startedMs, maxOrders });
    summary.scanned = candidates.length;

    for (const order of candidates) {
      if (overBudget()) {
        summary.deferred += 1;
        continue;
      }
      let result;
      try {
        result = await processOrder({ supabaseAdmin, getFetch, orderId: order.id, now, overBudget, summary });
      } catch (err) {
        const msg = rpcMessage(err);
        if (msg.includes('evidence_too_early')) {
          summary.waiting.push({ order_id: order.id, reason: 'evidence_too_early' });
          continue;
        }
        console.error(`[${LOG_TAG}] order failed`, { orderId: order.id, message: msg.slice(0, 120) });
        summary.errors.push({ order_id: order.id, reason: 'exception' });
        continue;
      }
      if (result.outcome === 'released') summary.released.push(order.id);
      else if (result.outcome === 'waiting') summary.waiting.push({ order_id: order.id, reason: result.reason });
      else if (result.outcome === 'deferred') summary.deferred += 1;
      else if (result.outcome === 'error') summary.errors.push({ order_id: order.id, reason: result.reason });
      else summary.not_released.push({ order_id: order.id, reason: result.reason });
    }
  } catch (err) {
    console.error(`[${LOG_TAG}] phase failed`, { message: rpcMessage(err).slice(0, 120) });
    summary.errors.push({ order_id: null, reason: 'phase_exception' });
  }
  return summary;
}
