// 20260923130000_kitchen_service_state_v1.test.js — KITCHEN_OPEN_CLOSE_V1.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260923130000_kitchen_service_state_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260923130000_kitchen_service_state_v1.sql'), 'utf8');

test('crea kitchen_service_state con PK venue_id e default is_open=true', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS public\.kitchen_service_state/);
  assert.match(src, /is_open\s+boolean NOT NULL DEFAULT true/);
  assert.match(src, /CONSTRAINT kitchen_service_state_pkey PRIMARY KEY \(venue_id\)/);
});

test('RLS abilitata, lettura aperta ad anon + authenticated, scrittura solo staff del venue', () => {
  assert.match(src, /ALTER TABLE public\.kitchen_service_state ENABLE ROW LEVEL SECURITY/);
  assert.match(src, /CREATE POLICY anon_select_kitchen_service_state[\s\S]*?FOR SELECT TO anon/);
  assert.match(src, /CREATE POLICY customer_select_kitchen_service_state[\s\S]*?FOR SELECT TO authenticated/);
  assert.match(src, /CREATE POLICY staff_insert_kitchen_service_state[\s\S]*?WITH CHECK \(is_staff_for_venue\(venue_id\)\)/);
  assert.match(src, /CREATE POLICY staff_update_kitchen_service_state[\s\S]*?USING \(is_staff_for_venue\(venue_id\)\)/);
});

test('seed walrus-main aperta, idempotente (ON CONFLICT DO NOTHING)', () => {
  assert.match(src, /INSERT INTO public\.kitchen_service_state \(venue_id, is_open\)\s*\nVALUES \('walrus-main', true\)\s*\nON CONFLICT \(venue_id\) DO NOTHING;/);
});

test('entrambe le firme di kitchen_customer_create_order sono ridefinite (4 e 5 argomenti)', () => {
  const fourArg = /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order\(\s*p_venue_id text,\s*p_nickname text,\s*p_customer_note text,\s*p_items jsonb\s*\)/;
  const fiveArg = /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order\(\s*p_venue_id text,\s*p_nickname text,\s*p_customer_note text,\s*p_items jsonb,\s*p_fulfillment_type text\s*\)/;
  assert.match(src, fourArg);
  assert.match(src, fiveArg);
});

test('ogni firma alza kitchen_closed subito dopo la validazione del venue, prima di ogni altro controllo', () => {
  const guard = /IF EXISTS \(\s*SELECT 1 FROM public\.kitchen_service_state s\s*WHERE s\.venue_id = p_venue_id AND s\.is_open = false\s*\) THEN\s*RAISE EXCEPTION 'kitchen_closed';\s*END IF;/g;
  const matches = [...src.matchAll(guard)];
  assert.equal(matches.length, 2, 'atteso un guard kitchen_closed per ciascuna delle 2 firme');

  // Il guard precede sempre nickname_required (primo controllo successivo in entrambe le firme).
  const guardIdx = matches.map((m) => m.index);
  const nicknameIdx = [...src.matchAll(/RAISE EXCEPTION 'nickname_required'/g)].map((m) => m.index);
  assert.equal(nicknameIdx.length, 2);
  guardIdx.forEach((gi, i) => assert.ok(gi < nicknameIdx[i], 'guard kitchen_closed deve precedere nickname_required'));
});

test('nessuna altra RPC toccata: nessun riferimento a payment/refund/promo/status transition in questo file', () => {
  assert.doesNotMatch(src, /kitchen_payment_/);
  assert.doesNotMatch(src, /kitchen_promo_pass/);
  assert.doesNotMatch(src, /kitchen_order_cancel/);
  assert.doesNotMatch(src, /UPDATE public\.kitchen_orders\s+SET status/i);
});

test('grant execute ripristinati su entrambe le firme dopo il REPLACE', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_customer_create_order\(text, text, text, jsonb\) TO authenticated;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_customer_create_order\(text, text, text, jsonb, text\) TO authenticated;/);
});

console.log('20260923130000_kitchen_service_state_v1.test.js: tutti i test passati.');
