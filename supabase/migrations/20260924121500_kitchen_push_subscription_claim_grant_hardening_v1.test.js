// 20260924121500_kitchen_push_subscription_claim_grant_hardening_v1.test.js — F6 Phase 1 RPC
// grant hardening (2026-09-24).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale. Versiona in repo un
// REVOKE già applicato manualmente in produzione (ledger remoto, migration
// kitchen_push_subscription_claim_revoke_anon_v1) — vedi header del file .sql.
// Eseguire a mano: node --test supabase/migrations/20260924121500_kitchen_push_subscription_claim_grant_hardening_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  join(__dirname, '20260924121500_kitchen_push_subscription_claim_grant_hardening_v1.sql'),
  'utf8'
);

test('REVOKE EXECUTE da anon sulla RPC con la firma reale a 5 parametri', () => {
  assert.match(
    src,
    /REVOKE EXECUTE ON FUNCTION public\.kitchen_push_subscription_claim\(text, text, text, text, text\) FROM anon;/
  );
});

test('riconferma REVOKE ALL FROM PUBLIC (idempotente, stessa firma a 5 parametri)', () => {
  assert.match(
    src,
    /REVOKE ALL ON FUNCTION public\.kitchen_push_subscription_claim\(text, text, text, text, text\) FROM PUBLIC;/
  );
});

test('riconferma GRANT EXECUTE solo a authenticated', () => {
  assert.match(
    src,
    /GRANT EXECUTE ON FUNCTION public\.kitchen_push_subscription_claim\(text, text, text, text, text\) TO authenticated;/
  );
  assert.doesNotMatch(src, /TO anon/);
  assert.doesNotMatch(src, /TO PUBLIC;\s*$/m);
});

test('nessuna DDL su tabelle/colonne — solo GRANT/REVOKE sulla RPC', () => {
  assert.doesNotMatch(src, /CREATE TABLE/);
  assert.doesNotMatch(src, /ALTER TABLE/);
  assert.doesNotMatch(src, /CREATE POLICY/);
  assert.doesNotMatch(src, /CREATE OR REPLACE FUNCTION/);
});

test('nessun riferimento a Phase 2 (kitchen_orders / ready push identity)', () => {
  assert.doesNotMatch(src, /kitchen_orders/);
  assert.doesNotMatch(src, /ready_push/i);
});

test('nessun secret/Vault/VAPID/Edge Function', () => {
  assert.doesNotMatch(src, /vault/i);
  assert.doesNotMatch(src, /vapid/i);
  assert.doesNotMatch(src, /pg_net/i);
  assert.doesNotMatch(src, /http_post/i);
});

test('tocca solo kitchen_push_subscription_claim, nessun\'altra funzione', () => {
  const otherFnMatches = src.match(/FUNCTION public\.(\w+)/g) ?? [];
  for (const m of otherFnMatches) {
    assert.match(m, /kitchen_push_subscription_claim/);
  }
});
