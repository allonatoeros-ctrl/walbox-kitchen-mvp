import { useState, useEffect, useMemo, useRef } from 'react';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { useKitchenMenu } from '../hooks/useKitchenMenu';
import { useKitchenPayments } from '../hooks/useKitchenPayments';
import { kitchenMenuItems } from '../data/kitchenMockData';
import { getStaffSession, onAuthStateChange, isKitchenStaff } from '../lib/supabaseAuth';
import { usePreviewKitchenOrders, usePreviewKitchenMenu } from './kitchenSoloPreviewFixtures';
import MenuView from './MenuView';
import StoricoView from './StoricoView';
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

function itemsLine(order) {
  return order.items.map((i) => `${i.quantity} × ${i.name.toUpperCase()}`).join(' · ');
}

function getAllergens(order) {
  const set = new Set();
  order.items.forEach((item) => {
    const mi = kitchenMenuItems.find((m) => m.id === item.itemId);
    if (mi?.allergens) mi.allergens.forEach((a) => set.add(a));
  });
  return [...set];
}

const STATUS_PILL = {
  pending_counter_payment: { label: 'DA PAGARE',      cls: 'pending' },
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
  const { orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote, retrySync } = useKitchenOrders();
  const { menuItems, toggleAvailability } = useKitchenMenu();
  // Micro-fase 1 (badge anomalie Payment Hub): read-only, nessuna azione — vedi
  // ai-ops/reports/kitchen-solo-payment-hub-integration-audit.md §5. Non montato in
  // Preview/Demo per restare isolati da Supabase (invariato).
  const { anomalies: paymentAnomalies } = useKitchenPayments();

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

  return (
    <KitchenSoloServiceView
      orders={orders}
      updateOrderStatus={updateOrderStatus}
      confirmPayment={confirmPayment}
      cancelOrder={cancelOrder}
      updateStaffNote={updateStaffNote}
      retrySync={retrySync}
      menuItems={menuItems}
      toggleAvailability={toggleAvailability}
      paymentAnomalies={paymentAnomalies}
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
  orders, updateOrderStatus, confirmPayment, cancelOrder, updateStaffNote, retrySync,
  menuItems, toggleAvailability, isPreview = false, paymentAnomalies = [],
  paymentsPath = '/kitchen/payments',
}) {
  const [focusId, setFocusId]         = useState(null);
  const [checked, setChecked]         = useState({});   // { [orderId]: { [idx]: true } }
  const [snoozed, setSnoozed]         = useState({});   // { [orderId]: timestamp }
  const [searchOpen, setSearchOpen]   = useState(false);
  const [search, setSearch]           = useState('');
  const [moreOpen, setMoreOpen]       = useState(false);
  const [overlay, setOverlay]         = useState(null); // 'menu' | 'storico' | 'alert'
  const [queueOpen, setQueueOpen]     = useState(false); // phone: coda a schermo intero
  const [, setTick]                   = useState(0);
  // Undo P0-B: { orderId, orderCode, fromStatus, actionLabel, expiresAt } | null — un solo undo alla volta.
  const [undo, setUndo]               = useState(null);

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
  const allergens = focusOrder ? getAllergens(focusOrder) : [];
  const lateFocus = focusOrder ? minutesSince(focusOrder.createdAt) >= 15 : false;

  const runAction = (kind, order = focusOrder) => {
    if (!order) return;
    if (kind === 'pay') {
      confirmPayment(order.id, 'counter');
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
  };

  /** Click esplicito ANNULLA: unico modo per ripristinare lo stato precedente. Nessun reverse silenzioso. */
  const cancelUndo = () => {
    if (!undo) return;
    updateOrderStatus(undo.orderId, undo.fromStatus);
    setFocusId(undo.orderId);
    setUndo(null);
  };

  /** Pagamento rapido da card laterale: incassa senza perdere il focus corrente. */
  const quickPay = (order) => {
    const keep = focusOrder?.id ?? null;
    confirmPayment(order.id, 'counter');
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

  const askCancel = () => {
    if (!focusOrder) return;
    const reason = window.prompt(`Annullare ${focusOrder.orderCode}? Motivo:`, 'Fuori stock');
    if (reason) cancelOrder(focusOrder.id, reason);
    setMoreOpen(false);
  };

  const askStaffNote = () => {
    if (!focusOrder) return;
    const note = window.prompt(`Nota staff per ${focusOrder.orderCode}:`, focusOrder.staffNote ?? '');
    if (note !== null) updateStaffNote(focusOrder.id, note);
    setMoreOpen(false);
  };

  const alertCount = active.filter((o) => minutesSince(o.createdAt) >= 10).length;
  const unavailableCount = menuItems.filter((i) => !i.available).length;
  // Badge minimo, nessun dettaglio inline: solo anomalie legate a ordini attivi in questa coda SOLO.
  const activeIds = new Set(active.map((o) => o.id));
  const paymentAlertCount = paymentAnomalies.filter((a) => activeIds.has(a.order_id)).length;

  const matchesSearch = (o) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return [o.orderCode, o.table, o.nickname].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
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
                  <span className="kss-qcard-dot">·</span>
                  {o.table}
                  <span className="kss-qcard-dot">·</span>
                  <span className="kss-qcard-min">{mins} min</span>
                </span>
                <span className="kss-qcard-line2">{itemsLine(o)}</span>
              </span>
              <span className="kss-qcard-right">
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
          <button className="kss-secondary-btn" onClick={() => setOverlay('menu')}>
            <span aria-hidden="true">☰</span><span className="kss-secondary-label">MENU</span>
            {unavailableCount > 0 && <span className="kss-secondary-badge">{unavailableCount}</span>}
          </button>
          <button className="kss-secondary-btn" onClick={() => setOverlay('storico')}>
            <span aria-hidden="true">🕘</span><span className="kss-secondary-label">STORICO</span>
          </button>
          <button className="kss-secondary-btn" onClick={() => setOverlay('alert')}>
            <span aria-hidden="true">🔔</span><span className="kss-secondary-label">ALERT</span>
            {alertCount > 0 && <span className="kss-secondary-badge">{alertCount}</span>}
          </button>
          <button className="kss-secondary-btn" onClick={() => navigate('/kitchen/staff')}>
            <span className="kss-secondary-label">DASHBOARD</span>
            {paymentAlertCount > 0 && (
              <span className="kss-secondary-badge" data-testid="payment-anomaly-badge">
                {paymentAlertCount}
              </span>
            )}
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
              {renderGroup('pagare', 'DA PAGARE', daPagare, 'pagare')}
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
                  <div className="kss-focus-code">
                    <span data-testid="focus-code">{focusOrder.orderCode}</span>
                    <span className="kss-focus-sep">·</span>
                    <span>{focusOrder.table}</span>
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
                  <button
                    type="button"
                    className="kss-sync-error-retry"
                    onClick={() => retrySync?.(focusOrder.id)}
                  >
                    RIPROVA
                  </button>
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
                        <span className="kss-prep-name">{item.name}</span>
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
                    {allergens.length > 0 ? (
                      <>
                        <div className="kss-allergen-list" data-testid="focus-allergeni">
                          {allergens.map((a) => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}
                        </div>
                        <div className="kss-allergen-warn"><span aria-hidden="true">⚠</span> ATTENZIONE</div>
                      </>
                    ) : (
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
              <button className="kss-more-item" onClick={() => { setOverlay('storico'); setMoreOpen(false); }}>
                Storico ordini
              </button>
              <button
                className="kss-more-item"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(paymentsPath);
                }}
              >
                Pagamenti
              </button>
              <button className="kss-more-item kss-more-item--danger" disabled={!focusOrder} onClick={askCancel}>
                Annulla ordine
              </button>
            </div>
          )}
        </div>
      </div>

      {/* OVERLAY secondari */}
      {overlay && (
        <div className="kss-overlay" onClick={() => setOverlay(null)}>
          <div className="kss-overlay-panel" onClick={(e) => e.stopPropagation()}>
            <div className="kss-overlay-head">
              <span>{overlay.toUpperCase()}</span>
              <button className="kss-overlay-close" onClick={() => setOverlay(null)}>CHIUDI ✕</button>
            </div>
            <div className="kss-overlay-body">
              {overlay === 'menu'    && <MenuView menuItems={menuItems} toggleAvailability={toggleAvailability} />}
              {overlay === 'storico' && <StoricoView orders={orders} />}
              {overlay === 'alert'   && <AlertView orders={orders} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
