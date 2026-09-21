// Kitchen Analytics V1 — Fase 4 (ATTENZIONE, Storico), layout consolidato in Fase 9B.
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §FINAL_PAGE_STRUCTURE punto 3,
// §ACCEPTANCE_CRITERIA AC2; ai-ops/reports/kitchen-analytics-phase9a-ux-audit-20260921.md
// (decisione Eros Fase 9B: unico posto per Annullati/In sospeso/Falliti, mai piu' nella KPI strip).
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo di aggregazione — riceve valori
// gia' calcolati da StoricoView (paymentsSummary.inSospeso/.falliti gia' letti da
// useKitchenPayments, reportOggi.annullati derivato localmente, anomalies gia' letto da
// useKitchenPayments/usePreviewKitchenNightPayments). Zero nuove query, zero nuova capability.
//
// AC2: la sezione non occupa spazio se pending/falliti/annullati/anomalie sono tutti a zero —
// ritorna null, non un empty-state (diverso dal blocco "DA CONTROLLARE" di PaymentsView, che
// mostra sempre un placeholder "Nessuna anomalia").
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
      <div className="kpd-attention-badges">
        {hasPending && (
          <span className="kpd-attention-badge" data-testid="attention-pending">
            <span className="kpd-attention-badge-label">In sospeso</span>
            <span className="kpd-attention-badge-value" style={{ color: '#f59e0b' }}>
              {`€ ${Number(pendingAmount).toFixed(2)}`}
            </span>
          </span>
        )}
        {hasFailed && (
          <span className="kpd-attention-badge" data-testid="attention-failed">
            <span className="kpd-attention-badge-label">Falliti</span>
            <span className="kpd-attention-badge-value" style={{ color: '#f87171' }}>
              {failedCount}
            </span>
          </span>
        )}
        {hasCancelled && (
          <span className="kpd-attention-badge" data-testid="attention-cancelled">
            <span className="kpd-attention-badge-label">Annullati</span>
            <span className="kpd-attention-badge-value" style={{ color: '#f87171' }}>
              {cancelledCount}
            </span>
          </span>
        )}
        {hasAnomalies && (
          <span className="kpd-attention-badge" data-testid="attention-anomalies">
            <span className="kpd-attention-badge-label">Anomalie</span>
            <span className="kpd-attention-badge-value" style={{ color: '#f87171' }}>
              {anomalyCount}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
