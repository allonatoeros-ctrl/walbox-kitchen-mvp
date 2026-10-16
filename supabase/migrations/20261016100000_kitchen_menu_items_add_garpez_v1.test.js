// 20261016100000_kitchen_menu_items_add_garpez_v1.test.js — CATALOG AUTHORITY TEST per item-059.
//
// Verifica statica sul sorgente SQL (nessuna connessione DB), stesso stile delle altre migration
// test del repo. Garantisce che la riga server di GARPEZ coincida con kitchenMockData.js e che la
// migration sia additiva e idempotente.
//
// Eseguire a mano: node --test supabase/migrations/20261016100000_kitchen_menu_items_add_garpez_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261016100000_kitchen_menu_items_add_garpez_v1.sql'), 'utf8');

// Solo le istruzioni eseguibili: esclude i commenti `--` (incluse le VERIFICHE manuali).
const statements = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

test('una sola istruzione eseguibile: INSERT ... ON CONFLICT, nessun DDL né DELETE', () => {
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^INSERT INTO public\.kitchen_menu_items/i);
  assert.match(statements[0], /ON CONFLICT \(venue_id, item_id\) DO UPDATE/i);
  assert.doesNotMatch(src, /\b(CREATE|ALTER|DROP|GRANT|REVOKE)\b\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER|EXECUTE|ALL|SELECT)/i);
  assert.doesNotMatch(statements[0], /\bDELETE\b/i);
});

test('inserisce la sola riga item-059 e coincide con kitchenMockData.js', () => {
  const rows = [...statements[0].matchAll(/\('walrus-main',\s*'(item-\d+)',\s*'((?:[^']|'')*)',\s*([\d.]+)\)/g)];
  assert.equal(rows.length, 1);
  const [, id, name, price] = rows[0];
  assert.equal(id, 'item-059');
  const item = kitchenMenuItems.find((i) => i.id === id);
  assert.ok(item, 'item-059 deve esistere nel catalogo cliente');
  assert.equal(name, item.name);
  assert.equal(Number(price), item.price);
});
