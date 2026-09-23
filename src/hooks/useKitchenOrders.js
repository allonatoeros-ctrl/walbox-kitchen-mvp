import { useState, useEffect, useRef } from 'react';
import { demoKitchenOrders } from '../data/kitchenMockData';
import { supabase } from '../lib/supabaseClient';

// Storage cliente vs storage staff/cassa (privacy client-side, 2026-09-16).
//
// `walbox_kitchen_orders_demo` e' la cache della lista ordini DEL LOCALE: su un device staff la
// sessione autenticata vede (giustamente) tutti gli ordini, quindi quella chiave contiene
// nickname, piatti, totali, note e stato pagamento di ogni cliente. Finche' cliente e staff
// hanno condiviso quella chiave, un device usato prima dal banco e poi da un cliente si portava
// dietro quei dati: il filtro P0 impediva di mostrarli, ma restavano scritti sul dispositivo.
//
// Da qui in poi le due superfici sono separate per costruzione:
//   - staff / cassa / solo / TV  -> LS_VENUE_KEY   (lista del locale, invariata)
//   - cliente                    -> LS_CUSTOMER_KEY (SOLO gli ordini creati da questo device)
// La chiave cliente e' filtrata per proprieta' sia in lettura sia in scrittura, quindi non puo'
// contenere l'ordine di un altro cliente nemmeno per errore.
const LS_VENUE_KEY = 'walbox_kitchen_orders_demo';
const LS_CUSTOMER_KEY = 'walbox_kitchen_my_orders';
const LS_OWNED_IDS_KEY = 'walbox_kitchen_my_order_ids';
const OWNED_IDS_MAX = 20;

const SCOPE_CUSTOMER = 'customer';

// Identità ordine lato cliente (P0 privacy, 2026-09-16). L'unico titolo per vedere un ordine su
// /kitchen/status è averlo creato da QUESTO dispositivo: nickname e tavolo sono condivisi e
// indovinabili, quindi non possono essere una prova di proprietà. Il registro vive solo nel
// browser del cliente (nessuno schema/RLS toccato) ed è scritto al submit in CustomerKitchenMenu.
export function getOwnedOrderIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_OWNED_IDS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string' && id) : [];
  } catch {
    return [];
  }
}

export function rememberOwnedOrderId(id) {
  if (!id) return;
  try {
    const next = [id, ...getOwnedOrderIds().filter((x) => x !== id)].slice(0, OWNED_IDS_MAX);
    localStorage.setItem(LS_OWNED_IDS_KEY, JSON.stringify(next));
  } catch { }
}

function storageKeyFor(scope) {
  return scope === SCOPE_CUSTOMER ? LS_CUSTOMER_KEY : LS_VENUE_KEY;
}

function readOrdersFromKey(key) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeOrdersToKey(key, orders) {
  try {
    localStorage.setItem(key, JSON.stringify(orders));
  } catch { }
}

function onlyOwned(orders) {
  const owned = new Set(getOwnedOrderIds());
  return orders.filter((o) => o?.id && owned.has(o.id));
}

// Un device che passa al contesto cliente non deve conservare la cache del locale lasciata da
// una sessione staff/cassa: si adottano solo gli ordini gia' riconosciuti come propri (cosi' una
// sessione cliente aperta prima di questo cambio non perde il suo ordine) e la cache del locale
// viene rimossa dal dispositivo. E' pura cache: staff/cassa la ricostruiscono da Supabase al
// primo fetch, nessun dato di servizio va perso.
function adoptAndClearVenueCacheForCustomer() {
  const legacy = readOrdersFromKey(LS_VENUE_KEY);
  if (legacy === null) return;
  const mine = onlyOwned(legacy);
  if (mine.length) {
    const byId = new Map((readOrdersFromKey(LS_CUSTOMER_KEY) ?? []).map((o) => [o.id, o]));
    mine.forEach((o) => { if (!byId.has(o.id)) byId.set(o.id, o); });
    writeOrdersToKey(LS_CUSTOMER_KEY, [...byId.values()]);
  }
  try { localStorage.removeItem(LS_VENUE_KEY); } catch { }
}

// export solo per il test mirato staff-cache-empty-supabase; nessun nuovo consumer applicativo
// oltre a useKitchenOrders (useState iniziale + refresh su storage/focus/visibility).
export function loadOrders(scope) {
  if (scope === SCOPE_CUSTOMER) {
    adoptAndClearVenueCacheForCustomer();
    // Nessun fallback ai demo order lato cliente: i demo sono ordini di altre persone, e il
    // cliente non deve avere sul proprio device niente che non abbia ordinato lui.
    const stored = readOrdersFromKey(LS_CUSTOMER_KEY) ?? [];
    const mine = onlyOwned(stored);
    // Non basta filtrare in lettura: cio' che non e' di questo dispositivo va anche tolto dal
    // dispositivo (device passato da un cliente all'altro, o storage manomesso).
    if (mine.length !== stored.length) writeOrdersToKey(LS_CUSTOMER_KEY, mine);
    return mine;
  }
  const saved = readOrdersFromKey(LS_VENUE_KEY);
  if (saved) return saved;
  // Niente fallback ai demo order in produzione: se la cache del locale e' vuota (device nuovo,
  // cache ripulita, dopo un reset dati) lo stato reale e' "nessun ordine", non i 6 ordini finti
  // di demoKitchenOrders — mostrarli su una superficie staff reale (TV/solo/cassa/prep board)
  // significherebbe far vedere allo staff ordini di clienti mai esistiti. I mock restano
  // disponibili solo nei percorsi preview/demo gia' espliciti (KitchenSoloServiceDemo,
  // KitchenPrepBoardDemo, i rispettivi `*PreviewFixtures.js`), che non passano da questo hook.
  return [];
}

function saveOrders(scope, orders) {
  if (scope === SCOPE_CUSTOMER) {
    writeOrdersToKey(LS_CUSTOMER_KEY, onlyOwned(orders));
    return;
  }
  writeOrdersToKey(LS_VENUE_KEY, orders);
}
// export solo per il test mirato staff-cache-empty-supabase; e' la stessa funzione usata da
// `persist` dentro useKitchenOrders, nessun nuovo consumer applicativo.
export { saveOrders };

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
    fulfillmentType: row.fulfillment_type ?? null,
    paidAt:        row.paid_at ?? null,
    createdAt:     row.created_at,
    readyAt:       row.ready_at ?? null,
    staffNote:     row.staff_note ?? null,
    note:          row.customer_note ?? null,
    cancelReason:  row.cancel_reason ?? null,
    cancelledAt:   row.cancelled_at ?? null,
    promoCode:     row.promo_code ?? null,
    discountAmount: row.discount_amount != null ? Number(row.discount_amount) : 0,
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

// BUG B (ai-ops/reports/kitchen-bugA-bugB-audit-20260923.md) — refund/cancel dead-end.
// Riusa esclusivamente api/kitchen-sumup-refund.js + kitchen_payment_refund* (invariati): la RPC
// deriva provider/method dalla charge originale, quindi lo stesso endpoint copre sumup_online
// (rimborso reale su SumUp) e cash/card_counter_manual (ramo ledger-only nell'handler, nessuna
// chiamata esterna) — nessun branch per metodo necessario qui, vedi audit BUG B (Gate 1, 2026-09-23).
const REFUND_ERROR_LABELS = {
  missing_session: 'Sessione staff scaduta — ricarica e riprova',
  not_staff_for_venue: 'Non autorizzato per questo locale',
  not_authorized: 'Non autorizzato per questo locale',
  order_not_found: 'Ordine non trovato',
  no_succeeded_charge_to_refund: 'Nessun pagamento riuscito da rimborsare per questo ordine',
  sumup_transaction_id_missing: 'Transazione originale non trovata — serve verifica manuale, non riprovare da qui',
  internal_server_error: 'Errore del server — riprova',
  server_configuration_error: 'Errore di configurazione server',
};

// Verifica server-side obbligatoria dopo un esito 'refunded'/'already_refunded' (condizione Gate 1
// di Eros, 2026-09-23): la risposta dell'endpoint non è di per sé prova che kitchen_orders sia
// stato aggiornato, ANNULLA deve sbloccarsi solo dopo aver riletto payment_status dal server.
// Fail-closed su null: un errore di rete/RLS nella verifica non è mai trattato come "non più paid".
async function isOrderStillPaid(orderId) {
  try {
    const { data, error } = await supabase
      .from('kitchen_orders')
      .select('payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !data) return null;
    return data.payment_status === 'paid';
  } catch (err) {
    console.warn('[Walbox] isOrderStillPaid check failed', err);
    return null;
  }
}

// refundOrder è standalone (non chiusura sull'hook) come supabaseUpdateOrder: non tocca lo stato
// locale ordini, la UI rilegge l'esito dal risultato e lo stato ordine reale arriva via il normale
// poll/realtime di fetchSupabaseOrders dopo l'ANNULLA che segue.
export async function refundOrder(id, reason) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('[Walbox] Refund order — missing staff session');
      return {
        ok: false, outcome: null, error: 'missing_session',
        message: REFUND_ERROR_LABELS.missing_session, canRetry: true, readyToCancel: false,
      };
    }

    const res = await fetch('/api/kitchen-sumup-refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ order_id: id, reason: reason ?? null }),
    });
    const body = await res.json();

    if (!res.ok) {
      const code = body?.error || `refund_failed_${res.status}`;
      console.warn('[Walbox] Refund order failed', body);
      // sumup_transaction_id_missing: non retryable in modo sicuro senza intervento manuale
      // (vedi audit BUG B) — mai riproporre RIMBORSA come se fosse un retry normale.
      const terminal = code === 'sumup_transaction_id_missing';
      return {
        ok: false, outcome: code, error: code,
        message: REFUND_ERROR_LABELS[code] ?? 'Rimborso non riuscito — riprova',
        canRetry: !terminal, readyToCancel: false,
      };
    }

    if (body.outcome === 'refunded' || body.outcome === 'already_refunded') {
      const stillPaid = await isOrderStillPaid(id);
      if (stillPaid !== false) {
        // true (davvero ancora paid) o null (verifica non riuscita): mai sbloccare ANNULLA alla
        // cieca solo perché l'endpoint ha risposto refunded/already_refunded.
        return {
          ok: true, outcome: body.outcome,
          message: stillPaid === true
            ? 'Rimborso registrato ma l\'ordine risulta ancora pagato — verifica prima di annullare'
            : 'Rimborso registrato ma la verifica dello stato ordine non è riuscita — riprova a controllare',
          canRetry: false, readyToCancel: false, syncMismatch: true,
        };
      }
      return {
        ok: true, outcome: body.outcome,
        message: body.outcome === 'already_refunded' ? 'Ordine già rimborsato' : 'Rimborso completato',
        canRetry: false, readyToCancel: true,
      };
    }

    if (body.outcome === 'in_progress') {
      return { ok: false, outcome: 'in_progress', message: 'Rimborso già in corso — attendi', canRetry: true, readyToCancel: false };
    }

    if (body.outcome === 'failed') {
      return { ok: false, outcome: 'failed', message: 'Rimborso rifiutato — riprova', canRetry: true, readyToCancel: false };
    }

    // 'unknown': inconclusive (network/5xx lato SumUp) — mai dare per riuscito, mai ANNULLA.
    return {
      ok: false, outcome: 'unknown',
      message: 'Esito rimborso non determinabile — verifica manualmente',
      canRetry: false, readyToCancel: false,
    };
  } catch (err) {
    console.warn('[Walbox] Refund order request failed', err);
    return {
      ok: false, outcome: null, error: 'network_error',
      message: 'Rimborso non riuscito — riprova', canRetry: true, readyToCancel: false,
    };
  }
}

// export solo per il test mirato staff-cache-empty-supabase (funzione pura, nessun mock modulo
// necessario); nessun nuovo consumer applicativo oltre a fetchSupabaseOrders dentro
// useKitchenOrders.
//
// `data` e' sempre un array quando la select Supabase non ha errore (anche 0 righe = locale
// davvero vuoto, es. dopo un DB cleanup pre go-live): il fetch e' la fonte di verita' e un
// ordine sopravvive solo se il server lo restituisce ancora. L'unica eccezione e' un ordine con
// un write pending/fallito non ancora confermato (pendingWrites) — quello resta protetto
// localmente anche se questa risposta e' vuota o non lo contiene piu', cosi' un fetch che
// incrocia una mutation staff in corso non la cancella sotto i piedi.
export function mergeFetchedOrders(prev, data, pendingWrites) {
  const prevById = new Map(prev.map((o) => [o.id, o]));
  const fromServer = data.map((row) => {
    const mapped = mapSupabaseOrder(row);
    return pendingWrites.has(mapped.id) ? (prevById.get(mapped.id) ?? mapped) : mapped;
  });
  const serverIds = new Set(fromServer.map((o) => o.id));
  const protectedPending = prev.filter((o) => pendingWrites.has(o.id) && !serverIds.has(o.id));
  return [...fromServer, ...protectedPending];
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

// export solo per il test mirato F02 (mock.module su ../lib/supabaseClient); nessun nuovo
// consumer applicativo oltre a useKitchenOrders.addOrder.
//
// La RPC server è l'unica fonte di verità per id/order_code: nessun fallback locale. Un
// ordine che non ha superato questa chiamata non esiste per la cucina/staff, quindi non deve
// mai risultare in un successo silenzioso (F02 — Phantom Order).
export async function createOrderOnServer(order) {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    if (!session) throw new Error('customer_session_missing');

    // The DB RPC is the authoritative boundary for operational code allocation and customer
    // order persistence. Still no table/tavolo concept: Kitchen has no tables (product decision
    // 2026-09-05, see ai-ops/reports/sprint3b-no-tables-correction-audit.md) — fulfillment_type
    // (Customer Checkout V1, 2026-09-13) only carries eat_here/takeaway, never a table number.
    //
    // Calls the 5-argument overload (20260913130000_kitchen_checkout_fulfillment_v1.sql), which
    // requires p_fulfillment_type explicitly (no DEFAULT — see design doc AMBIGUITY_RISK): every
    // current-build client always passes 'eat_here' or 'takeaway' here, never omits the argument.
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
      p_fulfillment_type: order.fulfillmentType,
    });
    if (error) throw error;
    if (!data?.id || !data?.order_code) throw new Error('order_creation_invalid_response');

    return {
      ok: true,
      order: {
        actionLog: [],
        ...order,
        id: data.id,
        orderCode: data.order_code,
        serviceDay: data.service_day,
        serviceSequence: data.service_sequence,
        total: Number(data.total),
        createdAt: data.created_at,
        fulfillmentType: data.fulfillment_type ?? order.fulfillmentType ?? null,
      },
    };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Shared hook for kitchen order state.
 * Provides cross-tab sync via the storage event (same pattern as the jukebox).
 *
 * Used by KitchenStaffDashboard and CustomerOrderStatus.
 * Replaces duplicated localStorage read/write blocks in both files.
 *
 * `scope` sceglie la superficie di storage locale (vedi LS_VENUE_KEY / LS_CUSTOMER_KEY in testa
 * al file): 'staff' (default) per Solo Service / cassa / TV, 'customer' per le pagine cliente,
 * che persistono solo gli ordini creati da quel dispositivo. Non cambia nulla lato Supabase:
 * fetch, realtime, RPC e RLS sono identici nei due scope.
 */
export function useKitchenOrders({ scope = 'staff' } = {}) {
  const isCustomer = scope === SCOPE_CUSTOMER;
  const storageKey = storageKeyFor(scope);
  const [orders, setOrders] = useState(() => loadOrders(scope));
  // Unico punto di scrittura su localStorage dell'hook: in scope cliente filtra per proprieta',
  // in scope staff scrive la lista del locale come sempre.
  const persist = (next) => saveOrders(scope, next);
  // orderId -> last patch sent to Supabase, present while a write is in-flight or failed.
  // Used to (a) skip clobbering that order on the next poll and (b) support retry.
  const pendingWritesRef = useRef(new Map());

  useEffect(() => {
    const refresh = () => setOrders(loadOrders(scope));

    // `e.newValue` nullo = chiave svuotata da un'altra tab (es. il passaggio al contesto cliente
    // che rimuove la cache del locale): non deve far rimbalzare una vista staff viva sui demo
    // order. Il fetch Supabase resta l'unica fonte che puo' azzerare davvero la lista.
    const onStorage    = (e) => { if (e.key === storageKey && e.newValue) refresh(); };
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
  }, [scope, storageKey]);

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

      setOrders((prev) => {
        const next = mergeFetchedOrders(prev, data ?? [], pendingWritesRef.current);
        // La cache staff (LS_VENUE_KEY) deve riflettere l'ultima risposta Supabase valida,
        // incluso lo svuotamento (0 ordini reali dopo un DB cleanup): senza questo la cache
        // resta stale finche' nessuna mutation locale la riscrive. Lo scope cliente non viene
        // toccato qui — la sua persistenza resta quella gia' esistente (addOrder), per non
        // introdurre effetti collaterali fuori scope su quel percorso.
        if (scope !== SCOPE_CUSTOMER) saveOrders(scope, next);
        return next;
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

  const applyLocalSyncStatus = (id, syncStatus, syncError, syncRetryable = true) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, syncStatus, syncError, syncRetryable } : o));
      persist(next);
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
      persist(next);
      return next;
    });
    const patch = { status: newStatus, ...(newStatus === 'ready' ? { ready_at: now } : {}) };
    runOrderSync(id, patch);
    supabaseInsertActionLog({ order_id: id, action: newStatus, from_status: fromOrder?.status ?? null, to_status: newStatus, created_at: now });
  };

  const addOrder = async (order) => {
    const result = await createOrderOnServer(order);
    if (!result.ok) {
      console.warn('[Walbox] Order creation failed — order NOT persisted', result.error);
      return result;
    }
    // Un ordine creato da QUESTO dispositivo e', per definizione, di questo dispositivo: la
    // registrazione di proprieta' avviene qui, prima di qualunque persistenza, altrimenti lo
    // storage cliente (filtrato per proprieta') scarterebbe l'ordine appena creato. In scope
    // staff/cassa non si registra nulla: il tablet del banco non e' il device del cliente.
    if (isCustomer) rememberOwnedOrderId(result.order.id);
    // Persistenza sincrona su localStorage PRIMA del setState: chi chiama addOrder naviga subito
    // dopo (CustomerKitchenMenu → /kitchen/status) e lo unmount di quella pagina scarta l'update
    // React in coda — con esso anche il saveOrders dentro l'updater. Senza questa riga l'ordine
    // appena creato non sopravvive alla navigazione né a un reload.
    const persistedBase = loadOrders(scope);
    if (!persistedBase.some((o) => o.id === result.order.id)) {
      persist([...persistedBase, result.order]);
    }
    setOrders((prev) => {
      if (prev.some((o) => o.id === result.order.id)) return prev;
      const next = [...prev, result.order];
      persist(next);
      return next;
    });
    return result;
  };

  // A counter confirmation is always a Payment Hub write. The amount comes from the order locked
  // by the server; the client can choose only an explicit counter method.
  const confirmPayment = async (orderId, method = 'cash') => {
    const current = orders.find((o) => o.id === orderId);
    if (!current) return;

    let data;
    try {
      const rpcResult = await supabase.rpc('kitchen_payment_record_counter', {
        p_order_id: orderId,
        p_method: method,
      });
      const { error } = rpcResult;
      // F03: a live/retry-eligible SumUp attempt blocks this order from being paid at the counter
      // (see kitchen_payment_record_counter, migration 20260913120000) — this is a real block, not
      // a "someone else already paid" idempotent case, so it must surface as a distinct failure and
      // the UI must NOT show "pagato".
      if (error?.message?.includes('online_payment_in_progress')) {
        console.warn('[Walbox] Counter payment blocked — online payment in progress', error);
        applyLocalSyncStatus(orderId, 'error', 'Pagamento online in corso per questo ordine — verifica prima di incassare');
        return { ok: false, error, reason: 'online_payment_in_progress' };
      }
      if (error) throw error;
      data = rpcResult.data;
    } catch (err) {
      console.warn('[Walbox] Counter payment RPC failed — order not marked paid', err);
      applyLocalSyncStatus(orderId, 'error', 'Pagamento non registrato — riprova');
      return { ok: false, error: err };
    }

    // Semantic check, not just "error == null": the RPC can return an idempotent pre-existing
    // succeeded payment (e.g. already paid via a different method/channel) instead of the counter
    // charge just requested. Trust the server-returned row, never the locally-clicked method.
    const resolvedMethod = data?.method ?? method;
    const now = new Date().toISOString();
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== orderId) return o;
        const updated = {
          ...o,
          paymentStatus: 'paid',
          paymentMethod: resolvedMethod,
          paidAt: now,
          status: o.status === 'pending_counter_payment' ? 'received' : o.status,
          syncStatus: 'synced',
          syncError: null,
        };
        return appendLog(updated, 'pagato');
      });
      persist(next);
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
    return { ok: true, method: resolvedMethod };
  };

  // Redemption staff-side del Personalità Discutibile Pass (V2, Opzione A). La RPC è l'unica
  // fonte di verità: sceglie lei il Peso Massimo eleggibile, calcola lo sconto e aggiorna
  // kitchen_orders.total in una sola transazione atomica — qui si riflette solo il risultato.
  const redeemPromo = async (orderId, code) => {
    try {
      const { data, error } = await supabase.rpc('kitchen_promo_pass_redeem_for_order', {
        p_code: code,
        p_order_id: orderId,
      });
      if (error) throw error;
      if (!data) throw new Error('promo_redeem_invalid_response');

      setOrders((prev) => {
        const next = prev.map((o) => (o.id !== orderId ? o : {
          ...o,
          promoCode: data.promo_code ?? null,
          discountAmount: data.discount_amount != null ? Number(data.discount_amount) : 0,
          total: data.total != null ? Number(data.total) : o.total,
        }));
        persist(next);
        return next;
      });
      return { ok: true, promoCode: data.promo_code, discountAmount: Number(data.discount_amount ?? 0), total: Number(data.total) };
    } catch (err) {
      console.warn('[Walbox] Promo redeem RPC failed', err);
      return { ok: false, error: err };
    }
  };

  // Cancel is a Payment Hub-guarded write — like confirmPayment, the server call must happen
  // and succeed BEFORE the local state reflects "cancelled", never optimistically first, or a
  // rejected cancel would still show as cancelled locally.
  //
  // Payment Cancel Hardening (2026-09-22 wiring): goes through the dedicated staff endpoint
  // api/kitchen-cancel-with-payment-check instead of the kitchen_order_cancel RPC directly. The
  // RPC only ever checked kitchen_orders.payment_status='paid' — it never looked at a live SumUp
  // charge attempt still 'initiated'/'pending', so a cancel could land while the customer's
  // hosted checkout page was still open and payable underneath it. The endpoint checks SumUp
  // authoritatively first (fail-closed on any indeterminate result) and only then calls the new
  // atomic RPC kitchen_order_cancel_with_payment_attempt — same auth pattern (own staff JWT via
  // supabase.auth.getSession()) as the sibling staff endpoints (see PaymentsView.jsx's
  // liveReconcileAction/liveRefundAction).
  const cancelOrder = async (id, reason) => {
    const current = orders.find((o) => o.id === id);
    if (!current) return;

    let body;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[Walbox] Cancel order — missing staff session');
        applyLocalSyncStatus(id, 'error', 'Sessione staff scaduta — ricarica e riprova');
        return { ok: false, error: new Error('missing_session'), reason: 'missing_session' };
      }

      const res = await fetch('/api/kitchen-cancel-with-payment-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: id, reason: reason ?? null }),
      });
      body = await res.json();

      if (!res.ok) {
        if (body?.error === 'order_already_paid_cannot_cancel' || body?.error === 'cannot_cancel_already_paid') {
          console.warn('[Walbox] Cancel blocked — order already paid', body);
          applyLocalSyncStatus(id, 'error', 'Ordine già pagato — rimborsa prima di annullare', false);
          return { ok: false, error: body, reason: 'order_already_paid_cannot_cancel' };
        }
        if (body?.error === 'payment_attempt_not_cancelable') {
          console.warn('[Walbox] Cancel blocked — payment just confirmed concurrently', body);
          applyLocalSyncStatus(id, 'error', 'Pagamento appena confermato — verifica prima di riprovare', false);
          return { ok: false, error: body, reason: 'payment_attempt_not_cancelable' };
        }
        throw new Error(body?.error || `cancel_with_payment_check_failed_${res.status}`);
      }

      // 'unknown' = the live SumUp checkout couldn't be verified authoritatively (network/API
      // failure, ambiguous provider_ref recovery): fail-closed, never cancel blind.
      if (body.outcome === 'unknown') {
        console.warn('[Walbox] Cancel order — SumUp checkout state unverifiable', body);
        applyLocalSyncStatus(id, 'error', 'Verifica pagamento non riuscita — controlla manualmente prima di riprovare', false);
        return { ok: false, error: body, reason: 'unknown' };
      }
    } catch (err) {
      console.warn('[Walbox] Cancel order failed — order not cancelled', err);
      applyLocalSyncStatus(id, 'error', 'Annullamento non riuscito — riprova');
      return { ok: false, error: err };
    }

    // 'already_cancelled' (idempotent double-click) carries no `order` row: fall back to now()
    // exactly like the previous RPC-direct path did when the RPC's own row was unavailable.
    const order = body.order ?? null;
    const now = order?.cancelled_at ?? new Date().toISOString();
    setOrders((prev) => {
      const next = prev.map((o) => {
        if (o.id !== id) return o;
        const updated = {
          ...o,
          status: 'cancelled',
          cancelReason: order?.cancel_reason ?? reason,
          cancelledAt: now,
          syncStatus: 'synced',
          syncError: null,
        };
        return appendLog(updated, 'annullato');
      });
      persist(next);
      return next;
    });
    return { ok: true };
  };

  const updateStaffNote = (id, note) => {
    setOrders((prev) => {
      const next = prev.map((o) => o.id !== id ? o : { ...o, staffNote: note });
      persist(next);
      return next;
    });
    runOrderSync(id, { staff_note: note });
  };

  const resetToDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    persist(fresh);
    setOrders(fresh);
  };

  return { orders, updateOrderStatus, addOrder, confirmPayment, cancelOrder, resetToDemo, updateStaffNote, retrySync, redeemPromo, refundOrder };
}
