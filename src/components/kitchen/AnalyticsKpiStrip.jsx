// Kitchen Analytics V1 — Fase 3 (KPI STRIP).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §KPI, §IMPLEMENTATION_PHASES.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo di aggregazione — riceve i
// valori gia' calcolati/formattati da StoricoView (paymentsSummary da useKitchenPayments,
// reportOggi derivato localmente). Ticket medio = netto / pagamenti succeeded
// (paymentsSummary.incassiRiusciti), non piu' netto / ordini consegnati. Incasso/Netto/Ticket
// medio arrivano gia' come stringa ('—' quando paymentsSummary non e' disponibile, stessa policy
// del resto di StoricoView: mai inventare importi). In sospeso e Falliti sono evidenziati solo
// se > 0 (valori falsy/null nascondono la tile, AC2-style).
export default function AnalyticsKpiStrip({
  incassoDisplay,
  nettoDisplay,
  ticketMedioDisplay,
  ordiniConsegnati,
  annullati,
  inSospeso,
  falliti,
}) {
  return (
    <div className="kpd-cash-grid" data-testid="analytics-kpi-strip">
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Incasso</span>
        <span className="kpd-cash-value" style={{ color: '#4ade80' }} data-testid="kpi-incasso">
          {incassoDisplay}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Netto</span>
        <span className="kpd-cash-value" style={{ color: '#facc15' }} data-testid="kpi-netto">
          {nettoDisplay}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Ticket medio</span>
        <span className="kpd-cash-value" style={{ color: '#60a5fa' }} data-testid="kpi-ticket-medio">
          {ticketMedioDisplay}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Ordini consegnati</span>
        <span className="kpd-cash-value" style={{ color: '#4ade80' }} data-testid="kpi-ordini-consegnati">
          {ordiniConsegnati}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Annullati</span>
        <span
          className="kpd-cash-value"
          style={{ color: annullati > 0 ? '#f87171' : 'rgba(245,240,232,0.4)' }}
          data-testid="kpi-annullati"
        >
          {annullati}
        </span>
      </div>
      {inSospeso > 0 && (
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">In sospeso</span>
          <span className="kpd-cash-value" style={{ color: '#f59e0b' }} data-testid="kpi-in-sospeso">
            {`€ ${Number(inSospeso).toFixed(2)}`}
          </span>
        </div>
      )}
      {falliti > 0 && (
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">Falliti</span>
          <span className="kpd-cash-value" style={{ color: '#f87171' }} data-testid="kpi-falliti">
            {falliti}
          </span>
        </div>
      )}
    </div>
  );
}
