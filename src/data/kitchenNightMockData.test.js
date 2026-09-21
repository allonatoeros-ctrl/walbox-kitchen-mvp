// kitchenNightMockData.test.js — Kitchen V2 Fase 2 / micro-fase B1.
// Invarianti minimi sul dataset DEV "Serata Walrus": determinismo, shape isomorfa,
// riconciliazione ordini<->pagamenti, copertura scenario, isolamento da Supabase/runtime.
//
// Eseguire a mano: node --test src/data/kitchenNightMockData.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kitchenOrderStatuses } from './kitchenMockData.js';
import {
  buildSerataWalrusNight,
  serataWalrusOrders,
  serataWalrusPayments,
} from './kitchenNightMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'kitchenNightMockData.js'), 'utf8');

const VALID_STATUSES = new Set(Object.keys(kitchenOrderStatuses));
const VALID_PAYMENT_STATUSES = new Set(['pending_counter_payment', 'paid']);
const VALID_FULFILLMENT = new Set(['eat_here', 'takeaway']);
const VALID_PAYMENT_METHODS = new Set(['cash', 'card_counter_manual', 'sumup_online']);

test('dataset size is in the 50-100 orders range requested for Serata Walrus', () => {
  assert.ok(serataWalrusOrders.length >= 50 && serataWalrusOrders.length <= 100,
    `expected 50-100 orders, got ${serataWalrusOrders.length}`);
});

test('generator is deterministic: same seed -> identical orders and payments', () => {
  const a = buildSerataWalrusNight();
  const b = buildSerataWalrusNight();
  assert.deepEqual(a.orders, b.orders);
  assert.deepEqual(a.payments, b.payments);
});

test('source has no unseeded randomness (no bare Math.random) and no Supabase/runtime coupling', () => {
  const codeOnly = SOURCE.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  assert.ok(!/Math\.random\(/.test(codeOnly), 'kitchenNightMockData.js must not call Math.random()');
  assert.ok(!/from\s+['"][^'"]*supabaseClient['"]/.test(codeOnly), 'dataset must not import supabaseClient');
  assert.ok(!/from\s+['"][^'"]*(useKitchenOrders|useKitchenPayments)['"]/.test(codeOnly),
    'dataset must not be wired to the real runtime hooks yet (B1 scope)');
});

test('every order has the shape isomorphic to mapSupabaseOrder() + a valid enum state', () => {
  const seenIds = new Set();
  const seenCodes = new Set();
  const seenSequences = new Set();

  serataWalrusOrders.forEach((order) => {
    assert.ok(!seenIds.has(order.id), `duplicate order id ${order.id}`);
    seenIds.add(order.id);
    assert.ok(!seenCodes.has(order.orderCode), `duplicate orderCode ${order.orderCode}`);
    seenCodes.add(order.orderCode);
    assert.ok(!seenSequences.has(order.serviceSequence), `duplicate serviceSequence ${order.serviceSequence}`);
    seenSequences.add(order.serviceSequence);

    assert.ok(VALID_STATUSES.has(order.status), `invalid status ${order.status} on ${order.id}`);
    assert.ok(VALID_PAYMENT_STATUSES.has(order.paymentStatus), `invalid paymentStatus on ${order.id}`);
    assert.ok(VALID_FULFILLMENT.has(order.fulfillmentType), `missing/invalid fulfillmentType on ${order.id}`);
    assert.ok(Array.isArray(order.items) && order.items.length > 0, `empty items on ${order.id}`);
    assert.ok(typeof order.serviceDay === 'string' && order.serviceDay.length === 10);
    assert.ok(!Number.isNaN(new Date(order.createdAt).getTime()), `invalid createdAt on ${order.id}`);

    const expectedTotal = Math.round(
      order.items.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100
    ) / 100;
    assert.equal(order.total, expectedTotal, `total mismatch on ${order.id}`);

    if (order.paymentMethod != null) {
      assert.ok(VALID_PAYMENT_METHODS.has(order.paymentMethod), `unknown paymentMethod on ${order.id}`);
    }
  });
});

test('all orders share the same service day across the midnight boundary (06:00 -> 06:00 rule)', () => {
  const serviceDays = new Set(serataWalrusOrders.map((o) => o.serviceDay));
  assert.equal(serviceDays.size, 1, 'Serata Walrus must be a single service day end-to-end');

  const calendarDates = new Set(serataWalrusOrders.map((o) => o.createdAt.slice(0, 10)));
  assert.ok(calendarDates.size >= 2,
    'dataset must contain orders both before and after local midnight');
});

test('required scenario coverage: cash, card_counter_manual, sumup_online, pending, cancelled', () => {
  const paidMethods = new Set(
    serataWalrusOrders.filter((o) => o.paymentStatus === 'paid').map((o) => o.paymentMethod)
  );
  assert.ok(paidMethods.has('cash'), 'missing at least one cash-paid order');
  assert.ok(paidMethods.has('card_counter_manual'), 'missing at least one POS/manual-card-paid order');
  assert.ok(paidMethods.has('sumup_online'), 'missing at least one SumUp online-paid order');

  const pendingCount = serataWalrusOrders.filter((o) => o.status === 'pending_counter_payment').length;
  assert.ok(pendingCount > 0, 'missing at least one pending_counter_payment order');

  const cancelledCount = serataWalrusOrders.filter((o) => o.status === 'cancelled').length;
  assert.ok(cancelledCount > 0, 'missing at least one cancelled order');

  const fulfillmentTypes = new Set(serataWalrusOrders.map((o) => o.fulfillmentType));
  assert.ok(fulfillmentTypes.has('eat_here') && fulfillmentTypes.has('takeaway'),
    'missing eat_here/takeaway coverage');
});

test('payments are reconciliable 1:1 with orders (no orphans, no drift on paid orders)', () => {
  const orderById = new Map(serataWalrusOrders.map((o) => [o.id, o]));
  const seenPaymentIds = new Set();
  const paidChargesByOrder = new Map();

  serataWalrusPayments.forEach((payment) => {
    assert.ok(!seenPaymentIds.has(payment.id), `duplicate payment id ${payment.id}`);
    seenPaymentIds.add(payment.id);

    const order = orderById.get(payment.order_id);
    assert.ok(order, `payment ${payment.id} references unknown order ${payment.order_id}`);
    assert.equal(payment.order_code, order.orderCode, `order_code drift on payment ${payment.id}`);
    assert.notEqual(order.status, 'cancelled', `cancelled order ${order.id} must not have a payment row`);

    if (payment.status === 'succeeded' && payment.direction === 'charge') {
      const running = (paidChargesByOrder.get(order.id) ?? 0) + payment.amount;
      paidChargesByOrder.set(order.id, running);
    }
  });

  serataWalrusOrders.forEach((order) => {
    if (order.paymentStatus === 'paid') {
      assert.equal(paidChargesByOrder.get(order.id), order.total,
        `succeeded charges do not reconcile with total for order ${order.id}`);
    } else {
      assert.ok(!paidChargesByOrder.has(order.id),
        `order ${order.id} has a succeeded charge but paymentStatus is not 'paid'`);
    }
  });
});
