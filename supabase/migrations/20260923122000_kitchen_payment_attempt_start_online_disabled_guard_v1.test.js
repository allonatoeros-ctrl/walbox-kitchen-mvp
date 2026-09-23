// 20260923122000_kitchen_payment_attempt_start_online_disabled_guard_v1.test.js — BUG A fix,
// kitchen_payment_attempt_start rifiuta un nuovo attempt online se online_payment_disabled=true.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260923122000_kitchen_payment_attempt_start_online_disabled_guard_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260923122000_kitchen_payment_attempt_start_online_disabled_guard_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

const fn = fnBody('kitchen_payment_attempt_start');

test('rifiuta un nuovo attempt online (RAISE online_payment_disabled) quando v_order.online_payment_disabled e true', () => {
  assert.match(fn, /IF v_order\.online_payment_disabled THEN\s*\n\s*RAISE EXCEPTION 'online_payment_disabled';/);
});

test('il guard vive dentro il ramo p_channel = app, dopo not_order_owner e prima di v_actor_type := customer', () => {
  const appBranchIdx = fn.indexOf("IF p_channel = 'app' THEN");
  const notOwnerIdx = fn.indexOf("RAISE EXCEPTION 'not_order_owner';", appBranchIdx);
  const guardIdx = fn.indexOf("v_order.online_payment_disabled THEN", appBranchIdx);
  const customerAssignIdx = fn.indexOf("v_actor_type := 'customer';", appBranchIdx);
  const counterBranchIdx = fn.indexOf("ELSIF p_channel = 'counter' THEN", appBranchIdx);
  assert.ok(appBranchIdx > -1 && notOwnerIdx > appBranchIdx, 'il ramo app e il check not_order_owner devono esistere');
  assert.ok(guardIdx > notOwnerIdx, 'online_payment_disabled deve essere valutato dopo not_order_owner');
  assert.ok(customerAssignIdx > guardIdx, 'online_payment_disabled deve precedere v_actor_type := customer');
  assert.ok(customerAssignIdx < counterBranchIdx, 'il guard e l assegnazione customer restano dentro il ramo app, prima del ramo counter');
});

test('il canale counter (staff) NON e toccato dal nuovo guard: nessun riferimento a online_payment_disabled nel ramo counter', () => {
  const counterBranchIdx = fn.indexOf("ELSIF p_channel = 'counter' THEN");
  const elseIdx = fn.indexOf('ELSE', counterBranchIdx);
  const counterBranch = fn.slice(counterBranchIdx, elseIdx);
  assert.doesNotMatch(counterBranch, /online_payment_disabled/);
  assert.match(counterBranch, /is_staff_for_venue\(v_order\.venue_id\)/);
});

test('not_order_owner resta valutato per primo nel ramo app: un device non proprietario non deve mai scoprire online_payment_disabled', () => {
  const appBranchIdx = fn.indexOf("IF p_channel = 'app' THEN");
  const notOwnerCheckIdx = fn.indexOf('v_order.customer_id IS NULL OR v_order.customer_id <> auth.uid()', appBranchIdx);
  const guardIdx = fn.indexOf('v_order.online_payment_disabled THEN', appBranchIdx);
  assert.ok(notOwnerCheckIdx > -1 && guardIdx > notOwnerCheckIdx);
});

test('invariati: order_not_found, order_cancelled, order_already_paid, invalid_channel, amount_mismatch, duplicate/same-checkout-retry guard, grant', () => {
  assert.match(fn, /RAISE EXCEPTION 'order_not_found';/);
  assert.match(fn, /RAISE EXCEPTION 'order_cancelled';/);
  assert.match(fn, /RAISE EXCEPTION 'order_already_paid';/);
  assert.match(fn, /RAISE EXCEPTION 'invalid_channel';/);
  assert.match(fn, /RAISE EXCEPTION 'amount_mismatch';/);
  assert.match(fn, /status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed'/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_start\(text, text, text, text, numeric, text\)\s+TO authenticated;/);
});

test('non ridefinisce kitchen_payment_confirm/kitchen_payment_fail/kitchen_payment_attempt_close_unpaid in questo file', () => {
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_confirm\(/);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_fail\(/);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_attempt_close_unpaid\(/);
});

test('SECURITY DEFINER con search_path fissato (invariato)', () => {
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path TO 'public', 'pg_temp'/);
});

console.log('20260923122000_kitchen_payment_attempt_start_online_disabled_guard_v1.test.js: tutti i test passati.');
