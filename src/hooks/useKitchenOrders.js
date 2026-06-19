import { useState, useEffect } from 'react';
import { demoKitchenOrders } from '../data/kitchenMockData';

const LS_KEY = 'walbox_kitchen_orders_demo';

function loadOrders() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { }
  return demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
}

function saveOrders(orders) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(orders));
  } catch { }
}

/**
 * Shared hook for kitchen order state.
 * Provides cross-tab sync via the storage event (same pattern as the jukebox).
 *
 * Used by KitchenStaffDashboard and CustomerOrderStatus.
 * Replaces duplicated localStorage read/write blocks in both files.
 */
export function useKitchenOrders() {
  const [orders, setOrders] = useState(loadOrders);

  useEffect(() => {
    const refresh = () => setOrders(loadOrders());

    const onStorage    = (e) => { if (e.key === LS_KEY) refresh(); };
    const onFocus      = () => refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const updateOrderStatus = (id, newStatus) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o));
      saveOrders(next);
      return next;
    });
  };

  const addOrder = (order) => {
    setOrders((prev) => {
      const next = [...prev, order];
      saveOrders(next);
      return next;
    });
  };

  const confirmPayment = (orderId, paymentMethod = 'counter') => {
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          paymentStatus: 'paid',
          paymentMethod,
          paidAt: new Date().toISOString(),
          status: o.status === 'pending_counter_payment' ? 'received' : o.status,
        };
      });
      saveOrders(next);
      return next;
    });
  };

  const resetToDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    saveOrders(fresh);
    setOrders(fresh);
  };

  return { orders, updateOrderStatus, addOrder, confirmPayment, resetToDemo };
}
