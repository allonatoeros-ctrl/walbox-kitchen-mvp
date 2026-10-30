import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '20261030150000_kitchen_menu_items_prezzi_menu_come_prima_v1.sql'), 'utf8');
const executable = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

test('solo UPDATE di prezzo su kitchen_menu_items, nessun DDL/DELETE/INSERT/GRANT', () => {
  assert.doesNotMatch(executable, /\b(CREATE|ALTER|DROP|DELETE|INSERT|GRANT|REVOKE|TRUNCATE)\b/i);
  assert.equal((executable.match(/UPDATE public\.kitchen_menu_items/g) || []).length, 2);
  assert.doesNotMatch(executable, /SET[^;]*\bname\b/i);
});

test('menu Box Pulled Pork 19 con birra e con bibita', () => {
  assert.match(executable, /price = 19,[^;]*item_id IN \('item-040', 'item-060'\)/);
});

test('menu Pastrami e Brisket 20 con birra e con bibita', () => {
  assert.match(executable, /price = 20,[^;]*item_id IN \('item-041', 'item-042', 'item-061', 'item-062'\)/);
});

test('ogni UPDATE limitato al venue walrus-main', () => {
  for (const stmt of executable.split(';').filter((s) => /UPDATE/.test(s))) {
    assert.match(stmt, /venue_id = 'walrus-main'/);
  }
});
