import { useState, useMemo, useEffect } from 'react';
import { useKitchenPayments } from '../hooks/useKitchenPayments';
import { useSelectedServiceNight } from '../hooks/useSelectedServiceNight';
import { useFullscreenToggle } from '../hooks/useFullscreenToggle';
import { formatServiceNightLabel } from '../lib/kitchenServiceRules';
import { supabase } from '../lib/supabaseClient';
import CassaControlSection from '../components/kitchen/CassaControlSection';
import ServiceNightSelector from '../components/kitchen/ServiceNightSelector';
import './PaymentsViewDemo.css';

const METHOD_LABELS = {
  sumup_online: 'Carta (online)',
  sumup_pos: 'Carta (POS)',
  satispay_app: 'Satispay',
  cash: 'Contanti',
  card_counter_manual: 'Carta/POS al banco',
  manual_comp: 'Omaggio',
  manual_other: 'Manuale',
};

// Testo operativo per lo staff: mai il drift_type tecnico grezzo.
const ANOMALY_REASON_LABELS = {
  paid_without_verifiable_charge: 'Segnato come pagato ma manca la prova del pagamento.',
  refunded_without_verifiable_refund: 'Segnato come rimborsato ma manca la prova del rimborso.',
  refund_stuck_initiated: 'Rimborso avviato ma non ancora confermato.',
  failed_charge_retry_window_open: 'Pagamento fallito — il cliente può ancora riprovare.',
};
const ANOMALY_REASON_FALLBACK = 'Anomalia da verificare manualmente.';

const ANOMALY_HINT_LABELS = {
  paid_without_verifiable_charge: 'Controlla lo scontrino/POS prima di consegnare — non risulta un incasso confermato.',
  refunded_without_verifiable_refund: 'Verifica su SumUp se il rimborso è arrivato davvero prima di risponderne al cliente.',
  refund_stuck_initiated: 'Controlla lo stato su SumUp prima di avviare un nuovo rimborso per lo stesso ordine.',
  failed_charge_retry_window_open: 'Il cliente può ritentare il pagamento alla cassa — non serve intervento immediato.',
};
const ANOMALY_HINT_FALLBACK = 'Verifica manualmente prima di procedere.';

// Mai mostrare il motivo tecnico grezzo (es. "card_declined") nella UI primaria.
const FAILURE_REASON_LABELS = {
  card_declined: 'carta rifiutata',
  insufficient_funds: 'fondi insufficienti',
  network_error: 'errore di rete',
};

const REFUND_ERROR_LABELS = {
  missing_session: 'Sessione scaduta — ricarica la pagina.',
  not_staff_for_venue: 'Non autorizzato per questo locale.',
  not_authorized: 'Non autorizzato.',
  order_not_found: 'Ordine non trovato.',
  no_succeeded_charge_to_refund: 'Nessun pagamento riuscito da rimborsare per questo ordine.',
  sumup_transaction_id_missing: 'Transazione SumUp non identificabile — contatta il supporto.',
  internal_server_error: 'Errore del server — riprova.',
  server_configuration_error: 'Errore di configurazione server.',
};

const REFUND_OUTCOME_LABELS = {
  refunded: 'Rimborso completato.',
  already_refunded: 'Era già rimborsato.',
  in_progress: 'Rimborso già in corso — attendi.',
  unknown: "Esito incerto: verifica su SumUp prima di riprovare.",
  failed: 'SumUp ha rifiutato il rimborso.',
};

const RECONCILE_ERROR_LABELS = {
  missing_session: 'Sessione scaduta — ricarica la pagina.',
  invalid_session: 'Sessione scaduta — ricarica la pagina.',
  not_staff_for_venue: 'Non autorizzato per questo locale.',
  order_not_found: 'Ordine non trovato.',
  internal_server_error: 'Errore del server — riprova.',
  server_configuration_error: 'Errore di configurazione server.',
};

// Testo dell'esito operativo 'reason' del reconcile — mai il valore tecnico grezzo.
const RECONCILE_FAILURE_REASON_LABELS = {
  expired: 'scaduto',
  cancelled: 'annullato dal cliente',
  amount_mismatch: 'importo non corrispondente',
  failed: 'rifiutato',
};

const RECONCILE_OUTCOME_LABELS = {
  already_paid: 'Risulta già pagato.',
  no_pending_attempt: 'Nessun pagamento in sospeso da verificare.',
  confirmed: 'Pagamento confermato.',
  pending: 'Ancora in corso — riprova tra poco.',
};

// "Passa al pagamento al banco" — chiusura esplicita di un checkout SumUp online non concluso.
const CLOSE_FOR_COUNTER_CONFIRM_MESSAGE = 'Confermi che il cliente vuole pagare al banco? Il checkout online in corso verrà chiuso.';

const CLOSE_FOR_COUNTER_ERROR_LABELS = {
  missing_session: 'Sessione scaduta — ricarica la pagina.',
  invalid_session: 'Sessione scaduta — ricarica la pagina.',
  not_staff_for_venue: 'Non autorizzato per questo locale.',
  order_not_found: 'Ordine non trovato.',
  order_cancelled: 'Ordine annullato — nulla da chiudere.',
  order_already_paid: 'Risulta già pagato.',
  cannot_close_already_paid: 'Il cliente ha già pagato online — verificato ora.',
  sumup_delete_indeterminate: 'Esito non determinabile — riprova.',
  payment_attempt_not_found: 'Pagamento non trovato.',
  invalid_attempt_status: 'Lo stato del pagamento è cambiato — verifica prima di riprovare.',
  internal_server_error: 'Errore del server — riprova.',
  server_configuration_error: 'Errore di configurazione server.',
};

const CLOSE_FOR_COUNTER_OUTCOME_LABELS = {
  closed_for_counter: 'Checkout online chiuso — ora puoi incassare al banco.',
  no_pending_attempt: 'Nessun pagamento online in sospeso per questo ordine.',
  unknown: 'Esito non determinabile — verifica manualmente.',
};

const CLOSE_FOR_COUNTER_OUTCOME_TONE = {
  closed_for_counter: 'ok',
  no_pending_attempt: 'neutral',
  unknown: 'warn',
};

function formatEuro(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function methodLabel(payment) {
  return METHOD_LABELS[payment.method] ?? payment.provider ?? 'Altro';
}

function orderLabel(payment) {
  return payment.order_code ?? `Ordine #${String(payment.order_id).slice(0, 6)}`;
}

// Stato operativo in italiano: mai stati tecnici grezzi (initiated, succeeded, failed...).
function statusInfo(p) {
  if (p.direction === 'refund') {
    if (p.status === 'succeeded') return { text: 'RIMBORSATO', cls: 'refunded' };
    if (p.status === 'failed') return { text: 'RIMBORSO FALLITO', cls: 'failed' };
    return { text: 'RIMBORSO IN CORSO', cls: 'pending' };
  }
  if (p.status === 'succeeded') return { text: 'PAGATO', cls: 'paid' };
  if (p.status === 'failed') return { text: 'RIFIUTATO', cls: 'failed' };
  return { text: 'IN CORSO', cls: 'pending' };
}

function failureNote(p) {
  if (p.status !== 'failed' || !p.failure_reason) return null;
  return FAILURE_REASON_LABELS[p.failure_reason] ?? 'motivo non specificato';
}

// Refund reale di produzione: sessione staff + endpoint SumUp. Override via prop `refundAction`
// per riusare questo stesso componente in un harness demo senza rete/Supabase.
async function liveRefundAction(orderId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: 'missing_session' };
  }

  const res = await fetch('/api/kitchen-sumup-refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await res.json();

  if (!res.ok) {
    return { ok: false, error: body.error };
  }
  return { ok: true, outcome: body.outcome };
}

const DEFAULT_CONFIRM_MESSAGE = 'Confermi il rimborso di questo ordine? L\'operazione avvia un rimborso reale su SumUp.';

const RECONCILE_OUTCOME_TONE = {
  already_paid: 'ok',
  confirmed: 'ok',
  no_pending_attempt: 'neutral',
  pending: 'neutral',
  failed: 'warn',
  unknown: 'warn',
};

function reconcileOutcomeMessage(body) {
  if (body.outcome === 'failed') {
    const reasonText = RECONCILE_FAILURE_REASON_LABELS[body.reason];
    let message = reasonText ? `Pagamento non riuscito (${reasonText}).` : 'Pagamento non riuscito.';
    if (body.retryable) message += ' Il cliente può riprovare al bancone.';
    return { text: message, tone: RECONCILE_OUTCOME_TONE.failed };
  }
  if (body.outcome === 'unknown') {
    const text = body.needs_manual_reconciliation
      ? 'Esito non determinabile — serve riconciliazione manuale.'
      : 'Esito non determinabile — verifica manualmente.';
    return { text, tone: RECONCILE_OUTCOME_TONE.unknown };
  }
  return {
    text: RECONCILE_OUTCOME_LABELS[body.outcome] ?? 'Esito sconosciuto.',
    tone: RECONCILE_OUTCOME_TONE[body.outcome] ?? 'neutral',
  };
}

// Verifica reale di produzione: sessione staff + endpoint SumUp. Override via prop `reconcileAction`
// per riusare questo stesso componente in un harness demo senza rete/Supabase.
async function liveReconcileAction(orderId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: 'missing_session' };
  }

  const res = await fetch('/api/kitchen-staff-sumup-reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await res.json();

  if (!res.ok) {
    return { ok: false, error: body.error };
  }
  return { ok: true, ...reconcileOutcomeMessage(body) };
}

function closeForCounterOutcomeMessage(body) {
  return {
    text: CLOSE_FOR_COUNTER_OUTCOME_LABELS[body.outcome] ?? 'Esito sconosciuto.',
    tone: CLOSE_FOR_COUNTER_OUTCOME_TONE[body.outcome] ?? 'neutral',
  };
}

// "Passa al pagamento al banco" reale di produzione: sessione staff + endpoint dedicato. Override
// via prop `closeForCounterAction` per riusare questo stesso componente in un harness demo senza
// rete/Supabase — stesso pattern di liveReconcileAction/liveRefundAction.
async function liveCloseForCounterAction(orderId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: 'missing_session' };
  }

  const res = await fetch('/api/kitchen-staff-sumup-close-for-counter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ order_id: orderId }),
  });
  const body = await res.json();

  if (!res.ok) {
    return { ok: false, error: body.error, message: CLOSE_FOR_COUNTER_ERROR_LABELS[body.error] };
  }
  return { ok: true, ...closeForCounterOutcomeMessage(body) };
}

/**
 * `usePaymentsData` e `refundAction` sono injection point opzionali: di default usano i dati/azioni
 * live (Supabase). Un harness demo può passare fixture locali + un'azione simulata senza toccare
 * questo componente né duplicarne la UI — vedi KitchenStaffDashboardDemo.jsx.
 */
export default function PaymentsView({
  usePaymentsData = useKitchenPayments,
  refundAction = liveRefundAction,
  reconcileAction = liveReconcileAction,
  closeForCounterAction = liveCloseForCounterAction,
  confirmRefundMessage = DEFAULT_CONFIRM_MESSAGE,
  confirmCloseForCounterMessage = CLOSE_FOR_COUNTER_CONFIRM_MESSAGE,
  visiblePaymentIds,
  visibleAnomalyIds,
  allowReconcileFailed = true,
} = {}) {
  // Selettore service night (Gate 1 approvato da Eros 2026-09-21): condiviso con Storico via
  // useSelectedServiceNight (modulo esterno) — stessa notte se lo staff naviga da Storico "Apri
  // Cassa →". Mostrato solo quando questa vista usa i dati LIVE reali (default `useKitchenPayments`):
  // gli harness demo/training passano un `usePaymentsData` custom con dataset statico, che il
  // selettore non avrebbe nulla da far navigare — nessuna modifica al loro comportamento.
  const isLiveData = usePaymentsData === useKitchenPayments;
  const { selectedServiceNight } = useSelectedServiceNight();
  const { loading, error, refresh, todaySummary, paymentsByMethod, anomalies, recentPayments, serviceNight } = usePaymentsData({ night: selectedServiceNight });
  // Stessa finestra dello Storico (06:00 -> 06:00): il titolo deve dire QUALE serata, altrimenti
  // dopo mezzanotte "oggi" e' ambiguo proprio quando serve di piu'. Gli harness demo non passano
  // serviceNight: in quel caso resta il titolo neutro.
  const nightLabel = formatServiceNightLabel(serviceNight);
  const visiblePayments = visiblePaymentIds
    ? recentPayments.filter((payment) => visiblePaymentIds.includes(payment.id))
    : recentPayments;
  const visibleAnomalies = visibleAnomalyIds
    ? anomalies.filter((anomaly) => visibleAnomalyIds.includes(anomaly.order_id))
    : anomalies;
  // order_id -> { status: 'loading'|'done'|'error', message }
  const [refundState, setRefundState] = useState({});
  // order_id -> { status: 'loading'|'done'|'error', message }
  const [reconcileState, setReconcileState] = useState({});
  // order_id -> { status: 'loading'|'done'|'error', message }
  const [closeForCounterState, setCloseForCounterState] = useState({});

  // Filtri "Pagamenti recenti" (CassaControlSection) — stato locale, nessun impatto su payment
  // state/RPC/fetch: filtrano solo cosa e' gia' in `visiblePayments`. Due gruppi combinabili
  // (METODO x STATO, sprint 2026-09-22 continuazione — corregge il filtro singolo a scelta
  // esclusiva della sessione precedente, che non copriva POS e non permetteva di incrociare
  // metodo+stato) piu' un terzo toggle indipendente per le anomalie.
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const anomalyOrderIds = useMemo(
    () => new Set(visibleAnomalies.map((a) => a.order_id)),
    [visibleAnomalies]
  );
  // Conteggi STATO generici su tutti i metodi (non solo SumUp) per i badge del gruppo STATO —
  // stesso criterio "in corso = initiated|pending" gia' usato da summarizeServiceNightPayments/
  // summarizePaymentsByMethod in kitchenServiceRules.js, qui senza toccare quella funzione
  // condivisa (usata anche da PaymentMixChart/StoricoView) ne' il suo scope SumUp-only.
  const statusCounts = useMemo(() => {
    const counts = { succeeded: 0, pending: 0, failed: 0 };
    visiblePayments.forEach((p) => {
      if (p.status === 'succeeded') counts.succeeded += 1;
      else if (p.status === 'initiated' || p.status === 'pending') counts.pending += 1;
      else if (p.status === 'failed') counts.failed += 1;
    });
    return counts;
  }, [visiblePayments]);
  const filteredPayments = useMemo(() => {
    return visiblePayments.filter((p) => {
      if (methodFilter !== 'all' && p.method !== methodFilter) return false;
      if (statusFilter === 'succeeded' && p.status !== 'succeeded') return false;
      if (statusFilter === 'pending' && !(p.status === 'initiated' || p.status === 'pending')) return false;
      if (statusFilter === 'failed' && p.status !== 'failed') return false;
      if (anomalyOnly && !anomalyOrderIds.has(p.order_id)) return false;
      return true;
    });
  }, [methodFilter, statusFilter, anomalyOnly, visiblePayments, anomalyOrderIds]);
  const hasActiveFilter = methodFilter !== 'all' || statusFilter !== 'all' || anomalyOnly;

  // Fullscreen/tablet, auto all'apertura (Cassa Payment Hub, sprint 2026-09-22 continuazione):
  // tocca solo layout, nessuno stato pagamenti. Solo su dati LIVE (isLiveData, stesso gate di
  // ServiceNightSelector sopra): `manualKiosk` parte gia' attivo cosi' la modalita' full-viewport
  // (classe CSS "kiosk") e' garantita subito, indipendentemente dal supporto/esito della vera
  // Fullscreen API — quella resta un tentativo aggiuntivo (qui e/o dal click di navigazione che ha
  // portato a questa pagina, vedi requestFullscreenBestEffort in useFullscreenToggle.js). Gli
  // harness demo/training restano com'erano (kiosk disattivo, solo toggle manuale): la loro guida
  // a coach-tip assume la tipografia normale, non quella ingrandita del kiosk.
  const { isFullscreen, isSupported: fullscreenSupported, toggleFullscreen } = useFullscreenToggle();
  const [manualKiosk, setManualKiosk] = useState(isLiveData);
  const kioskActive = isFullscreen || manualKiosk;
  useEffect(() => {
    if (isLiveData && fullscreenSupported && !isFullscreen) {
      // Tentativo automatico all'apertura: se non c'e' un gesture utente disponibile (es. refresh
      // diretto su questa route) il browser lo rifiuta silenziosamente — errore gia' catturato
      // dentro toggleFullscreen, il layout resta comunque full-viewport via manualKiosk sopra.
      toggleFullscreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleFullscreenToggle = () => {
    setManualKiosk((prev) => !prev);
    if (fullscreenSupported) {
      toggleFullscreen();
    }
  };
  const handleBackToStaff = () => {
    if (document.exitFullscreen && (document.fullscreenElement || document.webkitFullscreenElement)) {
      document.exitFullscreen().catch(() => {});
    }
    window.history.pushState({}, '', '/kitchen/solo');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const handleReconcile = async (orderId) => {
    setReconcileState((prev) => ({ ...prev, [orderId]: { status: 'loading', message: null } }));

    try {
      const result = await reconcileAction(orderId);

      if (!result.ok) {
        const message = RECONCILE_ERROR_LABELS[result.error] ?? 'Errore imprevisto — riprova.';
        setReconcileState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: 'warn', message } }));
        refresh();
        return;
      }

      setReconcileState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: result.tone, message: result.text } }));
      refresh();
    } catch {
      setReconcileState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: 'warn', message: 'Errore di rete — riprova.' } }));
    }
  };

  const handleCloseForCounter = async (orderId) => {
    if (!window.confirm(confirmCloseForCounterMessage)) return;

    setCloseForCounterState((prev) => ({ ...prev, [orderId]: { status: 'loading', message: null } }));

    try {
      const result = await closeForCounterAction(orderId);

      if (!result.ok) {
        const message = result.message ?? CLOSE_FOR_COUNTER_ERROR_LABELS[result.error] ?? 'Errore imprevisto — riprova.';
        setCloseForCounterState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: 'warn', message } }));
        refresh();
        return;
      }

      setCloseForCounterState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: result.tone, message: result.text } }));
      refresh();
    } catch {
      setCloseForCounterState((prev) => ({ ...prev, [orderId]: { status: 'done', tone: 'warn', message: 'Errore di rete — riprova.' } }));
    }
  };

  const handleRefund = async (orderId) => {
    if (!window.confirm(confirmRefundMessage)) return;

    setRefundState((prev) => ({ ...prev, [orderId]: { status: 'loading', message: null } }));

    try {
      const result = await refundAction(orderId);

      if (!result.ok) {
        const message = REFUND_ERROR_LABELS[result.error] ?? 'Errore imprevisto — riprova.';
        setRefundState((prev) => ({ ...prev, [orderId]: { status: 'error', message } }));
        return;
      }

      const isSettled = result.outcome === 'refunded' || result.outcome === 'already_refunded';
      const message = REFUND_OUTCOME_LABELS[result.outcome] ?? 'Esito sconosciuto.';
      setRefundState((prev) => ({ ...prev, [orderId]: { status: isSettled ? 'done' : 'error', message } }));
      refresh();
    } catch {
      setRefundState((prev) => ({ ...prev, [orderId]: { status: 'error', message: 'Errore di rete — riprova.' } }));
    }
  };

  if (loading) {
    return <div className="kpd-empty">Caricamento pagamenti…</div>;
  }

  // Refundabile solo se: charge riuscito E per quell'ordine non esiste già un rimborso (in corso o completato).
  const refundedOrderIds = new Set(
    recentPayments.filter((p) => p.direction === 'refund').map((p) => p.order_id)
  );

  return (
    <div className={`kpd-page${kioskActive ? ' kpd-page--kiosk' : ''}`}>

      <div className="kpd-fullscreen-row">
        {isLiveData && (
          <button
            type="button"
            className="kpd-staff-back-btn"
            data-testid="kpd-back-to-staff"
            onClick={handleBackToStaff}
          >
            ← STAFF
          </button>
        )}
        <button
          type="button"
          className="kpd-fullscreen-btn"
          data-testid="kpd-fullscreen-toggle"
          onClick={handleFullscreenToggle}
        >
          {kioskActive ? 'ESCI FULLSCREEN' : 'FULLSCREEN'}
        </button>
      </div>

      {isLiveData && <ServiceNightSelector />}

      {error && (
        <div style={{ background: '#3a0808', border: '1px solid #ef444455', color: '#ef4444', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* DA CONTROLLARE — Kitchen Analytics V1 Fase 9B: rinominato da "⚠ Attenzione" per non
          confondersi con AttentionSection di StoricoView (contenuto diverso: qui solo anomalie
          pagamento, sempre visibile; li' pending/falliti/annullati/anomalie, solo se >0). */}
      <div>
        <div className="kpd-section-title kpd-attention-title">DA CONTROLLARE</div>
        {visibleAnomalies.length === 0 ? (
          <div className="kpd-attention-empty">Nessuna anomalia 🟢</div>
        ) : (
          <div className="kpd-attention-list">
            {visibleAnomalies.map((a, i) => (
              <div key={`${a.order_id}-${a.drift_type}-${i}`} className="kpd-attention-card">
                <div className="kpd-attention-icon">⚠️</div>
                <div className="kpd-attention-body">
                  <div className="kpd-attention-order">{a.order_code ?? `Ordine #${String(a.order_id).slice(0, 6)}`}</div>
                  <div className="kpd-attention-reason">{ANOMALY_REASON_LABELS[a.drift_type] ?? ANOMALY_REASON_FALLBACK}</div>
                  <div className="kpd-attention-hint">{ANOMALY_HINT_LABELS[a.drift_type] ?? ANOMALY_HINT_FALLBACK}</div>
                </div>
                {a.total != null && <div className="kpd-attention-amount">{formatEuro(a.total)}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CONTROLLO SERATA / CASSA — Kitchen Analytics V1 Fase 2, sostituisce "Cassa serata" */}
      <CassaControlSection
        nightLabel={nightLabel}
        todaySummary={todaySummary}
        paymentsByMethod={paymentsByMethod}
        anomalyCount={visibleAnomalies.length}
        methodFilter={methodFilter}
        onMethodFilterChange={setMethodFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        anomalyOnly={anomalyOnly}
        onAnomalyOnlyChange={setAnomalyOnly}
      />

      {/* PAGAMENTI RECENTI */}
      <div>
        <div className="kpd-section-title">Pagamenti recenti</div>
        {filteredPayments.length === 0 ? (
          <div className="kpd-empty">
            {hasActiveFilter ? 'Nessun pagamento per questo filtro.' : 'Nessun pagamento registrato.'}
          </div>
        ) : (
          <div className="kpd-payments-list">
            {filteredPayments.map((p) => {
              const canRefund = p.direction === 'charge' && p.status === 'succeeded' && !refundedOrderIds.has(p.order_id);
              const canReconcile = p.direction === 'charge' && p.provider === 'sumup' && p.status !== 'succeeded'
                && (allowReconcileFailed || p.status !== 'failed');
              // "Passa al pagamento al banco": per un checkout SumUp ancora aperto (initiated/
              // pending), OPPURE già 'failed' ma ancora nella same-checkout retry window di F03
              // (failure_reason='sumup_failed' — carta rifiutata, checkout ancora riattivabile).
              // Un 'failed' con un altro motivo (già chiuso, scaduto, annullato) resta dominio
              // esclusivo della ri-verifica autoritativa (VERIFICA STATO).
              const canCloseForCounter = p.direction === 'charge' && p.provider === 'sumup'
                && (p.status === 'initiated' || p.status === 'pending'
                  || (p.status === 'failed' && p.failure_reason === 'sumup_failed'));
              const state = refundState[p.order_id];
              const rState = reconcileState[p.order_id];
              const cState = closeForCounterState[p.order_id];
              const info = statusInfo(p);
              const note = failureNote(p);
              return (
                <div key={p.id} className="kpd-payment-row" data-testid={`payment-row-${p.id}`}>
                  <span className="kpd-payment-time">{formatTime(p.created_at)}</span>
                  <span className="kpd-payment-order">
                    {orderLabel(p)}
                    {p.nickname && <span className="kpd-payment-nickname"> · {p.nickname}</span>}
                  </span>
                  <span className="kpd-payment-amount">{formatEuro(p.amount)}</span>
                  <span className="kpd-payment-method">
                    {methodLabel(p)}{note ? ` · ${note}` : ''}
                  </span>
                  <span className={`kpd-payment-status kpd-status--${info.cls}`}>{info.text}</span>

                  {canRefund && (
                    <div className="kpd-payment-refund-row">
                      <button
                        className="ksd-btn-reset"
                        data-testid={`refund-btn-${p.order_id}`}
                        disabled={state?.status === 'loading' || state?.status === 'done'}
                        onClick={() => handleRefund(p.order_id)}
                      >
                        {state?.status === 'loading' ? 'RIMBORSO IN CORSO…' : state?.status === 'done' ? 'RIMBORSATO' : 'RIMBORSA'}
                      </button>
                      {state?.message && (
                        <span className="kpd-refund-msg" style={{ color: state.status === 'error' ? '#ef4444' : '#4ade80' }}>
                          {state.message}
                        </span>
                      )}
                    </div>
                  )}

                  {canReconcile && (
                    <div className="kpd-payment-refund-row">
                      <button
                        className="ksd-btn-reset"
                        data-testid={`reconcile-btn-${p.order_id}`}
                        disabled={rState?.status === 'loading'}
                        onClick={() => handleReconcile(p.order_id)}
                      >
                        {rState?.status === 'loading' ? 'VERIFICA IN CORSO…' : 'VERIFICA STATO'}
                      </button>
                      {rState?.message && (
                        <span
                          className="kpd-refund-msg"
                          style={{ color: rState.tone === 'warn' ? '#f59e0b' : rState.tone === 'ok' ? '#4ade80' : 'rgba(245,240,232,0.7)' }}
                        >
                          {rState.message}
                        </span>
                      )}
                    </div>
                  )}

                  {canCloseForCounter && (
                    <div className="kpd-payment-refund-row">
                      <button
                        className="ksd-btn-reset"
                        data-testid={`close-for-counter-btn-${p.order_id}`}
                        disabled={cState?.status === 'loading'}
                        onClick={() => handleCloseForCounter(p.order_id)}
                      >
                        {cState?.status === 'loading' ? 'CHIUSURA IN CORSO…' : 'PASSA AL BANCO'}
                      </button>
                      {cState?.message && (
                        <span
                          className="kpd-refund-msg"
                          style={{ color: cState.tone === 'warn' ? '#f59e0b' : cState.tone === 'ok' ? '#4ade80' : 'rgba(245,240,232,0.7)' }}
                        >
                          {cState.message}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
