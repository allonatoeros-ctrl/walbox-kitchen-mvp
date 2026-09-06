import { useState, useEffect, useRef } from 'react';
import { demoKitchenOrders } from '../data/kitchenMockData';
import { supabase } from '../lib/supabaseClient';
import { nextLocalOperationalCode } from '../lib/kitchenOrderCode';

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
    serviceDay:     row.service_day ?? null,
    serviceSequence: row.service_sequence ?? null,
    nickname:      row.nickname,
    status:        row.status,
    total:         row.total,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? null,
    paidAt:        row.paid_at ?? null,
    createdAt:     row.created_at,
    readyAt:       row.ready_at ?? null,
    staffNote:     row.staff_note ?? null,
    note:          row.customer_note ?? null,
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

// export solo per il test mirato P0-A (mock.module su ../lib/supabaseClient); nessun
// nuovo consumer applicativo.
export async function supabaseUpdateOrder(id, patch) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    // supabaseUpdateOrder è chiamata solo da mutation staff (runOrderSync): qui non
    // esiste un caso guest/local-only legittimo, quindi nessuna sessione valida è
    // sempre un fallimento di sync, mai un successo silenzioso (P0-A).
    if (!session || session.user.is_anonymous) {
      return { ok: false, error: new Error('no-session: staff sync skipped') };
    }
    const { error } = await supabase.from('kitchen_orders').update(patch).eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[Walbox] Supabase update failed — localStorage updated only', err);
    return { ok: false, error: err };
  }
}

// export solo per il test mirato Sprint 3B (mock.channel/.on/.subscribe); nessun nuovo
// consumer applicativo oltre a useKitchenOrders.
export function subscribeToKitchenOrdersRealtime(onChange) {
  return supabase
    .channel('realtime:kitchen_orders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'kitchen_orders', filter: 'venue_id=eq.walrus-main' },
      onChange
    )
    .subscribe((status, err) => {
      if (err) console.warn('[Walbox] kitchen_orders realtime subscribe error:', err);
    });
}

async function supabaseInsertActionLog({ order_id, action, from_status, to_status, reason, metadata, created_at }) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) return;
    const { error } = await supabase.from('kitchen_action_log').insert({
      order_id,
      venue_id:    'walrus-main',
      action,
      from_status: from_status ?? null,
      to_status:   to_status   ?? null,
      actor_type:  'staff',
      actor_id:    session.user.id,
      reason:      reason   ?? null,
      metadata:    metadata ?? {},
      created_at,
    });
    if (error) throw error;
  } catch (err) {
    console.warn('[Walbox] Supabase action log insert failed', err);
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
  // orderId -> last patch sent to Supabase, present while a write is in-flight or failed.
  // Used to (a) skip clobbering that order on the next poll and (b) support retry.
  const pendingWritesRef = useRef(new Map());

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

  const fetchSupabaseOrders = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('kitchen_orders')
        .select('*, kitchen_order_items(*)')
        .eq('venue_id', 'walrus-main')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data?.length) return;

      setOrders((prev) => {
        const prevById = new Map(prev.map((o) => [o.id, o]));
        return data.map((row) => {
          const mapped = mapSupabaseOrder(row);
          // A write for this order is still pending or failed and unretried:
          // keep the local view so the poll doesn't silently rewind it.
          return pendingWritesRef.current.has(mapped.id)
            ? (prevById.get(mapped.id) ?? mapped)
            : mapped;
        });
      });
    } catch (err) {
      console.warn('[Walbox] Supabase read failed — using localStorage', err);
    }
  };

  useEffect(() => {
    fetchSupabaseOrders();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(fetchSupabaseOrders, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // Realtime: rileva nuovi/aggiornati kitchen_orders quasi immediatamente. Il poll 10s sopra
  // resta come fallback (rete instabile, realtime non disponibile, ecc.). Nessun mapping
  // parallelo: alla notifica si rilancia lo stesso fetch canonico usato dal poll, così lo
  // stato resta identico indipendentemente dalla fonte del trigger (nessun doppio inserimento).
  useEffect(() => {
    let channel;
    let cancelled = false;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      channel = subscribeToKitchenOrdersRealtime(() => fetchSupabaseOrders());
    }

    init();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const applyLocalSyncStatus = (id, syncStatus, syncError) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, syncStatus, syncError } : o));
      saveOrders(next);
      return next;
    });
  };

  // Writes `patch` to Supabase and reflects pending/success/failure on the order itself,
  // so a failure is never presented to the operator as a successful save.
  const runOrderSync = async (id, patch) => {
    pendingWritesRef.current.set(id, patch);
    applyLocalSyncStatus(id, 'pending', null);
    const result = await supabaseUpdateOrder(id, patch);
    if (result.ok) {
      pendingWritesRef.current.delete(id);
      applyLocalSyncStatus(id, 'synced', null);
    } else {
      applyLocalSyncStatus(id, 'error', 'Sincronizzazione fallita — riprova');
    }
  };

  const retrySync = (id) => {
    const patch = pendingWritesRef.current.get(id);
    if (!patch) return;
    runOrderSync(id, patch);
  };

  const updateOrderStatus = (id, newStatus) => {
    const now = new Date().toISOString();
    const fromOrder = orders.find((o) => o.id === id);
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const extra = newStatus === 'ready' ? { readyAt: now } : {};
        const actionMap = { received: 'ricevuto', preparing: 'in preparazione', ready: 'pronto', delivered: 'ritirato', cancelled: 'annullato' };
        const updated = { ...o, status: newStatus, ...extra };
        return actionMap[newStatus] ? appendLog(updated, actionMap[newStatus]) : updated;
      });
      saveOrders(next);
      return next;
    });
    const patch = { status: newStatus, ...(newStatus === 'ready' ? { ready_at: now } : {}) };
    runOrderSync(id, patch);
    supabaseInsertActionLog({ order_id: id, action: newStatus, from_status: fromOrder?.status ?? null, to_status: newStatus, created_at: now });
  };

  const addOrder = async (order) => {
    const localCode = nextLocalOperationalCode('walrus-main');
    let createdOrder = {
      actionLog: [],
      ...order,
      ...localCode,
      orderCode: localCode.orderCode,
    };
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      };
      if (!session) throw new Error('customer_session_missing');

      // The DB RPC is the authoritative boundary for operational code allocation and customer
      // order persistence. No table/fulfillment concept: Kitchen has no tables (product
      // decision 2026-09-05, see ai-ops/reports/sprint3b-no-tables-correction-audit.md).
      const { data, error } = await supabase.rpc('kitchen_customer_create_order', {
        p_venue_id: 'walrus-main',
        p_nickname: order.nickname,
        p_customer_note: order.note ?? null,
        p_items: order.items.map((item) => ({
          item_id: item.itemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      });
      if (error) throw error;
      if (!data?.id || !data?.order_code) throw new Error('order_creation_invalid_response');

      createdOrder = {
        ...createdOrder,
        id: data.id,
        orderCode: data.order_code,
        serviceDay: data.service_day,
        serviceSequence: data.service_sequence,
        total: Number(data.total),
        createdAt: data.created_at,
      }
    } catch (err) {
      console.warn('[Walbox] Order RPC unavailable — local-only fallback active', err);
    }

    setOrders((prev) => {
      const next = [...prev, createdOrder];
      saveOrders(next);
      return next;
    });
    return createdOrder;
  };

  // A counter confirmation is always a Payment Hub write. The amount comes from the order locked
  // by the server; the client can choose only an explicit counter method.
  const confirmPayment = async (orderId, method = 'cash') => {
    const current = orders.find((o) => o.id === orderId);
    if (!current) return;

    try {
      const { error } = await supabase.rpc('kitchen_payment_record_counter', {
        p_order_id: orderId,
        p_method: method,
      });
      // order_already_paid = another call already recorded this payment (double click /
      // concurrent staff action) — the order IS paid, so this is not a real failure.
      if (error && !error.message?.includes('order_already_paid')) throw error;
    } catch (err) {
      console.warn('[Walbox] Counter payment RPC failed — order not marked paid', err);
      applyLocalSyncStatus(orderId, 'error', 'Pagamento non registrato — riprova');
      return { ok: false, error: err };
    }

    const now = new Date().toISOString();
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== orderId) return o;
        const updated = {
          ...o,
          paymentStatus: 'paid',
          paymentMethod: method,
          paidAt: now,
          status: o.status === 'pending_counter_payment' ? 'received' : o.status,
          syncStatus: 'synced',
          syncError: null,
        };
        return appendLog(updated, 'pagato');
      });
      saveOrders(next);
      return next;
    });

    // payment_status/payment_method/paid_at and the 'payment_confirmed' action log entry are
    // already committed by the RPC above — only the kitchen-workflow status transition (not a
    // payment field) still needs the regular table patch + its own log entry.
    if (current.status === 'pending_counter_payment') {
      runOrderSync(orderId, { status: 'received' });
      supabaseInsertActionLog({
        order_id:    orderId,
        action:      'received',
        from_status: current.status,
        to_status:   'received',
        created_at:  now,
      });
    }
    return { ok: true, method };
  };

  const cancelOrder = (id, reason) => {
    const now = new Date().toISOString();
    const fromOrder = orders.find((o) => o.id === id);
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, status: 'cancelled', cancelReason: reason, cancelledAt: now };
        return appendLog(updated, 'annullato');
      });
      saveOrders(next);
      return next;
    });
    runOrderSync(id, { status: 'cancelled', cancel_reason: reason, cancelled_at: now });
    supabaseInsertActionLog({ order_id: id, action: 'cancelled', from_status: fromOrder?.status ?? null, to_status: 'cancelled', reason: reason ?? null, created_at: now });
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => {
      const next = prev.map((o) => o.id !== id ? o : { ...o, staffNote: note });
      saveOrders(next);
      return next;
    });
    runOrderSync(id, { staff_note: note });
  };

  const resetToDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    saveOrders(fresh);
    setOrders(fresh);
  };

  return { orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo, updateStaffNote, retrySync };
}
