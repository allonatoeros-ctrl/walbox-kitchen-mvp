// Food Club V1 fase A — test statici sulla migration 20261109108000 (stati del checkout SumUp solo documentati:
// CANCELLED non e' terminale). Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in
// tests/db/food-club/95_sb_simulations.sql (SB2-*).
// Eseguire: node --test supabase/migrations/20261109108000_food_club_v1_checkout_status_documented.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261109108000_food_club_v1_checkout_status_documented.sql';
const ORIGINAL = '20261109104000_food_club_v1_voucher_release.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));
const orig = sqlOnly(readFileSync(join(__dirname, ORIGINAL), 'utf8'));
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$$;', text.indexOf('AS $$', start));
  return text.slice(start, end + 3);
};
const body = fnBody(code, 'food_club_release_eval_attempt');
const origBody = fnBody(orig, 'food_club_release_eval_attempt');

test('ridefinisce SOLO food_club_release_eval_attempt: nessuna kitchen_*, nessuna costante, nessun trigger/tabella/cron', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, ['food_club_release_eval_attempt']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(TABLE|TRIGGER)\b|DROP\s|cron\.|ALTER\s+(TABLE|FUNCTION)|\bDELETE\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(code, /food_club_release_verified_rules\(\)\s+RETURNS|food_club_expected_merchant_code\(\)\s+RETURNS/);
});

test('corpo identico all originale di 20261109104000 tranne CANCELLED tolto dai due IN terminali', () => {
  const patched = origBody.replaceAll("IN ('FAILED', 'EXPIRED', 'CANCELLED')", "IN ('FAILED', 'EXPIRED')");
  assert.notEqual(patched, origBody, 'l originale conteneva CANCELLED');
  assert.equal(body, patched);
  assert.equal((body.match(/IN \('FAILED', 'EXPIRED'\)/g) || []).length, 2);
});

test('nessun CANCELLED nel codice SQL (solo nei commenti)', () => {
  assert.doesNotMatch(code, /CANCELLED/i);
});

test('stessa firma, LANGUAGE, sicurezza e search_path; REVOKE identico, nessun GRANT', () => {
  assert.match(body, /^CREATE OR REPLACE FUNCTION public\.food_club_release_eval_attempt\(p_attempt public\.kitchen_payments, p_sealed_at timestamptz\)\nRETURNS jsonb\nLANGUAGE plpgsql\nSET search_path = public, pg_temp\nAS \$\$/);
  assert.doesNotMatch(body, /SECURITY DEFINER/);
  const revoke = 'REVOKE ALL ON FUNCTION public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz) FROM PUBLIC, anon, authenticated, service_role;';
  assert.ok(orig.includes(revoke), 'REVOKE presente nell originale');
  assert.ok(code.includes(revoke), 'REVOKE ripetuto identico');
  assert.doesNotMatch(code, /\bGRANT\s/i);
  assert.doesNotMatch(code, /\bOWNER\s+TO\b/i);
});

test('regole invariate: PAID vince, terminali solo con terminal_verified, PENDING solo con valid_until_verified', () => {
  assert.match(body, /upper\(e\.sumup_status\) = 'PAID'/);
  assert.match(body, /IF v_rules\.terminal_verified THEN/);
  assert.match(body, /IF v_rules\.valid_until_verified THEN/);
  assert.match(body, /'states_not_concordant'/);
});
