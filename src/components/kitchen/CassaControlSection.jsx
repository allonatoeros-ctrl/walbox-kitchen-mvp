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
 *
 * Filtri sulla lista "Pagamenti recenti" sotto (Cassa Payment Hub, sprint 2026-09-22 continuazione
 * — corregge il filtro singolo a scelta esclusiva della sessione precedente): due gruppi
 * combinabili, METODO e STATO, piu' un terzo toggle indipendente Anomalie. Componente resta
 * presentazionale: lo stato vive in PaymentsView, qui solo bottoni + classe attiva.
 * `methodFilter`/`onMethodFilterChange`: 'all' | 'cash' | 'sumup_online' | 'card_counter_manual'.
 * `statusFilter`/`onStatusFilterChange`: 'all' | 'succeeded' | 'pending' | 'failed'.
 * `statusCounts` = { succeeded, pending, failed } su TUTTI i metodi (non solo SumUp) — calcolato in
 * PaymentsView da `visiblePayments`, stesso pattern di `paymentsByMethod.sumup` ma senza lo scope
 * SumUp-only (quello resta sotto, badge informativi invariati, nessuna rottura di AC4).
 * `anomalyOnly`/`onAnomalyOnlyChange`: terzo filtro AND-combinato, non esclusivo con gli altri due.
 */
export default function CassaControlSection({
  nightLabel,
  todaySummary,
  paymentsByMethod,
  anomalyCount = 0,
  methodFilter = 'all',
  onMethodFilterChange,
  statusFilter = 'all',
  onStatusFilterChange,
  statusCounts,
  anomalyOnly = false,
  onAnomalyOnlyChange,
}) {
  const counts = statusCounts ?? { succeeded: 0, pending: 0, failed: 0 };
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

      {/* Badge informativi SumUp (invariati da AC4: stesso testid/testo, sola lettura — la
          narrowing per SumUp+stato ora si ottiene combinando METODO=SumUp Online e uno STATO
          sotto, non piu' cliccando qui). */}
      <div className="kpd-sumup-badges" data-testid="cassa-sumup-badges">
        <span className="kpd-sumup-badge kpd-sumup-badge--ok" data-testid="cassa-sumup-succeeded">
          SumUp riusciti: {sumup.succeeded}
        </span>
        <span className="kpd-sumup-badge kpd-sumup-badge--pending" data-testid="cassa-sumup-pending">
          In corso: {sumup.pending}
        </span>
        <span className="kpd-sumup-badge kpd-sumup-badge--failed" data-testid="cassa-sumup-failed">
          Falliti: {sumup.failed}
        </span>
        <button
          type="button"
          className={`kpd-sumup-badge ${anomalyCount > 0 ? 'kpd-sumup-badge--failed' : 'kpd-sumup-badge--ok'}${anomalyOnly ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-anomaly-badge"
          onClick={() => onAnomalyOnlyChange?.(!anomalyOnly)}
        >
          {anomalyCount > 0 ? `⚠ ${anomalyCount} anomalie da verificare` : '✓ Nessuna anomalia'}
        </button>
      </div>

      {/* Filtri combinabili "Pagamenti recenti" — due gruppi indipendenti, METODO x STATO, sulla
          stessa riga (wrap se serve) per non allungare la pagina: uno scenario del training guidato
          (coach-tip ancorato a un payment-row) e' sensibile all'altezza aggiunta sopra la lista. */}
      <div className="kpd-filter-group" data-testid="cassa-method-filters">
        <span className="kpd-filter-label">Metodo</span>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${methodFilter === 'all' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-method-all"
          onClick={() => onMethodFilterChange?.('all')}
        >
          Tutti
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${methodFilter === 'cash' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-method-cash"
          onClick={() => onMethodFilterChange?.('cash')}
        >
          Contanti
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${methodFilter === 'sumup_online' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-method-sumup_online"
          onClick={() => onMethodFilterChange?.('sumup_online')}
        >
          SumUp Online
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${methodFilter === 'card_counter_manual' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-method-pos"
          onClick={() => onMethodFilterChange?.('card_counter_manual')}
        >
          POS
        </button>
      </div>

      <div className="kpd-filter-group" data-testid="cassa-status-filters">
        <span className="kpd-filter-label">Stato</span>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--neutral${statusFilter === 'all' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-status-all"
          onClick={() => onStatusFilterChange?.('all')}
        >
          Tutti
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--ok${statusFilter === 'succeeded' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-status-succeeded"
          onClick={() => onStatusFilterChange?.('succeeded')}
        >
          Riusciti: {counts.succeeded}
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--pending${statusFilter === 'pending' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-status-pending"
          onClick={() => onStatusFilterChange?.('pending')}
        >
          In corso: {counts.pending}
        </button>
        <button
          type="button"
          className={`kpd-sumup-badge kpd-sumup-badge--failed${statusFilter === 'failed' ? ' kpd-sumup-badge--active' : ''}`}
          data-testid="cassa-filter-status-failed"
          onClick={() => onStatusFilterChange?.('failed')}
        >
          Falliti: {counts.failed}
        </button>
      </div>
    </div>
  );
}
