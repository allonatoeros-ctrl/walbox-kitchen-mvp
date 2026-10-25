import { useEffect, useRef } from 'react';

/**
 * Category tab bar for the kitchen menu.
 * Accepts categories array, activeKey, onSelect handler.
 * Sistema cromatico unico Walrus (CLAUDE.md §8 / decisione Eros): niente
 * tinting per categoria — un solo stato attivo (red/orange + cream/gold) e
 * un solo stato inattivo (dark + cream/muted) per tutti i tab.
 * Stato attivo guidato da classe CSS (`.is-active`), non da stili inline:
 * un solo punto di verità, nessuno scale sul tap (CHECKPOINT audit
 * 2026-09-14, "le icone si muovono al tap").
 */

export default function KitchenCategoryTabs({ categories, activeKey, onSelect }) {
  // A 390px la strip è più larga del viewport e non si spostava mai: con
  // TARTARE attiva il cerchio arancione restava tagliato sul bordo destro,
  // senza nulla che segnalasse lo scroll. Il tab attivo viene portato in vista
  // dentro la strip — ma solo se non è già interamente visibile, altrimenti
  // ogni tap innescava un micro-scroll "smooth" percepito come movimento.
  // Centrato (`inline: 'center'`) invece che al bordo (`'nearest'`), così un
  // tab nascosto arriva in vista con contesto laterale su entrambi i lati.
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const elRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const fullyVisible = elRect.left >= parentRect.left && elRect.right <= parentRect.right;
    if (!fullyVisible) {
      el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [activeKey]);

  // Restyling poster (mockup B): chip rettangolari, nessuna icona, nessun edge fade: il chip
  // tagliato sul bordo destro è già il segnale che la strip scorre in orizzontale.
  return (
    <nav className="kp-tabs" aria-label="Categorie del menu">
      {categories.map((cat) => {
        const isActive = activeKey === cat.key;
        return (
          <button
            key={cat.key}
            type="button"
            ref={isActive ? activeRef : null}
            className={`kp-chip${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onSelect(cat.key)}
          >
            {cat.label}
          </button>
        );
      })}
    </nav>
  );
}
