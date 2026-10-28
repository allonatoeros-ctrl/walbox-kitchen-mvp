// 20261028120000_kitchen_menu_items_menu_ottobre_v1.test.js — CATALOG AUTHORITY TEST MENU OTTOBRE.
//
// Verifica statica sul sorgente SQL (nessuna connessione DB), stesso stile delle altre migration
// test del repo: le 10 righe server coincidono con kitchenMockData.js (menu con birra, varianti
// bibita, bibite nuove) e la migration resta additiva (nessun DELETE delle Schweppes).
//
// Eseguire a mano: node --test supabase/migrations/20261028120000_kitchen_menu_items_menu_ottobre_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261028120000_kitchen_menu_items_menu_ottobre_v1.sql'), 'utf8');

const statements = src
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const rows = new Map(
  [...(statements[0] ?? '').matchAll(/\('walrus-main',\s*'(item-\d+)',\s*'((?:[^']|'')*)',\s*([\d.]+)\)/g)]
    .map(([, id, name, price]) => [id, { name, price: Number(price) }]),
);

function expectedRow(id) {
  const item = kitchenMenuItems.find((i) => i.id === id);
  if (item) return { name: item.name, price: item.price };
  for (const combo of Object.values(kitchenPesiMassimiCombos)) {
    if (combo.id === id) return { name: combo.name, price: combo.price };
    if (combo.softDrink?.id === id) return { name: combo.softDrink.name, price: combo.softDrink.price };
  }
  return null;
}

test('una sola istruzione eseguibile: INSERT ... ON CONFLICT, nessun DDL né DELETE', () => {
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^INSERT INTO public\.kitchen_menu_items/i);
  assert.match(statements[0], /ON CONFLICT \(venue_id, item_id\) DO UPDATE/i);
  assert.doesNotMatch(statements[0], /\bDELETE\b/i);
  assert.doesNotMatch(src, /\b(CREATE|ALTER|DROP|GRANT|REVOKE)\b\s+(TABLE|FUNCTION|POLICY|INDEX|TRIGGER|EXECUTE|ALL|SELECT)/i);
});

test('le 10 righe attese, ognuna identica a kitchenMockData.js', () => {
  assert.deepEqual([...rows.keys()].sort(), [
    'item-040', 'item-041', 'item-042', 'item-060', 'item-061', 'item-062',
    'item-063', 'item-064', 'item-065', 'item-066',
  ]);
  for (const [id, got] of rows) {
    const want = expectedRow(id);
    assert.ok(want, `${id} deve esistere nel catalogo cliente`);
    assert.deepEqual(got, want, `riga server divergente per ${id}`);
  }
});

test('prezzi decisi da Eros: birra 15,90/17,90/17,90 · bibita 13,90/16,90/16,90 · bibite 4', () => {
  assert.equal(rows.get('item-040').price, 15.9);
  assert.equal(rows.get('item-041').price, 17.9);
  assert.equal(rows.get('item-042').price, 17.9);
  assert.equal(rows.get('item-060').price, 13.9);
  assert.equal(rows.get('item-061').price, 16.9);
  assert.equal(rows.get('item-062').price, 16.9);
  for (const id of ['item-063', 'item-064', 'item-065', 'item-066']) assert.equal(rows.get(id).price, 4);
});

test('Schweppes non toccate dalla migration (additiva verso il frontend in produzione)', () => {
  assert.ok(!rows.has('item-049'));
  assert.ok(!rows.has('item-050'));
});
