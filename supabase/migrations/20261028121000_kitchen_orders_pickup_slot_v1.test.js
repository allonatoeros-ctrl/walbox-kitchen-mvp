// 20261028121000_kitchen_orders_pickup_slot_v1.test.js — RITIRO CON ORARIO.
//
// Verifica statica sul sorgente SQL (nessuna connessione DB): colonna additiva, fasce ammesse dal
// CHECK e dalla RPC identiche, v3 che delega alla v2 senza toccarla, grant come la v2.
//
// Eseguire a mano: node --test supabase/migrations/20261028121000_kitchen_orders_pickup_slot_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261028121000_kitchen_orders_pickup_slot_v1.sql'), 'utf8');
const executable = src.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

const SIGNATURE = 'public.kitchen_customer_create_order_v3(text, text, text, jsonb, text, text, uuid, text)';

function expectedSlots() {
  const out = [];
  for (const [from, to] of [[12 * 60, 14 * 60 + 30], [18 * 60, 22 * 60 + 30]]) {
    for (let m = from; m <= to; m += 15) {
      out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }
  return out;
}

function allHHMM() {
  const out = [];
  for (let h = 0; h < 24; h += 1) for (let m = 0; m < 60; m += 5) {
    out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return out;
}

test('colonna additiva e nullable, nessun DROP di colonne/tabelle esistenti', () => {
  assert.match(executable, /ALTER TABLE public\.kitchen_orders\s+ADD COLUMN IF NOT EXISTS pickup_slot text;/);
  assert.doesNotMatch(executable, /DROP\s+(COLUMN|TABLE|FUNCTION)/i);
  assert.doesNotMatch(executable, /pickup_slot text NOT NULL/i);
});

test('CHECK e RPC usano la stessa regex e ammettono esattamente le fasce 12:00-14:30 e 18:00-22:30 ogni 15 min', () => {
  const regexes = [...executable.matchAll(/~\s*'([^']+)'/g)].map((m) => m[1]);
  assert.equal(regexes.length, 2);
  assert.equal(regexes[0], regexes[1]);
  const re = new RegExp(regexes[0]);
  const allowed = allHHMM().filter((s) => re.test(s));
  assert.deepEqual(allowed, expectedSlots());
  assert.equal(expectedSlots().length, 30);
});

test('v3: SECURITY DEFINER, search_path fisso, guardia auth.uid(), delega alla v2', () => {
  assert.match(executable, /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order_v3\(/);
  assert.match(executable, /SECURITY DEFINER\s+SET search_path TO 'public', 'pg_temp'/);
  assert.match(executable, /IF auth\.uid\(\) IS NULL THEN\s+RAISE EXCEPTION 'customer_session_required'/);
  assert.match(executable, /v_order := public\.kitchen_customer_create_order_v2\(/);
  assert.doesNotMatch(executable, /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order_v2/);
  assert.doesNotMatch(executable, /INSERT INTO public\.kitchen_orders/);
});

test('v3: orario solo con takeaway, errori nominati, vince il primo orario sul retry', () => {
  assert.match(executable, /p_fulfillment_type IS DISTINCT FROM 'takeaway'/);
  assert.match(executable, /RAISE EXCEPTION 'invalid_pickup_slot'/);
  assert.match(executable, /RAISE EXCEPTION 'pickup_slot_in_past'/);
  assert.match(executable, /timezone\('Europe\/Rome', now\(\)\)/);
  assert.match(executable, /v_order\.pickup_slot IS NULL/);
  assert.match(executable, /AND customer_id = auth\.uid\(\)/);
});

test('grant: niente PUBLIC/anon, EXECUTE a authenticated', () => {
  assert.ok(executable.includes(`REVOKE ALL ON FUNCTION ${SIGNATURE} FROM PUBLIC;`));
  assert.ok(executable.includes(`REVOKE EXECUTE ON FUNCTION ${SIGNATURE} FROM anon;`));
  assert.ok(executable.includes(`GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO authenticated;`));
  assert.doesNotMatch(executable, /TO anon/);
});
