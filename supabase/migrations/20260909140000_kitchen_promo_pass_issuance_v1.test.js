// 20260909140000_kitchen_promo_pass_issuance_v1.test.js — contratto RPC
// kitchen_promo_pass_issue (Personalita' Discutibile Pass, emissione, nessuna redemption).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260909140000_kitchen_promo_pass_issuance_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260909140000_kitchen_promo_pass_issuance_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_issue');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('schema: un pass per (venue_id, customer_id, campaign), codice univoco, status limitato a issued/redeemed', () => {
  assert.match(src, /CONSTRAINT kitchen_promo_passes_code_key UNIQUE \(code\)/);
  assert.match(src, /CONSTRAINT kitchen_promo_passes_one_per_customer UNIQUE \(venue_id, customer_id, campaign\)/);
  assert.match(src, /CHECK \(status IN \('issued', 'redeemed'\)\)/);
});

test('RLS: solo SELECT per cliente/staff, nessuna policy INSERT/UPDATE/DELETE (unico canale di scrittura e\' l\'RPC)', () => {
  assert.match(src, /ALTER TABLE public\.kitchen_promo_passes ENABLE ROW LEVEL SECURITY/);
  assert.match(src, /CREATE POLICY customer_select_own_promo_pass ON public\.kitchen_promo_passes\s+FOR SELECT USING \(customer_id = auth\.uid\(\)\)/);
  assert.match(src, /CREATE POLICY staff_select_promo_passes ON public\.kitchen_promo_passes\s+FOR SELECT USING \(is_staff_for_venue\(venue_id\)\)/);
  assert.doesNotMatch(src, /FOR (INSERT|UPDATE|DELETE) ON public\.kitchen_promo_passes/);
});

test('RPC: richiede sessione cliente, e\' idempotente sullo stesso (venue_id, customer_id, campaign)', () => {
  const fn = fnBody();
  assert.match(fn, /IF auth\.uid\(\) IS NULL THEN/);
  assert.match(fn, /RAISE EXCEPTION 'customer_session_required'/);
  assert.match(fn, /RETURN v_existing; -- idempotente/);
});

test('generazione codice: nessun fallback md5/random, solo extensions.gen_random_bytes, alfabeto senza 0/O/1/I, prefisso WALRUS-', () => {
  const fn = fnBody();
  assert.match(fn, /'WALRUS-' \|\|/);
  assert.match(fn, /extensions\.gen_random_bytes\(1\)/);
  assert.match(fn, /'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/);
  assert.doesNotMatch(src, /md5\(/);
  assert.doesNotMatch(src, /random\(\)/);
});

test('retry su collisione: max 8 tentativi, poi eccezione esplicita, nessun errore silenzioso', () => {
  const fn = fnBody();
  assert.match(fn, /WHEN unique_violation THEN/);
  assert.match(fn, /IF v_attempt >= 8 THEN/);
  assert.match(fn, /RAISE EXCEPTION 'promo_pass_code_generation_failed'/);
});

test('grant: EXECUTE solo per authenticated, revocato da PUBLIC (stesso pattern kitchen_customer_create_order)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_promo_pass_issue\(text, text\) FROM PUBLIC/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_promo_pass_issue\(text, text\) TO authenticated/);
});

console.log('20260909140000_kitchen_promo_pass_issuance_v1.test.js: tutti i test passati.');
