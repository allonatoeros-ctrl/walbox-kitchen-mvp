// kitchenServiceRules.test.js — P0-2 del failure-mode sweep pre-apertura 18/09
// (+ guardia di regressione sul gate serale Krombacher, preesistente).
//
// P0-2: la birra scelta in FALLO PESANTE deve sopravvivere a tutta la catena
// UI -> cart -> submit -> payload RPC -> ordine persistito -> /kitchen/solo.
// Il payload per-item della RPC e' chiuso (item_id + quantity, name/price riscritti dal
// catalogo), quindi il canale e' `customer_note`.
//
// Eseguire a mano: node --test src/lib/kitchenServiceRules.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import {
  buildIncludedBeersNote,
  isEveningServiceActive,
  EVENING_SERVICE_START_HOUR,
  INCLUDED_BEER_NOTE_PREFIX,
} from './kitchenServiceRules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const beers = kitchenMenuItems.filter((i) => i.category === 'birre' && i.tags?.includes('birre-v1'));

// Riga carrello come la costruisce PesiMassimiSection.jsx (id composito, baseId reale).
function comboCartLine(baseItemId, beer, qty = 1) {
  const combo = kitchenPesiMassimiCombos[baseItemId];
  return {
    id: `${combo.id}::${beer.id}`,
    baseId: combo.id,
    name: `${combo.name} · ${beer.name}`,
    price: combo.price,
    qty,
    includesBeerId: beer.id,
  };
}

test('tutte le birre selezionabili nel combo finiscono nella nota, col nome reale del catalogo', () => {
  assert.ok(beers.length >= 7, `attese >= 7 birre birre-v1, trovate ${beers.length}`);
  for (const beer of beers) {
    for (const baseItemId of Object.keys(kitchenPesiMassimiCombos)) {
      const note = buildIncludedBeersNote([comboCartLine(baseItemId, beer)], kitchenMenuItems);
      assert.match(note, new RegExp(INCLUDED_BEER_NOTE_PREFIX));
      assert.ok(note.includes(beer.name.toUpperCase()), `${beer.id} assente dalla nota: ${note}`);
    }
  }
});

test('carrello senza combo: nessuna nota (non si sporca la nota del cliente)', () => {
  assert.equal(buildIncludedBeersNote([{ id: 'item-016', name: 'Wraptor', qty: 2 }], kitchenMenuItems), '');
  assert.equal(buildIncludedBeersNote([], kitchenMenuItems), '');
  assert.equal(buildIncludedBeersNote(null, kitchenMenuItems), '');
});

test('due combo con la stessa birra: quantita sommata, non riga ripetuta', () => {
  const note = buildIncludedBeersNote([comboCartLine('item-009', beers[3], 2)], kitchenMenuItems);
  assert.ok(note.includes(`2x ${beers[3].name.toUpperCase()}`), note);
  assert.equal(note.split(beers[3].name.toUpperCase()).length - 1, 1);
});

test('due combo con birre diverse: entrambe presenti', () => {
  const note = buildIncludedBeersNote(
    [comboCartLine('item-009', beers[3]), comboCartLine('item-011', beers[6])],
    kitchenMenuItems,
  );
  assert.ok(note.includes(beers[3].name.toUpperCase()), note);
  assert.ok(note.includes(beers[6].name.toUpperCase()), note);
});

test('birra non piu in catalogo: si degrada sull id, mai una nota vuota o un crash', () => {
  const note = buildIncludedBeersNote([{ includesBeerId: 'item-099', qty: 1 }], kitchenMenuItems);
  assert.ok(note.includes('ITEM-099'), note);
});

test('il nome della birra NON viene ricavato dal nome della riga carrello', () => {
  // Stessa riga, nome composito bugiardo: la nota deve seguire includesBeerId, non il nome.
  const line = comboCartLine('item-009', beers[0]);
  line.name = 'Pulled Pork — Fallo Pesante · NOME SBAGLIATO';
  const note = buildIncludedBeersNote([line], kitchenMenuItems);
  assert.ok(note.includes(beers[0].name.toUpperCase()), note);
  assert.doesNotMatch(note, /NOME SBAGLIATO/);
});

test('handleSubmit mette la birra PRIMA della nota cliente e non cambia il payload item', () => {
  const src = readFileSync(join(__dirname, '../pages/CustomerKitchenMenu.jsx'), 'utf8');
  assert.match(src, /const noteParts = \[buildIncludedBeersNote\(orderItems, menuItems\), customerNote\.trim\(\)\]/);
  assert.match(src, /note: noteParts\.length > 0 \? noteParts\.join/);
  // Contratto invariato: l'id che va al server resta baseId (allowlist promo item-040/041/042).
  assert.match(src, /itemId: o\.baseId \|\| o\.id/);
});

test('la nota arriva davvero alla cucina: kitchen_orders.customer_note -> order.note -> focus card', () => {
  const hook = readFileSync(join(__dirname, '../hooks/useKitchenOrders.js'), 'utf8');
  assert.match(hook, /note:\s+row\.customer_note/);
  assert.match(hook, /p_customer_note: order\.note/);
  const solo = readFileSync(join(__dirname, '../pages/KitchenSoloService.jsx'), 'utf8');
  assert.match(solo, /MODIFICHE \/ NOTE/);
  assert.match(solo, /focusOrder\.note/);
});

test('regressione: gate serale invariato (Krombacher dalle 18:00)', () => {
  assert.equal(EVENING_SERVICE_START_HOUR, 18);
  assert.equal(isEveningServiceActive(new Date(2026, 8, 18, 17, 59)), false);
  assert.equal(isEveningServiceActive(new Date(2026, 8, 18, 18, 0)), true);
});
