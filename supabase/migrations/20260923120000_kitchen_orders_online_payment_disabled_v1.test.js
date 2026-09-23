// 20260923120000_kitchen_orders_online_payment_disabled_v1.test.js — BUG A fix, colonna
// kitchen_orders.online_payment_disabled.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260923120000_kitchen_orders_online_payment_disabled_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260923120000_kitchen_orders_online_payment_disabled_v1.sql'), 'utf8');

test('aggiunge online_payment_disabled boolean NOT NULL DEFAULT false su kitchen_orders', () => {
  assert.match(src, /ALTER TABLE public\.kitchen_orders\s+ADD COLUMN online_payment_disabled boolean NOT NULL DEFAULT false;/);
});

test('nessuna migrazione dati/backfill: DEFAULT false basta per le righe esistenti', () => {
  assert.doesNotMatch(src, /UPDATE public\.kitchen_orders/i);
});

test('unica ALTER nel file: nessuna altra colonna/constraint/indice toccato', () => {
  const alters = [...src.matchAll(/ALTER TABLE/gi)];
  assert.equal(alters.length, 1);
  assert.doesNotMatch(src, /DROP /i);
  assert.doesNotMatch(src, /CREATE (OR REPLACE )?FUNCTION/i);
  assert.doesNotMatch(src, /CREATE POLICY/i);
  assert.doesNotMatch(src, /GRANT|REVOKE/i);
});

console.log('20260923120000_kitchen_orders_online_payment_disabled_v1.test.js: tutti i test passati.');
