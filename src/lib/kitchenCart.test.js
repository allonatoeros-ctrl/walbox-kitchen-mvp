// kitchenCart.test.js — persistenza del SACCO (2026-09-16).
// Eseguire a mano: node --test src/lib/kitchenCart.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import { loadCart, saveCart, clearCart, reconcileCartItems, cartTotal, CART_STORAGE_KEY } from './kitchenCart.js';
import { buildFalloPesanteCartLine, falloPesanteDrinkOptions, isFalloPesanteDrinkAllowed } from './kitchenPesiMassimi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const menuSrc = readFileSync(join(__dirname, '../pages/CustomerKitchenMenu.jsx'), 'utf8');

function fakeStorage(initial = {}) {
  const d = { ...initial };
  return {
    d,
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: (k) => { delete d[k]; },
  };
}

// Combo di riferimento: Pastrami (item-010). Dal 2026-10-30 il MENU Pulled Pork sta di nuovo sul
// panino (item-009); il Box (item-018) si vende solo.
const COMBO = kitchenPesiMassimiCombos['item-010'];
const BEER = kitchenMenuItems.find((i) => i.id === 'item-054');
const comboLine = (qty = 1) => ({ id: `${COMBO.id}::${BEER.id}`, baseId: COMBO.id, qty, includesBeerId: BEER.id });

test('round-trip: item, quantita, nota e scelta di ritiro sopravvivono al salvataggio', () => {
  const s = fakeStorage();
  saveCart({ items: [comboLine(2), { id: 'item-016', baseId: 'item-016', qty: 3 }], note: 'senza cipolla', fulfillmentType: 'takeaway' }, s);
  const back = loadCart(s);
  assert.equal(back.note, 'senza cipolla');
  assert.equal(back.fulfillmentType, 'takeaway');
  assert.equal(back.items.length, 2);
  assert.equal(back.items[0].qty, 2);
  assert.equal(back.items[1].qty, 3);
});

test('RITIRO AL WALRUS: scelta e orario sopravvivono; un orario ormai passato non torna', () => {
  // 28/10/2026, Roma = UTC+1.
  const at = (h, m) => Date.UTC(2026, 9, 28, h - 1, m);
  const s = fakeStorage();
  saveCart({ items: [{ id: 'item-016', baseId: 'item-016', qty: 1 }], note: '', fulfillmentType: 'pickup', pickupSlot: '13:15' }, s);
  assert.deepEqual(
    { ...loadCart(s, { now: at(12, 0) }), items: [] },
    { items: [], note: '', fulfillmentType: 'pickup', pickupSlot: '13:15' },
  );
  const late = loadCart(s, { now: at(13, 5) });
  assert.equal(late.fulfillmentType, 'pickup', 'resta la scelta RITIRO');
  assert.equal(late.pickupSlot, null, 'orario scaduto: da riscegliere, mai inviato');

  // Un orario rimasto in memoria con PORTO VIA non si salva.
  saveCart({ items: [], note: '', fulfillmentType: 'takeaway', pickupSlot: '13:15' }, s);
  assert.equal(JSON.parse(s.getItem(CART_STORAGE_KEY)).pickupSlot, null);

  // Carrello salvato prima del ritiro (nessun campo pickupSlot): si legge come sempre.
  s.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, items: [], note: 'x', fulfillmentType: 'eat_here' }));
  assert.deepEqual(loadCart(s, { now: at(12, 0) }), { items: [], note: 'x', fulfillmentType: 'eat_here', pickupSlot: null });
  // Orario non valido salvato a mano: scartato.
  s.setItem(CART_STORAGE_KEY, JSON.stringify({ v: 1, items: [], note: '', fulfillmentType: 'pickup', pickupSlot: '15:00' }));
  assert.equal(loadCart(s, { now: at(10, 0) }).pickupSlot, null);
});

test('FALLO PESANTE: la birra scelta sopravvive e il nome viene ricostruito dal catalogo', () => {
  const s = fakeStorage();
  saveCart({ items: [comboLine()], note: '', fulfillmentType: null }, s);
  const { items } = reconcileCartItems(loadCart(s).items, kitchenMenuItems, kitchenPesiMassimiCombos);
  assert.equal(items.length, 1);
  assert.equal(items[0].includesBeerId, BEER.id);
  assert.equal(items[0].baseId, COMBO.id, 'il payload ordine deve restare sul baseId del combo');
  assert.equal(items[0].id, `${COMBO.id}::${BEER.id}`);
  assert.equal(items[0].name, `${COMBO.name} · ${BEER.name}`);
  assert.equal(items[0].price, COMBO.price);
});

// H4 (2026-10-27): bibita al posto della birra nel FALLO PESANTE. Da MENU OTTOBRE la bibita ha la
// sua variante di catalogo (`COMBO.softDrink`): qui la riga salvata e' nel formato H4 (baseId birra),
// il reconcile la deve riportare sulla variante bibita.
const drinkLine = (id, qty = 1) => ({ id: `${COMBO.id}::${id}`, baseId: COMBO.id, qty, includesBeerId: id });

test('H4: lista bibite del MENU = bevande ordinabili, acqua esclusa', () => {
  const ids = falloPesanteDrinkOptions(kitchenMenuItems).map((i) => i.id);
  assert.deepEqual(ids, ['item-046', 'item-047', 'item-048', 'item-063', 'item-064', 'item-065', 'item-066']);
  assert.ok(!ids.includes('item-038'), 'l\'acqua non e una bibita del menu');
  // non ordinabili (esaurita / senza prezzo) escluse; nessun id hardcoded fuori dalla lib.
  const edited = kitchenMenuItems.map((i) => (
    i.id === 'item-046' ? { ...i, available: false } : i.id === 'item-047' ? { ...i, price: null } : i
  ));
  assert.deepEqual(falloPesanteDrinkOptions(edited).map((i) => i.id), ['item-048', 'item-063', 'item-064', 'item-065', 'item-066']);
  assert.deepEqual(falloPesanteDrinkOptions(null), []);
  assert.equal(isFalloPesanteDrinkAllowed(BEER), false, 'una birra non e una bibita');
});

test('H4: un FALLO PESANTE con bibita sopravvive al ripristino, riportato sulla variante bibita', () => {
  const s = fakeStorage();
  saveCart({ items: [drinkLine('item-047', 2)], note: '', fulfillmentType: null }, s);
  const { items, dropped } = reconcileCartItems(loadCart(s).items, kitchenMenuItems, kitchenPesiMassimiCombos);
  assert.equal(dropped.length, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].includesBeerId, 'item-047');
  assert.equal(items[0].baseId, COMBO.softDrink.id, 'payload sulla variante bibita (item-061)');
  assert.equal(items[0].id, `${COMBO.softDrink.id}::item-047`);
  assert.equal(items[0].name, `${COMBO.softDrink.name} · Pepsi Zero`);
  assert.equal(items[0].price, COMBO.softDrink.price);
  assert.equal(items[0].qty, 2);
});

test('H4: bevanda non piu ammessa (acqua) o non ordinabile -> la riga cade come per la birra', () => {
  const lines = [drinkLine('item-038'), drinkLine('item-047'), drinkLine('item-048')];
  const edited = kitchenMenuItems.map((i) => (i.id === 'item-048' ? { ...i, available: false } : i));
  const { items, dropped } = reconcileCartItems(lines, edited, kitchenPesiMassimiCombos);
  assert.deepEqual(items.map((l) => l.includesBeerId), ['item-047']);
  assert.equal(dropped.length, 2);
});

test('il totale e ricalcolato dai dati correnti, non letto dallo snapshot', () => {
  const s = fakeStorage();
  saveCart({ items: [comboLine(2), { id: 'item-016', baseId: 'item-016', qty: 1 }], note: '', fulfillmentType: null }, s);
  // prezzo manomesso nello storage: non deve poter entrare nel totale
  const raw = JSON.parse(s.getItem(CART_STORAGE_KEY));
  raw.items[0].price = 0.01;
  raw.items[0].name = 'GRATIS';
  s.setItem(CART_STORAGE_KEY, JSON.stringify(raw));

  const { items } = reconcileCartItems(loadCart(s).items, kitchenMenuItems, kitchenPesiMassimiCombos);
  const wraptor = kitchenMenuItems.find((i) => i.id === 'item-016');
  assert.equal(cartTotal(items), COMBO.price * 2 + wraptor.price);
  assert.ok(!items.some((i) => i.name === 'GRATIS'));
});

test('riga non piu ordinabile: scartata invece di restare in un carrello che il server rifiuterebbe', () => {
  const soldOut = kitchenMenuItems.map((i) => (i.id === 'item-016' ? { ...i, available: false } : i));
  const { items, dropped } = reconcileCartItems(
    [{ id: 'item-016', baseId: 'item-016', qty: 1 }], soldOut, kitchenPesiMassimiCombos);
  assert.deepEqual(items, []);
  assert.deepEqual(dropped, ['item-016']);

  const noPrice = kitchenMenuItems.map((i) => (i.id === 'item-016' ? { ...i, price: null } : i));
  assert.deepEqual(reconcileCartItems([{ id: 'item-016', baseId: 'item-016', qty: 1 }], noPrice, kitchenPesiMassimiCombos).items, []);

  // id sparito del tutto dal catalogo
  assert.deepEqual(reconcileCartItems([{ id: 'item-999', baseId: 'item-999', qty: 1 }], kitchenMenuItems, kitchenPesiMassimiCombos).items, []);
});

test('combo la cui birra non e piu servibile: cade tutta la riga (un combo senza birra non esiste)', () => {
  const beerOut = kitchenMenuItems.map((i) => (i.id === BEER.id ? { ...i, available: false } : i));
  const { items, dropped } = reconcileCartItems([comboLine()], beerOut, kitchenPesiMassimiCombos);
  assert.deepEqual(items, []);
  assert.deepEqual(dropped, [COMBO.id]);
});

// MENU OTTOBRE (2026-10-28): reconcile delle varianti birra/bibita e dei carrelli vecchi.
test('MENU OTTOBRE: variante bibita (item-060/061/062) riconosciuta e riprezzata dal catalogo', () => {
  const fanta = 'item-063';
  const saved = [
    { id: `item-061::${fanta}`, baseId: 'item-061', qty: 1, includesBeerId: fanta },
    { id: 'item-060::item-064', baseId: 'item-060', qty: 2, includesBeerId: 'item-064' },
  ];
  const { items, dropped } = reconcileCartItems(saved, kitchenMenuItems, kitchenPesiMassimiCombos);
  assert.deepEqual(dropped, []);
  assert.deepEqual(items.map((l) => [l.baseId, l.price, l.qty]), [['item-061', 20, 1], ['item-060', 19, 2]]);
  assert.equal(items[1].name, 'Pulled Pork — Menu Bibita · Sprite');
});

test('MENU OTTOBRE: la variante segue SEMPRE la bevanda salvata, mai il baseId salvato', () => {
  // baseId bibita con dentro una birra (riga incoerente/manomessa) → torna sulla variante birra.
  const { items } = reconcileCartItems(
    [{ id: 'item-061::item-054', baseId: 'item-061', qty: 1, includesBeerId: 'item-054' }],
    kitchenMenuItems, kitchenPesiMassimiCombos);
  assert.equal(items[0].baseId, 'item-041');
  assert.equal(items[0].id, 'item-041::item-054');
  assert.equal(items[0].price, 20);
});

test('MENU OTTOBRE: carrelli vecchi (prezzi 19/20, Schweppes, menu PP del panino) mai incoerenti', () => {
  const saved = [
    // menu Pulled Pork salvato quando item-040 era sul panino: resta MENU del panino, a prezzo e nome correnti
    { id: 'item-040::item-051', baseId: 'item-040', qty: 1, includesBeerId: 'item-051', price: 19, name: 'Pulled Pork — Fallo Pesante' },
    // Brisket a 20: riprezzato
    { id: 'item-042::item-052', baseId: 'item-042', qty: 1, includesBeerId: 'item-052', price: 20 },
    // menu con Schweppes (tolta dal catalogo): cade
    { id: 'item-041::item-049', baseId: 'item-041', qty: 1, includesBeerId: 'item-049' },
    // Schweppes singola: cade
    { id: 'item-050', baseId: 'item-050', qty: 1 },
  ];
  const { items, dropped } = reconcileCartItems(saved, kitchenMenuItems, kitchenPesiMassimiCombos);
  assert.deepEqual(items.map((l) => [l.baseId, l.price]), [['item-040', 19], ['item-042', 20]]);
  assert.match(items[0].name, /^Pulled Pork — Fallo Pesante · /);
  assert.deepEqual(dropped, ['item-041', 'item-050']);
});

test('MENU OTTOBRE: panino Pulled Pork esaurito → cadono entrambe le varianti del suo MENU', () => {
  const boxOut = kitchenMenuItems.map((i) => (i.id === 'item-009' ? { ...i, available: false } : i));
  const { items, dropped } = reconcileCartItems([
    { id: 'item-040::item-051', baseId: 'item-040', qty: 1, includesBeerId: 'item-051' },
    { id: 'item-060::item-046', baseId: 'item-060', qty: 1, includesBeerId: 'item-046' },
  ], boxOut, kitchenPesiMassimiCombos);
  assert.deepEqual(items, []);
  assert.deepEqual(dropped, ['item-040', 'item-060']);
});

test('storage corrotto o assente: carrello vuoto, nessuna eccezione', () => {
  const s = fakeStorage({ [CART_STORAGE_KEY]: '{non json' });
  assert.deepEqual(loadCart(s), { items: [], note: '', fulfillmentType: null, pickupSlot: null });
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.deepEqual(loadCart(boom), { items: [], note: '', fulfillmentType: null, pickupSlot: null });
  assert.doesNotThrow(() => saveCart({ items: [], note: '', fulfillmentType: null }, boom));
  assert.doesNotThrow(() => clearCart(boom));
});

test('righe malformate scartate, quantita normalizzata', () => {
  const s = fakeStorage({ [CART_STORAGE_KEY]: JSON.stringify({
    items: [null, { id: '' }, { id: 'item-016', qty: 0 }, { id: 'item-016', qty: -3 }, { id: 'item-016', qty: '2' }, { id: 'item-016', qty: 5000 }],
    note: 42, fulfillmentType: 'dine_in_teleport',
  }) });
  const back = loadCart(s);
  assert.equal(back.items.length, 2);
  assert.equal(back.items[0].qty, 2);
  assert.equal(back.items[1].qty, 99, 'quantita assurda va clampata');
  assert.equal(back.note, '', 'nota non stringa ignorata');
  assert.equal(back.fulfillmentType, null, 'fulfillment fuori dominio ignorato');
});

test('clear svuota davvero', () => {
  const s = fakeStorage();
  saveCart({ items: [comboLine()], note: 'x', fulfillmentType: 'eat_here' }, s);
  clearCart(s);
  assert.equal(s.getItem(CART_STORAGE_KEY), null);
  assert.deepEqual(loadCart(s), { items: [], note: '', fulfillmentType: null, pickupSlot: null });
});

test('chiave cliente separata da staff/cassa', () => {
  assert.equal(CART_STORAGE_KEY, 'walbox_kitchen_cart_v1');
  for (const staffKey of ['walbox_kitchen_orders_demo', 'walbox_kitchen_my_orders', 'walbox_kitchen_menu_availability']) {
    assert.notEqual(CART_STORAGE_KEY, staffKey);
  }
  // la cassa non deve nemmeno conoscere il modulo carrello cliente
  const cassa = readFileSync(join(__dirname, '../pages/CounterAssistedOrder.jsx'), 'utf8');
  assert.doesNotMatch(cassa, /kitchenCart|CART_STORAGE_KEY|walbox_kitchen_cart/);
  assert.doesNotMatch(cassa, /localStorage/);
});

// PESI MASSIMI MENU PARITY (2026-09-24): la cassa vende i 3 FALLO PESANTE con la stessa forma di
// riga del cliente, ma il payload ordine resta sul baseId del combo (allowlist server/promo).
test('buildFalloPesanteCartLine: id composito solo-UI, baseId reale, birra inclusa', () => {
  const beer = kitchenMenuItems.find((i) => i.id === 'item-051');
  const line = buildFalloPesanteCartLine(COMBO, beer);
  assert.equal(line.id, `${COMBO.id}::${beer.id}`);
  assert.equal(line.baseId, COMBO.id);
  assert.equal(line.name, `${COMBO.name} · ${beer.name}`);
  assert.equal(line.price, COMBO.price);
  assert.equal(line.includesBeerId, beer.id);
  assert.equal(line.qty, 1);
});

test('la cassa mappa il payload sul baseId (combo) e mette la birra inclusa in nota', () => {
  const cassa = readFileSync(join(__dirname, '../pages/CounterAssistedOrder.jsx'), 'utf8');
  // riusa l'helper condiviso neutro, MAI il modulo carrello cliente
  assert.match(cassa, /import \{[^}]*\bbuildFalloPesanteCartLine\b[^}]*\} from '\.\.\/lib\/kitchenPesiMassimi'/);
  // itemId del payload = baseId || id (per un combo è item-040/041/042, non l'id composito)
  assert.match(cassa, /itemId: l\.baseId \|\| l\.id/);
  // la birra scelta viaggia in nota con la stessa funzione del flusso cliente
  assert.match(cassa, /buildIncludedBeersNote\(cart, menuItems\)/);
});

test('il carrello viene svuotato SOLO dopo un ordine confermato dal server', () => {
  // clearCart() deve stare dopo il controllo su result.ok, mai prima
  const failGuard = menuSrc.indexOf("if (!result.ok)");
  const clearPos = menuSrc.indexOf('clearCart()');
  assert.ok(failGuard > -1 && clearPos > failGuard, 'clearCart deve venire dopo il guard di fallimento');
  assert.equal(menuSrc.split('clearCart()').length - 1, 1, 'un solo punto di svuotamento automatico');
  // e il ramo di fallimento non tocca il carrello
  const failBranch = menuSrc.slice(failGuard, menuSrc.indexOf('const createdOrder'));
  assert.doesNotMatch(failBranch, /clearCart|setOrderItems/);
});

test('CustomerKitchenMenu e cablato su load/save/reconcile', () => {
  assert.match(menuSrc, /import \{ loadCart, saveCart, clearCart, reconcileCartItems \} from '\.\.\/lib\/kitchenCart'/);
  assert.match(menuSrc, /\[restoredCart\] = useState\(\(\) => loadCart\(\)\)/);
  assert.match(menuSrc, /reconcileCartItems\(restoredCart\.items, menuItems, kitchenPesiMassimiCombos\)/);
  assert.match(menuSrc, /saveCart\(\{ items: orderItems, note: customerNote, fulfillmentType, pickupSlot \}/);
  // il salvataggio non deve partire prima del ripristino, o sovrascriverebbe lo snapshot
  assert.match(menuSrc, /if \(!cartRestored\) return;\s*\n\s*saveCart/);
});
