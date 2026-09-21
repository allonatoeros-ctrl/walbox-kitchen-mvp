// Kitchen Analytics V1 — Fase 6 (TOP CATEGORIE).
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §CHARTS, §IMPLEMENTATION_PHASES fase 6.
//
// Presentazione pura: nessun fetch, nessuno stato, nessun calcolo — riceve la lista gia'
// calcolata da `computeTopProductsAndCategories` (src/lib/kitchenServiceRules.js) via StoricoView.
// La categoria `NON_MAPPED_CATEGORY` ("non mappato") non viene nascosta: un item che non trova
// corrispondenza nel catalogo resta visibile, mai assorbito in silenzio in un'altra categoria.
export default function TopCategoriesChart({ categories = [] }) {
  if (categories.length === 0) {
    return (
      <div className="kpd-empty" data-testid="top-categories-empty">
        Nessuna categoria venduta in questa serata.
      </div>
    );
  }

  const maxQty = Math.max(1, ...categories.map((c) => c.quantity));

  return (
    <div className="kpd-category-chart" data-testid="top-categories-chart">
      {categories.map((c) => (
        <div key={c.category} className="kpd-category-row" data-testid={`top-category-${c.category}`}>
          <span className="kpd-category-label">{c.category}</span>
          <div className="kpd-category-track">
            <div className="kpd-category-bar" style={{ width: `${(c.quantity / maxQty) * 100}%` }} />
          </div>
          <span className="kpd-category-qty">×{c.quantity}</span>
        </div>
      ))}
    </div>
  );
}
