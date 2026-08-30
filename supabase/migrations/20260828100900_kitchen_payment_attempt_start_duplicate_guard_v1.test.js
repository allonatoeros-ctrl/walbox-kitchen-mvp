// 20260828100900_kitchen_payment_attempt_start_duplicate_guard_v1.test.js — contratto
// kitchen_payment_attempt_start dopo la fix P1-1 (duplicate checkout guard).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260828100900_kitchen_payment_attempt_start_duplicate_guard_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260828100900_kitchen_payment_attempt_start_duplicate_guard_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_start');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('kitchen_payment_attempt_start cerca un attempt live per order_id indipendentemente da idempotency_key', () => {
  const fn = fnBody();
  assert.match(fn, /WHERE order_id = p_order_id\s+AND direction = 'charge'\s+AND status IN \('initiated', 'pending'\)/);
  // La nuova guardia non deve filtrare per idempotency_key.
  const guardStart = fn.indexOf("WHERE order_id = p_order_id");
  const guardEnd = fn.indexOf('LIMIT 1', guardStart);
  const guard = fn.slice(guardStart, guardEnd);
  assert.doesNotMatch(guard, /idempotency_key/);
});

test('un attempt live esistente viene riusato (RETURN v_existing) prima di qualunque INSERT', () => {
  const fn = fnBody();
  const guardIdx = fn.indexOf("status IN ('initiated', 'pending')");
  const returnIdx = fn.indexOf('RETURN v_existing', guardIdx);
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_payments', guardIdx);
  assert.ok(guardIdx > -1 && returnIdx > guardIdx, 'RETURN v_existing deve seguire la guardia');
  assert.ok(insertIdx > returnIdx, "l'INSERT di un nuovo attempt deve venire dopo il RETURN esistente");
});

test('FAILED/CANCELLED non sono nella lista di stati bloccanti (permettono un nuovo attempt)', () => {
  const fn = fnBody();
  const guardStart = fn.indexOf("WHERE order_id = p_order_id");
  const guardEnd = fn.indexOf('LIMIT 1', guardStart);
  const guard = fn.slice(guardStart, guardEnd);
  assert.doesNotMatch(guard, /failed/);
  assert.doesNotMatch(guard, /cancelled/);
});

test('nessun bypass basato su timeout/TTL nella funzione (niente now() - / created_at <)', () => {
  const fn = fnBody();
  assert.doesNotMatch(fn, /created_at\s*[<>]/);
  assert.doesNotMatch(fn, /interval/i);
});

test('il lock FOR UPDATE sul ordine resta la concorrenza a monte della guardia', () => {
  const fn = fnBody();
  const lockIdx = fn.indexOf('FOR UPDATE');
  const guardIdx = fn.indexOf("status IN ('initiated', 'pending')");
  assert.ok(lockIdx > -1 && lockIdx < guardIdx, 'il lock deve precedere la guardia di duplicazione');
});

test('grant execute su authenticated invariato', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_start\(text, text, text, text, numeric, text\)\s+TO authenticated;/);
});

console.log('20260828100900_kitchen_payment_attempt_start_duplicate_guard_v1.test.js: tutti i test passati.');
