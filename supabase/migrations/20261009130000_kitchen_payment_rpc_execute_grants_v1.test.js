// 20261009130000_kitchen_payment_rpc_execute_grants_v1.test.js — S0.5 RPC EXECUTE grant hardening
// (2026-10-09).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20261009130000_kitchen_payment_rpc_execute_grants_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '20261009130000_kitchen_payment_rpc_execute_grants_v1.sql'),
  'utf8'
);
const sql = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');
const statements = sql
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const PROMO = 'public.kitchen_promo_pass_redeem_for_order(text, text)';
const START = 'public.kitchen_payment_attempt_start(text, text, text, text, numeric, text)';
const CONFIRM = 'public.kitchen_payment_confirm(uuid, text, jsonb)';

const expected = [
  `REVOKE EXECUTE ON FUNCTION ${PROMO} FROM PUBLIC`,
  `REVOKE EXECUTE ON FUNCTION ${PROMO} FROM anon`,
  `GRANT EXECUTE ON FUNCTION ${PROMO} TO authenticated`,
  `GRANT EXECUTE ON FUNCTION ${PROMO} TO service_role`,
  `REVOKE EXECUTE ON FUNCTION ${START} FROM PUBLIC`,
  `REVOKE EXECUTE ON FUNCTION ${START} FROM anon`,
  `GRANT EXECUTE ON FUNCTION ${START} TO authenticated`,
  `GRANT EXECUTE ON FUNCTION ${START} TO service_role`,
  `REVOKE EXECUTE ON FUNCTION ${CONFIRM} FROM PUBLIC`,
  `REVOKE EXECUTE ON FUNCTION ${CONFIRM} FROM anon`,
  `REVOKE EXECUTE ON FUNCTION ${CONFIRM} FROM authenticated`,
  `GRANT EXECUTE ON FUNCTION ${CONFIRM} TO service_role`,
];

test('contiene esattamente i 12 statement REVOKE/GRANT della policy approvata, in ordine', () => {
  assert.deepEqual(statements, expected);
});

test('solo REVOKE/GRANT: nessuna DDL, nessun corpo funzione, nessun default privilege', () => {
  for (const s of statements) {
    assert.match(s, /^(REVOKE|GRANT) EXECUTE ON FUNCTION public\./);
  }
  assert.doesNotMatch(sql, /CREATE|ALTER|DROP|DEFAULT PRIVILEGES|POLICY|ALL TABLES|ALL FUNCTIONS/i);
});

test('payment_confirm non è mai concesso a authenticated/anon/PUBLIC', () => {
  const grants = statements.filter((s) => s.startsWith('GRANT') && s.includes(CONFIRM));
  assert.deepEqual(grants, [`GRANT EXECUTE ON FUNCTION ${CONFIRM} TO service_role`]);
});

test('nessun GRANT a anon o PUBLIC su nessuna funzione', () => {
  assert.doesNotMatch(sql, /\bTO (anon|PUBLIC)\b/);
});

test('tocca solo le 3 RPC in scope', () => {
  const fns = new Set(sql.match(/FUNCTION public\.\w+/g) ?? []);
  assert.deepEqual(
    [...fns].sort(),
    [
      'FUNCTION public.kitchen_payment_attempt_start',
      'FUNCTION public.kitchen_payment_confirm',
      'FUNCTION public.kitchen_promo_pass_redeem_for_order',
    ]
  );
});
