// Kitchen Analytics V1 — Fase 2 (CONTROLLO SERATA/CASSA).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §CASH_SECTION.
//
// Presentazione pura: nessun fetch, nessuno stato. Legge solo `todaySummary` (invariato,
// stesso dato gia' mostrato da PaymentsView) e `paymentsByMethod` (Fase 1,
// useKitchenPayments.js / kitchenServiceRules.summarizePaymentsByMethod), piu' il conteggio
// anomalie gia' calcolato da PaymentsView per il blocco "⚠ Attenzione" (nessun nuovo calcolo
// di drift, solo riuso — AC5). Sostituisce il vecchio blocco "Cassa serata" di PaymentsView.jsx.
//
// METHOD_LABELS e' intenzionalmente duplicato da PaymentsView.jsx (stesso dizionario statico a 7
// voci) per evitare un import circolare PaymentsView <-> CassaControlSection.
const METHOD_LABELS = {
  cash: 'Contanti',
  card_counter_manual: 'Carta/POS banco',
  sumup_online: 'SumUp online',
  sumup_pos: 'SumUp POS',
  satispay_app: 'Satispay',
  manual_comp: 'Omaggio',
  manual_other: 'Manuale',
};

const EMPTY_SUMUP = { succeeded: 0, pending: 0, failed: 0 };

function formatEuro(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * `paymentsByMethod` = { byMethod: { [method]: {incasso, rimborsato, netto} }, sumup: {succeeded, pending, failed} }.
 * `anomalyCount` = numero di anomalie gia' visibile nel blocco "⚠ Attenzione" sopra (AC5: stesso dato, non ricalcolato).
 * `activeFilter`/`onFilterChange` = filtri cliccabili sulla lista "Pagamenti recenti" sotto (Cassa
 * Payment Hub, 2026-09-22). Componente resta presentazionale: lo stato del filtro vive in
 * PaymentsView, qui solo bottoni + classe attiva. I 3 filtri SumUp (riusciti/in corso/falliti)
 * restano SumUp-only, coerenti col badge esistente — nessuna estensione di significato.
 */
export default function CassaControlSection({
  nightLabel,
  todaySummary,
  paymentsByMethod,
  anomalyCount = 0,
  activeFilter = 'all',
  onFilterChange,
}) {
  const setFilter = (value) => onFilterChange?.(value);
  const byMethod = paymentsByMethod?.byMethod ?? {};
  const sumup = paymentsByMethod?.sumup ?? EMPTY_SUMUP;
  // Righe data-driven (solo i metodi presenti nella finestra serata), ordinate per incasso decrescente.
  const methods = Object.keys(byMethod).sort((a, b) => byMethod[b].incasso - byMethod[a].incasso);

  return (
    <div data-testid="cassa-control-section">
      <div className="kpd-section-title">
        {nightLabel ? `Controllo serata / cassa ${nightLabel}` : 'Controllo serata / cassa'}
      </div>

      <div className="kpd-cash-grid">
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">Incasso totale</span>
          <span className="kpd-cash-value" style={{ color: '#4ade80' }} data-testid="cassa-total-incasso">
            {formatEuro(todaySummary.incasso)}
          </span>
        </div>
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">Rimborsato</span>
          <span className="kpd-cash-value" style={{ color: '#f87171' }} data-testid="cassa-total-rimborsato">
            {formatEuro(todaySummary.rimborsato)}
          </span>
        </div>
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">Netto</span>
          <span className="kpd-cash-value" style={{ color: '#facc15' }} data-testid="cassa-total-netto">
            {formatEuro(todaySummary.netto)}
          </span>
        </div>
        {/* Invariati dal vecchio blocco "Cassa serata": stesso dato (todaySummary), nessuna
            funzionalita' persa nella sostituzione richiesta dalla FINAL SPEC §CASH_SECTION. */}
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">In sospeso</span>
          <span
            className="kpd-cash-value"
            style={{ color: todaySummary.inSospeso > 0 ? '#f59e0b' : 'rgba(245,240,232,0.4)' }}
            data-testid="cassa-total-insospeso"
          >
            {formatEuro(todaySummary.inSospeso)}
          </span>
        </div>
        <div className="kpd-cash-tile">
          <span className="kpd-cash-label">Tentativi falliti</span>
          <span
            className="kpd-cash-value"
            style={{ color: todaySummary.falliti > 0 ? '#f87171' : 'rgba(245,240,232,0.4)' }}
            data-testid="cassa-total-falliti"
          >
            {todaySummary.falliti}
          </span>
        </div>
      </div>

      {methods.length > 0 && (
        <div className="kpd-method-table" data-testid="cassa-method-table">
          <div className="kpd-method-row kpd-method-row--head">
            <span>Metodo</span>
            <span>Incasso</span>
            <span>Rimborsato</span>
            <span>Netto</span>
          </div>
          {methods.map((method) => {
            const m = byMethod[method];
            return (
              <div className="kpd-method-row" key={method} data-testid={`cassa-method-row-${method}`}>
                <span className="kpd-method-name">{METHOD_LABELS[method] ?? method}</span>
                <span>{formatEuro(m.incasso)}</span>
                <span>{formatEuro(m.rimborsato)}</span>
                <span className="kpd-method-netto">{formatEuro(m.netto)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="kpd-sumup-badges" data-testid="cassa-sumup-badges">
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${activeFilter === 'all' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-all"
          onClick={() => setFilter('all')}
        >
          Tutti
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--ok${activeFilter === 'sumup_succeeded' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-sumup-succeeded"
          onClick={() => setFilter('sumup_succeeded')}
        >
          SumUp riusciti: {sumup.succeeded}
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--pending${activeFilter === 'sumup_pending' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-sumup-pending"
          onClick={() => setFilter('sumup_pending')}
        >
          In corso: {sumup.pending}
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--failed${activeFilter === 'sumup_failed' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-sumup-failed"
          onClick={() => setFilter('sumup_failed')}
        >
          Falliti: {sumup.failed}
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${activeFilter === 'cash' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-cash"
          onClick={() => setFilter('cash')}
        >
          Contanti
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge ${anomalyCount > 0 ? 'kpd-sumup-badge--failed' : 'kpd-sumup-badge--ok'}${activeFilter === 'anomalies' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-anomaly-badge"
          onClick={() => setFilter('anomalies')}
        >
          {anomalyCount > 0 ? `⚠ ${anomalyCount} anomalie da verificare` : '✓ Nessuna anomalia'}
        </button>
      </div>
    </div>
  );
}
