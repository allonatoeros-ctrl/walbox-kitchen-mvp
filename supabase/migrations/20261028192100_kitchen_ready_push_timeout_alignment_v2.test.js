import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '20261028192100_kitchen_ready_push_timeout_alignment_v2.sql'), 'utf8');
const pushLogic = readFileSync(join(dir, '../functions/send-order-ready-push/logic.js'), 'utf8');

test('pg_net timeout exceeds the ready-push wait with a safety margin', () => {
  const timeout = Number(src.match(/timeout_milliseconds\s*:=\s*(\d+)/)?.[1]);
  const wait = Number(pushLogic.match(/export const WAIT_MS\s*=\s*(\d+)/)?.[1]);
  assert.ok(Number.isFinite(timeout) && timeout > 0);
  assert.ok(Number.isFinite(wait) && wait > 0);
  assert.ok(timeout >= wait + 15000, `timeout ${timeout}ms must exceed wait ${wait}ms with enough margin`);
  assert.equal(timeout, 30000);
});

test('replaces only the existing ready-push dispatcher, not the trigger or payment flow', () => {
  assert.match(src, /CREATE OR REPLACE FUNCTION public\.kitchen_orders_ready_push_dispatch\(\)/);
  assert.match(src, /RETURNS trigger[\s\S]*?LANGUAGE plpgsql[\s\S]*?SECURITY DEFINER/);
  assert.match(src, /SET search_path TO 'public', 'pg_temp'/);
  assert.match(src, /EXCEPTION WHEN OTHERS THEN[\s\S]*?RAISE WARNING/);
  assert.match(src, /RETURN NEW;/);
  assert.doesNotMatch(src, /CREATE TRIGGER|ALTER TABLE|UPDATE public\.kitchen_orders|UPDATE public\.kitchen_payments/i);
});

test('preserves the event identity, Vault name and no literal credential', () => {
  assert.match(src, /FROM vault\.decrypted_secrets\s+WHERE name = 'kitchen_push_webhook_secret'/);
  assert.match(src, /body := jsonb_build_object\('order_id', NEW\.id, 'ready_event_id', NEW\.ready_event_id\)/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_orders_ready_push_dispatch\(\) FROM PUBLIC/);
  assert.doesNotMatch(src, /Bearer [A-Za-z0-9+/=_-]{20,}/);
});
