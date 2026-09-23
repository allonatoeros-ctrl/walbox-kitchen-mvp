// 20260923100000_kitchen_payment_attempt_close_unpaid_v1.test.js — "Passa al pagamento al banco".
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260921100000_kitchen_payment_cancel_hardening_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260923100000_kitchen_payment_attempt_close_unpaid_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260923100000_kitchen_payment_attempt_close_unpaid_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata nel sorgente`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

const closeFn = fnBody('kitchen_payment_attempt_close_unpaid');

test('lock FOR UPDATE sull attempt prima di leggerne lo stato', () => {
  assert.match(closeFn, /SELECT \* INTO v_payment FROM public\.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;/);
});

test('rifiuta un attempt non-charge (not_a_charge_attempt)', () => {
  const idx = closeFn.indexOf("v_payment.direction <> 'charge'");
  assert.ok(idx > -1);
  assert.match(closeFn.slice(idx, idx + 100), /RAISE EXCEPTION 'not_a_charge_attempt';/);
});

test('verifica staff sul venue_id dell attempt (non service_role-only: azione esplicita banco)', () => {
  assert.match(closeFn, /is_staff_for_venue\(v_payment\.venue_id\)/);
  assert.match(closeFn, /RAISE EXCEPTION 'not_staff_for_venue';/);
  assert.doesNotMatch(closeFn, /auth\.role\(\) <> 'service_role'/, 'non deve essere ristretta a service_role come kitchen_payment_confirm');
});

test('race guard: attempt gia succeeded -> payment_attempt_already_succeeded, mai forzato', () => {
  const idx = closeFn.indexOf("v_payment.status = 'succeeded' THEN");
  assert.ok(idx > -1);
  const guard = closeFn.slice(idx, closeFn.indexOf('END IF;', idx));
  assert.match(guard, /RAISE EXCEPTION 'payment_attempt_already_succeeded';/);
});

test('idempotente su cancelled: return immediato, nessuna riscrittura', () => {
  const idx = closeFn.indexOf("v_payment.status = 'cancelled' THEN");
  assert.ok(idx > -1);
  const guard = closeFn.slice(idx, closeFn.indexOf('END IF;', idx));
  assert.match(guard, /RETURN v_payment;/);
});

test('failed non-sumup_failed (gia staff_closed_for_counter / sumup_expired / sumup_cancelled / sumup_amount_mismatch): idempotente, nessuna riscrittura', () => {
  const idx = closeFn.indexOf("v_payment.status = 'failed'\n     AND NOT");
  assert.ok(idx > -1, 'guard failed-non-sumup_failed non trovato');
  const guard = closeFn.slice(idx, closeFn.indexOf('END IF;', idx));
  assert.match(guard, /provider = 'sumup' AND v_payment\.failure_reason = 'sumup_failed'/);
  assert.match(guard, /RETURN v_payment;/);
});

test('failed + provider sumup + failure_reason sumup_failed: NON e catturato dal guard idempotente, procede alla conversione', () => {
  const idx = closeFn.indexOf("v_payment.status = 'failed'\n     AND NOT");
  const guard = closeFn.slice(idx, closeFn.indexOf('END IF;', idx));
  // Il guard scarta esplicitamente solo i failed che NON sono sumup/sumup_failed: un attempt
  // failed+sumup+sumup_failed non soddisfa la condizione NOT(...) quindi non ritorna qui, e
  // raggiunge la UPDATE piu sotto insieme a initiated/pending.
  assert.match(guard, /NOT \(v_payment\.provider = 'sumup' AND v_payment\.failure_reason = 'sumup_failed'\)/);
});

test('difesa in profondita: qualunque stato oltre initiated/pending/failed -> invalid_attempt_status', () => {
  const idx = closeFn.indexOf("v_payment.status NOT IN ('initiated', 'pending', 'failed') THEN");
  assert.ok(idx > -1);
  const guard = closeFn.slice(idx, closeFn.indexOf('END IF;', idx));
  assert.match(guard, /RAISE EXCEPTION 'invalid_attempt_status';/);
});

test('gli early-return/RAISE precedono qualunque UPDATE su kitchen_payments', () => {
  const firstUpdateIdx = closeFn.indexOf('UPDATE public.kitchen_payments');
  const succeededGuardIdx = closeFn.indexOf("RAISE EXCEPTION 'payment_attempt_already_succeeded'");
  const cancelledGuardIdx = closeFn.indexOf("v_payment.status = 'cancelled' THEN");
  const failedNonRetryGuardIdx = closeFn.indexOf("v_payment.status = 'failed'\n     AND NOT");
  const invalidGuardIdx = closeFn.indexOf("RAISE EXCEPTION 'invalid_attempt_status'");
  assert.ok(firstUpdateIdx > -1);
  assert.ok(succeededGuardIdx > -1 && succeededGuardIdx < firstUpdateIdx);
  assert.ok(cancelledGuardIdx > -1 && cancelledGuardIdx < firstUpdateIdx);
  assert.ok(failedNonRetryGuardIdx > -1 && failedNonRetryGuardIdx < firstUpdateIdx);
  assert.ok(invalidGuardIdx > -1 && invalidGuardIdx < firstUpdateIdx);
});

test('chiude l attempt come failed con failure_reason fisso staff_closed_for_counter (mai passato dal chiamante)', () => {
  const idx = closeFn.indexOf('UPDATE public.kitchen_payments');
  const setClause = closeFn.slice(idx, closeFn.indexOf(';', idx));
  assert.match(setClause, /status = 'failed'/);
  assert.match(setClause, /failure_reason = 'staff_closed_for_counter'/);
  assert.doesNotMatch(setClause, /p_note/, 'p_note non deve mai finire in failure_reason (solo in metadata del log)');
});

test('la UPDATE non scrive mai sumup_failed in failure_reason: non deve piu bloccare kitchen_payment_record_counter (F03) ne essere retry-eligible in kitchen_payment_confirm', () => {
  const idx = closeFn.indexOf('UPDATE public.kitchen_payments');
  const setClause = closeFn.slice(idx, closeFn.indexOf(';', idx));
  assert.doesNotMatch(setClause, /failure_reason = 'sumup_failed'/);
});

test('legge (non scrive) sumup_failed solo nei guard di lettura, mai in un SET', () => {
  // La stringa 'sumup_failed' puo comparire nei guard IF (lettura di v_payment.failure_reason,
  // per decidere se un failed e retry-eligible) ma mai dentro una clausola SET di una UPDATE.
  const setClauses = [...closeFn.matchAll(/UPDATE public\.kitchen_payments[\s\S]*?;/g)].map((m) => m[0]);
  assert.ok(setClauses.length > 0, 'nessuna UPDATE trovata nella funzione');
  for (const clause of setClauses) {
    assert.doesNotMatch(clause, /SET[\s\S]*failure_reason = 'sumup_failed'/);
  }
});

test('kitchen_orders non viene mai scritta da questa funzione', () => {
  assert.doesNotMatch(closeFn, /UPDATE public\.kitchen_orders/);
});

test('action log payment_attempt_closed_for_counter con payment_id/previous_status/note, dopo lo UPDATE', () => {
  const updateIdx = closeFn.indexOf('UPDATE public.kitchen_payments');
  const insertIdx = closeFn.indexOf('INSERT INTO public.kitchen_action_log', updateIdx);
  assert.ok(insertIdx > updateIdx);
  const insertBlock = closeFn.slice(insertIdx, closeFn.indexOf(';', insertIdx));
  assert.match(insertBlock, /'payment_attempt_closed_for_counter'/);
  assert.match(insertBlock, /'staff'/);
  assert.match(insertBlock, /v_old_status/);
  assert.match(insertBlock, /p_note/);
});

test('nessuna modifica a schema/indici/constraint/RLS/altre funzioni in tutto il file', () => {
  assert.doesNotMatch(src, /ALTER TABLE/i);
  assert.doesNotMatch(src, /CREATE (UNIQUE )?INDEX/i);
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /DROP /i);
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_fail\(/, 'non deve toccare kitchen_payment_fail esistente');
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_confirm\(/, 'non deve toccare kitchen_payment_confirm esistente');
  assert.doesNotMatch(src, /FUNCTION public\.kitchen_payment_record_counter\(/, 'non deve toccare kitchen_payment_record_counter esistente');
});

test('grant execute solo authenticated, revoke public (stesso pattern di kitchen_order_cancel_with_payment_attempt)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_payment_attempt_close_unpaid\(uuid, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_close_unpaid\(uuid, text\) TO authenticated;/);
});

test('SECURITY DEFINER con search_path fissato (stesso pattern delle altre RPC Payment Hub)', () => {
  assert.match(closeFn, /SECURITY DEFINER/);
  assert.match(closeFn, /SET search_path TO 'public', 'pg_temp'/);
});

console.log('20260923100000_kitchen_payment_attempt_close_unpaid_v1.test.js: tutti i test passati.');
