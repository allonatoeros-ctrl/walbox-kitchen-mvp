// 20261108140000_kitchen_payment_record_counter_lock_order_v1.test.js — K4 (Passo 3, 2026-11-08).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime e' provato su Postgres locale da tests/db/kitchen-payments/
// (p7_concorrenza.sh 7b3, p7c_k2_concorrenza.sh 7c1, p7d_k4_ordine_lock.sh, p7e_k4_ripetizioni.sh).
// Eseguire: node --test supabase/migrations/20261108140000_kitchen_payment_record_counter_lock_order_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const src = read('20261108140000_kitchen_payment_record_counter_lock_order_v1.sql');
const prev = read('20260913120000_kitchen_payment_counter_online_exclusivity_v1.sql');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const FN = 'kitchen_payment_record_counter';
const fnBody = (text) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${FN}(`);
  assert.ok(start > -1, `funzione ${FN} non trovata`);
  const end = text.indexOf('$function$;', start);
  assert.ok(end > start, `fine di ${FN} non trovata`);
  return squash(text.slice(start, end));
};
const grants = (text) => sqlOnly(text).split('\n')
  .filter((l) => /^(REVOKE|GRANT)\b/.test(l.trim()) && l.includes(`public.${FN}(`))
  .map((l) => squash(l));

const code = sqlOnly(src);
const body = fnBody(code);
const prevBody = fnBody(sqlOnly(prev));

const K4_DECL = squash('v_venue_id public.kitchen_orders.venue_id%TYPE;');
const K4_STAFF = squash(`SELECT venue_id INTO v_venue_id FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT is_staff_for_venue(v_venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'; END IF;`);
const K4_LOCK = squash(`PERFORM 1 FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge'
  ORDER BY id
  FOR UPDATE;`);
const ORDER_LOCK = 'FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE';

test('header: migration dichiarata locale e non applicata, da rilasciare con K1+K2', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
  assert.match(src, /20261108120000/);
  assert.match(src, /20261108130000/);
});

test('ridefinisce solo kitchen_payment_record_counter, nessun DDL su tabelle/policy/indici', () => {
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns, [FN]);
  assert.equal((code.match(/CREATE (OR REPLACE )?FUNCTION/g) || []).length, 1);
  assert.doesNotMatch(code, /\b(ALTER|DROP|CREATE)\s+(TABLE|POLICY|INDEX|TRIGGER)\b/i);
  assert.doesNotMatch(code, /kitchen_payment_confirm/);
});

test('corpo identico a 20260913120000 salvo i blocchi K4 (dichiarazione, controllo staff, lock charge)', () => {
  for (const part of [K4_DECL, K4_STAFF, K4_LOCK]) {
    assert.ok(body.includes(part), `blocco K4 mancante: ${part.slice(0, 60)}`);
  }
  const stripped = squash(body.replace(K4_DECL, '').replace(K4_STAFF, '').replace(K4_LOCK, ''));
  assert.equal(stripped, prevBody);
});

test('ordine: controllo staff senza lock -> lock righe charge ORDER BY id -> lock riga ordine', () => {
  const iStaff = body.indexOf(K4_STAFF);
  const iLock = body.indexOf(K4_LOCK);
  const iOrder = body.indexOf(ORDER_LOCK);
  assert.ok(body.indexOf("RAISE EXCEPTION 'invalid_counter_payment_method'") < iStaff);
  assert.ok(iStaff > -1 && iStaff < iLock, 'il controllo staff deve precedere il PERFORM');
  assert.ok(iLock > -1 && iLock < iOrder, 'il PERFORM deve precedere il lock della riga ordine');
  assert.match(K4_LOCK, /ORDER BY id FOR UPDATE/);
  // la lettura del venue_id non prende lock
  assert.doesNotMatch(K4_STAFF, /FOR (UPDATE|SHARE|NO KEY UPDATE|KEY SHARE)/);
  // i controlli sotto lock restano (verifica definitiva)
  const afterOrder = body.slice(iOrder);
  assert.ok(afterOrder.includes("IF NOT is_staff_for_venue(v_order.venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'"));
  assert.ok(afterOrder.includes("RAISE EXCEPTION 'online_payment_in_progress'"));
});

test('grant identici a 20260913120000', () => {
  const g = grants(src);
  assert.deepEqual(g, grants(prev));
  assert.deepEqual(g, [
    `REVOKE ALL ON FUNCTION public.${FN}(text, text) FROM PUBLIC;`,
    `GRANT EXECUTE ON FUNCTION public.${FN}(text, text) TO authenticated;`,
  ]);
});
