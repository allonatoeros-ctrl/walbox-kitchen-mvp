// 20260830120000_kitchen_payment_refund_lifecycle_v1.test.js — contratto del refund lifecycle
// (kitchen_payment_refund / _confirm / _fail / _claim_provider_call).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (vedi
// 20260828100900_kitchen_payment_attempt_start_duplicate_guard_v1.test.js per lo stesso pattern).
// Eseguire a mano: node --test supabase/migrations/20260830120000_kitchen_payment_refund_lifecycle_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260830120000_kitchen_payment_refund_lifecycle_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`FUNCTION public.${name}`);
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('la vecchia firma a 3 argomenti (con p_amount client-side) viene droppata', () => {
  assert.match(src, /DROP FUNCTION IF EXISTS public\.kitchen_payment_refund\(text, numeric, text\);/);
});

test('kitchen_payment_refund non accetta più p_amount dal chiamante', () => {
  const fn = fnBody('kitchen_payment_refund(');
  assert.doesNotMatch(fn.split('BEGIN')[0], /p_amount/);
});

test('kitchen_payment_refund deriva sempre amount dal charge originale (v_charge.amount)', () => {
  const fn = fnBody('kitchen_payment_refund(');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_payments');
  const insertBlock = fn.slice(insertIdx, fn.indexOf(');', insertIdx));
  assert.match(insertBlock, /v_charge\.amount/);
});

test("kitchen_payment_refund apre l'attempt in stato 'initiated', non 'succeeded'", () => {
  const fn = fnBody('kitchen_payment_refund(');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_payments');
  const insertBlock = fn.slice(insertIdx, fn.indexOf(');', insertIdx));
  assert.match(insertBlock, /'refund', 'initiated'/);
});

test('un refund attempt live (initiated/pending) esistente viene riusato prima di un INSERT', () => {
  const fn = fnBody('kitchen_payment_refund(');
  const guardIdx = fn.indexOf("direction = 'refund'\n    AND status IN ('initiated', 'pending')");
  const returnIdx = fn.indexOf('RETURN v_existing', guardIdx);
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_payments', guardIdx);
  assert.ok(guardIdx > -1, 'guardia duplicate-refund non trovata');
  assert.ok(returnIdx > guardIdx && insertIdx > returnIdx, 'RETURN v_existing deve precedere INSERT');
});

test('kitchen_payment_refund_confirm è service_role only e idempotente su succeeded', () => {
  const fn = fnBody('kitchen_payment_refund_confirm(');
  assert.match(fn, /auth\.role\(\)\s*<>\s*'service_role'/);
  assert.match(fn, /IF v_refund\.status = 'succeeded' THEN\s*\n\s*RETURN v_refund;/);
});

test("kitchen_payment_refund_confirm marca l'ordine 'refunded' solo dopo l'UPDATE succeeded", () => {
  const fn = fnBody('kitchen_payment_refund_confirm(');
  const succeededIdx = fn.indexOf("SET status = 'succeeded'");
  const orderUpdateIdx = fn.indexOf("SET payment_status = 'refunded'");
  assert.ok(succeededIdx > -1 && orderUpdateIdx > succeededIdx, "l'update ordine deve seguire l'update succeeded");
});

test('kitchen_payment_refund_fail non tocca mai kitchen_orders (nessun UPDATE su kitchen_orders)', () => {
  const fn = fnBody('kitchen_payment_refund_fail(');
  assert.doesNotMatch(fn, /UPDATE public\.kitchen_orders/);
});

test('kitchen_payment_refund_fail accetta service_role O staff-per-venue, mai chiunque altro', () => {
  const fn = fnBody('kitchen_payment_refund_fail(');
  assert.match(fn, /auth\.role\(\)\s*=\s*'service_role'/);
  assert.match(fn, /is_staff_for_venue\(v_refund\.venue_id\)/);
  assert.match(fn, /RAISE EXCEPTION 'not_authorized'/);
});

test('kitchen_payment_refund_claim_provider_call è service_role only', () => {
  const fn = fnBody('kitchen_payment_refund_claim_provider_call(');
  assert.match(fn, /auth\.role\(\)\s*<>\s*'service_role'/);
});

test('il claim rifiuta un secondo claim sullo stesso attempt (niente doppia chiamata SumUp reale)', () => {
  const fn = fnBody('kitchen_payment_refund_claim_provider_call(');
  assert.match(fn, /raw_last_event \? 'provider_call_claimed_at'/);
  assert.match(fn, /RAISE EXCEPTION 'refund_call_already_claimed'/);
});

test('il claim usa FOR UPDATE (row lock) prima di leggere/scrivere il marker', () => {
  const fn = fnBody('kitchen_payment_refund_claim_provider_call(');
  const lockIdx = fn.indexOf('FOR UPDATE');
  const checkIdx = fn.indexOf("raw_last_event ? 'provider_call_claimed_at'");
  assert.ok(lockIdx > -1 && lockIdx < checkIdx, 'il lock deve precedere il check del marker');
});

test('grants: refund su authenticated, confirm/claim su service_role, fail su entrambi', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_refund\(text, text\)\s+TO authenticated;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_refund_confirm\(uuid, text, jsonb\)\s+TO service_role;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_refund_fail\(uuid, text, jsonb\)\s+TO authenticated, service_role;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_refund_claim_provider_call\(uuid\)\s+TO service_role;/);
});

console.log('20260830120000_kitchen_payment_refund_lifecycle_v1.test.js: tutti i test passati.');
