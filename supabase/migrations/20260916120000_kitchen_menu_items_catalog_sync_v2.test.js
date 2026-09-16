// 20260916120000_kitchen_menu_items_catalog_sync_v2.test.js — CATALOG AUTHORITY TEST.
//
// Non verifica solo la sintassi della migration: verifica che il catalogo che la migration
// porterebbe sul remoto sia ESATTAMENTE il catalogo che il cliente vede in
// src/data/kitchenMockData.js. E' il test che, da qui in avanti, fallisce appena qualcuno
// cambia un prezzo o aggiunge un piatto nel bundle senza allineare kitchen_menu_items —
// cioe' la causa esatta del P0-1 del failure-mode sweep del 2026-09-16.
//
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
// Eseguire a mano: node --test supabase/migrations/20260916120000_kitchen_menu_items_catalog_sync_v2.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../../src/data/kitchenMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260916120000_kitchen_menu_items_catalog_sync_v2.sql'), 'utf8');
const legacySeed = readFileSync(join(__dirname, '20260912100000_kitchen_menu_items_v1.sql'), 'utf8');

function parsedRows(sql) {
  const rows = new Map();
  for (const m of sql.matchAll(/\('walrus-main',\s*'(item-\d+)',\s*'((?:[^']|'')*)',\s*(NULL|[\d.]+)\)/g)) {
    rows.set(m[1], { name: m[2].replace(/''/g, "'"), price: m[3] === 'NULL' ? null : Number(m[3]) });
  }
  return rows;
}

function expectedCatalog() {
  const out = new Map();
  for (const i of kitchenMenuItems) out.set(i.id, { name: i.name, price: i.price });
  for (const combo of Object.values(kitchenPesiMassimiCombos)) out.set(combo.id, { name: combo.name, price: combo.price });
  return out;
}

const rows = parsedRows(src);
const expected = expectedCatalog();

test('§1 contiene esattamente il catalogo cliente corrente, nessuna voce in piu o in meno', () => {
  assert.deepEqual([...rows.keys()].sort(), [...expected.keys()].sort());
  assert.equal(rows.size, 40);
});

test('§1 nome e prezzo di ogni voce combaciano con kitchenMockData (authority server-side)', () => {
  for (const [id, want] of expected) {
    const got = rows.get(id);
    assert.equal(got.name, want.name, `name divergente per ${id}`);
    assert.equal(got.price, want.price, `price divergente per ${id}`);
  }
});

test('nessuna voce del catalogo arriva con price NULL o 0 (sarebbe non ordinabile, o gratis)', () => {
  for (const [id, r] of rows) {
    assert.notEqual(r.price, null, `${id} arriverebbe non ordinabile`);
    assert.ok(r.price > 0, `${id} arriverebbe a prezzo ${r.price}`);
  }
});

test('i 3 combo FALLO PESANTE usano gli id che il client manda davvero e che la allowlist promo conosce', () => {
  // baseId in PesiMassimiSection.jsx === id in kitchenPesiMassimiCombos === id nella ARRAY[...]
  // di kitchen_promo_pass_redeem_for_order (20260910130000). Se questi divergono, o l'ordine
  // viene rifiutato o il promo pass non trova piu' il Peso Massimo eleggibile.
  const promoAllowlist = readFileSync(
    join(__dirname, '20260910130000_kitchen_promo_pass_redeem_customer_v1.sql'), 'utf8',
  );
  for (const id of ['item-040', 'item-041', 'item-042']) {
    assert.ok(rows.has(id), `${id} assente dalla migration`);
    assert.match(promoAllowlist, new RegExp(`'${id}'`), `${id} non e' nella allowlist promo`);
  }
});

test('copre tutte le voci che la seed del 2026-09-12 non aveva (le 12 che oggi fanno fallire l ordine)', () => {
  const before = parsedRows(legacySeed);
  const missingBefore = [...expected.keys()].filter((id) => !before.has(id));
  assert.deepEqual(missingBefore.sort(), [
    'item-018', 'item-040', 'item-041', 'item-042',
    'item-051', 'item-052', 'item-053', 'item-054', 'item-055', 'item-056', 'item-057',
    'item-058',
  ]);
  for (const id of missingBefore) assert.ok(rows.has(id), `${id} ancora assente`);
});

test('corregge le voci che la seed aveva a price NULL o divergente', () => {
  const before = parsedRows(legacySeed);
  const broken = [...expected.entries()].filter(([id, want]) => {
    const b = before.get(id);
    return b && (b.price === null || b.price !== want.price);
  });
  // 15 con price NULL + item-045 (8 vs 10)
  assert.equal(broken.length, 16);
  for (const [id, want] of broken) assert.equal(rows.get(id).price, want.price, `${id} non corretto`);
});

test('§2 ritira le righe legacy senza cancellarle: price -> NULL, nessun DELETE su kitchen_menu_items', () => {
  const before = parsedRows(legacySeed);
  const legacyIds = [...before.keys()].filter((id) => !expected.has(id)).sort();
  assert.deepEqual(legacyIds, [
    'item-001', 'item-002', 'item-003', 'item-004',
    'item-005', 'item-006', 'item-007', 'item-008', 'item-033',
  ]);
  const update = src.slice(src.indexOf('UPDATE public.kitchen_menu_items'), src.indexOf('DELETE FROM'));
  assert.match(update, /SET price = NULL/);
  for (const id of legacyIds) assert.match(update, new RegExp(`'${id}'`), `${id} non ritirato`);
  assert.doesNotMatch(src, /DELETE FROM public\.kitchen_menu_items/);
});

test('idempotente: UPSERT su conflitto, UPDATE e DELETE con guardia', () => {
  assert.match(src, /ON CONFLICT \(venue_id, item_id\) DO UPDATE/);
  assert.match(src, /AND price IS NOT NULL;/);                 // §2 no-op alla seconda esecuzione
  assert.match(src, /DELETE FROM public\.kitchen_menu_availability[\s\S]*NOT EXISTS/); // §3 idempotente
});

test('non tocca schema, RPC, RLS, grant ne dati d ordine', () => {
  for (const forbidden of [
    /CREATE TABLE/, /ALTER TABLE/, /DROP /, /CREATE (OR REPLACE )?FUNCTION/,
    /CREATE POLICY/, /DROP POLICY/, /GRANT /, /REVOKE /,
    /kitchen_orders/, /kitchen_order_items/, /kitchen_payments/,
  ]) {
    assert.doesNotMatch(src.replace(/^--.*$/gm, ''), forbidden, `statement vietato: ${forbidden}`);
  }
});

test('non forza availability sugli item del catalogo corrente (intento staff preservato)', () => {
  const body = src.replace(/^--.*$/gm, '');
  assert.doesNotMatch(body, /INSERT INTO public\.kitchen_menu_availability/);
  assert.doesNotMatch(body, /UPDATE public\.kitchen_menu_availability/);
  assert.doesNotMatch(body, /available\s*=\s*true/);
});

test('dichiara di non essere applicata e richiede il Gate 2', () => {
  assert.match(src, /NOT APPLIED TO REMOTE/);
  assert.match(src, /Gate 2/);
  assert.match(src, /db push --linked/);
});

// ---------------------------------------------------------------------------------------------
// Simulazione del contratto RPC: riproduce le guardie di kitchen_customer_create_order
// (20260913130000 §2) sul catalogo che questa migration porterebbe sul remoto, e le applica a
// OGNI carrello che la UI cliente e la cassa possono davvero produrre.
// E' il test che oggi, sul catalogo remoto reale, fallirebbe 28 volte su 40.
// ---------------------------------------------------------------------------------------------

// Guardie della RPC, in ordine: unknown_menu_item -> item_not_orderable -> invalid_order_items.
function simulateCreateOrder(items, catalog) {
  for (const line of items) {
    const row = catalog.get(line.item_id);
    if (!row) return { error: 'unknown_menu_item', item_id: line.item_id };
    if (row.price === null) return { error: 'item_not_orderable', item_id: line.item_id };
    if (line.quantity == null || line.quantity < 1) return { error: 'invalid_order_items', item_id: line.item_id };
  }
  // total e name vengono SEMPRE dal catalogo, mai da p_items.
  const total = items.reduce((sum, l) => sum + l.quantity * catalog.get(l.item_id).price, 0);
  return { total, names: items.map((l) => catalog.get(l.item_id).name) };
}

const CUSTOMER_ORDERABLE = kitchenMenuItems.filter((i) => i.price != null && i.available !== false);

test('RPC simulata: ogni item ordinabile dal menu cliente viene accettato al prezzo mostrato', () => {
  assert.ok(CUSTOMER_ORDERABLE.length >= 37, `catalogo ordinabile inatteso: ${CUSTOMER_ORDERABLE.length}`);
  for (const item of CUSTOMER_ORDERABLE) {
    const res = simulateCreateOrder([{ item_id: item.id, quantity: 2 }], rows);
    assert.equal(res.error, undefined, `${item.id} (${item.name}) rifiutato: ${res.error}`);
    assert.equal(res.total, item.price * 2, `totale server != carrello per ${item.id}`);
  }
});

test('RPC simulata: FALLO PESANTE con OGNI birra passa, al prezzo fisso del combo', () => {
  const beers = kitchenMenuItems.filter((i) => i.category === 'birre' && i.tags?.includes('birre-v1'));
  assert.ok(beers.length >= 7);
  for (const [, combo] of Object.entries(kitchenPesiMassimiCombos)) {
    for (const beer of beers) {
      // Il client manda baseId = combo.id, MAI l'id composito e MAI una riga birra separata:
      // il prezzo del combo resta invariato e la birra viaggia in customer_note (P0-2).
      const res = simulateCreateOrder([{ item_id: combo.id, quantity: 1 }], rows);
      assert.equal(res.error, undefined, `${combo.id} con ${beer.id} rifiutato: ${res.error}`);
      assert.equal(res.total, combo.price, `${combo.id} non al prezzo del combo`);
    }
  }
});

test('RPC simulata: carrello misto (panino + combo + birra + bibita + contorno) accettato', () => {
  const cart = [
    { item_id: 'item-016', quantity: 1 },   // panino
    { item_id: 'item-040', quantity: 1 },   // FALLO PESANTE
    { item_id: 'item-054', quantity: 2 },   // birra standalone
    { item_id: 'item-047', quantity: 1 },   // bibita
    { item_id: 'item-058', quantity: 1 },   // contorno
  ];
  const res = simulateCreateOrder(cart, rows);
  assert.equal(res.error, undefined, `carrello misto rifiutato: ${res.error}`);
  assert.equal(res.total, 8 + 19 + 12 + 4 + 5);
});

test('RPC simulata: sullo stato ATTUALE del remoto lo stesso carrello viene rifiutato', () => {
  // Controprova del P0-1: la migration non e' cosmetica. Catalogo = seed 2026-09-12, che e'
  // quello verificato live il 2026-09-15 (37 righe, item-001..008 presenti).
  const before = parsedRows(legacySeed);
  const rejected = CUSTOMER_ORDERABLE
    .map((i) => ({ id: i.id, res: simulateCreateOrder([{ item_id: i.id, quantity: 1 }], before) }))
    .filter((x) => x.res.error);
  assert.equal(rejected.length, 24, `attesi 24 item rifiutati oggi, trovati ${rejected.length}`);
  for (const combo of Object.values(kitchenPesiMassimiCombos)) {
    assert.equal(simulateCreateOrder([{ item_id: combo.id, quantity: 1 }], before).error, 'unknown_menu_item');
  }
  // E l'unico che passa col prezzo sbagliato.
  assert.equal(simulateCreateOrder([{ item_id: 'item-045', quantity: 1 }], before).total, 8);
  assert.equal(simulateCreateOrder([{ item_id: 'item-045', quantity: 1 }], rows).total, 10);
});

test('RPC simulata: le righe legacy ritirate da §2 non sono piu ordinabili', () => {
  const before = parsedRows(legacySeed);
  const legacyIds = [...before.keys()].filter((id) => !expected.has(id));
  const update = src.slice(src.indexOf('UPDATE public.kitchen_menu_items'));
  for (const id of legacyIds) {
    assert.match(update, new RegExp(`'${id}'`));
    // dopo §2 il catalogo non le contiene piu come ordinabili
    assert.equal(rows.has(id), false, `${id} non deve entrare fra le righe ordinabili di §1`);
  }
});
