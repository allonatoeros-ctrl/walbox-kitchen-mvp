// 20260913120000_kitchen_payment_counter_online_exclusivity_v1.test.js — F03: Cash/POS vs SumUp
// online mutual exclusivity (kitchen_payment_record_counter, kitchen_payment_confirm).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260830101227_kitchen_payment_failed_retry_promotion_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260913120000_kitchen_payment_counter_online_exclusivity_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260913120000_kitchen_payment_counter_online_exclusivity_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

// ---- kitchen_payment_record_counter (F03 fix) ---------------------------------------------------

test('record_counter: blocca su charge initiated/pending (SumUp active -> counter reject)', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const guardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  assert.ok(guardIdx > -1, 'deve esistere un raise dedicato online_payment_in_progress');
  const guardStart = fn.lastIndexOf('IF EXISTS', guardIdx);
  const guard = fn.slice(guardStart, guardIdx);
  assert.match(guard, /status IN \('initiated', 'pending'\)/);
});

test('record_counter: blocca su charge failed/sumup_failed (finestra di retry stesso-checkout, "ambiguous")', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const guardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  const guardStart = fn.lastIndexOf('IF EXISTS', guardIdx);
  const guard = fn.slice(guardStart, guardIdx);
  assert.match(guard, /status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed'/);
});

test('record_counter: NON blocca su failed terminale (expired/cancelled/amount_mismatch) -> retry consentito', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const guardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  const guardStart = fn.lastIndexOf('IF EXISTS', guardIdx);
  const guard = fn.slice(guardStart, guardIdx);
  assert.doesNotMatch(guard, /sumup_expired/);
  assert.doesNotMatch(guard, /sumup_cancelled/);
  assert.doesNotMatch(guard, /sumup_amount_mismatch/);
});

test('record_counter: il check su succeeded esistente resta invariato e viene valutato PRIMA del nuovo guard (idempotenza preservata, SumUp succeeded -> counter reject)', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const succeededCheckIdx = fn.indexOf("status = 'succeeded'\n  LIMIT 1");
  const existingReturnIdx = fn.indexOf('RETURN v_existing', succeededCheckIdx);
  const newGuardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  assert.ok(succeededCheckIdx > -1 && existingReturnIdx > succeededCheckIdx, 'il ramo idempotente su succeeded deve esistere ed essere invariato');
  assert.ok(existingReturnIdx < newGuardIdx, 'il check su succeeded (idempotente, invariato) deve precedere il nuovo guard bloccante');
});

test('record_counter: il nuovo guard usa un errore distinto (online_payment_in_progress), non riusa order_already_paid', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  assert.doesNotMatch(fn, /order_already_paid/, 'record_counter non deve introdurre/riusare order_already_paid: deve restare distinguibile dal caso idempotente su succeeded');
});

test('record_counter: il guard e posizionato PRIMA di qualunque INSERT/UPDATE (nessuna scrittura se bloccato)', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const guardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_payments');
  const updateIdx = fn.indexOf('UPDATE public.kitchen_orders');
  assert.ok(guardIdx > -1 && guardIdx < insertIdx && guardIdx < updateIdx, 'il RAISE deve precedere ogni scrittura su kitchen_payments/kitchen_orders');
});

test('record_counter: il nuovo guard usa solo status di kitchen_payments gia esistenti nel CHECK constraint (nessun nuovo status introdotto)', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  const guardIdx = fn.indexOf("RAISE EXCEPTION 'online_payment_in_progress'");
  const guardStart = fn.lastIndexOf('IF EXISTS', guardIdx);
  const guard = fn.slice(guardStart, guardIdx);
  const allowedStatus = ["'succeeded'", "'initiated'", "'pending'", "'failed'", "'cancelled'"];
  const nonStatusLiterals = ["'sumup'", "'sumup_failed'", "'charge'"]; // provider / failure_reason / direction, altro dominio
  for (const token of guard.match(/'[a-z_]+'/g) ?? []) {
    if (nonStatusLiterals.includes(token)) continue;
    assert.ok(allowedStatus.includes(token), `status letterale non riconosciuto nel nuovo guard: ${token}`);
  }
});

// ---- kitchen_payment_confirm (F03 fix: log della race persa) -------------------------------------

test('confirm: il ramo unique_violation resta idempotente (nessun RAISE, ritorna sempre v_payment)', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const exceptionIdx = fn.indexOf('EXCEPTION WHEN unique_violation');
  const endIdx = fn.indexOf('END;', exceptionIdx);
  const branch = fn.slice(exceptionIdx, endIdx);
  assert.doesNotMatch(branch, /RAISE EXCEPTION/, 'il ramo di race persa non deve mai sollevare un errore al chiamante (invariante idempotent-confirm)');
  assert.match(branch, /RETURN v_payment/);
});

test('confirm: il ramo unique_violation scrive un kitchen_action_log payment_confirm_lost_race prima del RETURN', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const exceptionIdx = fn.indexOf('EXCEPTION WHEN unique_violation');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_action_log', exceptionIdx);
  const returnIdx = fn.indexOf('RETURN v_payment', exceptionIdx);
  assert.ok(insertIdx > exceptionIdx, 'deve esistere un INSERT in kitchen_action_log dentro il ramo unique_violation');
  assert.ok(insertIdx < returnIdx, 'il log va scritto prima del RETURN');
  const insertBlock = fn.slice(insertIdx, returnIdx);
  assert.match(insertBlock, /'payment_confirm_lost_race'/);
  assert.match(insertBlock, /'losing_attempt_id',\s*p_attempt_id/);
  assert.match(insertBlock, /'winning_payment_id',\s*v_payment\.id/);
});

test('confirm: promozione failed->succeeded resta ammessa solo per provider=sumup AND failure_reason=sumup_failed (invariato)', () => {
  const fn = fnBody('kitchen_payment_confirm');
  assert.match(fn, /v_payment\.status = 'failed' AND v_payment\.provider = 'sumup' AND v_payment\.failure_reason = 'sumup_failed'/);
});

test('confirm: service_role_only invariato', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const idx = fn.indexOf("auth.role() <> 'service_role'");
  assert.ok(idx > -1 && idx < fn.indexOf('SELECT * INTO v_payment'));
});

test('confirm: succeeded resta terminale (early RETURN prima di qualunque UPDATE), invariato', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const idx = fn.indexOf("v_payment.status = 'succeeded'");
  const returnIdx = fn.indexOf('RETURN v_payment', idx);
  const updateIdx = fn.indexOf('UPDATE public.kitchen_payments', idx);
  assert.ok(idx > -1 && returnIdx > idx && returnIdx < updateIdx);
});

// ---- invarianti di sistema (indice unique, refund, claim, grants) --------------------------------

test('nessuna modifica a schema/indici/constraint (solo CREATE OR REPLACE FUNCTION + GRANT/REVOKE)', () => {
  assert.doesNotMatch(src, /ALTER TABLE/i);
  assert.doesNotMatch(src, /CREATE (UNIQUE )?INDEX/i);
  assert.doesNotMatch(src, /CREATE TYPE/i);
  assert.doesNotMatch(src, /DROP /i);
});

test('nessun riferimento a refund/claim-checkout: invarianti double-refund e atomic-claim non toccate da questa migration', () => {
  assert.doesNotMatch(src, /kitchen_payment_refund/i);
  assert.doesNotMatch(src, /kitchen_payment_attempt_claim_checkout/i);
});

test('grant execute invariati (record_counter->authenticated, confirm->service_role)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_payment_record_counter\(text, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_record_counter\(text, text\) TO authenticated;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\)\s+TO service_role;/);
});

test('amount server-authoritative invariato: record_counter deriva sempre v_order.total, nessun parametro p_amount', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  assert.doesNotMatch(fn, /p_amount/);
  assert.match(fn, /v_order\.total/);
});

console.log('20260913120000_kitchen_payment_counter_online_exclusivity_v1.test.js: tutti i test passati.');
