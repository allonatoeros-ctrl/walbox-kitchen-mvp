// Contratto statico: il branch failed_charge_retry_window_open esclude gli ordini cancelled,
// gli altri 3 branch restano invariati. Eseguire: node --test supabase/migrations/20261006124448_kitchen_payment_drift_exclude_cancelled_retry_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261006124448_kitchen_payment_drift_exclude_cancelled_retry_v1.sql'), 'utf8');
const prev = readFileSync(join(__dirname, '20260830101340_kitchen_payment_provider_drift_failed_retry_v1.sql'), 'utf8');
const branches = (s) => s.split('UNION ALL').map((b) => b.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim());

test('CREATE OR REPLACE VIEW, nessun DROP, 4 branch, grant mantenuto', () => {
  assert.match(src, /CREATE OR REPLACE VIEW public\.kitchen_payments_provider_drift_candidates AS/);
  assert.doesNotMatch(src, /DROP VIEW/);
  assert.equal(branches(src).length, 4);
  assert.match(src, /GRANT SELECT ON public\.kitchen_payments_provider_drift_candidates TO authenticated/);
});

test('i primi 3 branch sono identici alla migration precedente', () => {
  const a = branches(src).slice(0, 3);
  const b = branches(prev).slice(0, 3);
  assert.deepEqual(a, b);
});

test('failed_charge_retry_window_open esclude cancelled e mantiene le condizioni precedenti', () => {
  const last = branches(src)[3];
  assert.match(last, /o\.status <> 'cancelled'/);
  assert.match(last, /kp\.provider = 'sumup'/);
  assert.match(last, /kp\.failure_reason = 'sumup_failed'/);
  assert.match(last, /o\.payment_status <> 'paid'/);
});
