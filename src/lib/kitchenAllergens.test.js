// kitchenAllergens.test.js — P0-3 del failure-mode sweep pre-apertura 18/09.
//
// Copre i due difetti chiusi da src/lib/kitchenAllergens.js:
//   1. i combo FALLO PESANTE (item-040/041/042) non avevano allergeni e uscivano come
//      "Nessun allergene dichiarato" sulla focus card di /kitchen/solo;
//   2. un itemId fuori catalogo era indistinguibile da un piatto senza allergeni.
//
// Eseguire a mano: node --test src/lib/kitchenAllergens.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import {
  resolveItemAllergens,
  resolveOrderAllergens,
  falloPesanteBeerOptions,
  FALLO_PESANTE_SIDE_ITEM_ID,
} from './kitchenAllergens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const byId = (id) => kitchenMenuItems.find((i) => i.id === id);
const sorted = (a) => [...a].sort();

test('item normale: passa attraverso gli allergeni dichiarati, known = true', () => {
  assert.deepEqual(resolveItemAllergens('item-009'), { allergens: ['uova', 'latte'], known: true });
  // Un array vuoto dichiarato resta vuoto MA known: e' "nessun allergene", non "non lo so".
  assert.deepEqual(resolveItemAllergens(FALLO_PESANTE_SIDE_ITEM_ID), { allergens: [], known: true });
});

test('itemId fuori catalogo: known = false, MAI confuso con "nessun allergene"', () => {
  const unknown = resolveItemAllergens('item-999');
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.allergens, []);
  const empty = resolveItemAllergens(FALLO_PESANTE_SIDE_ITEM_ID);
  assert.deepEqual(empty.allergens, unknown.allergens);
  assert.notEqual(empty.known, unknown.known, 'i due casi devono restare distinguibili');
});

test('ogni combo FALLO PESANTE e l unione derivata dei suoi componenti dichiarati', () => {
  const beers = falloPesanteBeerOptions();
  assert.ok(beers.length >= 6, 'catalogo birre del combo inatteso');
  const side = byId(FALLO_PESANTE_SIDE_ITEM_ID);
  for (const [baseItemId, combo] of Object.entries(kitchenPesiMassimiCombos)) {
    const base = byId(baseItemId);
    const want = new Set([
      ...(base.allergens ?? []),
      ...(side.allergens ?? []),
      ...beers.flatMap((b) => b.allergens ?? []),
    ]);
    const got = resolveItemAllergens(combo.id);
    assert.equal(got.known, true, `${combo.id} deve essere risolvibile`);
    assert.deepEqual(sorted(got.allergens), sorted([...want]), `unione errata per ${combo.id}`);
  }
});

test('nessun combo dichiara MENO allergeni del panino che potenzia (lettura prudente)', () => {
  for (const [baseItemId, combo] of Object.entries(kitchenPesiMassimiCombos)) {
    const base = new Set(byId(baseItemId).allergens ?? []);
    const comboSet = new Set(resolveItemAllergens(combo.id).allergens);
    for (const a of base) assert.ok(comboSet.has(a), `${combo.id} perde '${a}' rispetto a ${baseItemId}`);
  }
});

test('il glutine della birra inclusa arriva su tutti e 3 i combo', () => {
  // Non hardcodato: viene dalle birre selezionabili, che dichiarano tutte glutine.
  const beerAllergens = new Set(falloPesanteBeerOptions().flatMap((b) => b.allergens ?? []));
  assert.ok(beerAllergens.has('glutine'));
  for (const combo of Object.values(kitchenPesiMassimiCombos)) {
    assert.ok(resolveItemAllergens(combo.id).allergens.includes('glutine'), `${combo.id} senza glutine`);
  }
});

test('ordine: unione fra righe + elenco delle righe non verificate', () => {
  const info = resolveOrderAllergens({
    items: [
      { itemId: 'item-040', name: 'Pulled Pork — Fallo Pesante', quantity: 1 },
      { itemId: 'item-025', name: 'Salmon', quantity: 1 },
      { itemId: 'item-999', name: 'Roba Ignota', quantity: 1 },
    ],
  });
  assert.equal(info.hasUnknown, true);
  assert.deepEqual(info.unknownItems, [{ itemId: 'item-999', name: 'Roba Ignota' }]);
  for (const a of ['uova', 'latte', 'glutine', 'pesce', 'sesamo']) {
    assert.ok(info.allergens.includes(a), `manca '${a}'`);
  }
});

test('ordine tutto noto e senza allergeni: hasUnknown false, nessun falso allarme', () => {
  const info = resolveOrderAllergens({ items: [{ itemId: FALLO_PESANTE_SIDE_ITEM_ID, name: 'Patate al Forno', quantity: 1 }] });
  assert.deepEqual(info, { allergens: [], unknownItems: [], hasUnknown: false });
});

test('ordine vuoto/malformato non lancia', () => {
  assert.deepEqual(resolveOrderAllergens({}), { allergens: [], unknownItems: [], hasUnknown: false });
  assert.deepEqual(resolveOrderAllergens(null), { allergens: [], unknownItems: [], hasUnknown: false });
});

test('le due UI staff usano il resolver condiviso, nessuna copia locale residua', () => {
  for (const f of ['../pages/KitchenSoloService.jsx', '../pages/AlertView.jsx']) {
    const src = readFileSync(join(__dirname, f), 'utf8');
    assert.match(src, /resolveOrderAllergens/, `${f} non usa il resolver`);
    assert.doesNotMatch(src, /function getAllergens/, `${f} ha ancora una copia locale`);
  }
});

test('la focus card staff distingue i tre stati (allergeni / non verificati / nessuno)', () => {
  const src = readFileSync(join(__dirname, '../pages/KitchenSoloService.jsx'), 'utf8');
  assert.match(src, /focus-allergeni-unverified/);
  assert.match(src, /ALLERGENI NON VERIFICATI/);
  assert.match(src, /allergens\.length === 0 && !allergenInfo\.hasUnknown/);
});

test('ALLERGEN_LABEL copre ogni chiave allergene presente nei dati', () => {
  // Guardia contro la divergenza storica `noci` (label) vs `frutta_secca` (dati).
  const labelSrc = readFileSync(join(__dirname, '../components/kitchen/AllergenBadges.jsx'), 'utf8');
  const block = labelSrc.slice(labelSrc.indexOf('ALLERGEN_LABEL = {'), labelSrc.indexOf('};', labelSrc.indexOf('ALLERGEN_LABEL = {')));
  const known = new Set([...block.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]));
  const used = new Set(kitchenMenuItems.flatMap((i) => i.allergens ?? []));
  for (const a of used) assert.ok(known.has(a), `ALLERGEN_LABEL non ha la chiave '${a}'`);
});

// ---------------------------------------------------------------------------------------------
// Fix prudenziale allergeni (2026-09-16, pre-apertura 18/09).
// item-018 e item-043 dichiaravano allergens: [] con liste ingredienti che dicono altro
// (salsa cheddar + maionese; mortadella). Non si inventano allergeni: si dichiara
// "non verificato" finche' Eros non conferma ricetta/etichetta.
// ---------------------------------------------------------------------------------------------

const PRUDENTIAL_UNVERIFIED = ['item-018', 'item-043'];

test('item-018 e item-043 NON sono piu presentati come "nessun allergene"', () => {
  for (const id of PRUDENTIAL_UNVERIFIED) {
    const res = resolveItemAllergens(id);
    assert.equal(res.known, false, `${id} risulta ancora verificato`);
    assert.deepEqual(res.allergens, [], `${id} espone allergeni: non devono essere inventati`);
  }
});

test('nessun allergene inventato: i dati restano allergens: [] e portano solo il flag', () => {
  for (const id of PRUDENTIAL_UNVERIFIED) {
    const item = byId(id);
    assert.deepEqual(item.allergens, [], `${id}: allergens deve restare vuoto`);
    assert.equal(item.allergensVerified, false, `${id}: manca allergensVerified: false`);
  }
});

test('un ordine con quelle voci finisce in ALLERGENI NON VERIFICATI, con la riga colpevole', () => {
  for (const id of PRUDENTIAL_UNVERIFIED) {
    const item = byId(id);
    const info = resolveOrderAllergens({ items: [{ itemId: id, name: item.name, quantity: 1 }] });
    assert.equal(info.hasUnknown, true, `${id} non segnalato`);
    assert.deepEqual(info.unknownItems, [{ itemId: id, name: item.name }]);
    assert.deepEqual(info.allergens, []);
  }
});

test('in un ordine misto gli allergeni noti restano visibili E la riga non verificata e segnalata', () => {
  const info = resolveOrderAllergens({
    items: [
      { itemId: 'item-016', name: 'Wraptor', quantity: 1 },          // glutine, latte, uova
      { itemId: 'item-043', name: 'Salumi Serissimi', quantity: 1 }, // non verificato
    ],
  });
  for (const a of ['glutine', 'latte', 'uova']) assert.ok(info.allergens.includes(a), `manca '${a}'`);
  assert.equal(info.hasUnknown, true);
  assert.deepEqual(info.unknownItems, [{ itemId: 'item-043', name: 'Salumi Serissimi' }]);
});

test('il flag e opt-in: ogni altra voce con allergens vuoto resta "nessun allergene dichiarato"', () => {
  const emptyOthers = kitchenMenuItems.filter(
    (i) => (i.allergens ?? []).length === 0 && !PRUDENTIAL_UNVERIFIED.includes(i.id),
  );
  // acqua, 5 bibite, patate al forno: assenza reale, coerente con le loro liste ingredienti.
  assert.deepEqual(sorted(emptyOthers.map((i) => i.id)),
    ['item-038', 'item-046', 'item-047', 'item-048', 'item-049', 'item-050', 'item-058']);
  for (const i of emptyOthers) {
    assert.equal(resolveItemAllergens(i.id).known, true, `${i.id} non deve diventare non verificato`);
  }
});

test('item-058 resta verificato: e componente dei combo, un flag qui li renderebbe tutti opachi', () => {
  assert.equal(resolveItemAllergens(FALLO_PESANTE_SIDE_ITEM_ID).known, true);
  for (const combo of Object.values(kitchenPesiMassimiCombos)) {
    assert.equal(resolveItemAllergens(combo.id).known, true, `${combo.id} non deve diventare opaco`);
  }
});

test('un combo erediterebbe il flag da qualunque componente non verificato', () => {
  // Non iniettabile senza mutare il catalogo: si verifica la guardia nel sorgente del resolver.
  const resolver = readFileSync(join(__dirname, 'kitchenAllergens.js'), 'utf8');
  assert.match(resolver, /components\.some\(\(c\) => !c\.known\)/);
  assert.match(resolver, /resolveItemAllergens\(comboRef\.baseItemId\)/);
  assert.match(resolver, /beers\.map\(\(b\) => resolveItemAllergens\(b\.id\)\)/);
});

test('il motivo del flag e scritto accanto al dato, non solo nel report', () => {
  const data = readFileSync(join(__dirname, '../data/kitchenMockData.js'), 'utf8');
  assert.match(data, /salsa cheddar e maionese/);
  assert.match(data, /mortadella/);
  assert.match(data, /quando Eros conferma ricetta\/etichetta/);
});
