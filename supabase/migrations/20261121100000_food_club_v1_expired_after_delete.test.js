// Food Club V1 — test statici sulla migration 20261121100000 (EXPIRED dopo DELETE SumUp: valid_until anticipato
// accettato solo per EXPIRED). Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in
// tests/db/food-club/95_sb_simulations.sql (SB4-S3).
// Eseguire: node --test supabase/migrations/20261121100000_food_club_v1_expired_after_delete.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261121100000_food_club_v1_expired_after_delete.sql';
const PREVIOUS = '20261109108000_food_club_v1_checkout_status_documented.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));
const prev = sqlOnly(readFileSync(join(__dirname, PREVIOUS), 'utf8'));
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$$;', text.indexOf('AS $$', start));
  return text.slice(start, end + 3);
};
const body = fnBody(code, 'food_club_release_eval_attempt');
const prevBody = fnBody(prev, 'food_club_release_eval_attempt');
const OLD = '     AND e.valid_until = v_intent.valid_until\n';
const NEW = "     AND (e.valid_until = v_intent.valid_until\n"
  + "          OR (upper(e.sumup_status) = 'EXPIRED' AND e.valid_until < v_intent.valid_until\n"
  + '              AND e.valid_until >= p_attempt.created_at))\n';

test('ridefinisce SOLO food_club_release_eval_attempt: nessuna kitchen_*, nessuna costante, nessun trigger/tabella/cron', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, ['food_club_release_eval_attempt']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(TABLE|TRIGGER)\b|DROP\s|cron\.|ALTER\s+(TABLE|FUNCTION)|\bDELETE\b|\bUPDATE\s+public\.|\bINSERT\s+INTO\b/i);
  assert.doesNotMatch(code, /food_club_release_verified_rules\(\)\s+RETURNS|food_club_expected_merchant_code\(\)\s+RETURNS/);
});

test('corpo identico a 20261109108000 tranne le due condizioni valid_until delle GET', () => {
  assert.equal(prevBody.split(OLD).length - 1, 2, 'la versione precedente aveva 2 uguaglianze esatte');
  assert.equal(body, prevBody.replaceAll(OLD, NEW));
  assert.equal(body.split(NEW).length - 1, 2);
});

test('eccezione solo per EXPIRED; soglie del verdetto ancora sul valid_until dell intento', () => {
  assert.doesNotMatch(body, /'(FAILED|PENDING|PAID)' AND e\.valid_until </);
  assert.match(body, /v_intent\.valid_until <= v_b\.fetched_at - interval '2 minutes'/);
  assert.match(body, /v_intent\.valid_until <= now\(\) - interval '2 minutes'/);
  assert.doesNotMatch(body, /CANCELLED/i);
  assert.equal((body.match(/IN \('FAILED', 'EXPIRED'\)/g) || []).length, 2);
});

test('stessa firma, LANGUAGE, sicurezza e search_path; REVOKE identico, nessun GRANT/OWNER', () => {
  assert.match(body, /^CREATE OR REPLACE FUNCTION public\.food_club_release_eval_attempt\(p_attempt public\.kitchen_payments, p_sealed_at timestamptz\)\nRETURNS jsonb\nLANGUAGE plpgsql\nSET search_path = public, pg_temp\nAS \$\$/);
  assert.doesNotMatch(body, /SECURITY DEFINER/);
  const revoke = 'REVOKE ALL ON FUNCTION public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz) FROM PUBLIC, anon, authenticated, service_role;';
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
