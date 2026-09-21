// Kitchen Analytics V1 — Fase 3 (KPI STRIP), consolidata in Fase 9B.
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §KPI, §IMPLEMENTATION_PHASES;
// ai-ops/reports/kitchen-analytics-phase9a-ux-audit-20260921.md (decisione Eros Fase 9B).
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo di aggregazione — riceve i
// valori gia' calcolati/formattati da StoricoView (paymentsSummary da useKitchenPayments,
// reportOggi derivato localmente). Ticket medio = netto / pagamenti succeeded
// (paymentsSummary.incassiRiusciti), non piu' netto / ordini consegnati. Incasso/Netto/Ticket
// medio arrivano gia' come stringa ('—' quando paymentsSummary non e' disponibile, stessa policy
// del resto di StoricoView: mai inventare importi).
//
// Fase 9B: 4 tile fisse (Incasso, Ordini, Ticket medio, Netto) — Annullati/In sospeso/Falliti
// spostati esclusivamente in AttentionSection, mai duplicati qui.
export default function AnalyticsKpiStrip({
  incassoDisplay,
  nettoDisplay,
  ticketMedioDisplay,
  ordiniConsegnati,
}) {
  return (
    <div className="kpd-kpi-grid" data-testid="analytics-kpi-strip">
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Incasso</span>
        <span className="kpd-cash-value" style={{ color: '#4ade80' }} data-testid="kpi-incasso">
          {incassoDisplay}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Ordini</span>
        <span className="kpd-cash-value" style={{ color: '#4ade80' }} data-testid="kpi-ordini-consegnati">
          {ordiniConsegnati}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Ticket medio</span>
        <span className="kpd-cash-value" style={{ color: '#60a5fa' }} data-testid="kpi-ticket-medio">
          {ticketMedioDisplay}
        </span>
      </div>
      <div className="kpd-cash-tile">
        <span className="kpd-cash-label">Netto</span>
        <span className="kpd-cash-value" style={{ color: '#facc15' }} data-testid="kpi-netto">
          {nettoDisplay}
        </span>
      </div>
    </div>
  );
}
