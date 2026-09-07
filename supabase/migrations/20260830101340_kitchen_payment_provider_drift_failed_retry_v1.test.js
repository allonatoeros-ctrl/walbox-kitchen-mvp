// 20260830101340_kitchen_payment_provider_drift_failed_retry_v1.test.js — contratto del branch
// 'failed_charge_retry_window_open' aggiunto alla view kitchen_payments_provider_drift_candidates
// (LONG SESSION F, layered su 20260830121000 gia applicata al remoto).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260830101340_kitchen_payment_provider_drift_failed_retry_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260830101340_kitchen_payment_provider_drift_failed_retry_v1.sql'), 'utf8');

test('CREATE OR REPLACE VIEW (non una nuova view, non un DROP) — layering sicuro su una view gia remota', () => {
  assert.match(src, /CREATE OR REPLACE VIEW public\.kitchen_payments_provider_drift_candidates AS/);
  assert.doesNotMatch(src, /DROP VIEW/);
});

test('i 3 branch esistenti (paid_without_verifiable_charge, refunded_without_verifiable_refund, refund_stuck_initiated) sono riprodotti invariati', () => {
  assert.match(src, /'paid_without_verifiable_charge'::text/);
  assert.match(src, /'refunded_without_verifiable_refund'::text/);
  assert.match(src, /'refund_stuck_initiated'::text/);
});

test('nuovo branch failed_charge_retry_window_open: gated su is_staff_for_venue (4 occorrenze totali in tutta la view)', () => {
  const occurrences = src.match(/is_staff_for_venue\(/g) || [];
  assert.equal(occurrences.length, 4, 'i 3 branch esistenti + il nuovo devono avere ciascuno il proprio predicato staff');
});

test('failed_charge_retry_window_open: richiede provider=sumup AND failure_reason=sumup_failed (stessa condizione del blocco attempt_start/confirm)', () => {
  const idx = src.indexOf("'failed_charge_retry_window_open'");
  assert.ok(idx > -1);
  const block = src.slice(idx);
  assert.match(block, /kp\.provider = 'sumup'/);
  assert.match(block, /kp\.failure_reason = 'sumup_failed'/);
});

test('failed_charge_retry_window_open: esclude gli ordini gia paid (altrimenti duplicherebbe paid_without_verifiable_charge)', () => {
  const idx = src.indexOf("'failed_charge_retry_window_open'");
  const block = src.slice(idx);
  assert.match(block, /o\.payment_status <> 'paid'/);
});

test('nessun accesso anon: solo GRANT SELECT a authenticated', () => {
  assert.match(src, /GRANT SELECT ON public\.kitchen_payments_provider_drift_candidates TO authenticated;/);
  assert.doesNotMatch(src, /TO anon/);
});

console.log('20260830101340_kitchen_payment_provider_drift_failed_retry_v1.test.js: tutti i test passati.');
