// 20260830143353_kitchen_payment_attempt_claim_checkout_v1.test.js — contratto RPC
// kitchen_payment_attempt_claim_checkout (P0 duplicate live checkout guard, Layer 2).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260830143353_kitchen_payment_attempt_claim_checkout_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260830143353_kitchen_payment_attempt_claim_checkout_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_claim_checkout');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('aggiunge checkout_claim_at come colonna additiva (IF NOT EXISTS, nullable, nessun ALTER distruttivo)', () => {
  assert.match(src, /ALTER TABLE public\.kitchen_payments\s+ADD COLUMN IF NOT EXISTS checkout_claim_at timestamptz;/);
});

test('kitchen_payment_attempt_claim_checkout e riservata a service_role', () => {
  const fn = fnBody();
  assert.match(fn, /IF auth\.role\(\) <> 'service_role' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'service_role_only'/);
});

test('la claim UPDATE richiede status=initiated, direction=charge, provider_ref NULL', () => {
  const fn = fnBody();
  assert.match(fn, /UPDATE public\.kitchen_payments/);
  assert.match(fn, /SET checkout_claim_at = now\(\)/);
  assert.match(fn, /WHERE id = p_attempt_id/);
  assert.match(fn, /AND status = 'initiated'/);
  assert.match(fn, /AND direction = 'charge'/);
  assert.match(fn, /AND provider_ref IS NULL/);
});

test('il TTL della claim e 20 secondi (approvato Eros), riclamabile solo dopo scadenza', () => {
  const fn = fnBody();
  assert.match(fn, /AND \(checkout_claim_at IS NULL OR checkout_claim_at < now\(\) - interval '20 seconds'\)/);
});

test('perdere la race (0 righe) non e un errore: nessun RAISE EXCEPTION dopo la UPDATE, solo RETURN', () => {
  const fn = fnBody();
  const updateIdx = fn.indexOf('UPDATE public.kitchen_payments');
  const afterUpdate = fn.slice(updateIdx);
  assert.doesNotMatch(afterUpdate, /RAISE EXCEPTION/, 'la claim fallita deve tornare NULL, non sollevare eccezione');
  assert.match(afterUpdate, /RETURN v_payment;/);
});

test('grant execute solo a service_role (mai a authenticated: nessun input diretto dal cliente)', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_claim_checkout\(uuid\)\s+TO service_role;/);
  assert.doesNotMatch(src, /TO authenticated/);
});

console.log('20260830143353_kitchen_payment_attempt_claim_checkout_v1.test.js: tutti i test passati.');
