// Kitchen Analytics V1 — Fase 4 (ATTENZIONE, Storico).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §FINAL_PAGE_STRUCTURE punto 3,
// §IMPLEMENTATION_PHASES fase 4, §ACCEPTANCE_CRITERIA AC2.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo di aggregazione — riceve valori
// gia' calcolati da StoricoView (paymentsSummary.inSospeso/.falliti gia' letti da
// useKitchenPayments, reportOggi.annullati derivato localmente, anomalies gia' letto da
// useKitchenPayments/usePreviewKitchenNightPayments). Zero nuove query, zero nuova capability.
//
// AC2: la sezione non occupa spazio se pending/falliti/annullati/anomalie sono tutti a zero —
// ritorna null, non un empty-state (diverso dal blocco "⚠ Attenzione" di PaymentsView, che mostra
// sempre un placeholder "Nessuna anomalia").
export default function AttentionSection({
  pendingAmount = 0,
  failedCount = 0,
  cancelledCount = 0,
  anomalyCount = 0,
}) {
  const hasPending = pendingAmount > 0;
  const hasFailed = failedCount > 0;
  const hasCancelled = cancelledCount > 0;
  const hasAnomalies = anomalyCount > 0;

  if (!hasPending && !hasFailed && !hasCancelled && !hasAnomalies) return null;

  return (
    <div data-testid="storico-attention-section" style={{ marginBottom: '1rem' }}>
      <div className="kpd-section-title kpd-attention-title">⚠ Attenzione</div>
      <div className="kpd-cash-grid">
        {hasPending && (
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Pagamenti in sospeso</span>
            <span className="kpd-cash-value" style={{ color: '#f59e0b' }} data-testid="attention-pending">
              {`€ ${Number(pendingAmount).toFixed(2)}`}
            </span>
          </div>
        )}
        {hasFailed && (
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Pagamenti falliti</span>
            <span className="kpd-cash-value" style={{ color: '#f87171' }} data-testid="attention-failed">
              {failedCount}
            </span>
          </div>
        )}
        {hasCancelled && (
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Ordini annullati</span>
            <span className="kpd-cash-value" style={{ color: '#f87171' }} data-testid="attention-cancelled">
              {cancelledCount}
            </span>
          </div>
        )}
        {hasAnomalies && (
          <div className="kpd-cash-tile">
            <span className="kpd-cash-label">Anomalie pagamento</span>
            <span className="kpd-cash-value" style={{ color: '#f87171' }} data-testid="attention-anomalies">
              {anomalyCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
