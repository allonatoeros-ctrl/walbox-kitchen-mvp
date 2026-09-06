import { useState } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

/**
 * Dev-only fixture data for /kitchen/solo?preview=1.
 * In-memory only: no localStorage, no Supabase, no network. State resets on page reload.
 * Same order/menu shape as useKitchenOrders/useKitchenMenu so KitchenSoloServiceView
 * renders identically to the live page.
 */
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function seedOrders() {
  return [
    {
      id: 'preview-1', orderCode: 'P47', nickname: 'Gamba Lunga',
      items: [{ itemId: 'item-002', name: 'Panino del Tricheco', quantity: 2, price: 9.0 }],
      total: 18.0, status: 'pending_counter_payment', paymentStatus: 'pending',
      createdAt: minutesAgo(3), note: '', actionLog: [],
    },
    {
      id: 'preview-2', orderCode: 'P44', nickname: 'IlCapo',
      items: [{ itemId: 'item-001', name: 'Porchetta', quantity: 1, price: 8.5 }],
      total: 8.5, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(6), note: 'Senza cipolla', staffNote: 'Allergia dichiarata al glutine', actionLog: [],
    },
    {
      id: 'preview-3', orderCode: 'P43', nickname: 'Sabrina87',
      items: [{ itemId: 'item-007', name: 'Combo CAVALLOOOO', quantity: 1, price: 16.0 }],
      total: 16.0, status: 'preparing', paymentStatus: 'paid',
      createdAt: minutesAgo(11), note: '', staffNote: '', actionLog: [],
    },
    {
      id: 'preview-4', orderCode: 'P41', nickname: 'FuriosaDelBanco',
      items: [{ itemId: 'item-004', name: 'Patatine Fuori di Testa', quantity: 1, price: 5.5 }],
      total: 5.5, status: 'ready', paymentStatus: 'paid',
      createdAt: minutesAgo(20), readyAt: minutesAgo(2), note: '', actionLog: [],
    },
  ];
}

function seedMenu() {
  return kitchenMenuItems.map((item) => ({ ...item, available: item.available !== false }));
}

function appendLog(order, action) {
  return { ...order, actionLog: [...(order.actionLog ?? []), { action, at: new Date().toISOString() }] };
}

export function usePreviewKitchenOrders() {
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

  return { orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote };
}

export function usePreviewKitchenMenu() {
  const [menuItems, setMenuItems] = useState(seedMenu);

  const toggleAvailability = (itemId) => {
    setMenuItems((prev) => prev.map((item) =>
      item.id === itemId ? { ...item, available: !item.available } : item
    ));
  };

  return { menuItems, toggleAvailability };
}
