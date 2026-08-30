// 20260830121000_kitchen_payment_provider_drift_v1.test.js — contratto della view
// kitchen_payments_provider_drift_candidates (FASE 5, direzione B: Walbox paid/refunded ma non
// verificabile contro il provider). Stile repo: assert statiche sul sorgente SQL.
// Eseguire a mano: node --test supabase/migrations/20260830121000_kitchen_payment_provider_drift_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260830121000_kitchen_payment_provider_drift_v1.sql'), 'utf8');

test('la view è gated su is_staff_for_venue in tutti e 3 i branch UNION ALL', () => {
  const occurrences = src.match(/is_staff_for_venue\(/g) || [];
  assert.equal(occurrences.length, 3, 'ogni branch della UNION ALL deve avere il proprio predicato staff');
});

test('paid_without_verifiable_charge non falsa-positiva sui pagamenti cash/manual (niente provider_ref)', () => {
  const idx = src.indexOf('paid_without_verifiable_charge');
  const block = src.slice(idx, src.indexOf('UNION ALL', idx));
  assert.match(block, /kp\.provider <> 'sumup' OR kp\.provider_ref IS NOT NULL/);
});

test('refunded_without_verifiable_refund usa la stessa eccezione cash/manual', () => {
  const idx = src.indexOf('refunded_without_verifiable_refund');
  const block = src.slice(idx, src.indexOf('UNION ALL', idx) > -1 ? src.indexOf('UNION ALL', idx) : src.length);
  assert.match(block, /kp\.provider <> 'sumup' OR kp\.provider_ref IS NOT NULL/);
});

test('refund_stuck_initiated sorveglia i refund initiated/pending indipendentemente dal provider', () => {
  const idx = src.indexOf('refund_stuck_initiated');
  const block = src.slice(idx);
  assert.match(block, /status IN \('initiated', 'pending'\)/);
});

test('nessun accesso anon: solo GRANT SELECT a authenticated', () => {
  assert.match(src, /GRANT SELECT ON public\.kitchen_payments_provider_drift_candidates TO authenticated;/);
  assert.doesNotMatch(src, /TO anon/);
});

console.log('20260830121000_kitchen_payment_provider_drift_v1.test.js: tutti i test passati.');
