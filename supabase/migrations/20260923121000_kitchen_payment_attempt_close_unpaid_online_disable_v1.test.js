// 20260923121000_kitchen_payment_attempt_close_unpaid_online_disable_v1.test.js — BUG A fix,
// kitchen_payment_attempt_close_unpaid ora marca l'ordine online_payment_disabled=true.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260923100000_kitchen_payment_attempt_close_unpaid_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260923121000_kitchen_payment_attempt_close_unpaid_online_disable_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260923121000_kitchen_payment_attempt_close_unpaid_online_disable_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

const closeFn = fnBody('kitchen_payment_attempt_close_unpaid');

test('marca online_payment_disabled=true su kitchen_orders quando la funzione procede davvero alla chiusura', () => {
  assert.match(closeFn, /UPDATE public\.kitchen_orders\s+SET online_payment_disabled = true\s+WHERE id = v_payment\.order_id AND online_payment_disabled = false;/);
});

test('la UPDATE su kitchen_orders e idempotente (WHERE online_payment_disabled = false)', () => {
  const idx = closeFn.indexOf('UPDATE public.kitchen_orders');
  const clause = closeFn.slice(idx, closeFn.indexOf(';', idx));
  assert.match(clause, /WHERE id = v_payment\.order_id AND online_payment_disabled = false/);
});

test('la UPDATE su kitchen_orders segue il guard payment_attempt_already_succeeded (mai disabilitare online su un ordine pagato online in race)', () => {
  const succeededIdx = closeFn.indexOf("RAISE EXCEPTION 'payment_attempt_already_succeeded'");
  const ordersUpdateIdx = closeFn.indexOf('UPDATE public.kitchen_orders');
  assert.ok(succeededIdx > -1 && ordersUpdateIdx > -1 && succeededIdx < ordersUpdateIdx);
});

test('la UPDATE su kitchen_orders precede i tre rami di uscita (cancelled no-op, failed non-retry no-op, conversione) cosi copre tutti e tre', () => {
  const ordersUpdateIdx = closeFn.indexOf('UPDATE public.kitchen_orders');
  const cancelledGuardIdx = closeFn.indexOf("v_payment.status = 'cancelled' THEN");
  const failedNonRetryGuardIdx = closeFn.indexOf("v_payment.status = 'failed'\n     AND NOT");
  const paymentsUpdateIdx = closeFn.indexOf('UPDATE public.kitchen_payments');
  assert.ok(ordersUpdateIdx > -1);
  assert.ok(cancelledGuardIdx > ordersUpdateIdx, 'la UPDATE su kitchen_orders deve precedere il ramo cancelled');
  assert.ok(failedNonRetryGuardIdx > ordersUpdateIdx, 'la UPDATE su kitchen_orders deve precedere il ramo failed non-retry');
  assert.ok(paymentsUpdateIdx > ordersUpdateIdx, 'la UPDATE su kitchen_orders deve precedere la UPDATE di conversione su kitchen_payments');
});

test('la UPDATE su kitchen_orders NON tocca status/payment_status (solo online_payment_disabled)', () => {
  const idx = closeFn.indexOf('UPDATE public.kitchen_orders');
  const clause = closeFn.slice(idx, closeFn.indexOf(';', idx));
  assert.doesNotMatch(clause, /\bstatus\s*=/);
  assert.doesNotMatch(clause, /payment_status\s*=/);
});

test('kitchen_orders viene scritta esattamente una volta in tutta la funzione', () => {
  const matches = [...closeFn.matchAll(/UPDATE public\.kitchen_orders/g)];
  assert.equal(matches.length, 1);
});

test('invariato: lock FOR UPDATE, not_a_charge_attempt, not_staff_for_venue, race succeeded, idempotenza cancelled/failed, invalid_attempt_status, action log, grant', () => {
  assert.match(closeFn, /SELECT \* INTO v_payment FROM public\.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;/);
  assert.match(closeFn, /RAISE EXCEPTION 'not_a_charge_attempt';/);
  assert.match(closeFn, /is_staff_for_venue\(v_payment\.venue_id\)/);
  assert.match(closeFn, /RAISE EXCEPTION 'not_staff_for_venue';/);
  assert.match(closeFn, /RAISE EXCEPTION 'payment_attempt_already_succeeded';/);
  assert.match(closeFn, /RAISE EXCEPTION 'invalid_attempt_status';/);
  assert.match(closeFn, /status = 'failed', failure_reason = 'staff_closed_for_counter'/);
  assert.match(closeFn, /'payment_attempt_closed_for_counter'/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_payment_attempt_close_unpaid\(uuid, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_close_unpaid\(uuid, text\) TO authenticated;/);
});

test('SECURITY DEFINER con search_path fissato (stesso pattern delle altre RPC Payment Hub)', () => {
  assert.match(closeFn, /SECURITY DEFINER/);
  assert.match(closeFn, /SET search_path TO 'public', 'pg_temp'/);
});

test('non tocca kitchen_payment_confirm/kitchen_payment_fail/kitchen_payment_record_counter/kitchen_payment_attempt_start esistenti', () => {
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_fail\(/);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_confirm\(/);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_record_counter\(/);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_attempt_start\(/);
});

console.log('20260923121000_kitchen_payment_attempt_close_unpaid_online_disable_v1.test.js: tutti i test passati.');
