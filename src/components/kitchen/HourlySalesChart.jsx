// Kitchen Analytics V1 — Fase 5 (VENDITE PER FASCIA ORARIA).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §CHARTS punto 1,
// §IMPLEMENTATION_PHASES fase 5.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo — riceve i bucket gia'
// calcolati da `bucketOrdersByServiceNight` (src/lib/kitchenServiceRules.js) via StoricoView.
// `bucket.value` e' la somma di order.total nel bucket ("valore ordini", non incasso — vedi
// commento nella funzione sorgente): qui viene mostrato come dato secondario, mai etichettato
// "incasso".
export default function HourlySalesChart({ buckets = [] }) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const hasData = buckets.some((b) => b.count > 0);

  if (!hasData) {
    return (
      <div className="kpd-empty" data-testid="hourly-sales-empty">
        Nessun ordine consegnato in questa serata.
      </div>
    );
  }

  return (
    <div className="kpd-hourly-chart" data-testid="hourly-sales-chart">
      {buckets.map((b) => (
        <div key={b.label} className="kpd-hourly-row" data-testid={`hourly-bucket-${b.label}`}>
          <span className="kpd-hourly-label">{b.label}</span>
          <div className="kpd-hourly-track">
            <div className="kpd-hourly-bar" style={{ width: `${(b.count / maxCount) * 100}%` }} />
          </div>
          <div className="kpd-hourly-meta">
            <span className="kpd-hourly-count">{b.count}</span>
            {b.value > 0 && <span className="kpd-hourly-value">€ {b.value.toFixed(2)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
