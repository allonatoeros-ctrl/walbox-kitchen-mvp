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

function mapSupabaseOrder(row) {
  return {
    id:            row.id,
    orderCode:     row.order_code,
    table:         row.table_id,
    nickname:      row.nickname,
    status:        row.status,
    total:         row.total,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? null,
    paidAt:        row.paid_at ?? null,
    createdAt:     row.created_at,
    readyAt:       row.ready_at ?? null,
    staffNote:     row.staff_note ?? null,
    cancelReason:  row.cancel_reason ?? null,
    cancelledAt:   row.cancelled_at ?? null,
    actionLog:     [],
    items: (row.kitchen_order_items ?? []).map((i) => ({
      itemId:   i.item_id,
      name:     i.name,
      quantity: i.quantity,
      price:    i.price,
    })),
  };
}

async function supabaseUpdateOrder(id, patch) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) return;
    const { error } = await supabase.from('kitchen_orders').update(patch).eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.warn('[Walbox] Supabase update failed — localStorage updated only', err);
  }
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

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || session.user.is_anonymous) return;

        const { data, error } = await supabase
          .from('kitchen_orders')
          .select('*, kitchen_order_items(*)')
          .eq('venue_id', 'walrus-main')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!data?.length) return;

        setOrders(data.map(mapSupabaseOrder));
      } catch (err) {
        console.warn('[Walbox] Supabase read failed — using localStorage', err);
      }
    })();
  }, []);

  const updateOrderStatus = (id, newStatus) => {
    const now = new Date().toISOString();
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const extra = newStatus === 'ready' ? { readyAt: now } : {};
        const actionMap = { ready: 'pronto', delivered: 'ritirato', cancelled: 'annullato' };
        const updated = { ...o, status: newStatus, ...extra };
        return actionMap[newStatus] ? appendLog(updated, actionMap[newStatus]) : updated;
      });
      saveOrders(next);
      return next;
    });
    const patch = { status: newStatus, ...(newStatus === 'ready' ? { ready_at: now } : {}) };
    supabaseUpdateOrder(id, patch);
  };

  const addOrder = async (order) => {
    setOrders((prev) => {
      const next = [...prev, { actionLog: [], ...order }];
      saveOrders(next);
      return next;
    });

    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      if (!session) return;

      const { error: orderError } = await supabase.from('kitchen_orders').insert({
        id:             order.id,
        order_code:     order.orderCode,
        venue_id:       'walrus-main',
        table_id:       order.table,
        nickname:       order.nickname,
        customer_id:    session.user.id,
        status:         order.status,
        total:          order.total,
        payment_status: order.paymentStatus,
        payment_method: order.paymentMethod,
        paid_at:        order.paidAt,
        created_at:     order.createdAt,
      });
      if (orderError) throw orderError;

      if (order.items?.length) {
        const { error: itemsError } = await supabase.from('kitchen_order_items').insert(
          order.items.map((item) => ({
            order_id: order.id,
            venue_id: 'walrus-main',
            item_id:  item.itemId,
            name:     item.name,
            quantity: item.quantity,
            price:    item.price,
          }))
        );
        if (itemsError) throw itemsError;
      }
    } catch (err) {
      console.warn('[Walbox] Supabase write failed — order saved to localStorage only', err);
    }
  };

  const confirmPayment = (orderId, paymentMethod = 'counter') => {
    const now = new Date().toISOString();
    const current = orders.find((o) => o.id === orderId);
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== orderId) return o;
        const updated = {
          ...o,
          paymentStatus: 'paid',
          paymentMethod,
          paidAt: now,
          status: o.status === 'pending_counter_payment' ? 'received' : o.status,
        };
        return appendLog(updated, 'pagato');
      });
      saveOrders(next);
      return next;
    });
    const patch = {
      payment_status: 'paid',
      payment_method: paymentMethod,
      paid_at: now,
      ...(current?.status === 'pending_counter_payment' ? { status: 'received' } : {}),
    };
    supabaseUpdateOrder(orderId, patch);
  };

  const cancelOrder = (id, reason) => {
    const now = new Date().toISOString();
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, status: 'cancelled', cancelReason: reason, cancelledAt: now };
        return appendLog(updated, 'annullato');
      });
      saveOrders(next);
      return next;
    });
    supabaseUpdateOrder(id, { status: 'cancelled', cancel_reason: reason, cancelled_at: now });
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => {
      const next = prev.map((o) => o.id !== id ? o : { ...o, staffNote: note });
      saveOrders(next);
      return next;
    });
    supabaseUpdateOrder(id, { staff_note: note });
  };

  const resetToDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    saveOrders(fresh);
    setOrders(fresh);
  };

  return { orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo, updateStaffNote };
}
