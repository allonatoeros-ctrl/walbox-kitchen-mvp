// Kitchen V2 — Fase 2 / micro-fase B2 — adapter DEV ordini, "Serata Walrus".
//
// Hook drop-in a contratto compatibile con useKitchenOrders.js (stessa shape di ritorno:
// orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo,
// updateStaffNote, retrySync, redeemPromo), ma 100% locale: unica source dati e'
// kitchenNightMockData.js (dataset B1 "Serata Walrus"), nessun import di supabaseClient,
// nessuna rete, nessun localStorage — solo React state in-memory, azzerato a ogni remount.
// Vedi ai-ops/reports/kitchen-v2-fase2-dev-mock-layer-audit.md (PROPOSED_MINIMAL_ARCHITECTURE
// punto 3): stesso pattern gia' validato da kitchenStaffPaymentsDemoFixtures.js.
//
// Non collegato a nessuna route/pagina in questa micro-fase (nessun consumer applicativo).
//
// La logica di transizione stato/pagamento e' isolata in funzioni pure (buildInitialNightOrders,
// applyOrderStatusUpdate, applyConfirmPayment, applyCancelOrder, applyStaffNote,
// applyRedeemPromo, buildNewOrder) cosi' da essere testabili senza renderizzare l'hook React
// (stesso motivo per cui useKitchenOrders.js esporta mergeFetchedOrders/loadOrders a parte).
import { useState } from 'react';
import { serataWalrusOrders } from '../data/kitchenNightMockData.js';
import { formatOperationalCode } from '../lib/kitchenOrderCode.js';

const STATUS_ACTION_LABEL = {
  received: 'ricevuto',
  preparing: 'in preparazione',
  ready: 'pronto',
  delivered: 'ritirato',
  cancelled: 'annullato',
};

function cloneOrder(order) {
  return {
    ...order,
    items: order.items.map((line) => ({ ...line })),
    actionLog: [...(order.actionLog ?? [])],
  };
}

function appendLog(order, action) {
  return { ...order, actionLog: [...(order.actionLog ?? []), { action, at: new Date().toISOString() }] };
}

// Clona il dataset B1 (nessuna mutazione condivisa tra piu' mount/istanze dell'hook).
export function buildInitialNightOrders() {
  return serataWalrusOrders.map(cloneOrder);
}

export function applyOrderStatusUpdate(orders, id, newStatus) {
  const now = new Date().toISOString();
  return orders.map((order) => {
    if (order.id !== id) return order;
    const extra = newStatus === 'ready' ? { readyAt: now } : {};
    const updated = { ...order, status: newStatus, ...extra };
    return STATUS_ACTION_LABEL[newStatus] ? appendLog(updated, STATUS_ACTION_LABEL[newStatus]) : updated;
  });
}

// Stesso comportamento di useKitchenOrders.confirmPayment (senza RPC): pending_counter_payment
// -> received alla conferma, resto invariato.
export function applyConfirmPayment(orders, orderId, method = 'cash') {
  const current = orders.find((order) => order.id === orderId);
  if (!current) return { orders, result: undefined };

  const now = new Date().toISOString();
  const next = orders.map((order) => {
    if (order.id !== orderId) return order;
    const updated = {
      ...order,
      paymentStatus: 'paid',
      paymentMethod: method,
      paidAt: now,
      status: order.status === 'pending_counter_payment' ? 'received' : order.status,
    };
    return appendLog(updated, 'pagato');
  });
  return { orders: next, result: { ok: true, method } };
}

// Stesso guard del reale kitchen_order_cancel RPC: un ordine gia' pagato non si annulla qui.
export function applyCancelOrder(orders, id, reason) {
  const current = orders.find((order) => order.id === id);
  if (!current) return { orders, result: undefined };
  if (current.paymentStatus === 'paid') {
    return {
      orders,
      result: { ok: false, error: new Error('order_already_paid_cannot_cancel'), reason: 'order_already_paid_cannot_cancel' },
    };
  }

  const now = new Date().toISOString();
  const next = orders.map((order) => {
    if (order.id !== id) return order;
    const updated = { ...order, status: 'cancelled', cancelReason: reason ?? null, cancelledAt: now };
    return appendLog(updated, 'annullato');
  });
  return { orders: next, result: { ok: true } };
}

export function applyStaffNote(orders, id, note) {
  return orders.map((order) => (order.id === id ? { ...order, staffNote: note } : order));
}

// Preview scope: il dataset B1 non modella Personalita' Discutibile Pass / codici promo, quindi
// qui non c'e' una RPC da imitare. Stessa shape di ritorno del fallimento reale ({ ok: false,
// error }), cosi' un consumer scritto contro useKitchenOrders() non deve gestire una forma
// diversa — resta esplicitamente "non disponibile in preview", non inventato.
export function applyRedeemPromo(orders, orderId) {
  return { orders, result: { ok: false, error: new Error(`preview_promo_not_supported:${orderId}`) } };
}

// Sequenza continua da quella del dataset B1, cosi' l'orderCode del nuovo ordine resta unico
// nella stessa serata (formatOperationalCode e' una funzione pura della sequenza).
export function buildNewOrder(orders, input) {
  const maxSequence = orders.reduce((max, order) => Math.max(max, order.serviceSequence ?? 0), 0);
  const sequence = maxSequence + 1;
  const items = input.items ?? [];
  const total = Math.round(items.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100;

  return {
    id: `swn-live-${sequence}`,
    orderCode: formatOperationalCode(sequence),
    serviceDay: orders[0]?.serviceDay ?? null,
    serviceSequence: sequence,
    nickname: input.nickname ?? '',
    items,
    total,
    fulfillmentType: input.fulfillmentType ?? 'eat_here',
    note: input.note ?? '',
    staffNote: null,
    createdAt: new Date().toISOString(),
    promoCode: null,
    discountAmount: 0,
    cancelReason: null,
    cancelledAt: null,
    actionLog: [],
    status: 'pending_counter_payment',
    paymentStatus: 'pending_counter_payment',
    paymentMethod: null,
    paidAt: null,
    readyAt: null,
  };
}

/**
 * Adapter DEV — contratto compatibile con useKitchenOrders({ scope }) ma solo in-memory.
 * Nessun parametro scope: il dataset "Serata Walrus" e' un'unica vista locale, non separata
 * staff/cliente (vedi audit MISSING — nessuno switch runtime ancora richiesto in questa fase).
 */
export function usePreviewKitchenNightOrders() {
  const [orders, setOrders] = useState(buildInitialNightOrders);

  const updateOrderStatus = (id, newStatus) => {
    setOrders((prev) => applyOrderStatusUpdate(prev, id, newStatus));
  };

  const addOrder = async (input) => {
    let created;
    setOrders((prev) => {
      created = buildNewOrder(prev, input);
      return [...prev, created];
    });
    return { ok: true, order: created };
  };

  const confirmPayment = async (orderId, method = 'cash') => {
    let result;
    setOrders((prev) => {
      const applied = applyConfirmPayment(prev, orderId, method);
      result = applied.result;
      return applied.orders;
    });
    return result;
  };

  const cancelOrder = async (id, reason) => {
    let result;
    setOrders((prev) => {
      const applied = applyCancelOrder(prev, id, reason);
      result = applied.result;
      return applied.orders;
    });
    return result;
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => applyStaffNote(prev, id, note));
  };

  const redeemPromo = async (orderId) => {
    let result;
    setOrders((prev) => {
      const applied = applyRedeemPromo(prev, orderId);
      result = applied.result;
      return applied.orders;
    });
    return result;
  };

  const resetToDemo = () => setOrders(buildInitialNightOrders());

  // Nessun pending write da riprovare: il preview non scrive mai in rete.
  const retrySync = () => {};

  return { orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo, updateStaffNote, retrySync, redeemPromo };
}
