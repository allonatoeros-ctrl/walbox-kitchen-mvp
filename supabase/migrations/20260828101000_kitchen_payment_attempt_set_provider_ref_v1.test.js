// 20260828101000_kitchen_payment_attempt_set_provider_ref_v1.test.js — contratto RPC
// kitchen_payment_attempt_set_provider_ref (reconciliation core, FASE 2).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260828101000_kitchen_payment_attempt_set_provider_ref_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260828101000_kitchen_payment_attempt_set_provider_ref_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_set_provider_ref');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('kitchen_payment_attempt_set_provider_ref e riservata a service_role', () => {
  const fn = fnBody();
  assert.match(fn, /IF auth\.role\(\) <> 'service_role' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'service_role_only'/);
});

test('non sovrascrive mai provider_ref di un attempt gia risolto (status fuori initiated/pending)', () => {
  const fn = fnBody();
  assert.match(fn, /IF v_payment\.status NOT IN \('initiated', 'pending'\) THEN/);
  const guardIdx = fn.indexOf("NOT IN ('initiated', 'pending')");
  const returnIdx = fn.indexOf('RETURN v_payment', guardIdx);
  const updateIdx = fn.indexOf('UPDATE public.kitchen_payments', guardIdx);
  assert.ok(returnIdx > guardIdx && returnIdx < updateIdx, 'un attempt gia risolto deve fare RETURN prima di qualunque UPDATE');
});

test('il caso "gia risolto" e un no-op silenzioso, non un errore (nessun RAISE EXCEPTION dopo la guardia di stato)', () => {
  const fn = fnBody();
  const guardIdx = fn.indexOf("NOT IN ('initiated', 'pending')");
  const blockEnd = fn.indexOf('END IF;', guardIdx);
  const block = fn.slice(guardIdx, blockEnd);
  assert.doesNotMatch(block, /RAISE EXCEPTION/);
});

test('grant execute solo a service_role (mai a authenticated: nessun input diretto dal cliente)', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_set_provider_ref\(uuid, text\)\s+TO service_role;/);
  assert.doesNotMatch(src, /TO authenticated/);
});

console.log('20260828101000_kitchen_payment_attempt_set_provider_ref_v1.test.js: tutti i test passati.');
