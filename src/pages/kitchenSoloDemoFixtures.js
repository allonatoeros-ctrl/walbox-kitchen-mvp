import { useState } from 'react';

/**
 * Live Demo Harness fixtures for /kitchen/solo-demo.
 * In-memory only: no localStorage, no Supabase, no network, no polling.
 * State resets on page reload and on explicit RESET DEMO.
 * Same order shape as useKitchenOrders so KitchenSoloServiceView renders identically to the live page.
 */

export const DEMO_SYNC_ORDER_ID = 'demo-6';

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function seedOrders() {
  return [
    {
      id: 'demo-1', orderCode: 'D101', nickname: 'Rocco',
      items: [{ itemId: 'item-016', name: 'Wraptor', quantity: 1, price: 8.0 }],
      total: 8.0, status: 'pending_counter_payment', paymentStatus: 'pending',
      createdAt: minutesAgo(2), note: '', actionLog: [],
    },
    {
      id: 'demo-2', orderCode: 'D098', nickname: 'Wanda',
      items: [{ itemId: 'item-058', name: 'Patate al Forno', quantity: 2, price: 5.0 }],
      total: 10.0, status: 'pending_counter_payment', paymentStatus: 'pending',
      createdAt: minutesAgo(4), note: '', actionLog: [],
    },
    {
      // allergene reale: item-013 dichiara latte/uova in kitchenMockData.js
      id: 'demo-3', orderCode: 'D095', nickname: 'Bea',
      items: [{ itemId: 'item-013', name: 'Orto Cattivo', quantity: 1, price: 8.0 }],
      total: 8.0, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(7), note: 'Senza cipolla se possibile', staffNote: 'Allergia dichiarata: uova', actionLog: [],
    },
    {
      id: 'demo-4', orderCode: 'D091', nickname: 'Otto',
      items: [{ itemId: 'item-018', name: 'Box Pulled Pork', quantity: 1, price: 11.5 }],
      total: 11.5, status: 'preparing', paymentStatus: 'paid',
      createdAt: minutesAgo(12), note: '', staffNote: '', actionLog: [],
    },
    {
      id: 'demo-5', orderCode: 'D088', nickname: 'Nadia',
      items: [{ itemId: 'item-058', name: 'Patate al Forno', quantity: 1, price: 5.0 }],
      total: 5.0, status: 'ready', paymentStatus: 'paid',
      createdAt: minutesAgo(18), readyAt: minutesAgo(3), note: '', actionLog: [],
    },
    {
      // ordine dedicato al controllo demo "SIMULA SYNC ✗" (vedi KitchenSoloServiceDemo.jsx)
      id: DEMO_SYNC_ORDER_ID, orderCode: 'D085', nickname: 'Furio',
      items: [{ itemId: 'item-016', name: 'Wraptor', quantity: 1, price: 8.0 }],
      total: 8.0, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(9), note: '', staffNote: '', actionLog: [],
      syncStatus: 'synced',
    },
  ];
}

function appendLog(order, action) {
  return { ...order, actionLog: [...(order.actionLog ?? []), { action, at: new Date().toISOString() }] };
}

export function useDemoKitchenOrders() {
  const [orders, setOrders] = useState(seedOrders);

  const updateOrderStatus = (id, newStatus) => {
    const now = new Date().toISOString();
    setOrders((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const extra = newStatus === 'ready' ? { readyAt: now } : {};
      const actionMap = { received: 'ricevuto', preparing: 'in preparazione', ready: 'pronto', delivered: 'ritirato', cancelled: 'annullato' };
      const updated = { ...o, status: newStatus, ...extra };
      return actionMap[newStatus] ? appendLog(updated, actionMap[newStatus]) : updated;
    }));
  };

  const confirmPayment = (orderId, paymentMethod = 'counter') => {
    const now = new Date().toISOString();
    setOrders((prev) => prev.map((o) => {
      if (o.id !== orderId) return o;
      const updated = {
        ...o,
        paymentStatus: 'paid',
        paymentMethod,
        paidAt: now,
        status: o.status === 'pending_counter_payment' ? 'received' : o.status,
      };
      return appendLog(updated, 'pagato');
    }));
  };

  const cancelOrder = (id, reason) => {
    const now = new Date().toISOString();
    setOrders((prev) => prev.map((o) => {
      if (o.id !== id) return o;
      const updated = { ...o, status: 'cancelled', cancelReason: reason, cancelledAt: now };
      return appendLog(updated, 'annullato');
    }));
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => prev.map((o) => (o.id !== id ? o : { ...o, staffNote: note })));
  };

  /** Demo-only: forza un ordine in stato SYNC ✗ per verificare badge/banner/retry. */
  const simulateSyncError = (id) => {
    setOrders((prev) => prev.map((o) => (
      o.id !== id ? o : { ...o, syncStatus: 'error', syncError: 'Errore di sincronizzazione (demo)' }
    )));
  };

  /** Stesso contratto di retrySync lato live: risolve il caso SYNC ✗ simulato. */
  const retrySync = (id) => {
    setOrders((prev) => prev.map((o) => (
      o.id !== id ? o : { ...o, syncStatus: 'synced', syncError: undefined }
    )));
  };

  const resetDemo = () => setOrders(seedOrders());

  return { orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote, simulateSyncError, retrySync, resetDemo };
}
