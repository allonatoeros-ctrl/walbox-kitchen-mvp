// 20260914090000_kitchen_order_cancel_guard_v1.test.js — REAL_RISKS #1 fix (kitchen_order_cancel).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260913120000_kitchen_payment_counter_online_exclusivity_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260914090000_kitchen_order_cancel_guard_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260914090000_kitchen_order_cancel_guard_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

const fn = fnBody('kitchen_order_cancel');

// ---- step 2: lock ordine + verifica staff venue ---------------------------------------------

test('lock: SELECT ... FOR UPDATE sull ordine prima di qualunque decisione', () => {
  assert.match(fn, /SELECT \* INTO v_order FROM public\.kitchen_orders WHERE id = p_order_id FOR UPDATE;/);
});

test('verifica staff venue: is_staff_for_venue chiamata su v_order.venue_id (non su un parametro client)', () => {
  const idx = fn.indexOf('is_staff_for_venue(v_order.venue_id)');
  assert.ok(idx > -1, 'deve verificare is_staff_for_venue sul venue_id letto dalla riga locked');
});

test('ordine su venue_id di un altro venue -> not_staff_for_venue', () => {
  assert.match(fn, /RAISE EXCEPTION 'not_staff_for_venue';/);
});

// ---- step 3: guard payment_status='paid' -----------------------------------------------------

test('guard: rifiuta con order_already_paid_cannot_cancel quando payment_status=paid', () => {
  const guardIdx = fn.indexOf("v_order.payment_status = 'paid'");
  assert.ok(guardIdx > -1, 'deve esistere un check esplicito su payment_status = paid');
  const raiseIdx = fn.indexOf("RAISE EXCEPTION 'order_already_paid_cannot_cancel'", guardIdx);
  assert.ok(raiseIdx > -1 && raiseIdx - guardIdx < 200, 'il raise deve seguire direttamente il check paid');
});

test('guard: il check paid precede qualunque UPDATE/INSERT (nessuna scrittura se bloccato)', () => {
  const guardIdx = fn.indexOf("v_order.payment_status = 'paid'");
  const updateIdx = fn.indexOf('UPDATE public.kitchen_orders');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_action_log');
  assert.ok(guardIdx > -1 && guardIdx < updateIdx && guardIdx < insertIdx);
});

test('guard: usa solo il valore payment_status=paid, non tocca refunded/cancelled/pending_counter_payment', () => {
  const guardIdx = fn.indexOf("v_order.payment_status = 'paid'");
  const raiseIdx = fn.indexOf("RAISE EXCEPTION 'order_already_paid_cannot_cancel'", guardIdx);
  const guard = fn.slice(guardIdx, raiseIdx);
  assert.doesNotMatch(guard, /refunded/);
  assert.doesNotMatch(guard, /pending_counter_payment/);
});

// ---- step 4: ordine non pagato -> cancel come oggi --------------------------------------------

test('cancel effettivo: stesse colonne del path client legacy (status/cancel_reason/cancelled_at)', () => {
  const updateIdx = fn.indexOf('UPDATE public.kitchen_orders\n  SET status');
  assert.ok(updateIdx > -1, 'deve esistere un UPDATE che setta status/cancel_reason/cancelled_at');
  const setClause = fn.slice(updateIdx, fn.indexOf(';', updateIdx));
  assert.match(setClause, /status = 'cancelled'/);
  assert.match(setClause, /cancel_reason = p_reason/);
  assert.match(setClause, /cancelled_at = now\(\)/);
});

test('cancel effettivo: avviene dopo il guard paid, mai prima', () => {
  const guardIdx = fn.indexOf("v_order.payment_status = 'paid'");
  const updateIdx = fn.indexOf("SET status = 'cancelled'");
  assert.ok(guardIdx < updateIdx);
});

// ---- step 5: dopo refund riuscito -> cancel consentito -----------------------------------------

test('nessun blocco su payment_status=refunded: il guard testa solo = paid, refunded passa oltre', () => {
  // kitchen_payment_refund_confirm porta payment_status a 'refunded' (20260830120000, riga 164):
  // il guard qui deve testare l'uguaglianza esatta con 'paid', non un pattern più ampio.
  assert.match(fn, /IF v_order\.payment_status = 'paid' THEN/);
  assert.doesNotMatch(fn, /payment_status IN \(/);
  assert.doesNotMatch(fn, /payment_status != 'refunded'/);
});

// ---- invarianti generali -------------------------------------------------------------------

test('lock+staff-check avvengono prima del guard paid (ordine di controllo)', () => {
  const lockIdx = fn.indexOf('FOR UPDATE');
  const staffIdx = fn.indexOf('is_staff_for_venue');
  const guardIdx = fn.indexOf("v_order.payment_status = 'paid'");
  assert.ok(lockIdx < staffIdx && staffIdx < guardIdx);
});

test('action log: scrive un entry cancelled con from_status/to_status/reason dopo lo UPDATE', () => {
  const updateIdx = fn.indexOf("SET status = 'cancelled'");
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_action_log', updateIdx);
  assert.ok(insertIdx > updateIdx, 'il log va scritto dopo che il cancel ha avuto effetto');
  const insertBlock = fn.slice(insertIdx, fn.indexOf(';', insertIdx));
  assert.match(insertBlock, /'cancelled'/);
  assert.match(insertBlock, /v_old_status/);
  assert.match(insertBlock, /p_reason/);
});

test('nessuna modifica a schema/indici/constraint/RLS (solo CREATE OR REPLACE FUNCTION + GRANT/REVOKE)', () => {
  assert.doesNotMatch(src, /ALTER TABLE/i);
  assert.doesNotMatch(src, /CREATE (UNIQUE )?INDEX/i);
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /DROP /i);
});

test('grant execute: solo authenticated, revoke public (stesso pattern di kitchen_payment_record_counter)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_order_cancel\(text, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_order_cancel\(text, text\) TO authenticated;/);
});

test('SECURITY DEFINER con search_path fissato (stesso pattern delle altre RPC Payment Hub)', () => {
  assert.match(fn, /SECURITY DEFINER/);
  assert.match(fn, /SET search_path TO 'public', 'pg_temp'/);
});

console.log('20260914090000_kitchen_order_cancel_guard_v1.test.js: tutti i test passati.');
