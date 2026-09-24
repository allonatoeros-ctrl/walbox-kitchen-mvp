// kitchenCart.test.js — persistenza del SACCO (2026-09-16).
// Eseguire a mano: node --test src/lib/kitchenCart.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';
import { loadCart, saveCart, clearCart, reconcileCartItems, cartTotal, CART_STORAGE_KEY } from './kitchenCart.js';
import { buildFalloPesanteCartLine } from './kitchenPesiMassimi.js';

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

const COMBO = kitchenPesiMassimiCombos['item-009'];
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

test('storage corrotto o assente: carrello vuoto, nessuna eccezione', () => {
  const s = fakeStorage({ [CART_STORAGE_KEY]: '{non json' });
  assert.deepEqual(loadCart(s), { items: [], note: '', fulfillmentType: null });
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.deepEqual(loadCart(boom), { items: [], note: '', fulfillmentType: null });
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
  assert.deepEqual(loadCart(s), { items: [], note: '', fulfillmentType: null });
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
  assert.match(cassa, /import \{ buildFalloPesanteCartLine \} from '\.\.\/lib\/kitchenPesiMassimi'/);
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
  assert.match(menuSrc, /useRef\(loadCart\(\)\)\.current/);
  assert.match(menuSrc, /reconcileCartItems\(restoredCart\.items, menuItems, kitchenPesiMassimiCombos\)/);
  assert.match(menuSrc, /saveCart\(\{ items: orderItems, note: customerNote, fulfillmentType \}/);
  // il salvataggio non deve partire prima del ripristino, o sovrascriverebbe lo snapshot
  assert.match(menuSrc, /if \(!cartRestored\) return;\s*\n\s*saveCart/);
});
