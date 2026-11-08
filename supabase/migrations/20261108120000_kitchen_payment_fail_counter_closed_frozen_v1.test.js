// 20261108120000_kitchen_payment_fail_counter_closed_frozen_v1.test.js — K1 (2026-11-08).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime e' provato su Postgres locale da tests/db/kitchen-payments/ (P5a, P5b, P5c).
// Eseguire: node --test supabase/migrations/20261108120000_kitchen_payment_fail_counter_closed_frozen_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const src = read('20261108120000_kitchen_payment_fail_counter_closed_frozen_v1.sql');
const prev = read('20260830101227_kitchen_payment_failed_retry_promotion_v1.sql');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$function$;', start);
  assert.ok(end > start, `fine di ${name} non trovata`);
  return squash(text.slice(start, end));
};

const code = sqlOnly(src);
const body = fnBody(code, 'kitchen_payment_fail');
const prevBody = fnBody(sqlOnly(prev), 'kitchen_payment_fail');
const K1_BLOCK = squash(`IF v_payment.status = 'failed'
     AND v_payment.failure_reason IN ('customer_switched_to_counter', 'staff_closed_for_counter')
  THEN
    RETURN v_payment;
  END IF;`);

test('header: migration dichiarata locale e non applicata', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
});

test('ridefinisce solo kitchen_payment_fail, nessun DDL su tabelle/policy', () => {
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns, ['kitchen_payment_fail']);
  assert.doesNotMatch(code, /\b(ALTER|DROP|CREATE)\s+(TABLE|POLICY|INDEX|TRIGGER)\b/i);
  assert.doesNotMatch(code, /\bREVOKE\b/i);
});

test('corpo identico a 20260830101227 salvo il solo blocco K1', () => {
  assert.ok(body.includes(K1_BLOCK), 'blocco K1 mancante');
  assert.equal(body.replace(K1_BLOCK + ' ', ''), prevBody);
});

test('blocco K1 dopo le guardie di stato e di autorizzazione, prima di qualsiasi UPDATE', () => {
  const k1 = body.indexOf(K1_BLOCK);
  assert.ok(body.indexOf("RAISE EXCEPTION 'invalid_attempt_status'") < k1);
  assert.ok(body.lastIndexOf("RAISE EXCEPTION 'not_authorized'") < k1);
  assert.ok(k1 < body.indexOf('UPDATE public.kitchen_payments'));
  assert.ok(k1 < body.indexOf('INSERT INTO public.kitchen_action_log'));
});

test('sumup_failed e abandoned_timeout non sono congelati', () => {
  const list = K1_BLOCK.slice(K1_BLOCK.indexOf('IN ('), K1_BLOCK.indexOf(')'));
  assert.doesNotMatch(list, /sumup_failed|abandoned_timeout/);
});

test('grant invariati (authenticated, service_role) e SECURITY DEFINER con search_path', () => {
  assert.match(squash(code), /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_fail\(uuid, text, jsonb\) TO authenticated, service_role;/);
  assert.match(body, /SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
});
