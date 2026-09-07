// 20260830101227_kitchen_payment_failed_retry_promotion_v1.test.js — contratto
// kitchen_payment_attempt_start / kitchen_payment_confirm / kitchen_payment_fail dopo la fix
// "same-checkout retry" (LONG SESSION F).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260830101227_kitchen_payment_failed_retry_promotion_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260830101227_kitchen_payment_failed_retry_promotion_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

// ---- kitchen_payment_attempt_start -------------------------------------------------------------

test('attempt_start: un attempt failed sumup/sumup_failed blocca un nuovo attempt (stesso guard di initiated/pending)', () => {
  const fn = fnBody('kitchen_payment_attempt_start');
  assert.match(fn, /status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed'/);
  const guardStart = fn.indexOf('SELECT \* INTO v_existing');
  const returnIdx = fn.indexOf('RETURN v_existing', guardStart);
  const reasonIdx = fn.indexOf("failure_reason = 'sumup_failed'", guardStart);
  assert.ok(guardStart > -1 && reasonIdx > guardStart && returnIdx > reasonIdx, 'la condizione failed/sumup_failed deve far parte del guard che precede RETURN v_existing');
});

test('attempt_start: il blocco su failed non e ristretto al provider/method richiesto dal nuovo tentativo (protegge l\'ordine, non solo lo stesso metodo)', () => {
  const fn = fnBody('kitchen_payment_attempt_start');
  const guardStart = fn.indexOf('WHERE order_id = p_order_id');
  const guardEnd = fn.indexOf('LIMIT 1', guardStart);
  const guard = fn.slice(guardStart, guardEnd);
  assert.doesNotMatch(guard, /p_provider|p_method/, 'il guard non deve filtrare per il provider/method del NUOVO tentativo');
});

test('attempt_start: altri failure_reason (expired/cancelled/amount_mismatch) NON bloccano un nuovo attempt', () => {
  const fn = fnBody('kitchen_payment_attempt_start');
  const guardStart = fn.indexOf('WHERE order_id = p_order_id');
  const guardEnd = fn.indexOf('LIMIT 1', guardStart);
  const guard = fn.slice(guardStart, guardEnd);
  assert.doesNotMatch(guard, /sumup_expired/);
  assert.doesNotMatch(guard, /sumup_cancelled/);
  assert.doesNotMatch(guard, /sumup_amount_mismatch/);
});

test('attempt_start: nessun bypass basato su timeout/TTL', () => {
  const fn = fnBody('kitchen_payment_attempt_start');
  assert.doesNotMatch(fn, /created_at\s*[<>]/);
  assert.doesNotMatch(fn, /interval/i);
});

// ---- kitchen_payment_confirm --------------------------------------------------------------------

test('confirm: promozione failed->succeeded ammessa SOLO per provider=sumup AND failure_reason=sumup_failed', () => {
  const fn = fnBody('kitchen_payment_confirm');
  assert.match(fn, /v_payment\.status = 'failed' AND v_payment\.provider = 'sumup' AND v_payment\.failure_reason = 'sumup_failed'/);
});

test('confirm: succeeded resta sempre terminale (idempotent no-op via early RETURN, mai una seconda UPDATE)', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const idx = fn.indexOf("v_payment.status = 'succeeded'");
  const returnIdx = fn.indexOf('RETURN v_payment', idx);
  const updateIdx = fn.indexOf('UPDATE public.kitchen_payments', idx);
  assert.ok(idx > -1 && returnIdx > idx && returnIdx < updateIdx, 'il check su succeeded deve ritornare prima di qualunque UPDATE');
});

test('confirm: cancelled non e mai ammesso alla promozione (non compare nella condizione di eccezione)', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const guardStart = fn.indexOf("IF v_payment.status NOT IN");
  const guardEnd = fn.indexOf('RAISE EXCEPTION', guardStart);
  const guard = fn.slice(guardStart, guardEnd);
  assert.doesNotMatch(guard, /'cancelled'/);
});

test('confirm: failure_reason viene azzerato quando l\'attempt passa a succeeded (niente reason stantio su una riga succeeded)', () => {
  const fn = fnBody('kitchen_payment_confirm');
  assert.match(fn, /SET status = 'succeeded'.*failure_reason = NULL/s);
});

test('confirm: service_role_only invariato', () => {
  const fn = fnBody('kitchen_payment_confirm');
  const idx = fn.indexOf("auth.role() <> 'service_role'");
  assert.ok(idx > -1 && idx < fn.indexOf('SELECT * INTO v_payment'), 'il check service_role deve precedere qualunque lettura/scrittura');
});

// ---- kitchen_payment_fail ------------------------------------------------------------------------

test('fail: un attempt gia failed puo essere ri-processato (idempotente), succeeded/cancelled restano vietati', () => {
  const fn = fnBody('kitchen_payment_fail');
  assert.match(fn, /IF v_payment\.status NOT IN \('initiated', 'pending', 'failed'\) THEN/);
});

test('fail: re-check con lo stesso motivo -> nessun nuovo INSERT in kitchen_action_log (niente log spam)', () => {
  const fn = fnBody('kitchen_payment_fail');
  const idx = fn.indexOf('v_old_reason IS NOT DISTINCT FROM p_reason');
  const returnIdx = fn.indexOf('RETURN v_payment', idx);
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_action_log', idx);
  assert.ok(idx > -1 && returnIdx > idx, 'il ramo idempotente deve esistere');
  assert.ok(returnIdx < insertIdx, 'il ramo idempotente deve fare RETURN prima di arrivare all\'INSERT del log');
});

test('fail: kitchen_orders non viene mai toccato (ne payment_status ne status)', () => {
  const fn = fnBody('kitchen_payment_fail');
  assert.doesNotMatch(fn, /UPDATE public\.kitchen_orders/);
});

test('fail: su attempt status=failed, staff viene rifiutato (not_authorized) PRIMA di qualunque scrittura', () => {
  const fn = fnBody('kitchen_payment_fail');
  const statusGuardIdx = fn.indexOf("IF v_payment.status NOT IN ('initiated', 'pending', 'failed') THEN");
  const authGuardIdx = fn.indexOf("IF auth.role() = 'service_role' THEN", statusGuardIdx);
  const failedBranchIdx = fn.indexOf("ELSIF v_payment.status = 'failed' THEN", authGuardIdx);
  const notAuthorizedIdx = fn.indexOf("RAISE EXCEPTION 'not_authorized'", failedBranchIdx);
  const staffBranchIdx = fn.indexOf('is_staff_for_venue', authGuardIdx);
  const updateIdx = fn.indexOf('UPDATE public.kitchen_payments', authGuardIdx);
  assert.ok(
    authGuardIdx > -1 && failedBranchIdx > authGuardIdx && notAuthorizedIdx > failedBranchIdx,
    'lo status failed deve essere respinto con not_authorized prima del ramo staff'
  );
  assert.ok(
    failedBranchIdx < staffBranchIdx,
    'il branch "status=failed" deve essere valutato prima del branch is_staff_for_venue, cosi lo staff non lo raggiunge mai su un attempt failed'
  );
  assert.ok(notAuthorizedIdx < updateIdx, 'il rifiuto per status=failed deve avvenire prima di qualunque UPDATE');
});

test('fail: su attempt status=failed, service_role resta consentito (v_actor_type=system)', () => {
  const fn = fnBody('kitchen_payment_fail');
  const authGuardIdx = fn.indexOf("IF auth.role() = 'service_role' THEN");
  const systemAssignIdx = fn.indexOf("v_actor_type := 'system'", authGuardIdx);
  assert.ok(authGuardIdx > -1 && systemAssignIdx > authGuardIdx, 'service_role deve restare il primo ramo controllato, indipendentemente dallo status');
});

test('fail: su attempt status initiated/pending, il comportamento resta invariato (staff autorizzato o service_role)', () => {
  const fn = fnBody('kitchen_payment_fail');
  const authGuardIdx = fn.indexOf("IF auth.role() = 'service_role' THEN");
  const failedBranchIdx = fn.indexOf("ELSIF v_payment.status = 'failed' THEN", authGuardIdx);
  const staffBranchIdx = fn.indexOf('is_staff_for_venue', authGuardIdx);
  const staffAssignIdx = fn.indexOf("v_actor_type := 'staff'", staffBranchIdx);
  assert.ok(
    failedBranchIdx > -1 && staffBranchIdx > failedBranchIdx && staffAssignIdx > staffBranchIdx,
    'il branch is_staff_for_venue (per initiated/pending) deve seguire il branch status=failed e assegnare v_actor_type=staff, senza condizioni aggiuntive sullo status'
  );
});

test('fail: primo fail (non re-check) -> metadata e sempre \'{}\'::jsonb, mai NULL esplicito', () => {
  const fn = fnBody('kitchen_payment_fail');
  const metadataIdx = fn.indexOf("CASE WHEN v_was_failed THEN jsonb_build_object");
  const metadataExpr = fn.slice(metadataIdx, fn.indexOf('END', metadataIdx) + 3);
  assert.match(
    metadataExpr,
    /CASE WHEN v_was_failed THEN jsonb_build_object\('recheck_reason_changed_from', v_old_reason\) ELSE '\{\}'::jsonb END/,
    'il ramo ELSE (primo fail, v_was_failed = false) deve produrre \'{}\'::jsonb, non NULL, per rispettare kitchen_action_log.metadata NOT NULL DEFAULT \'{}\'::jsonb'
  );
  assert.doesNotMatch(metadataExpr, /ELSE NULL END/, 'il metadata non deve mai essere NULL esplicito');
});

test('fail: re-check con reason cambiata -> metadata contiene recheck_reason_changed_from', () => {
  const fn = fnBody('kitchen_payment_fail');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_action_log');
  const valuesIdx = fn.indexOf('VALUES', insertIdx);
  const metadataExpr = fn.slice(valuesIdx, fn.indexOf(');', valuesIdx));
  assert.match(
    metadataExpr,
    /CASE WHEN v_was_failed THEN jsonb_build_object\('recheck_reason_changed_from', v_old_reason\)/,
    'quando v_was_failed e true (re-check con reason diversa, l\'unico caso che arriva a questo INSERT) il metadata deve riportare recheck_reason_changed_from'
  );
});

test('grant execute invariati (attempt_start->authenticated, confirm->service_role, fail->authenticated+service_role)', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_start\(text, text, text, text, numeric, text\)\s+TO authenticated;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\)\s+TO service_role;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_fail\(uuid, text, jsonb\)\s+TO authenticated, service_role;/);
});

console.log('20260830101227_kitchen_payment_failed_retry_promotion_v1.test.js: tutti i test passati.');
