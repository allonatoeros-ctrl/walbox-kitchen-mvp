// 20260921100000_kitchen_payment_cancel_hardening_v1.test.js — Payment Cancel Hardening.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260914090000_kitchen_order_cancel_guard_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260921100000_kitchen_payment_cancel_hardening_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260921100000_kitchen_payment_cancel_hardening_v1.sql'), 'utf8');

function fnBody(name, occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) {
    start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`, start + 1);
    assert.ok(start > -1, `funzione ${name} (occorrenza ${i}) non trovata nel sorgente`);
  }
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

const confirmFn = fnBody('kitchen_payment_confirm');
const cancelFn = fnBody('kitchen_order_cancel_with_payment_attempt');

// ================================================================================================
// kitchen_payment_confirm — never order.status='cancelled' + payment_status='paid'
// ================================================================================================

test('confirm: il branch pending_counter_payment resta invariato (promuove a received, setta paid)', () => {
  const idx = confirmFn.indexOf("v_order_status = 'pending_counter_payment'");
  assert.ok(idx > -1);
  const branch = confirmFn.slice(idx, confirmFn.indexOf('ELSIF', idx));
  assert.match(branch, /payment_status = 'paid'/);
  assert.match(branch, /status = 'received'/);
});

test('confirm: esiste un branch ELSIF dedicato per v_order_status = \'cancelled\'', () => {
  const idx = confirmFn.indexOf("ELSIF v_order_status = 'cancelled' THEN");
  assert.ok(idx > -1, 'deve esistere un ramo esplicito per lo stato cancelled, non il generico ELSE');
});

test('confirm: il branch cancelled NON scrive mai payment_status=paid su kitchen_orders', () => {
  const startIdx = confirmFn.indexOf("ELSIF v_order_status = 'cancelled' THEN");
  const endIdx = confirmFn.indexOf('ELSE', startIdx);
  const branch = confirmFn.slice(startIdx, endIdx);
  assert.doesNotMatch(branch, /UPDATE public\.kitchen_orders/, 'nessun UPDATE su kitchen_orders quando lo stato e cancelled');
  assert.doesNotMatch(branch, /payment_status = 'paid'/);
});

test('confirm: il branch cancelled fa RETURN esplicito prima del log payment_confirmed generico', () => {
  const startIdx = confirmFn.indexOf("ELSIF v_order_status = 'cancelled' THEN");
  const endIdx = confirmFn.indexOf('ELSE', startIdx);
  const branch = confirmFn.slice(startIdx, endIdx);
  assert.match(branch, /RETURN v_payment;/);
});

test('confirm: il branch cancelled logga payment_confirmed_after_cancel con needs_manual_reconciliation', () => {
  const startIdx = confirmFn.indexOf("ELSIF v_order_status = 'cancelled' THEN");
  const endIdx = confirmFn.indexOf('ELSE', startIdx);
  const branch = confirmFn.slice(startIdx, endIdx);
  assert.match(branch, /'payment_confirmed_after_cancel'/);
  assert.match(branch, /'needs_manual_reconciliation', true/);
});

test('confirm: il branch ELSE generico (received/preparing/ready/delivered) resta invariato, mai tocca status', () => {
  const idx = confirmFn.indexOf('ELSE\n    -- Order already moved on');
  assert.ok(idx > -1, 'branch ELSE generico non trovato dove atteso');
  const branch = confirmFn.slice(idx, confirmFn.indexOf('END IF;', idx));
  assert.match(branch, /payment_status = 'paid'/);
  assert.doesNotMatch(branch, /status = 'cancelled'/);
  assert.doesNotMatch(branch, /(?<!payment_)status = /, 'il branch else non deve mai settare kitchen_orders.status (solo payment_status)');
});

test('confirm: la charge stessa resta succeeded anche quando l ordine e cancelled (mai persa dal ledger)', () => {
  const updateIdx = confirmFn.indexOf("SET status = 'succeeded'");
  const branchIdx = confirmFn.indexOf("ELSIF v_order_status = 'cancelled' THEN");
  assert.ok(updateIdx > -1 && updateIdx < branchIdx, 'la charge deve gia essere succeeded prima del branch cancelled, non condizionata da esso');
});

test('confirm: firma/grant invariati (service_role_only, stesso nome/argomenti)', () => {
  assert.match(confirmFn, /IF auth\.role\(\) <> 'service_role' THEN/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\)\s*\n\s*TO service_role;/);
});

// ================================================================================================
// kitchen_order_cancel_with_payment_attempt — new atomic RPC
// ================================================================================================

test('cancel-with-attempt: lock ordine payment attempt PRIMA del lock ordine (stesso ordine di kitchen_payment_confirm)', () => {
  const paymentLockIdx = cancelFn.indexOf('FROM public.kitchen_payments');
  const orderLockIdx = cancelFn.indexOf('SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;');
  assert.ok(paymentLockIdx > -1 && orderLockIdx > -1);
  assert.ok(paymentLockIdx < orderLockIdx, 'il lock sul payment attempt deve precedere il lock sull ordine');
});

test('cancel-with-attempt: il lookup del payment attempt filtra solo initiated/pending, direction charge', () => {
  const idx = cancelFn.indexOf('FROM public.kitchen_payments');
  const clause = cancelFn.slice(idx, cancelFn.indexOf('FOR UPDATE', idx));
  assert.match(clause, /direction = 'charge'/);
  assert.match(clause, /status IN \('initiated', 'pending'\)/);
});

test('cancel-with-attempt: verifica staff venue sul venue_id letto dalla riga locked', () => {
  assert.match(cancelFn, /is_staff_for_venue\(v_order\.venue_id\)/);
  assert.match(cancelFn, /RAISE EXCEPTION 'not_staff_for_venue';/);
});

test('cancel-with-attempt: idempotente su ordine gia cancelled (nessuna scrittura, return immediato)', () => {
  const idx = cancelFn.indexOf("v_order.status = 'cancelled' THEN");
  assert.ok(idx > -1);
  const guard = cancelFn.slice(idx, cancelFn.indexOf('END IF;', idx));
  assert.match(guard, /RETURN v_order;/);
});

test('cancel-with-attempt: guard payment_status=paid -> order_already_paid_cannot_cancel (stesso di kitchen_order_cancel)', () => {
  const idx = cancelFn.indexOf("v_order.payment_status = 'paid'");
  assert.ok(idx > -1);
  const raiseIdx = cancelFn.indexOf("RAISE EXCEPTION 'order_already_paid_cannot_cancel'", idx);
  assert.ok(raiseIdx > -1 && raiseIdx - idx < 100);
});

test('cancel-with-attempt: race guard — attempt non piu initiated/pending al lock time -> payment_attempt_not_cancelable', () => {
  assert.match(cancelFn, /v_payment\.id IS NOT NULL AND v_payment\.status NOT IN \('initiated', 'pending'\) THEN/);
  assert.match(cancelFn, /RAISE EXCEPTION 'payment_attempt_not_cancelable';/);
});

test('cancel-with-attempt: race guard precede qualunque UPDATE (nessuna scrittura se il race guard blocca)', () => {
  const raceGuardIdx = cancelFn.indexOf("RAISE EXCEPTION 'payment_attempt_not_cancelable'");
  const firstUpdateIdx = cancelFn.indexOf('UPDATE public.kitchen_payments');
  const orderUpdateIdx = cancelFn.indexOf('UPDATE public.kitchen_orders', cancelFn.indexOf('v_old_status := v_order.status;'));
  assert.ok(raceGuardIdx < firstUpdateIdx && raceGuardIdx < orderUpdateIdx);
});

test('cancel-with-attempt: quando c e un attempt live, lo marca cancelled prima di cancellare l ordine', () => {
  const attemptUpdateIdx = cancelFn.indexOf("SET status = 'cancelled', updated_at = now()");
  const orderUpdateIdx = cancelFn.indexOf("SET status = 'cancelled', cancel_reason = p_reason");
  assert.ok(attemptUpdateIdx > -1 && orderUpdateIdx > -1);
  assert.ok(attemptUpdateIdx < orderUpdateIdx, 'il payment attempt va cancellato prima di cancellare l ordine');
});

test('cancel-with-attempt: cancella l ordine con le stesse colonne del path legacy (status/cancel_reason/cancelled_at)', () => {
  const idx = cancelFn.indexOf('UPDATE public.kitchen_orders\n  SET status');
  assert.ok(idx > -1);
  const setClause = cancelFn.slice(idx, cancelFn.indexOf(';', idx));
  assert.match(setClause, /status = 'cancelled'/);
  assert.match(setClause, /cancel_reason = p_reason/);
  assert.match(setClause, /cancelled_at = now\(\)/);
});

test('cancel-with-attempt: quando NON c e un attempt live, nessun UPDATE su kitchen_payments viene eseguito', () => {
  // v_payment.id IS NOT NULL è la guardia che racchiude sia il race-guard sia lo UPDATE
  // dell'attempt: verifichiamo che lo UPDATE stia dentro un IF v_payment.id IS NOT NULL dedicato.
  const guardIdx = cancelFn.indexOf('IF v_payment.id IS NOT NULL THEN');
  const updateIdx = cancelFn.indexOf("SET status = 'cancelled', updated_at = now()");
  const endIfIdx = cancelFn.indexOf('END IF;', guardIdx);
  assert.ok(guardIdx > -1 && updateIdx > guardIdx && updateIdx < endIfIdx);
});

test('cancel-with-attempt: action log payment_attempt_cancelled solo quando c e un attempt da cancellare', () => {
  const guardIdx = cancelFn.indexOf('IF v_payment.id IS NOT NULL THEN');
  const endIfIdx = cancelFn.indexOf('END IF;', guardIdx);
  const block = cancelFn.slice(guardIdx, endIfIdx);
  assert.match(block, /'payment_attempt_cancelled'/);
});

test('cancel-with-attempt: action log cancelled con from_status/to_status/reason dopo lo UPDATE ordine', () => {
  const updateIdx = cancelFn.indexOf("SET status = 'cancelled', cancel_reason = p_reason");
  const insertIdx = cancelFn.indexOf('INSERT INTO public.kitchen_action_log', updateIdx);
  assert.ok(insertIdx > updateIdx);
  const insertBlock = cancelFn.slice(insertIdx, cancelFn.indexOf(';', insertIdx));
  assert.match(insertBlock, /'cancelled'/);
  assert.match(insertBlock, /v_old_status/);
  assert.match(insertBlock, /p_reason/);
});

test('cancel-with-attempt: nessuna modifica a schema/indici/constraint/RLS in tutto il file (solo funzioni + GRANT/REVOKE)', () => {
  assert.doesNotMatch(src, /ALTER TABLE/i);
  assert.doesNotMatch(src, /CREATE (UNIQUE )?INDEX/i);
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /DROP /i);
});

test('cancel-with-attempt: kitchen_order_cancel (storica) non e menzionata/toccata in questo file', () => {
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_order_cancel\(/);
});

test('cancel-with-attempt: grant execute solo authenticated, revoke public (stesso pattern di kitchen_order_cancel)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_order_cancel_with_payment_attempt\(text, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_order_cancel_with_payment_attempt\(text, text\) TO authenticated;/);
});

test('cancel-with-attempt: SECURITY DEFINER con search_path fissato (stesso pattern delle altre RPC Payment Hub)', () => {
  assert.match(cancelFn, /SECURITY DEFINER/);
  assert.match(cancelFn, /SET search_path TO 'public', 'pg_temp'/);
});

console.log('20260921100000_kitchen_payment_cancel_hardening_v1.test.js: tutti i test passati.');
