// 20261106100000_kitchen_menu_items_remove_garpez_v1.test.js — verifica statica sul testo SQL.
// Eseguire a mano: node --test supabase/migrations/20261106100000_kitchen_menu_items_remove_garpez_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261106100000_kitchen_menu_items_remove_garpez_v1.sql'), 'utf8');
const statements = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

test('una sola istruzione: DELETE puntuale, nessun DDL', () => {
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^DELETE FROM public\.kitchen_menu_items/i);
  assert.doesNotMatch(src, /\b(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER)/i);
});

test('target esatto walrus-main / item-059, WHERE senza OR/IN', () => {
  const where = statements[0].slice(statements[0].search(/WHERE/i));
  assert.match(where, /venue_id\s*=\s*'walrus-main'/i);
  assert.match(where, /item_id\s*=\s*'item-059'/i);
  assert.doesNotMatch(where, /\bOR\b|\bIN\s*\(/i);
  assert.deepEqual(statements[0].match(/item-\d+/g), ['item-059']);
});

test('idempotente: niente RETURNING né RAISE EXCEPTION', () => {
  assert.doesNotMatch(statements[0], /RETURNING/i);
  assert.doesNotMatch(src, /RAISE EXCEPTION/i);
});

test('coerente con il cliente: item-059 non è più in kitchenMenuItems', () => {
  assert.ok(!kitchenMenuItems.some((i) => i.id === 'item-059'));
});

test('rollback documentato e header "non applicata"', () => {
  assert.match(src, /'walrus-main',\s*'item-059',\s*'Garpez',\s*15/);
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTO/);
});
