// Contratto statico: le tre viste di reporting passano a security_invoker e perdono i privilegi superflui.
// Eseguire: node --test supabase/migrations/20261025120000_kitchen_payment_views_security_invoker_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, '20261025120000_kitchen_payment_views_security_invoker_v1.sql'), 'utf8');
const src = raw.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
const VIEWS = [
  'kitchen_payments_daily_summary',
  'kitchen_payments_order_reconciliation',
  'kitchen_payments_provider_drift_candidates',
];

test('ogni vista: ALTER VIEW SET security_invoker = true', () => {
  for (const v of VIEWS) {
    assert.ok(src.includes(`ALTER VIEW public.${v} SET (security_invoker = true);`), v);
  }
});

test('ogni vista: REVOKE ALL poi solo SELECT a authenticated e service_role, nessun accesso anon/PUBLIC', () => {
  for (const v of VIEWS) {
    assert.ok(src.includes(`REVOKE ALL ON public.${v} FROM PUBLIC, anon, authenticated, service_role;`), v);
    assert.ok(src.includes(`GRANT SELECT ON public.${v} TO authenticated, service_role;`), v);
  }
  assert.doesNotMatch(src, /GRANT [^;]*\bTO [^;]*\banon\b/);
});

test('nessun cambio a logica, tabelle, policy, funzioni o dati', () => {
  assert.doesNotMatch(src, /CREATE (OR REPLACE )?(VIEW|FUNCTION|TABLE|POLICY)/i);
  assert.doesNotMatch(src, /\b(DROP|INSERT|UPDATE|DELETE|TRUNCATE|ALTER TABLE|ALTER POLICY|ALTER FUNCTION)\b/);
});

test('contiene solo le tre viste attese', () => {
  const named = new Set(src.match(/public\.kitchen_[a-z_]+/g));
  assert.deepEqual([...named].sort(), VIEWS.map((v) => `public.${v}`).sort());
});
