import { useState, useEffect } from 'react';
import { demoKitchenOrders } from '../data/kitchenMockData';
import { supabase } from '../lib/supabaseClient';

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

function appendLog(order, action) {
  const log = [...(order.actionLog ?? []), { action, at: new Date().toISOString() }];
  return { ...order, actionLog: log };
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
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const extra = newStatus === 'ready' ? { readyAt: new Date().toISOString() } : {};
        const actionMap = { ready: 'pronto', delivered: 'ritirato', cancelled: 'annullato' };
        const updated = { ...o, status: newStatus, ...extra };
        return actionMap[newStatus] ? appendLog(updated, actionMap[newStatus]) : updated;
      });
      saveOrders(next);
      return next;
    });
  };

  const addOrder = async (order) => {
    setOrders((prev) => {
      const next = [...prev, { actionLog: [], ...order }];
      saveOrders(next);
      return next;
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) await supabase.auth.signInAnonymously();
    } catch (err) {
      console.warn('[Walbox] Supabase anon auth failed — running on localStorage only', err);
    }
  };

  const confirmPayment = (orderId, paymentMethod = 'counter') => {
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== orderId) return o;
        const updated = {
          ...o,
          paymentStatus: 'paid',
          paymentMethod,
          paidAt: new Date().toISOString(),
          status: o.status === 'pending_counter_payment' ? 'received' : o.status,
        };
        return appendLog(updated, 'pagato');
      });
      saveOrders(next);
      return next;
    });
  };

  const cancelOrder = (id, reason) => {
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, status: 'cancelled', cancelReason: reason, cancelledAt: new Date().toISOString() };
        return appendLog(updated, 'annullato');
      });
      saveOrders(next);
      return next;
    });
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => {
      const next = prev.map((o) => o.id !== id ? o : { ...o, staffNote: note });
      saveOrders(next);
      return next;
    });
  };

  const resetToDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    saveOrders(fresh);
    setOrders(fresh);
  };

  return { orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo, updateStaffNote };
}
