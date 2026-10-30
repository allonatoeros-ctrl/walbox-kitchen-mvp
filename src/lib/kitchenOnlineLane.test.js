// kitchenOnlineLane.test.js — corsia online del cliente (S5, Payment Lifecycle V2).
// Eseguire a mano: node --test src/lib/kitchenOnlineLane.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ONLINE_RETRY_WINDOW_MS,
  ONLINE_EXPIRY_MS,
  PAYMENT_ABANDONED_MESSAGE,
  isOnlineLaneStatus,
  getOnlineWindow,
  formatMmSs,
  getOrderStatusLabel,
  cartFingerprint,
  getOrCreateClientRequestId,
  clearClientRequestId,
  resolveCreateOutcome,
  onlineErrorMessage,
  switchErrorMessage,
  readHiddenOrderIds,
  hideOrderId,
  buildRebuildCart,
  isPickupSlotError,
} from './kitchenOnlineLane.js';

function fakeStorage(initial = {}) {
  const d = { ...initial };
  return {
    d,
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => { d[k] = String(v); },
    removeItem: (k) => { delete d[k]; },
  };
}
const throwingStorage = {
  getItem() { throw new Error('storage_off'); },
  setItem() { throw new Error('storage_off'); },
  removeItem() { throw new Error('storage_off'); },
};

test('costanti: 4:30 e 5:00', () => {
  assert.equal(ONLINE_RETRY_WINDOW_MS, 270000);
  assert.equal(ONLINE_EXPIRY_MS, 300000);
});

test('isOnlineLaneStatus: solo POP e PA', () => {
  assert.equal(isOnlineLaneStatus('pending_online_payment'), true);
  assert.equal(isOnlineLaneStatus('payment_abandoned'), true);
  assert.equal(isOnlineLaneStatus('pending_counter_payment'), false);
  assert.equal(isOnlineLaneStatus('received'), false);
  assert.equal(isOnlineLaneStatus(undefined), false);
});

test('getOnlineWindow: active con secondi rimasti', () => {
  const t0 = Date.parse('2026-10-13T20:00:00.000Z');
  const w = getOnlineWindow(new Date(t0).toISOString(), t0 + 30000);
  assert.equal(w.phase, 'active');
  assert.equal(w.secondsLeft, 240);
});

test('getOnlineWindow: confini 4:30 e 5:00', () => {
  const t0 = Date.parse('2026-10-13T20:00:00.000Z');
  const iso = new Date(t0).toISOString();
  assert.equal(getOnlineWindow(iso, t0 + 269999).phase, 'active');
  assert.equal(getOnlineWindow(iso, t0 + 270000).phase, 'retry_closed');
  assert.equal(getOnlineWindow(iso, t0 + 299999).phase, 'retry_closed');
  assert.equal(getOnlineWindow(iso, t0 + 300000).phase, 'closing');
  assert.equal(getOnlineWindow(iso, t0 + 600000).phase, 'closing');
  assert.equal(getOnlineWindow(iso, t0 + 269999).secondsLeft, 1);
  assert.equal(getOnlineWindow(iso, t0 + 270000).secondsLeft, 0);
});

test('getOnlineWindow: createdAt mancante/invalido -> active senza timer, mai crash', () => {
  for (const bad of [null, undefined, '', 'non-una-data', NaN, {}]) {
    const w = getOnlineWindow(bad, Date.now());
    assert.equal(w.phase, 'active');
    assert.equal(w.secondsLeft, null);
  }
});

test('getOnlineWindow: orologio del telefono indietro (createdAt nel futuro) non supera 4:30', () => {
  const t0 = Date.parse('2026-10-13T20:00:00.000Z');
  const w = getOnlineWindow(new Date(t0 + 60000).toISOString(), t0);
  assert.equal(w.phase, 'active');
  assert.equal(w.secondsLeft, 270);
});

test('formatMmSs', () => {
  assert.equal(formatMmSs(270), '4:30');
  assert.equal(formatMmSs(65), '1:05');
  assert.equal(formatMmSs(0), '0:00');
  assert.equal(formatMmSs(-5), '0:00');
  assert.equal(formatMmSs(null), '0:00');
  assert.equal(formatMmSs(NaN), '0:00');
});

test('testo PA esatto e senza promesse di "nessun addebito"', () => {
  assert.equal(PAYMENT_ABANDONED_MESSAGE, 'Ordine annullato: il pagamento non è stato completato entro 5 minuti.');
  assert.doesNotMatch(PAYMENT_ABANDONED_MESSAGE, /addebit/i);
});

test('getOrderStatusLabel: POP/PA propri, altri stati dalla mappa, ultimo fallback lo status', () => {
  const map = { received: { label: 'RICEVUTO' } };
  assert.match(getOrderStatusLabel('pending_online_payment', map), /PAGAMENTO ONLINE/);
  assert.match(getOrderStatusLabel('payment_abandoned', map), /ANNULLATO/);
  assert.equal(getOrderStatusLabel('received', map), 'RICEVUTO');
  assert.equal(getOrderStatusLabel('boh', map), 'boh');
  assert.equal(getOrderStatusLabel('received', undefined), 'received');
  assert.equal(getOrderStatusLabel(undefined, map), '');
});

test('cartFingerprint: stabile rispetto all ordine delle righe, sensibile a qty/ritiro/nota', () => {
  const a = { items: [{ itemId: 'x', quantity: 1 }, { itemId: 'y', quantity: 2 }], fulfillmentType: 'eat_here', note: 'n' };
  const b = { items: [{ itemId: 'y', quantity: 2 }, { itemId: 'x', quantity: 1 }], fulfillmentType: 'eat_here', note: 'n' };
  assert.equal(cartFingerprint(a), cartFingerprint(b));
  assert.notEqual(cartFingerprint(a), cartFingerprint({ ...a, items: [{ itemId: 'x', quantity: 2 }, { itemId: 'y', quantity: 2 }] }));
  assert.notEqual(cartFingerprint(a), cartFingerprint({ ...a, fulfillmentType: 'takeaway' }));
  assert.notEqual(cartFingerprint(a), cartFingerprint({ ...a, note: 'altra' }));
  assert.equal(cartFingerprint({ items: [], fulfillmentType: null, note: null }), cartFingerprint({ items: [], fulfillmentType: null, note: '' }));
});

test('client_request_id: stesso carrello -> stesso id (anche dopo ricarica), carrello cambiato -> id nuovo', () => {
  const s = fakeStorage();
  let n = 0;
  const gen = () => `id-${++n}`;
  const m1 = {};
  const id1 = getOrCreateClientRequestId('fp-A', { storage: s, generateId: gen, memory: m1 });
  const id2 = getOrCreateClientRequestId('fp-A', { storage: s, generateId: gen, memory: m1 });
  assert.equal(id1, id2);
  // "ricarica pagina": memoria vuota, stesso storage
  const id3 = getOrCreateClientRequestId('fp-A', { storage: s, generateId: gen, memory: {} });
  assert.equal(id3, id1);
  const id4 = getOrCreateClientRequestId('fp-B', { storage: s, generateId: gen, memory: {} });
  assert.notEqual(id4, id1);
});

test('client_request_id: clear lo cancella (ordine creato)', () => {
  const s = fakeStorage();
  let n = 0;
  const gen = () => `id-${++n}`;
  const mem = {};
  const id1 = getOrCreateClientRequestId('fp-A', { storage: s, generateId: gen, memory: mem });
  clearClientRequestId({ storage: s, memory: mem });
  const id2 = getOrCreateClientRequestId('fp-A', { storage: s, generateId: gen, memory: mem });
  assert.notEqual(id1, id2);
});

test('client_request_id: storage che lancia -> niente crash, id stabile in memoria', () => {
  let n = 0;
  const gen = () => `id-${++n}`;
  const mem = {};
  const id1 = getOrCreateClientRequestId('fp-A', { storage: throwingStorage, generateId: gen, memory: mem });
  const id2 = getOrCreateClientRequestId('fp-A', { storage: throwingStorage, generateId: gen, memory: mem });
  assert.equal(id1, id2);
  assert.doesNotThrow(() => clearClientRequestId({ storage: throwingStorage, memory: mem }));
});

test('client_request_id: valore corrotto nello storage -> id nuovo, nessun crash', () => {
  const s = fakeStorage({ walbox_kitchen_client_request_id_v1: '{non json' });
  const id = getOrCreateClientRequestId('fp-A', { storage: s, generateId: () => 'nuovo', memory: {} });
  assert.equal(id, 'nuovo');
});

test('resolveCreateOutcome: vale lo status restituito dal server, non la corsia cliccata', () => {
  assert.equal(resolveCreateOutcome('pending_online_payment', 'online'), 'start_online');
  assert.equal(resolveCreateOutcome('pending_online_payment', 'counter'), 'go_status');
  assert.equal(resolveCreateOutcome('pending_counter_payment', 'online'), 'go_status');
  assert.equal(resolveCreateOutcome('pending_counter_payment', 'counter'), 'go_status');
  assert.equal(resolveCreateOutcome('payment_abandoned', 'online'), 'go_status');
  assert.equal(resolveCreateOutcome('received', 'online'), 'go_status');
  assert.equal(resolveCreateOutcome(undefined, 'online'), 'go_status');
});

test('onlineErrorMessage: codici noti', () => {
  assert.match(onlineErrorMessage('online_payment_expired'), /tempo/i);
  assert.equal(onlineErrorMessage({ error: 'order_payment_abandoned' }), PAYMENT_ABANDONED_MESSAGE);
  assert.match(onlineErrorMessage(new Error('switch_to_counter_uncertain')), /tra qualche secondo/i);
  assert.match(onlineErrorMessage('order_already_paid'), /già pagato/i);
  assert.match(onlineErrorMessage({ message: 'kitchen_closed' }), /CUCINA È CHIUSA/);
  assert.match(onlineErrorMessage(new TypeError('Failed to fetch')), /connessione/i);
  assert.match(onlineErrorMessage('qualcosa di strano'), /riprova/i);
  assert.match(onlineErrorMessage(null), /riprova/i);
});

test('onlineErrorMessage: nessuna promessa di "nessun addebito" in nessun messaggio', () => {
  const codes = ['online_payment_expired', 'order_payment_abandoned', 'switch_to_counter_uncertain',
    'order_already_paid', 'kitchen_closed', 'order_cancelled', 'x'];
  for (const c of codes) assert.doesNotMatch(onlineErrorMessage(c), /addebit|nessun costo|non pagherai/i);
});

test('ordini PA nascosti: lettura/scrittura robusta', () => {
  const s = fakeStorage();
  assert.deepEqual(readHiddenOrderIds(s), []);
  hideOrderId('o1', s);
  hideOrderId('o2', s);
  hideOrderId('o1', s);
  assert.deepEqual(readHiddenOrderIds(s).sort(), ['o1', 'o2']);
  assert.deepEqual(readHiddenOrderIds(throwingStorage), []);
  assert.doesNotThrow(() => hideOrderId('o3', throwingStorage));
  assert.deepEqual(readHiddenOrderIds(fakeStorage({ walbox_kitchen_hidden_abandoned_ids: '{rotto' })), []);
});

test('buildRebuildCart: stessi piatti e ritiro, righe senza itemId scartate', () => {
  const cart = buildRebuildCart({
    fulfillmentType: 'takeaway',
    items: [{ itemId: 'item-016', quantity: 2 }, { itemId: null, quantity: 1 }, { itemId: 'item-020', quantity: 0 }],
  });
  assert.deepEqual(cart.items, [{ id: 'item-016', baseId: 'item-016', qty: 2 }]);
  assert.equal(cart.fulfillmentType, 'takeaway');
  assert.equal(cart.note, '');
  assert.deepEqual(buildRebuildCart(null).items, []);
});

test('switchErrorMessage: un messaggio per ogni 409 / errore dello switch', () => {
  assert.match(switchErrorMessage({ error: 'switch_to_counter_uncertain', retryable: true }), /tra qualche secondo/i);
  assert.doesNotMatch(switchErrorMessage({ error: 'switch_to_counter_uncertain', retryable: false }), /tra qualche secondo/i);
  assert.match(switchErrorMessage({ error: 'switch_to_counter_uncertain', retryable: false }), /cassa/i);
  assert.match(switchErrorMessage({ error: 'order_already_paid' }), /già pagato/i);
  assert.equal(switchErrorMessage({ error: 'order_payment_abandoned' }), PAYMENT_ABANDONED_MESSAGE);
  assert.match(switchErrorMessage({ error: 'order_cancelled' }), /annullato/i);
  assert.match(switchErrorMessage({ error: 'order_not_pending_online_payment' }), /stato dell'ordine/i);
  assert.match(switchErrorMessage({ error: 'not_order_owner' }), /sessione/i);
  assert.match(switchErrorMessage({ error: 'missing_session' }), /sessione/i);
  assert.match(switchErrorMessage(new TypeError('Failed to fetch')), /connessione/i);
  assert.match(switchErrorMessage({}), /riprova/i);
  assert.match(switchErrorMessage(null), /riprova/i);
});

test('buildRebuildCart: con carrello gia pieno somma le quantita e tiene nota/ritiro scelti', () => {
  const order = { fulfillmentType: 'takeaway', items: [{ itemId: 'a', quantity: 2 }, { itemId: 'b', quantity: 1 }] };
  const existing = { items: [{ id: 'a', baseId: 'a', qty: 1 }, { id: 'c::x', baseId: 'c', qty: 1, includesBeerId: 'x' }], note: 'senza sale', fulfillmentType: 'eat_here' };
  const cart = buildRebuildCart(order, existing);
  assert.deepEqual(cart.items, [
    { id: 'a', baseId: 'a', qty: 3 },
    { id: 'c::x', baseId: 'c', qty: 1, includesBeerId: 'x' },
    { id: 'b', baseId: 'b', qty: 1 },
  ]);
  assert.equal(cart.note, 'senza sale');
  assert.equal(cart.fulfillmentType, 'eat_here');
  assert.deepEqual(buildRebuildCart(order, { items: [], note: '', fulfillmentType: null }).items.length, 2);
});

test('RITIRO AL WALRUS: l orario entra nell impronta solo se c e (impronte vecchie invariate)', () => {
  const t = { items: [{ itemId: 'x', quantity: 1 }], fulfillmentType: 'takeaway', note: '' };
  assert.equal(cartFingerprint(t), cartFingerprint({ ...t, pickupSlot: null }));
  assert.equal(cartFingerprint(t), JSON.stringify([['x:1'], 'takeaway', '']));
  assert.notEqual(cartFingerprint(t), cartFingerprint({ ...t, pickupSlot: '13:15' }), 'PORTO VIA != ritiro');
  assert.notEqual(cartFingerprint({ ...t, pickupSlot: '13:15' }), cartFingerprint({ ...t, pickupSlot: '13:30' }), 'cambio orario = id nuovo');
  const s = fakeStorage();
  const memory = {};
  let n = 0;
  const gen = () => `id-${++n}`;
  const a = getOrCreateClientRequestId(cartFingerprint({ ...t, pickupSlot: '13:15' }), { storage: s, generateId: gen, memory });
  const b = getOrCreateClientRequestId(cartFingerprint({ ...t, pickupSlot: '13:30' }), { storage: s, generateId: gen, memory });
  assert.notEqual(a, b);
});

test('RITIRO AL WALRUS: errori orario dalla RPC v3 in messaggi cliente chiari', () => {
  const past = { message: 'pickup_slot_in_past' };
  const invalid = new Error('invalid_pickup_slot');
  assert.match(onlineErrorMessage(past), /già passato/);
  assert.match(onlineErrorMessage(invalid), /non valido/);
  assert.equal(isPickupSlotError(past), true);
  assert.equal(isPickupSlotError(invalid), true);
  assert.equal(isPickupSlotError({ message: 'kitchen_closed' }), false);
  assert.equal(isPickupSlotError(null), false);
});

test('RITIRO AL WALRUS: RIFAI L ORDINE riporta ritiro e orario (loadCart scarta quello scaduto)', () => {
  const order = { fulfillmentType: 'takeaway', pickupSlot: '19:30', items: [{ itemId: 'a', quantity: 1 }] };
  const cart = buildRebuildCart(order);
  assert.equal(cart.fulfillmentType, 'pickup');
  assert.equal(cart.pickupSlot, '19:30');
  assert.equal(buildRebuildCart({ ...order, pickupSlot: null }).fulfillmentType, 'takeaway');
});
