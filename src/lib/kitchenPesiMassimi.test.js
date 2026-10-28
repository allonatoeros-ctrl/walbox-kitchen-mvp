// kitchenPesiMassimi.test.js — MENU OTTOBRE (2026-10-28): due prezzi per MENU (birra / bibita).
// Eseguire a mano: node --test src/lib/kitchenPesiMassimi.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import {
  buildFalloPesanteCartLine,
  falloPesanteNeedsSide,
  falloPesanteVariant,
  findFalloPesanteCombo,
} from './kitchenPesiMassimi.js';

const item = (id) => kitchenMenuItems.find((i) => i.id === id);
const BEER = item('item-051');
const PEPSI = item('item-046');
const WATER = item('item-038');

test('il MENU Pulled Pork sta sul Box, non piu sul panino', () => {
  assert.deepEqual(Object.keys(kitchenPesiMassimiCombos).sort(), ['item-010', 'item-011', 'item-018']);
  assert.equal(kitchenPesiMassimiCombos['item-009'], undefined, 'il panino Pulled Pork non ha il MENU');
  const box = kitchenPesiMassimiCombos['item-018'];
  assert.equal(falloPesanteNeedsSide(box), false, 'le patate sono gia dentro la box');
  assert.equal(falloPesanteNeedsSide(kitchenPesiMassimiCombos['item-010']), true);
  assert.equal(falloPesanteNeedsSide(kitchenPesiMassimiCombos['item-011']), true);
  assert.equal(falloPesanteNeedsSide({ id: 'x' }), true, 'campo assente = patate incluse (prudente)');
  assert.doesNotMatch(box.subtitle, /PANINO/);
});

test('prezzi decisi da Eros: birra vs bibita', () => {
  const prices = Object.fromEntries(Object.entries(kitchenPesiMassimiCombos)
    .map(([k, c]) => [k, [c.id, c.price, c.softDrink.id, c.softDrink.price]]));
  assert.deepEqual(prices, {
    'item-018': ['item-040', 15.9, 'item-060', 13.9],
    'item-010': ['item-041', 17.9, 'item-061', 16.9],
    'item-011': ['item-042', 17.9, 'item-062', 16.9],
  });
});

test('falloPesanteVariant: birra → variante storica, bibita ammessa → softDrink', () => {
  const c = kitchenPesiMassimiCombos['item-010'];
  assert.deepEqual(falloPesanteVariant(c, BEER), { id: 'item-041', name: c.name, price: 17.9 });
  assert.deepEqual(falloPesanteVariant(c, PEPSI), c.softDrink);
  assert.equal(falloPesanteVariant(c, null).id, 'item-041', 'senza bevanda vale la variante birra');
  assert.equal(falloPesanteVariant(c, WATER).id, 'item-041', 'l\'acqua non e una bibita del MENU');
  const noSoft = { id: 'item-x', name: 'X', price: 10 };
  assert.equal(falloPesanteVariant(noSoft, PEPSI).id, 'item-x', 'combo senza softDrink: variante unica');
});

test('buildFalloPesanteCartLine: baseId e prezzo della variante giusta', () => {
  const box = kitchenPesiMassimiCombos['item-018'];
  const beerLine = buildFalloPesanteCartLine(box, BEER, 2);
  assert.deepEqual(
    { id: beerLine.id, baseId: beerLine.baseId, price: beerLine.price, qty: beerLine.qty, inc: beerLine.includesBeerId },
    { id: 'item-040::item-051', baseId: 'item-040', price: 15.9, qty: 2, inc: 'item-051' },
  );
  assert.equal(beerLine.name, `Box Pulled Pork — Fallo Pesante · ${BEER.name}`);
  const softLine = buildFalloPesanteCartLine(box, PEPSI);
  assert.deepEqual(
    { id: softLine.id, baseId: softLine.baseId, price: softLine.price, qty: softLine.qty, inc: softLine.includesBeerId },
    { id: 'item-060::item-046', baseId: 'item-060', price: 13.9, qty: 1, inc: 'item-046' },
  );
  assert.equal(softLine.name, 'Box Pulled Pork — Menu Bibita · Pepsi 33cl');
  assert.equal(softLine.image, box.image);
});

test('findFalloPesanteCombo: trova il MENU da entrambe le varianti', () => {
  for (const [baseItemId, combo] of Object.entries(kitchenPesiMassimiCombos)) {
    assert.deepEqual(findFalloPesanteCombo(kitchenPesiMassimiCombos, combo.id), { baseItemId, combo });
    assert.deepEqual(findFalloPesanteCombo(kitchenPesiMassimiCombos, combo.softDrink.id), { baseItemId, combo });
  }
  assert.equal(findFalloPesanteCombo(kitchenPesiMassimiCombos, 'item-009'), null);
  assert.equal(findFalloPesanteCombo(kitchenPesiMassimiCombos, undefined), null);
  assert.equal(findFalloPesanteCombo(null, 'item-040'), null);
});

test('bibite nuove a catalogo, Schweppes fuori', () => {
  for (const id of ['item-049', 'item-050']) assert.equal(item(id), undefined);
  for (const id of ['item-063', 'item-064', 'item-065', 'item-066']) {
    const b = item(id);
    assert.equal(b.category, 'bevande');
    assert.equal(b.price, 4);
    assert.equal(b.image, null, 'senza foto: la card mostra FOTO IN ARRIVO');
  }
});
