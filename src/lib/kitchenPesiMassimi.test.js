// kitchenPesiMassimi.test.js — MENU Fallo Pesante: prezzi tornati a quelli pre-28/10 (19/20/20), birra = bibita.
// Eseguire a mano: node --test src/lib/kitchenPesiMassimi.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import {
  buildFalloPesanteCartLine,
  falloPesanteCartDisplay,
  falloPesanteBeerExtra,
  falloPesanteIncludesLabel,
  falloPesanteMenuSupplement,
  falloPesanteNeedsSide,
  falloPesanteVariant,
  findFalloPesanteCombo,
} from './kitchenPesiMassimi.js';

const item = (id) => kitchenMenuItems.find((i) => i.id === id);
const BEER = item('item-051');
const PEPSI = item('item-046');
const WATER = item('item-038');

test('il MENU Pulled Pork sta sul panino (item-009), il Box si vende solo', () => {
  assert.deepEqual(Object.keys(kitchenPesiMassimiCombos).sort(), ['item-009', 'item-010', 'item-011']);
  assert.equal(kitchenPesiMassimiCombos['item-018'], undefined, 'il Box Pulled Pork non ha il MENU');
  const box = { id: 'x', subtitle: 'BOX CON PATATE + DA BERE', includesSide: false };
  assert.equal(falloPesanteNeedsSide(box), false, 'combo senza contorno a parte (includesSide: false)');
  assert.equal(falloPesanteNeedsSide(kitchenPesiMassimiCombos['item-009']), true);
  assert.equal(falloPesanteNeedsSide(kitchenPesiMassimiCombos['item-010']), true);
  assert.equal(falloPesanteNeedsSide(kitchenPesiMassimiCombos['item-011']), true);
  assert.equal(falloPesanteNeedsSide({ id: 'x' }), true, 'campo assente = patate incluse (prudente)');
  assert.doesNotMatch(box.subtitle, /PANINO/);
});

test('prezzi decisi da Eros: birra vs bibita', () => {
  const prices = Object.fromEntries(Object.entries(kitchenPesiMassimiCombos)
    .map(([k, c]) => [k, [c.id, c.price, c.softDrink.id, c.softDrink.price]]));
  assert.deepEqual(prices, {
    'item-009': ['item-040', 19, 'item-060', 19],
    'item-010': ['item-041', 20, 'item-061', 20],
    'item-011': ['item-042', 20, 'item-062', 20],
  });
});

test('falloPesanteVariant: birra → variante storica, bibita ammessa → softDrink', () => {
  const c = kitchenPesiMassimiCombos['item-010'];
  assert.deepEqual(falloPesanteVariant(c, BEER), { id: 'item-041', name: c.name, price: 20 });
  assert.deepEqual(falloPesanteVariant(c, PEPSI), c.softDrink);
  assert.equal(falloPesanteVariant(c, null).id, 'item-041', 'senza bevanda vale la variante birra');
  assert.equal(falloPesanteVariant(c, WATER).id, 'item-041', 'l\'acqua non e una bibita del MENU');
  const noSoft = { id: 'item-x', name: 'X', price: 10 };
  assert.equal(falloPesanteVariant(noSoft, PEPSI).id, 'item-x', 'combo senza softDrink: variante unica');
});

test('buildFalloPesanteCartLine: baseId e prezzo della variante giusta', () => {
  const box = kitchenPesiMassimiCombos['item-009'];
  const beerLine = buildFalloPesanteCartLine(box, BEER, 2);
  assert.deepEqual(
    { id: beerLine.id, baseId: beerLine.baseId, price: beerLine.price, qty: beerLine.qty, inc: beerLine.includesBeerId },
    { id: 'item-040::item-051', baseId: 'item-040', price: 19, qty: 2, inc: 'item-051' },
  );
  assert.equal(beerLine.name, `Pulled Pork — Fallo Pesante · ${BEER.name}`);
  const softLine = buildFalloPesanteCartLine(box, PEPSI);
  assert.deepEqual(
    { id: softLine.id, baseId: softLine.baseId, price: softLine.price, qty: softLine.qty, inc: softLine.includesBeerId },
    { id: 'item-060::item-046', baseId: 'item-060', price: 19, qty: 1, inc: 'item-046' },
  );
  assert.equal(softLine.name, 'Pulled Pork — Menu Bibita · Pepsi 33cl');
  assert.equal(softLine.image, box.image);
});

test('findFalloPesanteCombo: trova il MENU da entrambe le varianti', () => {
  for (const [baseItemId, combo] of Object.entries(kitchenPesiMassimiCombos)) {
    assert.deepEqual(findFalloPesanteCombo(kitchenPesiMassimiCombos, combo.id), { baseItemId, combo });
    assert.deepEqual(findFalloPesanteCombo(kitchenPesiMassimiCombos, combo.softDrink.id), { baseItemId, combo });
  }
  assert.equal(findFalloPesanteCombo(kitchenPesiMassimiCombos, 'item-009'), null, 'item-009 e il panino base, non una variante');
  assert.equal(findFalloPesanteCombo(kitchenPesiMassimiCombos, 'item-018'), null);
  assert.equal(findFalloPesanteCombo(kitchenPesiMassimiCombos, undefined), null);
  assert.equal(findFalloPesanteCombo(null, 'item-040'), null);
});

test('bibite nuove a catalogo, Schweppes fuori', () => {
  for (const id of ['item-049', 'item-050']) assert.equal(item(id), undefined);
  for (const id of ['item-063', 'item-064', 'item-065', 'item-066']) {
    const b = item(id);
    assert.equal(b.category, 'bevande');
    assert.equal(b.price, 4);
    assert.match(b.image, /^\/assets\/kitchen\/menu\/bevande\/item-06\d-.+\.webp$/);
  }
});

test('falloPesanteMenuSupplement: calcolato dai dati (variante bibita meno prezzo panino)', () => {
  const byId = (id) => item(id);
  const sup = (id) => falloPesanteMenuSupplement(byId(id).price, kitchenPesiMassimiCombos[id]);
  assert.equal(sup('item-010'), 5.5, 'Pastrami 20 − 14,50');
  assert.equal(sup('item-011'), 5, 'Brisket 20 − 15,00');
  assert.equal(sup('item-009'), 5.1, 'Pulled Pork 19 − 13,90');
});

test('falloPesanteMenuSupplement: senza bibite ordinabili vale la variante birra; dati mancanti = null', () => {
  const c = kitchenPesiMassimiCombos['item-010'];
  assert.equal(falloPesanteMenuSupplement(14.5, c, false), 5.5, 'solo birra: 20 − 14,50');
  assert.equal(falloPesanteMenuSupplement(14.5, { id: 'x', price: 20 }), 5.5, 'combo senza softDrink');
  assert.equal(falloPesanteMenuSupplement(null, c), null);
  assert.equal(falloPesanteMenuSupplement('', c), null);
  assert.equal(falloPesanteMenuSupplement(14.5, null), null);
});

test('falloPesanteBeerExtra: birra meno bibita, 0 se non applicabile', () => {
  // Prezzi reali: birra e bibita stesso prezzo → differenza 0.
  for (const id of ['item-009', 'item-010', 'item-011']) assert.equal(falloPesanteBeerExtra(kitchenPesiMassimiCombos[id]), 0);
  // Formula (dati di prova): birra 20 − bibita 19 = 1.
  assert.equal(falloPesanteBeerExtra({ id: 'x', price: 20, softDrink: { price: 19 } }), 1, 'formula birra − bibita');
  assert.equal(falloPesanteBeerExtra(kitchenPesiMassimiCombos['item-010'], false), 0, 'niente bibite');
  assert.equal(falloPesanteBeerExtra({ id: 'x', price: 10 }), 0, 'combo senza softDrink');
  assert.equal(falloPesanteBeerExtra(null), 0);
  assert.equal(falloPesanteBeerExtra({ id: 'x', price: 10, softDrink: { price: 12 } }), 0, 'mai negativo');
});

test('falloPesanteIncludesLabel: panino + patate per i panini, box con patate per il Box', () => {
  assert.equal(falloPesanteIncludesLabel(kitchenPesiMassimiCombos['item-010']), 'Panino + patate + da bere');
  const box = { id: 'x', subtitle: 'BOX CON PATATE + DA BERE', includesSide: false };
  assert.equal(falloPesanteIncludesLabel(box), 'Box con patate + da bere');
  assert.doesNotMatch(falloPesanteIncludesLabel(box), /panino/i);
});

test('falloPesanteCartDisplay: riga MENU leggibile a schermo (birra, bibita, Box), name carrello invariato', () => {
  const combos = kitchenPesiMassimiCombos;
  const beerLine = buildFalloPesanteCartLine(combos['item-010'], BEER);
  assert.deepEqual(falloPesanteCartDisplay(beerLine, combos, kitchenMenuItems), {
    title: 'Pastrami — FALLO PESANTE',
    detail: 'MENU · PANINO + PATATE + KEILER HELLES',
  });
  const softLine = buildFalloPesanteCartLine(combos['item-010'], PEPSI);
  assert.deepEqual(falloPesanteCartDisplay(softLine, combos, kitchenMenuItems), {
    title: 'Pastrami — FALLO PESANTE',
    detail: 'MENU · PANINO + PATATE + PEPSI 33CL',
  });
  const ppLine = buildFalloPesanteCartLine(combos['item-009'], BEER);
  assert.deepEqual(falloPesanteCartDisplay(ppLine, combos, kitchenMenuItems), {
    title: 'Pulled Pork — FALLO PESANTE',
    detail: 'MENU · PANINO + PATATE + KEILER HELLES',
  });
  assert.match(softLine.name, /Menu Bibita/, 'il nome della riga carrello non cambia');
});

test('falloPesanteCartDisplay: riga normale o dati mancanti = null (si mostra line.name)', () => {
  const combos = kitchenPesiMassimiCombos;
  const plain = { id: 'item-010', baseId: 'item-010', name: 'Pastrami', price: 14.5, qty: 1 };
  assert.equal(falloPesanteCartDisplay(plain, combos, kitchenMenuItems), null);
  assert.equal(falloPesanteCartDisplay(null, combos, kitchenMenuItems), null);
  const line = buildFalloPesanteCartLine(combos['item-010'], BEER);
  assert.equal(falloPesanteCartDisplay({ ...line, includesBeerId: 'item-inesistente' }, combos, kitchenMenuItems), null, 'bevanda non trovata');
  assert.equal(falloPesanteCartDisplay(line, combos, kitchenMenuItems.filter((i) => i.id !== 'item-010')), null, 'panino base non trovato');
  assert.equal(falloPesanteCartDisplay(line, {}, kitchenMenuItems), null, 'nessun combo');
  assert.equal(falloPesanteCartDisplay(line, combos, undefined), null, 'catalogo non caricato');
});
