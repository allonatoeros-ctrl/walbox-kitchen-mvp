// useKitchenNightPreview.test.js — Kitchen V2 Fase 2 / micro-fase B2.
// Invarianti minimi sugli adapter DEV "Serata Walrus": parita' di contratto (stesse chiavi di
// ritorno) con gli hook reali, correttezza delle transizioni pure, isolamento da
// Supabase/rete/localStorage e dataset B1 come unica source.
//
// Eseguire a mano: node --test src/hooks/useKitchenNightPreview.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildInitialNightOrders,
  applyOrderStatusUpdate,
  applyConfirmPayment,
  applyCancelOrder,
  applyStaffNote,
  applyRedeemPromo,
  buildNewOrder,
} from './useKitchenNightPreviewOrders.js';
import { buildNightPaymentsView } from './useKitchenNightPreviewPayments.js';
import { serataWalrusOrders, serataWalrusPayments } from '../data/kitchenNightMockData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (name) => readFileSync(join(__dirname, name), 'utf8');

const REAL_ORDERS_HOOK_SRC = readSrc('useKitchenOrders.js');
const REAL_PAYMENTS_HOOK_SRC = readSrc('useKitchenPayments.js');
const PREVIEW_ORDERS_SRC = readSrc('useKitchenNightPreviewOrders.js');
const PREVIEW_PAYMENTS_SRC = readSrc('useKitchenNightPreviewPayments.js');

// Estrae l'ULTIMO `return { a, b, c };` a lista di identificatori nudi (nessun `:`) di un file —
// e' la firma di ritorno dell'hook esportato (sempre l'ultima funzione/return del file, sia nei
// file reali sia in questi adapter), distinta dagli altri `return { ok: ... }` sparsi nel file.
function extractBareReturnKeys(source, label) {
  const matches = [...source.matchAll(/return\s*\{\s*([\w,\s]+?)\s*\};/g)];
  assert.ok(matches.length >= 1, `expected at least one bare-identifier return in ${label}, found 0`);
  return new Set(matches[matches.length - 1][1].split(',').map((s) => s.trim()).filter(Boolean));
}

test('MOCK_CONTRACT: usePreviewKitchenNightOrders returns the same key set as useKitchenOrders', () => {
  const real = extractBareReturnKeys(REAL_ORDERS_HOOK_SRC, 'useKitchenOrders.js');
  const preview = extractBareReturnKeys(PREVIEW_ORDERS_SRC, 'useKitchenNightPreviewOrders.js');
  assert.deepEqual(preview, real);
});

test('MOCK_CONTRACT: usePreviewKitchenNightPayments returns the same key set as useKitchenPayments', () => {
  const real = extractBareReturnKeys(REAL_PAYMENTS_HOOK_SRC, 'useKitchenPayments.js');
  const preview = extractBareReturnKeys(PREVIEW_PAYMENTS_SRC, 'useKitchenNightPreviewPayments.js');
  assert.deepEqual(preview, real);
});

test('ISOLATION_EVIDENCE: neither preview adapter imports supabaseClient, network APIs, or localStorage', () => {
  [PREVIEW_ORDERS_SRC, PREVIEW_PAYMENTS_SRC].forEach((src) => {
    const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    assert.ok(!/from\s+['"][^'"]*supabaseClient['"]/.test(codeOnly), 'must not import supabaseClient');
    assert.ok(!/\bfetch\(/.test(codeOnly), 'must not call fetch()');
    assert.ok(!/XMLHttpRequest/.test(codeOnly), 'must not use XMLHttpRequest');
    assert.ok(!/import\.meta\.env|process\.env/.test(codeOnly), 'must not read env vars');
    assert.ok(!/localStorage/.test(codeOnly), 'must not touch localStorage (pure in-memory preview)');
    assert.ok(!/supabase\.(from|rpc|channel|auth)/.test(codeOnly), 'must not call any supabase.* API');
  });
});

test('ISOLATION_EVIDENCE: dataset B1 (kitchenNightMockData.js) is the sole order/payment data source', () => {
  [PREVIEW_ORDERS_SRC, PREVIEW_PAYMENTS_SRC].forEach((src) => {
    assert.ok(/from\s+['"]\.\.\/data\/kitchenNightMockData\.js['"]/.test(src),
      'must import orders/payments from kitchenNightMockData.js');
    assert.ok(!/demoKitchenOrders/.test(src), 'must not read demoKitchenOrders directly (B1 dataset only)');
  });
});

test('buildInitialNightOrders clones the B1 dataset (same content, independent references)', () => {
  const a = buildInitialNightOrders();
  const b = buildInitialNightOrders();
  assert.equal(a.length, serataWalrusOrders.length);
  assert.deepEqual(a, serataWalrusOrders);
  assert.notEqual(a, b, 'two calls must not share the same array reference');
  assert.notEqual(a[0], b[0], 'two calls must not share the same order object reference');
  a[0].status = 'mutated-for-test';
  assert.notEqual(serataWalrusOrders[0].status, 'mutated-for-test', 'mutating a clone must not leak into the dataset');
});

test('applyOrderStatusUpdate transitions status, stamps readyAt on ready, appends action log', () => {
  const orders = buildInitialNightOrders();
  const target = orders.find((o) => o.status === 'received') ?? orders[0];
  const next = applyOrderStatusUpdate(orders, target.id, 'ready');
  const updated = next.find((o) => o.id === target.id);
  assert.equal(updated.status, 'ready');
  assert.ok(updated.readyAt, 'readyAt must be stamped on ready');
  assert.ok(updated.actionLog.some((l) => l.action === 'pronto'));
});

test('applyConfirmPayment marks paid and promotes pending_counter_payment -> received', () => {
  const orders = buildInitialNightOrders();
  const pending = orders.find((o) => o.status === 'pending_counter_payment');
  assert.ok(pending, 'dataset must contain at least one pending_counter_payment order');

  const { orders: next, result } = applyConfirmPayment(orders, pending.id, 'cash');
  assert.deepEqual(result, { ok: true, method: 'cash' });
  const updated = next.find((o) => o.id === pending.id);
  assert.equal(updated.paymentStatus, 'paid');
  assert.equal(updated.paymentMethod, 'cash');
  assert.equal(updated.status, 'received');
  assert.ok(updated.paidAt);
});

test('applyCancelOrder blocks cancellation of an already-paid order (same guard as the real RPC)', () => {
  const orders = buildInitialNightOrders();
  const paid = orders.find((o) => o.paymentStatus === 'paid');
  assert.ok(paid, 'dataset must contain at least one paid order');

  const { orders: next, result } = applyCancelOrder(orders, paid.id, 'test reason');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'order_already_paid_cannot_cancel');
  assert.deepEqual(next, orders, 'orders array must be unchanged when the cancel is blocked');
});

test('applyCancelOrder cancels an unpaid order and records the reason', () => {
  const orders = buildInitialNightOrders();
  const cancellable = orders.find((o) => o.status === 'pending_counter_payment');
  const { orders: next, result } = applyCancelOrder(orders, cancellable.id, 'cliente ha rinunciato');
  assert.equal(result.ok, true);
  const updated = next.find((o) => o.id === cancellable.id);
  assert.equal(updated.status, 'cancelled');
  assert.equal(updated.cancelReason, 'cliente ha rinunciato');
  assert.ok(updated.cancelledAt);
});

test('applyStaffNote sets staffNote on the target order only', () => {
  const orders = buildInitialNightOrders();
  const next = applyStaffNote(orders, orders[1].id, 'nota di test');
  assert.equal(next[1].staffNote, 'nota di test');
  assert.equal(next[0].staffNote, orders[0].staffNote, 'other orders must be untouched');
});

test('applyRedeemPromo returns a compatible ok:false result (not implemented in preview scope)', () => {
  const orders = buildInitialNightOrders();
  const { orders: next, result } = applyRedeemPromo(orders, orders[0].id);
  assert.equal(result.ok, false);
  assert.ok(result.error instanceof Error);
  assert.deepEqual(next, orders, 'orders must be unchanged');
});

test('buildNewOrder mints a unique id/orderCode continuing the dataset sequence', () => {
  const orders = buildInitialNightOrders();
  const maxSequence = Math.max(...orders.map((o) => o.serviceSequence));
  const created = buildNewOrder(orders, {
    nickname: 'TestNick',
    items: [{ itemId: 'item-x', name: 'Test Item', quantity: 2, price: 5 }],
    fulfillmentType: 'takeaway',
  });
  assert.equal(created.serviceSequence, maxSequence + 1);
  assert.ok(!orders.some((o) => o.id === created.id), 'new id must not collide with the dataset');
  assert.ok(!orders.some((o) => o.orderCode === created.orderCode), 'new orderCode must not collide with the dataset');
  assert.equal(created.total, 10);
  assert.equal(created.status, 'pending_counter_payment');
  assert.equal(created.serviceDay, orders[0].serviceDay);
});

test('buildNightPaymentsView reconciles todaySummary.incasso with succeeded charges in the B1 dataset', () => {
  const view = buildNightPaymentsView();
  const expectedIncasso = Math.round(
    serataWalrusPayments
      .filter((p) => p.direction === 'charge' && p.status === 'succeeded')
      .reduce((sum, p) => sum + p.amount, 0) * 100
  ) / 100;
  assert.equal(view.todaySummary.incasso, expectedIncasso);
  assert.equal(view.todaySummary.rimborsato, 0, 'B1 dataset has no refunds');
});

test('buildNightPaymentsView surfaces the stuck SumUp payments as anomalies with resolved order_code', () => {
  const view = buildNightPaymentsView();
  const stuckCount = serataWalrusPayments.filter((p) => p.status === 'initiated' && p.direction === 'charge').length;
  assert.equal(view.anomalies.length, stuckCount);
  assert.ok(stuckCount > 0, 'B1 dataset must include the pending_sumup_stuck scenario');
  view.anomalies.forEach((a) => {
    assert.equal(a.drift_type, 'sumup_online_stuck_initiated');
    assert.ok(a.order_code, `anomaly for ${a.order_id} must resolve an order_code`);
  });
});

test('buildNightPaymentsView.recentPayments is capped at 30 and sorted by created_at desc', () => {
  const view = buildNightPaymentsView();
  assert.ok(view.recentPayments.length <= 30);
  for (let i = 1; i < view.recentPayments.length; i += 1) {
    assert.ok(new Date(view.recentPayments[i - 1].created_at) >= new Date(view.recentPayments[i].created_at));
  }
  view.recentPayments.forEach((p) => assert.ok(p.order_code, `payment ${p.id} must resolve an order_code`));
});
