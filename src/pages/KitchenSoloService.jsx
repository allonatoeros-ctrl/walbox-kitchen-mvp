import { useState, useEffect, useMemo, useRef } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import { useKitchenPayments } from '../hooks/useKitchenPayments';
import { useSelectedServiceNight } from '../hooks/useSelectedServiceNight';
import { resolveOrderAllergens } from '../lib/kitchenAllergens';
import { STAFF_DISAMBIGUATION_LABEL } from '../lib/kitchenStaffLabels';
import { getStaffSession, onAuthStateChange, isKitchenStaff, signOut } from '../lib/supabaseAuth';
import { usePreviewKitchenOrders, usePreviewKitchenMenu } from './kitchenSoloPreviewFixtures';
import { useKitchenAudio } from '../hooks/useKitchenAudio';
import { requestFullscreenBestEffort } from '../hooks/useFullscreenToggle';
import {
  fetchCloseForCounterEligibility,
  liveCloseForCounterAction,
  CLOSE_FOR_COUNTER_CONFIRM_MESSAGE,
  CLOSE_FOR_COUNTER_ERROR_LABELS,
} from '../lib/kitchenCloseForCounter';
import MenuView from './MenuView';
import StoricoView from './StoricoView';
import ServiceNightSelector from '../components/kitchen/ServiceNightSelector';
import AlertView from './AlertView';
import './KitchenStaffDashboard.css';
import './KitchenSoloService.css';

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * DEV-only preview entry: /kitchen/solo?preview=1.
 * Never active in a production build (import.meta.env.DEV gate), regardless of URL.
 */
function isPreviewModeActive() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('preview') === '1';
  } catch {
    return false;
  }
}

/* ---------- helpers (puri) ---------- */

function minutesSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function clockSince(iso) {
  if (!iso) return '0:00';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatClock(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Nome cliente accanto al codice ordine ("A42 \u00B7 Marco", 2026-09-19). Il placeholder legacy
// "Ospite Walrus" degli ordini vecchi non aggiunge informazione: non viene mostrato.
function customerLabel(order) {
  const name = String(order?.nickname ?? '').trim();
  if (!name || name === 'Ospite Walrus') return '';
  return name;
}

function itemsLine(order) {
  return order.items
    .map((i) => {
      const tag = STAFF_DISAMBIGUATION_LABEL[i.itemId];
      return `${i.quantity} × ${i.name.toUpperCase()}${tag ? ` [${tag}]` : ''}`;
    })
    .join(' · ');
}

// P0-3: la derivazione vive in ../lib/kitchenAllergens (unica fonte, condivisa con AlertView).
// Qui si usa solo il risultato, inclusa la distinzione fra "nessun allergene dichiarato" e
// "questa riga non e' nel catalogo di questo device, non posso garantire nulla".

const STATUS_PILL = {
  pending_counter_payment: { label: 'DA INCASSARE',   cls: 'pending' },
  received:                { label: 'DA PREPARARE',   cls: 'received' },
  preparing:               { label: 'IN PREPARAZIONE', cls: 'preparing' },
  ready:                   { label: 'PRONTO',          cls: 'ready' },
};

/** Una sola next action per ordine in focus. */
function nextActionFor(order) {
  if (!order) return null;
  switch (order.status) {
    case 'pending_counter_payment':
      return { kind: 'pay',      label: 'CONFERMA PAGAMENTO', sub: 'Incassa al banco e manda in cucina', tone: 'yellow' };
    case 'received':
      return { kind: 'start',    label: 'INIZIA',             sub: 'Metti l’ordine in preparazione',  tone: 'orange' };
    case 'preparing':
      return { kind: 'ready',    label: 'PRONTO ✓',      sub: 'Segna l’ordine come pronto per il ritiro', tone: 'orange' };
    case 'ready':
      return { kind: 'delivered', label: 'RITIRATO ✓',   sub: 'Consegna al cliente e chiudi l’ordine', tone: 'green' };
    default:
      return null;
  }
}

/** Ordina la coda: prima gli ordini non rinviati, poi per anzianità. */
function sortQueueBy(list, snoozed) {
  return [...list].sort(
    (a, b) =>
      ((snoozed[a.id] ?? 0) - (snoozed[b.id] ?? 0)) ||
      (new Date(a.createdAt) - new Date(b.createdAt))
  );
}

function isPending(o) {
  return o.status === 'pending_counter_payment';
}
function isToDo(o) {
  return o.status === 'received' || o.status === 'preparing';
}
function isReady(o) {
  return o.status === 'ready';
}

export default function KitchenSoloService() {
  return isPreviewModeActive() ? <KitchenSoloServicePreview /> : <KitchenSoloServiceLive />;
}

/** Live page: real Supabase-backed hooks + real staff auth guard. Unchanged behavior. */
function KitchenSoloServiceLive() {
  const { orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote, retrySync, refundOrder } = useKitchenOrders();
  const { menuItems, toggleAvailability } = useKitchenMenu();
  // Micro-fase 1 (badge anomalie Payment Hub): read-only, nessuna azione — vedi
  // ai-ops/reports/kitchen-solo-payment-hub-integration-audit.md §5. Non montato in
  // Preview/Demo per restare isolati da Supabase (invariato).
  // Micro-fase 2 (Storico/Cassa allineati): la stessa summary kitchen_payments che alimenta
  // la Cassa/Payment Hub viene passata allo Storico, con la giornata operativa (service_day)
  // gia' risolta — cosi' le due schermate non possono divergere. Sempre read-only.
  // Selettore service night (Gate 1 approvato da Eros 2026-09-21): `selectedServiceNight` e'
  // condiviso con PaymentsView/Cassa via useSelectedServiceNight (modulo esterno, non un nuovo
  // stato locale) — la stessa notte scelta qui in Storico resta selezionata se lo staff apre Cassa.
  const { selectedServiceNight } = useSelectedServiceNight();
  const { anomalies: paymentAnomalies, todaySummary: paymentsSummary, serviceNight, paymentsByMethod } = useKitchenPayments({ night: selectedServiceNight });

  const [authChecked, setAuthChecked] = useState(
    () => import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true'
  );

  // Stesso guard della dashboard Kitchen esistente (invariata): auth + membership venue.
  // Fail-closed: qualsiasi errore manda al login, mai alla cucina.
  useEffect(() => {
    if (import.meta.env.VITE_E2E_BYPASS_STAFF_AUTH === 'true') return undefined;

    let subscription;
    try {
      getStaffSession()
        .then(async (session) => {
          if (!session) { navigate('/kitchen/login'); return; }
          try {
            const ok = await isKitchenStaff('walrus-main');
            if (!ok) { navigate('/kitchen/login'); return; }
          } catch {
            navigate('/kitchen/login');
            return;
          } finally {
            setAuthChecked(true);
          }
        })
        .catch(() => navigate('/kitchen/login'));

      subscription = onAuthStateChange((s) => {
        if (!s) navigate('/kitchen/login');
      }).data.subscription;
    } catch {
      navigate('/kitchen/login');
    }

    return () => subscription?.unsubscribe();
  }, []);

  if (!authChecked) return null;

  // Stesso auth/logout flow esistente (supabaseAuth.signOut, usato da KitchenStaffDashboard.jsx),
  // nessuna nuova logica: chiude la sessione e torna al login con una navigazione reale.
  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      navigate('/kitchen/login');
    }
  };

  return (
    <KitchenSoloServiceView
      orders={orders}
      updateOrderStatus={updateOrderStatus}
      confirmPayment={confirmPayment}
      cancelOrder={cancelOrder}
      refundOrder={refundOrder}
      updateStaffNote={updateStaffNote}
      retrySync={retrySync}
      menuItems={menuItems}
      toggleAvailability={toggleAvailability}
      paymentAnomalies={paymentAnomalies}
      paymentsSummary={paymentsSummary}
      paymentsByMethod={paymentsByMethod}
      serviceNight={serviceNight}
      showNightSelector
      onLogout={handleLogout}
    />
  );
}

/** DEV-only preview: local fixture data, no auth guard, zero Supabase/network calls. */
function KitchenSoloServicePreview() {
  const { orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote } = usePreviewKitchenOrders();
  const { menuItems, toggleAvailability } = usePreviewKitchenMenu();

  return (
    <KitchenSoloServiceView
      orders={orders}
      updateOrderStatus={updateOrderStatus}
      confirmPayment={confirmPayment}
      cancelOrder={cancelOrder}
      updateStaffNote={updateStaffNote}
      menuItems={menuItems}
      toggleAvailability={toggleAvailability}
      isPreview
    />
  );
}

/** Shared UI for Live, DEV Preview and the isolated Demo Harness. No data source or auth logic lives here. */
export function KitchenSoloServiceView({
  orders, updateOrderStatus, confirmPayment, cancelOrder, refundOrder, updateStaffNote, retrySync,
  menuItems, toggleAvailability, isPreview = false, paymentAnomalies = [],
  paymentsSummary = null, paymentsByMethod = null, serviceNight = null,
  // Selettore service night: solo Live lo passa true (dati realmente parametrizzati su
  // useKitchenPayments); Preview/Demo/Training restano invariati (dataset statico, il selettore
  // non avrebbe nulla da far navigare).
  showNightSelector = false,
  // Default per Preview/Demo/Training (nessuna sessione reale da chiudere): solo navigazione.
  onLogout = () => navigate('/kitchen/login'),
  // Gate vera Fullscreen API (2026-09-22, fix regressione training demo): Live la vuole (default
  // true). Training/Demo la disattivano esplicitamente (`allowFullscreen={false}`) perche' questo
  // componente e' riusato 1:1 dentro KitchenTrainingDemo.jsx e una vera richiesta fullscreen a
  // meta' del flusso guidato cambia le dimensioni reali del viewport, disallineando il CoachOverlay
  // (posizionato sulle coordinate pre-fullscreen) dal nuovo viewport.
  allowFullscreen = true,
}) {
  const requestFullscreenIfAllowed = () => {
    if (allowFullscreen) requestFullscreenBestEffort();
  };
  const [focusId, setFocusId]         = useState(null);
  const [checked, setChecked]         = useState({});   // { [orderId]: { [idx]: true } }
  const [snoozed, setSnoozed]         = useState({});   // { [orderId]: timestamp }
  const [searchOpen, setSearchOpen]   = useState(false);
  const [search, setSearch]           = useState('');
  const [moreOpen, setMoreOpen]       = useState(false);
  const [overlay, setOverlay]         = useState(null); // 'menu' | 'storico' | 'alert'
  // Chiusura overlay: esce anche dalla vera Fullscreen API se attiva (solo Storico la richiede,
  // vedi requestFullscreenBestEffort sopra) — nessun ritorno "a meta'" full-viewport dopo CHIUDI.
  const closeOverlay = () => {
    if (document.exitFullscreen && (document.fullscreenElement || document.webkitFullscreenElement)) {
      document.exitFullscreen().catch(() => {});
    }
    setOverlay(null);
  };
  const [queueOpen, setQueueOpen]     = useState(false); // phone: coda a schermo intero
  const [, setTick]                   = useState(0);
  // Undo P0-B: { orderId, orderCode, fromStatus, actionLabel, expiresAt } | null — un solo undo alla volta.
  const [undo, setUndo]               = useState(null);
  const { enabled: audioEnabled, toggle: toggleAudio, observeOrders, notifyCounterPayment } = useKitchenAudio();

  // ritorno al focus precedente dopo un pagamento rapido
  const returnFocusRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Finestra undo: auto-dismiss allo scadere, mai reverse automatico dello stato.
  useEffect(() => {
    if (!undo) return undefined;
    const remaining = undo.expiresAt - Date.now();
    if (remaining <= 0) { setUndo(null); return undefined; }
    const id = setTimeout(() => setUndo(null), remaining);
    return () => clearTimeout(id);
  }, [undo]);

  const active = useMemo(
    () => orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled'),
    [orders]
  );

  useEffect(() => {
    observeOrders(orders);
  }, [orders, observeOrders]);

  const daPagare = useMemo(() => sortQueueBy(active.filter(isPending), snoozed), [active, snoozed]);
  const daFare   = useMemo(() => sortQueueBy(active.filter(isToDo),   snoozed), [active, snoozed]);
  const pronti   = useMemo(() => sortQueueBy(active.filter(isReady),  snoozed), [active, snoozed]);

  // ordine di lavoro: prima cosa si cucina, poi si incassa, poi si consegna
  const workOrder = useMemo(() => [...daFare, ...daPagare, ...pronti], [daFare, daPagare, pronti]);

  // Focus auto: mantiene l'ordine scelto finché è attivo, altrimenti prende il primo della coda.
  const focusOrder = useMemo(() => {
    const explicit = workOrder.find((o) => o.id === focusId);
    return explicit ?? workOrder[0] ?? null;
  }, [workOrder, focusId]);

  const pagaTotal  = daPagare.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const fareMinutes = daFare.reduce((sum, o) => sum + minutesSince(o.createdAt), 0);
  const prontiMinutes = pronti.reduce((sum, o) => sum + minutesSince(o.readyAt ?? o.createdAt), 0);

  // Ordine da incassare diverso da quello in focus → pagamento rapido con ritorno.
  const quickPayOrder = daPagare.find((o) => o.id !== focusOrder?.id) ?? null;

  const action    = nextActionFor(focusOrder);

  // "PASSA AL BANCO" — bug reale: kitchen_payment_record_counter blocca l'incasso quando esiste
  // un attempt SumUp online ancora aperto/retry-eligible (online_payment_in_progress, vedi
  // useKitchenOrders.confirmPayment), senza via d'uscita da /kitchen/solo dopo il decommissioning
  // del Payment Hub UI (b696070). Lookup mirata per il solo focusOrder (mai la lista aggregata
  // "ultimi 30" di useKitchenPayments, che puo' non contenere l'attempt di un ordine piu' vecchio):
  // vedi src/lib/kitchenCloseForCounter.js. Non montata in Preview/Demo/Training (nessuna sessione
  // Supabase reale).
  const [closeForCounter, setCloseForCounter] = useState({ orderId: null, attempt: null, status: 'idle', message: null, tone: null });
  useEffect(() => {
    if (isPreview) return undefined;
    if (!focusOrder || focusOrder.status !== 'pending_counter_payment') {
      setCloseForCounter({ orderId: null, attempt: null, status: 'idle', message: null, tone: null });
      return undefined;
    }
    let cancelled = false;
    setCloseForCounter({ orderId: focusOrder.id, attempt: null, status: 'checking', message: null, tone: null });
    fetchCloseForCounterEligibility(focusOrder.id).then((attempt) => {
      if (cancelled) return;
      setCloseForCounter({ orderId: focusOrder.id, attempt, status: 'idle', message: null, tone: null });
    });
    return () => { cancelled = true; };
  }, [isPreview, focusOrder?.id, focusOrder?.status]);

  const handleCloseForCounter = async () => {
    if (!focusOrder || !window.confirm(CLOSE_FOR_COUNTER_CONFIRM_MESSAGE)) return;
    const orderId = focusOrder.id;
    setCloseForCounter((prev) => ({ ...prev, status: 'loading', message: null, tone: null }));
    const result = await liveCloseForCounterAction(orderId);
    const message = result.ok ? result.text : (result.message ?? CLOSE_FOR_COUNTER_ERROR_LABELS[result.error] ?? 'Errore imprevisto — riprova.');
    const tone = result.ok ? result.tone : 'warn';
    // Ri-verifica sempre dopo l'azione: se chiuso, l'attempt sparisce (bottone si nasconde); se
    // fallito, resta visibile per riprovare.
    const attempt = await fetchCloseForCounterEligibility(orderId);
    setCloseForCounter({ orderId, attempt, status: 'done', message, tone });
  };

  // BUG B (ai-ops/reports/kitchen-bugA-bugB-audit-20260923.md) — dead-end ordine pagato: ANNULLA
  // bloccato da kitchen-cancel-with-payment-check ("order_already_paid_cannot_cancel") senza via
  // d'uscita. Flow: RIMBORSA (refundOrder, riusa /api/kitchen-sumup-refund invariato) -> solo dopo
  // refunded/already_refunded E verifica server-side che payment_status non sia più 'paid'
  // (condizione Gate 1 di Eros, 2026-09-23) -> ANNULLA riprova cancelOrder, che ora passa il guard.
  const REFUND_CONFIRM_MESSAGE = {
    sumup_online: 'Confermi il rimborso online (SumUp) di questo ordine? L\'operazione avvia un rimborso reale su SumUp.',
    cash: 'Confermi di aver già restituito il contante al cliente? L\'ordine verrà segnato come rimborsato.',
    card_counter_manual: 'Confermi di aver già stornato la carta/POS al banco? L\'ordine verrà segnato come rimborsato.',
  };
  const [refundFlow, setRefundFlow] = useState({ orderId: null, reason: null, status: 'idle', message: null, canRetry: true, readyToCancel: false });

  const askCancel = async () => {
    if (!focusOrder) return;
    const reason = window.prompt(`Annullare ${focusOrder.orderCode}? Motivo:`, 'Fuori stock');
    setMoreOpen(false);
    if (!reason) return;
    const orderId = focusOrder.id;
    const result = await cancelOrder(orderId, reason);
    if (result?.reason === 'order_already_paid_cannot_cancel' && refundOrder) {
      setRefundFlow({ orderId, reason, status: 'idle', message: null, canRetry: true, readyToCancel: false });
    }
  };

  const handleRefund = async () => {
    if (!refundOrder || refundFlow.status === 'loading') return; // blocca doppio click durante la richiesta
    const confirmMsg = REFUND_CONFIRM_MESSAGE[focusOrder?.paymentMethod] ?? 'Confermi il rimborso di questo ordine?';
    if (!window.confirm(confirmMsg)) return;
    const { orderId, reason } = refundFlow;
    setRefundFlow((prev) => ({ ...prev, status: 'loading', message: null }));
    const result = await refundOrder(orderId, reason);
    setRefundFlow({
      orderId, reason, status: 'idle',
      message: result.message,
      canRetry: result.canRetry !== false,
      readyToCancel: result.readyToCancel === true,
    });
  };

  const handleConfirmCancelAfterRefund = async () => {
    if (!refundFlow.readyToCancel) return; // difesa aggiuntiva: mai annullare senza verifica payment_status confermata
    const result = await cancelOrder(refundFlow.orderId, refundFlow.reason);
    if (result?.ok) {
      setRefundFlow({ orderId: null, reason: null, status: 'idle', message: null, canRetry: true, readyToCancel: false });
    }
  };

  const allergenInfo = focusOrder ? resolveOrderAllergens(focusOrder) : { allergens: [], unknownItems: [], hasUnknown: false };
  const allergens = allergenInfo.allergens;
  const lateFocus = focusOrder ? minutesSince(focusOrder.createdAt) >= 15 : false;

  // Contratto RPC invariato (kitchen_payment_record_counter, p_method: 'cash' | 'card_counter_manual'),
  // stesso gate di conferma esplicita di CounterOrdersView.jsx per la carta/POS: l'incasso avviene
  // su hardware esterno e non è verificabile dall'app.
  const recordCounterPayment = async (order, method) => {
    if (method === 'card_counter_manual') {
      const amount = order.total != null ? order.total.toFixed(2) : '?';
      if (!window.confirm(`Confermi che la carta/POS è stata incassata per € ${amount}?`)) {
        return { ok: false, cancelled: true };
      }
    }
    return confirmPayment(order.id, method);
  };

  const runAction = async (kind, order = focusOrder, method = 'cash') => {
    if (!order) return;
    if (kind === 'pay') {
      const result = await recordCounterPayment(order, method);
      if (result?.ok) notifyCounterPayment(order.id);
      // Ritorno al focus precedente se il pagamento era una deviazione.
      if (returnFocusRef.current && returnFocusRef.current !== order.id) {
        setFocusId(returnFocusRef.current);
        returnFocusRef.current = null;
      }
      return;
    }
    const map = { start: 'preparing', ready: 'ready', delivered: 'delivered' };
    if (!map[kind]) return;
    const fromStatus = order.status;
    updateOrderStatus(order.id, map[kind]);
    // Protezione click accidentale (P0-B): solo PRONTO e CONSEGNATO offrono undo — reverse sicure
    // senza nuovo state/schema (vedi ai-ops/reports/kitchen-p0b-undo-window-audit.md §4).
    if (kind === 'ready' || kind === 'delivered') {
      setUndo({
        orderId: order.id,
        orderCode: order.orderCode,
        fromStatus,
        actionLabel: kind === 'ready' ? 'PRONTO' : 'CONSEGNATO',
        expiresAt: Date.now() + 9000,
      });
    }
    // P0-1: dopo PRONTO il focus deve avanzare al prossimo ordine da lavorare, anche se focusId
    // era già stato fissato in precedenza da selezione manuale/RINVIA/quick-pay/PREC-SUCC (finora
    // restava "agganciato" all'ordine appena completato — vedi
    // ai-ops/reports/kitchen-solo-final-operational-review.md P0-1). Stessa priorità operativa
    // già esistente (workOrder = da fare → da pagare → pronti), nessuno scheduler nuovo. Se non
    // resta nessun altro ordine attivo, focusId torna a null: il fallback su workOrder[0] mostra
    // comunque l'unico ordine rimasto (quello appena segnato pronto) o lo stato vuoto.
    if (kind === 'ready') {
      const next = workOrder.find((o) => o.id !== order.id);
      setFocusId(next?.id ?? null);
    }
  };

  /** Click esplicito ANNULLA: unico modo per ripristinare lo stato precedente. Nessun reverse silenzioso. */
  const cancelUndo = () => {
    if (!undo) return;
    updateOrderStatus(undo.orderId, undo.fromStatus);
    setFocusId(undo.orderId);
    setUndo(null);
  };

  /** Pagamento rapido da card laterale: incassa senza perdere il focus corrente. */
  const quickPay = async (order, method = 'cash') => {
    const keep = focusOrder?.id ?? null;
    const result = await recordCounterPayment(order, method);
    if (result?.ok) notifyCounterPayment(order.id);
    if (keep) setFocusId(keep);
  };

  const selectOrder = (order) => {
    // Se scelgo un ordine da incassare mentre ne stavo lavorando un altro, ricordo dove tornare.
    if (isPending(order) && focusOrder && focusOrder.id !== order.id && !isPending(focusOrder)) {
      returnFocusRef.current = focusOrder.id;
    } else {
      returnFocusRef.current = null;
    }
    setFocusId(order.id);
    setQueueOpen(false);
  };

  const snoozeFocus = () => {
    if (!focusOrder) return;
    const rest = workOrder.filter((o) => o.id !== focusOrder.id);
    setSnoozed((prev) => ({ ...prev, [focusOrder.id]: Date.now() }));
    setFocusId(rest[0]?.id ?? null);
  };

  const stepFocus = (delta) => {
    if (!focusOrder) return;
    const idx = workOrder.findIndex((o) => o.id === focusOrder.id);
    const next = workOrder[idx + delta];
    if (next) setFocusId(next.id);
  };

  const toggleCheck = (idx) => {
    if (!focusOrder) return;
    setChecked((prev) => {
      const forOrder = { ...(prev[focusOrder.id] ?? {}) };
      forOrder[idx] = !forOrder[idx];
      return { ...prev, [focusOrder.id]: forOrder };
    });
  };

  const askStaffNote = () => {
    if (!focusOrder) return;
    const note = window.prompt(`Nota staff per ${focusOrder.orderCode}:`, focusOrder.staffNote ?? '');
    if (note !== null) updateStaffNote(focusOrder.id, note);
    setMoreOpen(false);
  };

  const alertCount = active.filter((o) => minutesSince(o.createdAt) >= 10).length;
  const unavailableCount = menuItems.filter((i) => !i.available).length;

  const matchesSearch = (o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [o.orderCode, o.nickname].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  };

  const renderGroup = (key, label, list, modifier) => {
    const visible = list.filter(matchesSearch);
    if (visible.length === 0) return null;
    return (
      <div className={`kss-group kss-group--${modifier}`} key={key}>
        <div className="kss-group-head">
          <span>{label}</span>
          <span className="kss-group-count">{visible.length}</span>
        </div>
        {visible.map((o) => {
          const mins = minutesSince(isReady(o) ? (o.readyAt ?? o.createdAt) : o.createdAt);
          return (
            <button
              key={o.id}
              type="button"
              data-order={o.orderCode}
              className={`kss-qcard ${focusOrder?.id === o.id ? 'kss-qcard--active' : ''} ${mins >= 15 ? 'kss-qcard--late' : ''}`}
              onClick={() => selectOrder(o)}
            >
              <span className="kss-qcard-icon" aria-hidden="true">
                {isPending(o) ? '\u{1F4B3}' : isReady(o) ? '✅' : '\u{1F4CB}'}
              </span>
              <span className="kss-qcard-main">
                <span className="kss-qcard-line1">
                  {o.orderCode}
                  {customerLabel(o) && (
                    <>
                      <span className="kss-qcard-dot">·</span>
                      <span data-testid={`customer-name-${o.orderCode}`}>{customerLabel(o)}</span>
                    </>
                  )}
                  <span className="kss-qcard-dot">·</span>
                  <span className="kss-qcard-min">{mins} min</span>
                </span>
                <span className="kss-qcard-line2">{itemsLine(o)}</span>
              </span>
              <span className="kss-qcard-right">
                {o.fulfillmentType && (
                  <span className="kss-qcard-tag" data-testid={`fulfillment-tag-${o.orderCode}`}>
                    {o.fulfillmentType === 'takeaway' ? 'VIA' : 'QUI'}
                  </span>
                )}
                {isPending(o) && o.total != null && (
                  <span className="kss-qcard-amount">€{o.total.toFixed(2)}</span>
                )}
                {o.status === 'preparing' && <span className="kss-qcard-tag">IN PREPARAZIONE</span>}
                {o.syncStatus === 'error' && (
                  <span className="kss-qcard-tag kss-qcard-tag--sync-error" data-testid={`sync-error-tag-${o.orderCode}`}>
                    SYNC ✗
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`kss-page ${queueOpen ? 'kss-page--queue-open' : ''}`}>

      {/* HEADER — modalità + azioni secondarie */}
      <div className="kss-header">
        <span className="kss-brand">WALBOX KITCHEN</span>
        <span className="kss-header-divider" />
        <span className="kss-mode">
          <span aria-hidden="true">👤</span> SOLO SERVICE MODE
        </span>
        <span className="kss-mode-claim">
          Una persona. Tutto sotto controllo.{isPreview ? ' · PREVIEW (dati locali, no Supabase)' : ''}
        </span>
        <span className="kss-header-spacer" />
        <div className="kss-header-actions">
          <button className="kss-secondary-btn" onClick={toggleAudio} aria-pressed={audioEnabled}>
            <span aria-hidden="true">{audioEnabled ? '🔊' : '🔇'}</span><span className="kss-secondary-label">AUDIO</span>
          </button>
          <button className="kss-secondary-btn" onClick={() => setOverlay('menu')}>
            <span aria-hidden="true">☰</span><span className="kss-secondary-label">MENU</span>
            {unavailableCount > 0 && <span className="kss-secondary-badge">{unavailableCount}</span>}
          </button>
          <button className="kss-secondary-btn" onClick={() => { requestFullscreenIfAllowed(); setOverlay('storico'); }}>
            <span aria-hidden="true">🕘</span><span className="kss-secondary-label">STORICO</span>
          </button>
          <button className="kss-secondary-btn" onClick={() => setOverlay('alert')}>
            <span aria-hidden="true">🔔</span><span className="kss-secondary-label">ALERT</span>
            {alertCount > 0 && <span className="kss-secondary-badge">{alertCount}</span>}
          </button>
          {/* Ordine assistito al banco per il cliente che non usa l'app (/kitchen/cassa). */}
          <button className="kss-secondary-btn" data-testid="go-cassa" onClick={() => navigate('/kitchen/cassa')}>
            <span aria-hidden="true">🧾</span><span className="kss-secondary-label">CASSA</span>
          </button>
        </div>
      </div>

      <div className="kss-body">

        {/* COLONNA SINISTRA — KPI + CODA */}
        <div className="kss-queue-col">
          <div className="kss-kpis">
            <div className="kss-kpi kss-kpi--paga">
              <span className="kss-kpi-head"><span aria-hidden="true">💳</span> PAGA</span>
              <span className="kss-kpi-value" data-testid="kpi-paga">{daPagare.length}</span>
              <span className="kss-kpi-sub">€{pagaTotal.toFixed(2)}</span>
            </div>
            <div className="kss-kpi kss-kpi--fare">
              <span className="kss-kpi-head"><span aria-hidden="true">📋</span> DA FARE</span>
              <span className="kss-kpi-value" data-testid="kpi-dafare">{daFare.length}</span>
              <span className="kss-kpi-sub">{fareMinutes} min tot.</span>
            </div>
            <div className="kss-kpi kss-kpi--pronti">
              <span className="kss-kpi-head"><span aria-hidden="true">✅</span> PRONTI</span>
              <span className="kss-kpi-value" data-testid="kpi-pronti">{pronti.length}</span>
              <span className="kss-kpi-sub">{prontiMinutes} min tot.</span>
            </div>
          </div>

          <div className="kss-queue">
            <div className="kss-queue-head">
              <span className="kss-queue-title">CODA ORDINI</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="kss-filter" onClick={() => { setSearchOpen((v) => !v); setSearch(''); }}>
                  {searchOpen ? 'CHIUDI' : 'TUTTI ⌄'}
                </button>
                {queueOpen && (
                  <button className="kss-filter" onClick={() => setQueueOpen(false)}>FOCUS</button>
                )}
              </div>
            </div>

            {searchOpen && (
              <div className="kss-search">
                <input
                  autoFocus
                  placeholder="Cerca ordine: codice, tavolo, nickname"
                  aria-label="Cerca ordine"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            <div className="kss-queue-scroll">
              {renderGroup('pagare', 'DA INCASSARE', daPagare, 'pagare')}
              {renderGroup('fare',   'DA FARE',   daFare,   'fare')}
              {renderGroup('pronti', 'PRONTI',    pronti,   'pronti')}
              {daPagare.length + daFare.length + pronti.length === 0 && (
                <div className="kss-queue-empty">Nessun ordine attivo. Coda pulita.</div>
              )}
            </div>
          </div>
        </div>

        {/* COLONNA DESTRA — ORDINE IN FOCUS */}
        <div className="kss-focus">
          {!focusOrder && (
            <div className="kss-focus-empty">
              <div className="kss-focus-empty-title">TUTTO SOTTO CONTROLLO</div>
              <div>Nessun ordine da lavorare. Ti avviso appena arriva una comanda.</div>
            </div>
          )}

          {focusOrder && (
            <>
              <div className="kss-focus-top">
                <div className="kss-focus-headline">
                  <span className={`kss-status-pill kss-status-pill--${STATUS_PILL[focusOrder.status]?.cls ?? 'received'}`}>
                    {STATUS_PILL[focusOrder.status]?.label ?? focusOrder.status}
                  </span>
                  {focusOrder.fulfillmentType && (
                    <span className="kss-qcard-tag" data-testid="focus-fulfillment">
                      {focusOrder.fulfillmentType === 'takeaway' ? 'VIA' : 'QUI'}
                    </span>
                  )}
                  <div className="kss-focus-code">
                    <span data-testid="focus-code">{focusOrder.orderCode}</span>
                    {customerLabel(focusOrder) && (
                      <>
                        <span className="kss-focus-sep kss-focus-sep--min">·</span>
                        <span data-testid="focus-customer-name">{customerLabel(focusOrder)}</span>
                      </>
                    )}
                    <span className="kss-focus-sep kss-focus-sep--min">·</span>
                    <span className="kss-focus-min">{minutesSince(focusOrder.createdAt)} MIN</span>
                  </div>
                  <div className="kss-focus-items-line">{itemsLine(focusOrder)}</div>
                </div>
                <div className={`kss-focus-timer ${lateFocus ? 'kss-focus-timer--late' : ''}`}>
                  <div className="kss-focus-timer-value">
                    <span aria-hidden="true">⏱</span>{clockSince(focusOrder.createdAt)}
                  </div>
                  <div className="kss-focus-timer-sub">ARRIVATO {formatClock(focusOrder.createdAt)}</div>
                </div>
              </div>

              {focusOrder.syncStatus === 'error' && (
                <div className="kss-sync-error" data-testid="sync-error-banner">
                  <span>⚠ Salvataggio non riuscito — {focusOrder.syncError ?? 'riprova'}</span>
                  {focusOrder.syncRetryable !== false && (
                    <button
                      type="button"
                      className="kss-sync-error-retry"
                      onClick={() => retrySync?.(focusOrder.id)}
                    >
                      RIPROVA
                    </button>
                  )}
                </div>
              )}

              {refundFlow.orderId === focusOrder.id && (
                <div className="kss-sync-error" data-testid="refund-flow-panel">
                  {refundFlow.readyToCancel ? (
                    <>
                      <span>✓ {refundFlow.message ?? 'Rimborso confermato'} — ora puoi annullare l'ordine.</span>
                      <button
                        type="button"
                        className="kss-sync-error-retry"
                        data-testid="refund-confirm-cancel-btn"
                        onClick={handleConfirmCancelAfterRefund}
                      >
                        ANNULLA ORDINE
                      </button>
                    </>
                  ) : (
                    <>
                      <span>
                        ⚠ Ordine già pagato — rimborsa per poter annullare
                        {refundFlow.message ? ` — ${refundFlow.message}` : ''}
                      </span>
                      {refundFlow.canRetry !== false && (
                        <button
                          type="button"
                          className="kss-sync-error-retry"
                          data-testid="refund-btn"
                          disabled={refundFlow.status === 'loading'}
                          onClick={handleRefund}
                        >
                          {refundFlow.status === 'loading' ? 'RIMBORSO IN CORSO…' : 'RIMBORSA'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="kss-focus-grid">
                {/* DA PREPARARE */}
                <div className="kss-card kss-card--prep">
                  <div className="kss-card-title"><span aria-hidden="true">🔥</span> DA PREPARARE</div>
                  {focusOrder.items.map((item, idx) => {
                    const done = !!checked[focusOrder.id]?.[idx];
                    return (
                      <button
                        type="button"
                        key={idx}
                        className={`kss-prep-row ${done ? 'kss-prep-row--done' : ''}`}
                        onClick={() => toggleCheck(idx)}
                      >
                        <span className="kss-prep-check">{done ? '✓' : ''}</span>
                        <span className="kss-prep-name">
                          {item.name}
                          {STAFF_DISAMBIGUATION_LABEL[item.itemId] && (
                            <span className="kss-prep-tag">{STAFF_DISAMBIGUATION_LABEL[item.itemId]}</span>
                          )}
                        </span>
                        <span className="kss-prep-qty">{item.quantity}x</span>
                      </button>
                    );
                  })}
                </div>

                {/* MODIFICHE / NOTE */}
                <div className="kss-card">
                  <div className="kss-card-title"><span aria-hidden="true">📝</span> MODIFICHE / NOTE</div>
                  {focusOrder.note
                    ? <div className="kss-card-body">{focusOrder.note}</div>
                    : <div className="kss-card-text">Nessuna modifica</div>}
                </div>

                {/* ALLERGENI + NOTE STAFF */}
                <div className="kss-side-stack">
                  <div className="kss-card kss-card--allergeni">
                    <div className="kss-card-title"><span aria-hidden="true">⚠️</span> ALLERGENI</div>
                    {allergens.length > 0 && (
                      <div className="kss-allergen-list" data-testid="focus-allergeni">
                        {allergens.map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}
                      </div>
                    )}
                    {/* P0-3: un item fuori catalogo NON e' un item senza allergeni. Lo staff deve
                        vedere che su quella riga l'informazione manca, e su quali righe. */}
                    {allergenInfo.hasUnknown && (
                      <div className="kss-allergen-list" data-testid="focus-allergeni-unverified">
                        ALLERGENI NON VERIFICATI: {allergenInfo.unknownItems.map((u) => u.name || u.itemId).join(', ')} — CHIEDI AL CLIENTE
                      </div>
                    )}
                    {(allergens.length > 0 || allergenInfo.hasUnknown) && (
                      <div className="kss-allergen-warn"><span aria-hidden="true">⚠</span> ATTENZIONE</div>
                    )}
                    {allergens.length === 0 && !allergenInfo.hasUnknown && (
                      <div className="kss-card-text">Nessun allergene dichiarato</div>
                    )}
                  </div>

                  <div className="kss-card">
                    <div className="kss-card-title"><span aria-hidden="true">💬</span> NOTE STAFF</div>
                    {focusOrder.staffNote
                      ? <div className="kss-card-body">{focusOrder.staffNote}</div>
                      : <div className="kss-card-text">Nessuna nota</div>}
                  </div>
                </div>
              </div>

              {/* UNA SOLA NEXT ACTION + PAGAMENTO RAPIDO */}
              <div className="kss-action-grid">
                <div className="kss-next">
                  <div className="kss-next-label">PROSSIMA AZIONE CONSIGLIATA</div>
                  {action && (
                    <button
                      className={`kss-next-btn ${action.tone === 'green' ? 'kss-next-btn--green' : action.tone === 'yellow' ? 'kss-next-btn--yellow' : ''}`}
                      data-testid="next-action"
                      onClick={() => runAction(action.kind)}
                    >
                      <div className="kss-next-btn-main">{action.label}</div>
                      <div className="kss-next-btn-sub">{action.sub}</div>
                    </button>
                  )}
                  {action?.kind === 'pay' && (
                    <button
                      className="kss-next-btn-alt"
                      data-testid="next-action-card"
                      onClick={() => runAction('pay', focusOrder, 'card_counter_manual')}
                    >
                      CARTA/POS ✓
                    </button>
                  )}
                  {action?.kind === 'pay' && closeForCounter.orderId === focusOrder.id && closeForCounter.attempt && (
                    <div data-testid="close-for-counter-row">
                      <button
                        type="button"
                        className="kss-next-btn-alt"
                        data-testid="close-for-counter-btn"
                        disabled={closeForCounter.status === 'loading'}
                        onClick={handleCloseForCounter}
                      >
                        {closeForCounter.status === 'loading' ? 'CHIUSURA IN CORSO…' : 'PASSA AL BANCO — sblocca il checkout online'}
                      </button>
                      {closeForCounter.message && (
                        <div
                          className="kss-quickpay-text"
                          data-testid="close-for-counter-msg"
                          style={{ color: closeForCounter.tone === 'warn' ? '#f59e0b' : closeForCounter.tone === 'ok' ? '#4ade80' : undefined }}
                        >
                          {closeForCounter.message}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Sola lettura: il codice si redime lato cliente prima del pagamento
                      (CustomerKitchenMenu.jsx). Lo staff non inserisce più codici qui. */}
                  {action?.kind === 'pay' && focusOrder.promoCode && (
                    <div className="kss-promo">
                      <div className="kss-promo-badge" data-testid="promo-badge">
                        PROMO {focusOrder.promoCode} · −€{focusOrder.discountAmount.toFixed(2)} ·
                        TOTALE €{focusOrder.total.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                {quickPayOrder ? (
                  <div className="kss-quickpay">
                    <div className="kss-quickpay-label">
                      PAGA UN ORDINE E TORNA A {focusOrder.orderCode}
                    </div>
                    <div className="kss-quickpay-row">
                      <div className="kss-quickpay-text">
                        Devi incassare {quickPayOrder.orderCode}
                        {quickPayOrder.total != null ? ` (€${quickPayOrder.total.toFixed(2)})` : ''}?<br />
                        Paga ora e torni subito a <strong>{focusOrder.orderCode}</strong>.
                      </div>
                      <button
                        className="kss-quickpay-btn"
                        data-testid="quick-pay"
                        onClick={() => quickPay(quickPayOrder)}
                      >
                        <span aria-hidden="true">💳</span> PAGA {quickPayOrder.orderCode}
                      </button>
                      <button
                        className="kss-quickpay-btn kss-quickpay-btn--alt"
                        data-testid="quick-pay-card"
                        onClick={() => quickPay(quickPayOrder, 'card_counter_manual')}
                      >
                        CARTA/POS
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="kss-quickpay">
                    <div className="kss-quickpay-label">BANCO</div>
                    <div className="kss-quickpay-text">Nessun incasso in sospeso. Resta sulla cucina.</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* PHONE — navigazione Focus Mode (un ordine alla volta) */}
      <div className="kss-phone-bar">
        <button className="kss-phone-btn" onClick={() => stepFocus(-1)} disabled={!focusOrder}>‹ PREC</button>
        <button className="kss-phone-btn" onClick={() => setQueueOpen(true)}>
          CODA ({daPagare.length + daFare.length + pronti.length})
        </button>
        <button className="kss-phone-btn" onClick={() => stepFocus(1)} disabled={!focusOrder}>SUCC ›</button>
      </div>

      {/* UNDO TOAST — P0-B: protezione click accidentale, un solo undo alla volta */}
      {undo && (
        <div className="kss-undo-toast" data-testid="undo-toast">
          <span className="kss-undo-check" aria-hidden="true">✓</span>
          <span className="kss-undo-text">
            Ordine {undo.orderCode} segnato {undo.actionLabel}
          </span>
          <button type="button" className="kss-undo-btn" data-testid="undo-btn" onClick={cancelUndo}>
            ANNULLA
          </button>
          <span className="kss-undo-timer" data-testid="undo-timer">
            {Math.max(0, Math.ceil((undo.expiresAt - Date.now()) / 1000))}
          </span>
        </div>
      )}

      {/* BOTTOM BAR */}
      <div className="kss-bar">
        <button className="kss-bar-btn" onClick={() => { setSearchOpen(true); setQueueOpen(true); }}>
          <span aria-hidden="true">🔍</span> CERCA ORDINE
        </button>
        <button
          className="kss-bar-btn kss-bar-btn--status kss-bar-btn--pay"
          disabled={!focusOrder || !isPending(focusOrder)}
          onClick={() => runAction('pay')}
        >
          <span aria-hidden="true">💳</span> CONFERMA PAGAMENTO
        </button>
        <button
          className="kss-bar-btn kss-bar-btn--status kss-bar-btn--start"
          disabled={focusOrder?.status !== 'received'}
          onClick={() => runAction('start')}
        >
          <span aria-hidden="true">▶</span> INIZIA PREPARAZIONE
        </button>
        <button
          className="kss-bar-btn kss-bar-btn--status kss-bar-btn--ready"
          disabled={focusOrder?.status !== 'preparing'}
          onClick={() => runAction('ready')}
        >
          <span aria-hidden="true">✅</span> PRONTO
        </button>
        <button
          className="kss-bar-btn kss-bar-btn--snooze"
          disabled={!focusOrder}
          onClick={snoozeFocus}
        >
          <span aria-hidden="true">🕘</span> RINVIA
        </button>
        <div className="kss-bar-more">
          <button className="kss-bar-btn" style={{ width: '100%' }} onClick={() => setMoreOpen((v) => !v)}>
            <span aria-hidden="true">•••</span> ALTRO...
          </button>
          {moreOpen && (
            <div className="kss-more-menu">
              <button
                className="kss-more-item"
                disabled={focusOrder?.status !== 'ready'}
                onClick={() => { runAction('delivered'); setMoreOpen(false); }}
              >
                Segna come RITIRATO
              </button>
              <button className="kss-more-item" disabled={!focusOrder} onClick={askStaffNote}>
                Aggiungi nota staff
              </button>
              <button className="kss-more-item" onClick={() => { setOverlay('menu'); setMoreOpen(false); }}>
                Menu / disponibilità
              </button>
              <button className="kss-more-item" onClick={() => { requestFullscreenIfAllowed(); setOverlay('storico'); setMoreOpen(false); }}>
                Storico ordini
              </button>
              <button className="kss-more-item kss-more-item--danger" disabled={!focusOrder} onClick={askCancel}>
                Annulla ordine
              </button>
              <button
                className="kss-more-item"
                data-testid="logout-btn"
                onClick={() => {
                  setMoreOpen(false);
                  onLogout();
                }}
              >
                LOGOUT
              </button>
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY secondari */}
      {overlay && (
        <div
          className={`kss-overlay${overlay === 'storico' ? ' kss-overlay--fullscreen' : ''}`}
          onClick={() => closeOverlay()}
        >
          <div className="kss-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="kss-overlay-head">
              <span>{overlay.toUpperCase()}</span>
              <button className="kss-overlay-close" onClick={() => closeOverlay()}>CHIUDI ✕</button>
            </div>
            <div className="kss-overlay-body">
              {overlay === 'menu'    && <MenuView menuItems={menuItems} toggleAvailability={toggleAvailability} />}
              {overlay === 'storico' && (
                <>
                  {showNightSelector && <ServiceNightSelector />}
                  <StoricoView orders={orders} paymentsSummary={paymentsSummary} serviceNight={serviceNight} anomalies={paymentAnomalies} paymentsByMethod={paymentsByMethod} />
                </>
              )}
              {overlay === 'alert'   && <AlertView orders={orders} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
