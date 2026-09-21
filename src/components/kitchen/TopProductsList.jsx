// Kitchen Analytics V1 — Fase 6 (TOP PRODOTTI).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §CHARTS, §IMPLEMENTATION_PHASES fase 6.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo — riceve la lista gia'
// calcolata da `computeTopProductsAndCategories` (src/lib/kitchenServiceRules.js) via StoricoView.
export default function TopProductsList({ products = [] }) {
  if (products.length === 0) {
    return (
      <div className="kpd-empty" data-testid="top-products-empty">
        Nessun prodotto venduto in questa serata.
      </div>
    );
  }

  const maxQty = Math.max(1, ...products.map((p) => p.quantity));

  return (
    <div className="kpd-top-list" data-testid="top-products-list">
      {products.map((p, i) => (
        <div key={p.name} className="kpd-top-row" data-testid={`top-product-${i}`}>
          <span className="kpd-top-rank">{i + 1}</span>
          <span className="kpd-top-name">{p.name}</span>
          <div className="kpd-top-track">
            <div className="kpd-top-bar" style={{ width: `${(p.quantity / maxQty) * 100}%` }} />
          </div>
          <span className="kpd-top-qty">×{p.quantity}</span>
        </div>
      ))}
    </div>
  );
}
