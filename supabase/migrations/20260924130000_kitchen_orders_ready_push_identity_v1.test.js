// 20260924130000_kitchen_orders_ready_push_identity_v1.test.js — F6 Phase 2 (2026-09-24).
// Stile repo (vedi 20260924120000_kitchen_push_subscriptions_v1.test.js): assert statiche sul
// sorgente SQL, nessuna connessione DB reale (migration NON applicata). READY EVENT IDENTITY è
// inoltre verificata con una simulazione pura in JS dello stesso algoritmo del trigger BEFORE
// UPDATE — non esegue SQL reale, dimostra solo che l'algoritmo descritto produce l'esito atteso.
// Eseguire a mano: node --test supabase/migrations/20260924130000_kitchen_orders_ready_push_identity_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260924130000_kitchen_orders_ready_push_identity_v1.sql'), 'utf8');

test('header dichiara DOCUMENTATION ONLY — NOT APPLIED TO REMOTE', () => {
  assert.match(src, /DOCUMENTATION ONLY — NOT APPLIED TO REMOTE/);
});

test('aggiunge ready_event_id (uuid) e ready_push_claimed_at (timestamptz), entrambe nullable', () => {
  assert.match(src, /ADD COLUMN IF NOT EXISTS ready_event_id uuid NULL/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS ready_push_claimed_at timestamptz NULL/);
});

test('trigger di identità è BEFORE UPDATE, puro SQL (nessuna chiamata di rete nel suo blocco)', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_event_identity\(\)[\s\S]*?\$function\$;/)[0];
  assert.doesNotMatch(fnBlock, /net\.http_post|http_request/, 'il trigger di identità non deve fare chiamate HTTP');
  assert.match(src, /CREATE TRIGGER kitchen_orders_ready_event_identity_trg\s+BEFORE UPDATE ON public\.kitchen_orders/);
});

test('trigger di identità genera un nuovo ready_event_id SOLO su transizione verso ready', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_event_identity\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /IF NEW\.status IS DISTINCT FROM OLD\.status THEN/);
  assert.match(fnBlock, /IF NEW\.status = 'ready' THEN\s+NEW\.ready_event_id := gen_random_uuid\(\);/);
});

test('trigger di identità resetta ready_push_claimed_at su ogni cambio di status (non solo uscita da ready)', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_event_identity\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /NEW\.ready_push_claimed_at := NULL;/);
});

test('trigger AFTER UPDATE di dispatch: WHEN scoped solo a vera transizione verso ready', () => {
  assert.match(
    src,
    /CREATE TRIGGER kitchen_orders_ready_push_webhook_trg\s+AFTER UPDATE ON public\.kitchen_orders\s+FOR EACH ROW\s+WHEN \(OLD\.status IS DISTINCT FROM NEW\.status AND NEW\.status = 'ready'\)/
  );
});

test('dispatch: secret letto da Vault per nome, nessun valore letterale nella migration', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /FROM vault\.decrypted_secrets\s+WHERE name = 'kitchen_push_webhook_secret'/);
  assert.doesNotMatch(fnBlock, /Bearer [A-Za-z0-9+/=_-]{20,}/, 'nessun token letterale deve comparire nel file');
});

test('dispatch: config mancante -> RAISE WARNING, mai RAISE EXCEPTION (non deve mai abortire lo UPDATE)', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /IF v_secret IS NULL THEN\s+[\s\S]*?RAISE WARNING/);
  assert.doesNotMatch(fnBlock, /RAISE EXCEPTION/);
});

test('dispatch: net.http_post è avvolta in BEGIN/EXCEPTION WHEN OTHERS (fallimento non blocca lo UPDATE)', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /BEGIN\s+PERFORM net\.http_post\([\s\S]*?EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
});

test('dispatch: SECURITY DEFINER + search_path sicuro, coerente con la RPC di Phase 1', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /SECURITY DEFINER/);
  assert.match(fnBlock, /SET search_path TO 'public', 'pg_temp'/);
});

test('dispatch: payload verso la Edge Function contiene order_id e ready_event_id, non l\'intera riga', () => {
  const fnBlock = src.match(/CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)[\s\S]*?\$function\$;/)[0];
  assert.match(fnBlock, /body := jsonb_build_object\('order_id', NEW\.id, 'ready_event_id', NEW\.ready_event_id\)/);
});

test('URL della Edge Function è un placeholder esplicito, non un dominio Supabase reale', () => {
  assert.match(src, /v_edge_function_url\s+text := '<KITCHEN_PUSH_EDGE_FUNCTION_URL>'/);
  assert.doesNotMatch(src, /https:\/\/[a-z0-9]{15,}\.supabase\.co/);
});

test('pg_net dichiarata (prerequisito), non installata per assunzione — solo CREATE EXTENSION IF NOT EXISTS', () => {
  assert.match(src, /CREATE EXTENSION IF NOT EXISTS pg_net;/);
});

// --- Simulazione pura del trigger BEFORE UPDATE (READY EVENT IDENTITY / UNDO_RACE_VERDICT) -----
// Modella in JS la stessa logica del trigger kitchen_orders_ready_event_identity(): non esegue SQL
// reale, dimostra che l'algoritmo descritto produce identità diverse per ogni ingresso in ready.
function simulateIdentityTrigger(row, newStatus, uuidFactory) {
  if (newStatus === row.status) return row; // nessun UPDATE reale, nessuna transizione
  const next = { ...row, status: newStatus, ready_push_claimed_at: null };
  if (newStatus === 'ready') {
    next.ready_event_id = uuidFactory();
  }
  return next;
}

test('scenario: READY -> undo -> READY produce SEMPRE un ready_event_id diverso', () => {
  let seq = 0;
  const uuidFactory = () => `event-${(seq += 1)}`;

  let row = { status: 'preparing', ready_event_id: null, ready_push_claimed_at: null };
  row = simulateIdentityTrigger(row, 'ready', uuidFactory);
  const firstEventId = row.ready_event_id;
  assert.equal(firstEventId, 'event-1');
  assert.equal(row.ready_push_claimed_at, null);

  // Simula il claim della Edge Function sul primo evento (fuori dal trigger, per completezza).
  row = { ...row, ready_push_claimed_at: '2026-09-24T00:00:10Z' };

  // Staff annulla entro la finestra: undo -> preparing.
  row = simulateIdentityTrigger(row, 'preparing', uuidFactory);
  assert.equal(row.ready_event_id, firstEventId, 'ready_event_id resta quello del claim precedente, ma non è più rilevante');
  assert.equal(row.ready_push_claimed_at, null, 'il claim precedente deve essere resettato uscendo da ready');

  // Ordine torna ready una seconda volta.
  row = simulateIdentityTrigger(row, 'ready', uuidFactory);
  const secondEventId = row.ready_event_id;

  assert.equal(secondEventId, 'event-2');
  assert.notEqual(secondEventId, firstEventId, 'il secondo ingresso in ready deve avere un\'identità diversa dal primo');
  assert.equal(row.ready_push_claimed_at, null, 'il nuovo evento ready deve poter essere claimato di nuovo');
});

test('scenario: update che non cambia status (es. staff_note) non tocca identità né claim', () => {
  const row = { status: 'ready', ready_event_id: 'event-1', ready_push_claimed_at: '2026-09-24T00:00:10Z' };
  const next = simulateIdentityTrigger(row, 'ready', () => 'should-not-be-called');
  assert.deepEqual(next, row, 'nessuna transizione di status -> nessuna mutazione dei campi ready');
});
