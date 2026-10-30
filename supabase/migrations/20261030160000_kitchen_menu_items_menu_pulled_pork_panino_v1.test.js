import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, '20261030160000_kitchen_menu_items_menu_pulled_pork_panino_v1.sql'), 'utf8');
const executable = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

test('solo UPDATE di name su kitchen_menu_items, nessun DDL/DELETE/INSERT/GRANT', () => {
  assert.doesNotMatch(executable, /\b(CREATE|ALTER|DROP|DELETE|INSERT|GRANT|REVOKE|TRUNCATE)\b/i);
  assert.equal((executable.match(/UPDATE public\.kitchen_menu_items/g) || []).length, 2);
  assert.doesNotMatch(executable, /SET[^;]*\bprice\b/i);
});

test('item-040 e item-060 tornano sul panino Pulled Pork', () => {
  assert.match(executable, /name = 'Pulled Pork — Fallo Pesante'[^;]*item_id = 'item-040'/);
  assert.match(executable, /name = 'Pulled Pork — Menu Bibita'[^;]*item_id = 'item-060'/);
  assert.doesNotMatch(executable, /Box Pulled Pork/);
});

test('non tocca item-018', () => {
  assert.doesNotMatch(executable, /item-018/);
});

test('ogni UPDATE limitato al venue walrus-main', () => {
  for (const stmt of executable.split(';').filter((s) => /UPDATE/.test(s))) {
    assert.match(stmt, /venue_id = 'walrus-main'/);
  }
});
