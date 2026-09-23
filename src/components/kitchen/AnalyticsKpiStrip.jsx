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
// Fase 9B: 4 tile fisse (Incasso, Consegnati, Ticket medio, Rimborsi) — Annullati/In sospeso/Falliti
// spostati esclusivamente in AttentionSection, mai duplicati qui.
// Decisione prodotto (2026-09-23, ai-ops/reports/audit-storico-incasso-netto.md): la card "Netto"
// era ridondante con "Incasso" (che ora mostra il valore gia' netto di rimborsi, invariata la
// formula sottostante in kitchenServiceRules.summarizeServiceNightPayments) — sostituita da
// "Rimborsi", cifra separata gia' calcolata (paymentsSummary.rimborsato). "Ordini" rinominato in
// "Consegnati" per non essere confuso col conteggio totale ordini (che include gli annullati).
export default function AnalyticsKpiStrip({
  incassoDisplay,
  rimborsiDisplay,
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
        <span className="kpd-cash-label">Consegnati</span>
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
        <span className="kpd-cash-label">Rimborsi</span>
        <span className="kpd-cash-value" style={{ color: '#facc15' }} data-testid="kpi-rimborsi">
          {rimborsiDisplay}
        </span>
      </div>
    </div>
  );
}
