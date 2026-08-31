import { useState } from 'react';
import { usePreviewKitchenPayments } from './kitchenStaffPaymentsDemoFixtures';
import './PaymentsViewDemo.css';

const METHOD_LABELS = {
  sumup_online: 'Carta (online)',
  sumup_pos: 'Carta (POS)',
  satispay_app: 'Satispay',
  cash: 'Contanti',
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

/**
 * Demo/preview read-only: console operativa staff per il tab PAGAMENTI, dati locali
 * (kitchenStaffPaymentsDemoFixtures.js). Zero Supabase, zero fetch.
 * Il pulsante RIMBORSA è simulato: aggiorna solo lo stato locale del componente.
 */
export default function PaymentsViewDemo() {
  const { loading, error, todaySummary, anomalies, recentPayments } = usePreviewKitchenPayments();
  const [refundState, setRefundState] = useState({});

  const handleSimulatedRefund = (orderId) => {
    setRefundState((prev) => ({ ...prev, [orderId]: { status: 'done', message: 'Rimborso simulato (nessuna chiamata reale).' } }));
  };

  if (loading) {
    return <div className="kpd-empty">Caricamento pagamenti…</div>;
  }

  // Refundabile solo se: charge riuscito E per quell'ordine non esiste già un rimborso (in corso o completato).
  const refundedOrderIds = new Set(
    recentPayments.filter((p) => p.direction === 'refund').map((p) => p.order_id)
  );

  return (
    <div className="kpd-page">

      {error && (
        <div style={{ background: '#3a0808', border: '1px solid #ef444455', color: '#ef4444', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* ATTENZIONE */}
      <div>
        <div className="kpd-section-title kpd-attention-title">⚠ Attenzione</div>
        {anomalies.length === 0 ? (
          <div className="kpd-attention-empty">Nessuna anomalia 🟢</div>
        ) : (
          <div className="kpd-attention-list">
            {anomalies.map((a, i) => (
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

      {/* CASSA OGGI */}
      <div>
        <div className="kpd-section-title">Cassa oggi</div>
        <div className="kpd-cash-grid">
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Incassato</span>
            <span className="kpd-cash-value" style={{ color: '#4ade80' }}>{formatEuro(todaySummary.incasso)}</span>
          </div>
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Rimborsato</span>
            <span className="kpd-cash-value" style={{ color: '#f87171' }}>{formatEuro(todaySummary.rimborsato)}</span>
          </div>
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Netto</span>
            <span className="kpd-cash-value" style={{ color: '#facc15' }}>{formatEuro(todaySummary.netto)}</span>
          </div>
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">In sospeso</span>
            <span className="kpd-cash-value" style={{ color: todaySummary.inSospeso > 0 ? '#f59e0b' : 'rgba(245,240,232,0.4)' }}>{formatEuro(todaySummary.inSospeso)}</span>
          </div>
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Tentativi falliti</span>
            <span className="kpd-cash-value" style={{ color: todaySummary.falliti > 0 ? '#f87171' : 'rgba(245,240,232,0.4)' }}>{todaySummary.falliti}</span>
          </div>
        </div>
      </div>

      {/* PAGAMENTI RECENTI */}
      <div>
        <div className="kpd-section-title">Pagamenti recenti</div>
        {recentPayments.length === 0 ? (
          <div className="kpd-empty">Nessun pagamento registrato.</div>
        ) : (
          <div className="kpd-payments-list">
            {recentPayments.map((p) => {
              const canRefund = p.direction === 'charge' && p.status === 'succeeded' && !refundedOrderIds.has(p.order_id);
              const state = refundState[p.order_id];
              const info = statusInfo(p);
              const note = failureNote(p);
              return (
                <div key={p.id} className="kpd-payment-row">
                  <span className="kpd-payment-order">{orderLabel(p)}</span>
                  <span className="kpd-payment-method">
                    {methodLabel(p)}{note ? ` · ${note}` : ''}
                  </span>
                  <span className="kpd-payment-amount">{formatEuro(p.amount)}</span>
                  <span className="kpd-payment-time">{formatTime(p.created_at)}</span>
                  <span className={`kpd-payment-status kpd-status--${info.cls}`}>{info.text}</span>

                  {canRefund && (
                    <div className="kpd-payment-refund-row">
                      <button
                        className="ksd-btn-reset"
                        data-testid="demo-simulated-refund"
                        disabled={state?.status === 'done'}
                        onClick={() => handleSimulatedRefund(p.order_id)}
                      >
                        {state?.status === 'done' ? 'RIMBORSATO (SIMULATO)' : 'RIMBORSA (SIMULATO)'}
                      </button>
                      {state?.message && <span className="kpd-refund-msg">{state.message}</span>}
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
