import { useState } from 'react';
import { useKitchenPayments } from '../hooks/useKitchenPayments';
import { supabase } from '../lib/supabaseClient';

const DRIFT_LABELS = {
  paid_without_verifiable_charge: 'Segnato pagato ma manca la prova del pagamento',
  refunded_without_verifiable_refund: 'Segnato rimborsato ma manca la prova del rimborso',
  refund_stuck_initiated: 'Rimborso avviato ma non ancora confermato',
  failed_charge_retry_window_open: 'Pagamento fallito — il cliente può ancora riprovare',
};

const METHOD_LABELS = {
  sumup_online: 'Carta (online)',
  sumup_pos: 'Carta (POS)',
  satispay_app: 'Satispay',
  cash: 'Contanti',
  manual_comp: 'Omaggio',
  manual_other: 'Manuale',
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

function formatEuro(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function methodLabel(payment) {
  return METHOD_LABELS[payment.method] ?? payment.method ?? payment.provider;
}

export default function PaymentsView() {
  const { loading, error, refresh, todaySummary, anomalies, recentPayments } = useKitchenPayments();
  // order_id -> { status: 'loading'|'done'|'error', message }
  const [refundState, setRefundState] = useState({});

  const handleRefund = async (orderId) => {
    if (!window.confirm('Confermi il rimborso di questo ordine? L\'operazione avvia un rimborso reale su SumUp.')) return;

    setRefundState((prev) => ({ ...prev, [orderId]: { status: 'loading', message: null } }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setRefundState((prev) => ({ ...prev, [orderId]: { status: 'error', message: REFUND_ERROR_LABELS.missing_session } }));
        return;
      }

      const res = await fetch('/api/kitchen-sumup-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ order_id: orderId }),
      });
      const body = await res.json();

      if (!res.ok) {
        const message = REFUND_ERROR_LABELS[body.error] ?? 'Errore imprevisto — riprova.';
        setRefundState((prev) => ({ ...prev, [orderId]: { status: 'error', message } }));
        return;
      }

      const isSettled = body.outcome === 'refunded' || body.outcome === 'already_refunded';
      const message = REFUND_OUTCOME_LABELS[body.outcome] ?? 'Esito sconosciuto.';
      setRefundState((prev) => ({ ...prev, [orderId]: { status: isSettled ? 'done' : 'error', message } }));
      refresh();
    } catch {
      setRefundState((prev) => ({ ...prev, [orderId]: { status: 'error', message: 'Errore di rete — riprova.' } }));
    }
  };

  if (loading) {
    return <div className="ksd-empty">Caricamento pagamenti…</div>;
  }

  return (
    <div className="ksd-sections">
      <div className="ksd-history" style={{ borderTop: 'none' }}>
        <div className="ksd-history-body">

          {error && (
            <div style={{ background: '#3a0808', border: '1px solid #ef444455', color: '#ef4444', borderRadius: '8px', padding: '0.6rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          {/* Cassa oggi */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Cassa oggi
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incassato</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{formatEuro(todaySummary.incasso)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rimborsato</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171' }}>{formatEuro(todaySummary.rimborsato)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Netto</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#facc15' }}>{formatEuro(todaySummary.netto)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In sospeso</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: todaySummary.inSospeso > 0 ? '#f59e0b' : '#6b7280' }}>{formatEuro(todaySummary.inSospeso)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tentativi falliti</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: todaySummary.falliti > 0 ? '#f87171' : '#6b7280' }}>{todaySummary.falliti}</span>
              </div>
            </div>
          </div>

          {/* Anomalie */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Anomalie
            </div>
            {anomalies.length === 0 ? (
              <div className="ksd-empty" style={{ padding: '1rem', color: '#10b981' }}>Nessuna anomalia 🟢</div>
            ) : (
              <div className="ksd-row-list">
                {anomalies.map((a, i) => (
                  <div key={`${a.order_id}-${a.drift_type}-${i}`} className="ksd-row" style={{ borderLeft: '3px solid #ef4444' }}>
                    <div className="ksd-row-left">
                      <span className="ksd-row-nickname">#{String(a.order_id).slice(0, 8)}</span>
                    </div>
                    <div className="ksd-row-center">
                      <div style={{ fontSize: '13px', color: '#e2e8f0' }}>{DRIFT_LABELS[a.drift_type] ?? a.drift_type}</div>
                    </div>
                    <div className="ksd-row-right">
                      {a.total != null && <span className="ksd-history-total">{formatEuro(a.total)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Storico recente */}
          <div>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Pagamenti recenti
            </div>
            {recentPayments.length === 0 ? (
              <div className="ksd-history-empty">Nessun pagamento registrato.</div>
            ) : (
              <div className="ksd-history-list">
                {recentPayments.map((p) => {
                  const canRefund = p.direction === 'charge' && p.status === 'succeeded';
                  const state = refundState[p.order_id];
                  return (
                    <div key={p.id} className="ksd-history-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <div className="ksd-history-row-left">
                          <span className="ksd-row-code">#{String(p.order_id).slice(0, 8)}</span>
                          <span className="ksd-row-time">{formatTime(p.created_at)}</span>
                        </div>
                        <div className="ksd-history-row-center">
                          <div className="ksd-row-items">
                            {p.direction === 'refund' ? 'Rimborso' : 'Pagamento'} · {methodLabel(p)}
                            {p.status === 'failed' && p.failure_reason ? ` · ${p.failure_reason}` : ''}
                          </div>
                        </div>
                        <div className="ksd-history-row-right">
                          <span className="ksd-history-total">{formatEuro(p.amount)}</span>
                          <span className={`ksd-history-status ksd-history-status--${p.status === 'succeeded' ? 'delivered' : 'cancelled'}`}>
                            {p.status === 'succeeded' ? 'OK' : p.status === 'failed' ? 'FALLITO' : p.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {canRefund && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                          <button
                            className="ksd-btn-reset"
                            disabled={state?.status === 'loading' || state?.status === 'done'}
                            onClick={() => handleRefund(p.order_id)}
                          >
                            {state?.status === 'loading' ? 'RIMBORSO IN CORSO…' : state?.status === 'done' ? 'RIMBORSATO' : 'RIMBORSA'}
                          </button>
                          {state?.message && (
                            <span style={{ fontSize: '0.75rem', color: state.status === 'error' ? '#ef4444' : '#4ade80' }}>
                              {state.message}
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
      </div>
    </div>
  );
}
