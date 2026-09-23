// 20260924120000_kitchen_push_subscriptions_v1.test.js — F6 Phase 1 Web Push foundations +
// OWNERSHIP FIX (patch pre-Gate 2, 2026-09-24).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (migration NON
// applicata — vedi header del file .sql). Lo scenario di riassegnazione ownership è inoltre
// verificato con una simulazione pura in JS dello stesso algoritmo (DELETE stale + INSERT ...
// ON CONFLICT DO UPDATE) usato dalla RPC — non esegue SQL reale, dimostra solo che l'algoritmo
// descritto nella RPC produce l'esito atteso.
// Eseguire a mano: node --test supabase/migrations/20260924120000_kitchen_push_subscriptions_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260924120000_kitchen_push_subscriptions_v1.sql'), 'utf8');

test('header dichiara DOCUMENTATION ONLY — NOT APPLIED TO REMOTE', () => {
  assert.match(src, /DOCUMENTATION ONLY — NOT APPLIED TO REMOTE/);
});

test('crea kitchen_push_subscriptions con customer_id FK auth.users e colonne endpoint/keys', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS public\.kitchen_push_subscriptions/);
  assert.match(src, /customer_id\s+uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  assert.match(src, /endpoint\s+text NOT NULL/);
  assert.match(src, /p256dh\s+text NOT NULL/);
  assert.match(src, /auth_key\s+text NOT NULL/);
});

test('OWNERSHIP FIX: endpoint è globalmente UNIQUE, non più la coppia (customer_id, endpoint)', () => {
  assert.match(
    src,
    /CONSTRAINT kitchen_push_subscriptions_endpoint_unique UNIQUE \(endpoint\)/
  );
  assert.doesNotMatch(src, /UNIQUE \(customer_id, endpoint\)/);
});

test('nessuna colonna order_id nella tabella — la subscription non è per singolo ordine', () => {
  const tableBlock = src.match(/CREATE TABLE IF NOT EXISTS public\.kitchen_push_subscriptions \(([\s\S]*?)\n\);/)[1];
  assert.doesNotMatch(tableBlock, /\border_id\b/);
});

test('RLS abilitata', () => {
  assert.match(src, /ALTER TABLE public\.kitchen_push_subscriptions ENABLE ROW LEVEL SECURITY/);
});

test('OWNERSHIP FIX: solo policy SELECT e DELETE own-only sulla tabella, nessun INSERT/UPDATE diretto', () => {
  const policies = ['customer_select_own_push_subscription', 'customer_delete_own_push_subscription'];
  for (const name of policies) {
    const re = new RegExp(`CREATE POLICY ${name} ON public\\.kitchen_push_subscriptions[\\s\\S]*?customer_id = auth\\.uid\\(\\)`);
    assert.match(src, re, `policy ${name} deve filtrare su customer_id = auth.uid()`);
  }
  assert.doesNotMatch(src, /customer_insert_own_push_subscription/);
  assert.doesNotMatch(src, /customer_update_own_push_subscription/);
});

test('nessuna policy per ruolo anon o staff su questa tabella', () => {
  assert.doesNotMatch(src, /TO anon/);
  assert.doesNotMatch(src, /is_staff_for_venue/);
});

test('RPC kitchen_push_subscription_claim: SECURITY DEFINER + search_path sicuro', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_push_subscription_claim[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /SECURITY DEFINER/);
  assert.match(fnBlock, /SET search_path TO 'public', 'pg_temp'/);
});

test('RPC kitchen_push_subscription_claim: usa auth.uid(), nessun parametro customer_id accettato dal client', () => {
  const signature = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_push_subscription_claim\(([\s\S]*?)\)\nRETURNS/)[1];
  assert.doesNotMatch(signature, /customer_id/, 'la firma della RPC non deve avere un parametro customer_id');
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_push_subscription_claim[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /v_customer_id uuid := auth\.uid\(\)/);
});

test('RPC kitchen_push_subscription_claim: evict-then-claim, mai due righe sullo stesso endpoint', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_push_subscription_claim[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /DELETE FROM public\.kitchen_push_subscriptions\s+WHERE endpoint = p_endpoint\s+AND customer_id <> v_customer_id/);
  assert.match(fnBlock, /ON CONFLICT \(endpoint\) DO UPDATE/);
  assert.match(fnBlock, /SET customer_id\s*=\s*EXCLUDED\.customer_id/);
  assert.match(fnBlock, /last_seen_at\s*=\s*now\(\)/);
});

test('RPC kitchen_push_subscription_claim: privilegi minimi (nessun accesso PUBLIC/anon)', () => {
  assert.match(
    src,
    /REVOKE ALL ON FUNCTION public\.kitchen_push_subscription_claim\(text, text, text, text, text\) FROM PUBLIC;/
  );
  assert.match(
    src,
    /GRANT EXECUTE ON FUNCTION public\.kitchen_push_subscription_claim\(text, text, text, text, text\) TO authenticated;/
  );
});

// --- Simulazione pura dello scenario richiesto dal Final Gate --------------------------------
// Modella in JS lo stesso algoritmo della RPC (DELETE stale + INSERT ... ON CONFLICT DO UPDATE
// su UNIQUE(endpoint)) per dimostrare l'esito atteso. Non è un test contro Postgres reale.
function simulateClaim(rows, { customerId, endpoint }) {
  const survivors = rows.filter((r) => !(r.endpoint === endpoint && r.customerId !== customerId));
  const existing = survivors.find((r) => r.endpoint === endpoint);
  if (existing) {
    existing.customerId = customerId;
    return survivors;
  }
  return [...survivors, { customerId, endpoint }];
}

test('scenario: customer A reclama endpoint X, poi customer B reclama lo stesso endpoint X -> esiste solo B->X', () => {
  let rows = [];
  rows = simulateClaim(rows, { customerId: 'customer-A', endpoint: 'endpoint-X' });
  assert.deepEqual(rows, [{ customerId: 'customer-A', endpoint: 'endpoint-X' }]);

  rows = simulateClaim(rows, { customerId: 'customer-B', endpoint: 'endpoint-X' });

  const rowsForEndpointX = rows.filter((r) => r.endpoint === 'endpoint-X');
  assert.equal(rowsForEndpointX.length, 1, 'deve esistere una sola riga per endpoint-X');
  assert.equal(rowsForEndpointX[0].customerId, 'customer-B', 'la riga superstite deve appartenere a B');
  assert.ok(
    !rows.some((r) => r.customerId === 'customer-A'),
    'nessuna riga di A deve sopravvivere dopo che B ha reclamato lo stesso endpoint'
  );
});
