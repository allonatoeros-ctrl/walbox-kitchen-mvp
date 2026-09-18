// kitchenPrepAggregation.test.js — PREP V1 Production Board (2026-09-17).
// Eseguire a mano: node --test src/lib/kitchenPrepAggregation.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregatePrepBoard, buildPreparingTickets } from './kitchenPrepAggregation.js';

function order(overrides) {
  return {
    id: 'order-x',
    orderCode: 'W00',
    status: 'received',
    note: '',
    items: [],
    ...overrides,
  };
}

test('separa received (queue) e preparing (now), ignora gli altri stati', () => {
  const orders = [
    order({ orderCode: 'W01', status: 'preparing', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 2 }] }),
    order({ orderCode: 'W02', status: 'received', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
    order({ orderCode: 'W03', status: 'ready', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 5 }] }),
    order({ orderCode: 'W04', status: 'delivered', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 5 }] }),
    order({ orderCode: 'W05', status: 'cancelled', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 5 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.orderCount, 1);
  assert.equal(board.now.rows.length, 1);
  assert.equal(board.now.rows[0].quantity, 2);
  assert.equal(board.queue.orderCount, 1);
  assert.equal(board.queue.rows[0].quantity, 1);
});

test('orderCount conta ordini distinti, non la somma delle quantita', () => {
  const orders = [
    order({ orderCode: 'W06', status: 'preparing', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 5 }] }),
    order({ orderCode: 'W07', status: 'preparing', items: [{ itemId: 'item-020', name: 'Patatine', quantity: 7 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.orderCount, 2);
});

test('aggrega per itemId sommando le quantita di piu ordini e porta gli order code sorgente', () => {
  const orders = [
    order({ orderCode: 'W06', status: 'received', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
    order({ orderCode: 'W07', status: 'received', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 2 }] }),
    order({ orderCode: 'W11', status: 'received', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  const row = board.queue.rows.find((r) => r.itemId === 'item-009');
  assert.equal(row.quantity, 4);
  assert.deepEqual(
    row.orderCodes.map((o) => `${o.code}:${o.qty}`).sort(),
    ['W06:1', 'W07:2', 'W11:1'],
  );
  assert.equal(row.overflowCount, 0);
});

test('righe ordinate per quantita decrescente (piu urgente in cima)', () => {
  const orders = [
    order({ orderCode: 'W01', status: 'preparing', items: [{ itemId: 'item-a', name: 'Patatine', quantity: 7 }] }),
    order({ orderCode: 'W02', status: 'preparing', items: [{ itemId: 'item-b', name: 'Pastrami', quantity: 5 }] }),
    order({ orderCode: 'W03', status: 'preparing', items: [{ itemId: 'item-c', name: 'Cavallo', quantity: 3 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.deepEqual(board.now.rows.map((r) => r.name), ['Patatine', 'Pastrami', 'Cavallo']);
});

test('nota cliente non vuota finisce in attention.notes e marca la riga come flagged', () => {
  const orders = [
    order({
      orderCode: 'W18',
      status: 'preparing',
      note: 'Senza cipolla',
      items: [{ itemId: 'item-z', name: 'Panino', quantity: 1 }],
    }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.deepEqual(board.attention.notes.orderCodes, ['W18']);
  assert.equal(board.attention.notes.overflowCount, 0);
  assert.equal(board.now.rows[0].isFlagged, true);
});

test('allergene dichiarato su un item noto compare in attention.allergens, raggruppato per allergene', () => {
  // item-009 nel catalogo reale ha allergens: ['uova', 'latte'] (vedi kitchenAllergens.test.js)
  const orders = [
    order({ orderCode: 'W14', status: 'preparing', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  const byAllergen = Object.fromEntries(board.attention.allergens.map((a) => [a.allergen, a.orderCodes]));
  assert.deepEqual(byAllergen, { latte: ['W14'], uova: ['W14'] });
});

test('due ordini con lo stesso allergene finiscono nella stessa riga (una riga per allergene, non per ordine)', () => {
  const orders = [
    order({ orderCode: 'W14', status: 'preparing', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
    order({ orderCode: 'W20', status: 'received', items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  // 2 ordini, stesso item -> stesso set di allergeni: latte/uova devono avere UNA riga ciascuno con 2 codici, non 2 righe.
  assert.equal(board.attention.allergens.length, 2);
  const latte = board.attention.allergens.find((a) => a.allergen === 'latte');
  assert.deepEqual(latte.orderCodes, ['W14', 'W20']);
});

test('item non risolvibile nel catalogo produce attention.unverified, mai un falso "nessun allergene"', () => {
  const orders = [
    order({ orderCode: 'W99', status: 'received', items: [{ itemId: 'item-non-esiste', name: 'Misterioso', quantity: 1 }] }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.deepEqual(board.attention.unverified.orderCodes, ['W99']);
});

test('priorita: le allergie non vengono MAI cappate, anche con molti ordini sullo stesso allergene', () => {
  const orders = Array.from({ length: 20 }, (_, i) =>
    order({
      orderCode: `P${String(i + 1).padStart(2, '0')}`,
      status: 'preparing',
      items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }], // allergens: latte, uova
    }),
  );
  const board = aggregatePrepBoard(orders, { noteCodeLimit: 5 });
  const latte = board.attention.allergens.find((a) => a.allergen === 'latte');
  // Tutti i 20 order code devono essere presenti: nessun overflowCount esiste su un gruppo allergene.
  assert.equal(latte.orderCodes.length, 20);
  assert.equal('overflowCount' in latte, false);
});

test('priorita: solo le note vengono cappate quando superano noteCodeLimit, mai gli allergeni', () => {
  const orders = Array.from({ length: 20 }, (_, i) =>
    order({
      orderCode: `N${String(i + 1).padStart(2, '0')}`,
      status: 'received',
      note: 'Nota generica',
      items: [{ itemId: 'item-009', name: 'Pastrami', quantity: 1 }],
    }),
  );
  const board = aggregatePrepBoard(orders, { noteCodeLimit: 5 });
  assert.equal(board.attention.notes.orderCodes.length, 5);
  assert.equal(board.attention.notes.overflowCount, 15);
  // Le allergie sullo stesso lotto di ordini restano tutte visibili, zero perdita di dato safety-critical.
  const latte = board.attention.allergens.find((a) => a.allergen === 'latte');
  assert.equal(latte.orderCodes.length, 20);
});

test('overflow dei chip order code: cap a orderCodeLimit, resto in overflowCount', () => {
  const orders = Array.from({ length: 9 }, (_, i) =>
    order({
      orderCode: `W${String(i + 1).padStart(2, '0')}`,
      status: 'received',
      items: [{ itemId: 'item-shared', name: 'Patatine', quantity: 1 }],
    }),
  );
  const board = aggregatePrepBoard(orders, { orderCodeLimit: 6 });
  const row = board.queue.rows[0];
  assert.equal(row.quantity, 9);
  assert.equal(row.orderCodes.length, 6);
  assert.equal(row.overflowCount, 3);
});

test('stress: 30 ordini concorrenti restano leggibili (righe aggregate, non 30 ticket singoli)', () => {
  const productIds = ['item-001', 'item-002', 'item-003', 'item-004', 'item-005'];
  const orders = Array.from({ length: 30 }, (_, i) => {
    const itemId = productIds[i % productIds.length];
    return order({
      orderCode: `A${String(i + 1).padStart(2, '0')}`,
      status: i % 2 === 0 ? 'preparing' : 'received',
      items: [{ itemId, name: itemId, quantity: 1 + (i % 3) }],
    });
  });
  const board = aggregatePrepBoard(orders);

  // 30 ordini -> 15 preparing + 15 received, mai piu' di 5 righe per colonna (un prodotto = una riga).
  assert.equal(board.now.orderCount, 15);
  assert.equal(board.queue.orderCount, 15);
  assert.ok(board.now.rows.length <= productIds.length);
  assert.ok(board.queue.rows.length <= productIds.length);

  // Ogni riga aggregata resta leggibile: mai piu' di orderCodeLimit chip mostrati.
  [...board.now.rows, ...board.queue.rows].forEach((row) => {
    assert.ok(row.orderCodes.length <= 6);
    assert.ok(row.overflowCount >= 0);
  });

  // La somma delle quantita' aggregate deve combaciare col totale reale ordinato.
  const totalQuantity = orders.reduce((sum, o) => sum + o.items[0].quantity, 0);
  const aggregatedTotal =
    board.now.rows.reduce((s, r) => s + r.quantity, 0) + board.queue.rows.reduce((s, r) => s + r.quantity, 0);
  assert.equal(aggregatedTotal, totalQuantity);

  // Il pannello ATTENZIONE resta passivo/senza scroll anche a 30 ordini: nessun prodotto reale in
  // questo fixture ha allergeni (item-001..005 non sono nel catalogo), quindi le uniche righe
  // possibili sono "non verificati" (una riga, tutti gli order code, mai cappata).
  assert.equal(board.attention.allergens.length, 0);
  assert.equal(board.attention.unverified.orderCodes.length, 30);
  assert.equal(board.attention.notes.orderCodes.length, 0);
});

test('PREP V1: item drink (tags.includes("drink")) e escluso dal board', () => {
  const orders = [
    order({
      orderCode: 'W30',
      status: 'preparing',
      items: [{ itemId: 'item-051', name: 'Birra', quantity: 2 }], // category birre, tags: drink
    }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.rows.length, 0);
  // l'ordine resta comunque conteggiato: solo la riga prodotto sparisce, non l'ordine.
  assert.equal(board.now.orderCount, 1);
});

test('PREP V1: item food resta incluso nel board', () => {
  const orders = [
    order({
      orderCode: 'W31',
      status: 'preparing',
      items: [{ itemId: 'item-009', name: 'Pulled Pork', quantity: 1 }],
    }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.rows.length, 1);
  assert.equal(board.now.rows[0].itemId, 'item-009');
});

test('PREP V1: combo FALLO PESANTE resta incluso per intero (atomico, mai splittato)', () => {
  const orders = [
    order({
      orderCode: 'W32',
      status: 'preparing',
      items: [{ itemId: 'item-040', name: 'Pulled Pork — Fallo Pesante', quantity: 1 }],
    }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.rows.length, 1);
  assert.equal(board.now.rows[0].itemId, 'item-040');
  assert.equal(board.now.rows[0].quantity, 1);
});

test('PREP V1: ordine misto food+drink mostra solo la riga food, quantita food invariata', () => {
  const orders = [
    order({
      orderCode: 'W33',
      status: 'preparing',
      items: [
        { itemId: 'item-009', name: 'Pulled Pork', quantity: 2 },
        { itemId: 'item-051', name: 'Birra', quantity: 2 },
      ],
    }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.rows.length, 1);
  assert.equal(board.now.rows[0].itemId, 'item-009');
  assert.equal(board.now.rows[0].quantity, 2);
  // aggregazione ORA/IN CODA invariata: l'ordine resta 1, non 2 solo perche' ha 2 righe.
  assert.equal(board.now.orderCount, 1);
});

test('quantita zero o mancante viene ignorata (nessuna riga fantasma)', () => {
  const orders = [
    order({ orderCode: 'W01', status: 'preparing', items: [{ itemId: 'item-x', name: 'X', quantity: 0 }] }),
    order({ orderCode: 'W02', status: 'preparing', items: [{ itemId: 'item-y', name: 'Y' }] }),
  ];
  const board = aggregatePrepBoard(orders);
  assert.equal(board.now.rows.length, 0);
  // ma gli ordini contano comunque come "attivi" (status preparing), anche se senza righe prodotto valide
  assert.equal(board.now.orderCount, 2);
});

// PASSIVE KDS V2 — buildPreparingTickets (ticket singoli, CENTER del board)

test('buildPreparingTickets: solo ordini preparing, ordinati per createdAt crescente', () => {
  const orders = [
    order({ orderCode: 'W10', status: 'preparing', createdAt: '2026-09-17T10:05:00Z', items: [{ itemId: 'item-009', name: 'Pulled Pork', quantity: 1 }] }),
    order({ orderCode: 'W09', status: 'preparing', createdAt: '2026-09-17T10:01:00Z', items: [{ itemId: 'item-012', name: 'Crudo Vero', quantity: 1 }] }),
    order({ orderCode: 'W11', status: 'received', createdAt: '2026-09-17T10:00:00Z', items: [{ itemId: 'item-009', name: 'Pulled Pork', quantity: 1 }] }),
  ];
  const { tickets, totalCount, overflowCount } = buildPreparingTickets(orders);
  assert.equal(totalCount, 2);
  assert.equal(overflowCount, 0);
  assert.deepEqual(tickets.map((t) => t.orderCode), ['W09', 'W10']);
});

test('buildPreparingTickets: cap a 6, resto in overflowCount, mai un settimo ticket visibile', () => {
  const orders = Array.from({ length: 9 }, (_, i) =>
    order({
      orderCode: `W${20 + i}`,
      status: 'preparing',
      createdAt: `2026-09-17T10:${String(i).padStart(2, '0')}:00Z`,
      items: [{ itemId: 'item-012', name: 'Crudo Vero', quantity: 1 }],
    }),
  );
  const { tickets, totalCount, overflowCount } = buildPreparingTickets(orders);
  assert.equal(tickets.length, 6);
  assert.equal(totalCount, 9);
  assert.equal(overflowCount, 3);
});

test('buildPreparingTickets: drink escluso dalle righe, ordine di soli drink non produce ticket', () => {
  const orders = [
    order({
      orderCode: 'W30',
      status: 'preparing',
      items: [
        { itemId: 'item-009', name: 'Pulled Pork', quantity: 1 },
        { itemId: 'item-051', name: 'Birra', quantity: 2 },
      ],
    }),
    order({ orderCode: 'W31', status: 'preparing', items: [{ itemId: 'item-051', name: 'Birra', quantity: 3 }] }),
  ];
  const { tickets, totalCount } = buildPreparingTickets(orders);
  assert.equal(totalCount, 1);
  assert.equal(tickets[0].orderCode, 'W30');
  assert.equal(tickets[0].items.length, 1);
  assert.equal(tickets[0].items[0].itemId, 'item-009');
});

test('buildPreparingTickets: FALLO PESANTE resta atomico (una riga combo, mai scomposto)', () => {
  const orders = [
    order({
      orderCode: 'W32',
      status: 'preparing',
      items: [{ itemId: 'item-040', name: 'Pulled Pork — Fallo Pesante', quantity: 1 }],
    }),
  ];
  const { tickets } = buildPreparingTickets(orders);
  assert.equal(tickets[0].items.length, 1);
  assert.equal(tickets[0].items[0].itemId, 'item-040');
  assert.equal(tickets[0].items[0].quantity, 1);
});

test('buildPreparingTickets: allergeni e nota esposti sul ticket', () => {
  const orders = [
    order({
      orderCode: 'W33',
      status: 'preparing',
      note: 'Senza cipolla',
      items: [{ itemId: 'item-009', name: 'Pulled Pork', quantity: 1 }],
    }),
  ];
  const { tickets } = buildPreparingTickets(orders);
  assert.deepEqual(tickets[0].allergens.sort(), ['latte', 'uova']);
  assert.equal(tickets[0].allergensUnverified, false);
  assert.equal(tickets[0].note, 'Senza cipolla');
});

test('buildPreparingTickets: item non nel catalogo -> allergensUnverified true, item resta visibile', () => {
  const orders = [
    order({
      orderCode: 'W34',
      status: 'preparing',
      items: [{ itemId: 'item-ignoto', name: 'Piatto sconosciuto', quantity: 1 }],
    }),
  ];
  const { tickets } = buildPreparingTickets(orders);
  assert.equal(tickets[0].allergensUnverified, true);
  assert.equal(tickets[0].items[0].itemId, 'item-ignoto');
});
