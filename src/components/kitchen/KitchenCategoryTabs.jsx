import { useEffect, useRef, useState } from 'react';

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

  // Edge fade dinamico: segnala che la strip continua oltre il bordo visibile.
  // Visibile solo lato/i dove c'è overflow residuo reale (scroll ai margini →
  // fade nascosto su quel lato), mai un hint fisso indipendente dallo scroll.
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [categories]);

  useEffect(() => {
    // scrollIntoView è smooth/async: ricalcola il fade a ogni frame dello
    // scroll indotto dal cambio di tab attivo, non solo a scroll utente.
    const id = requestAnimationFrame(updateFade);
    return () => cancelAnimationFrame(id);
  }, [activeKey]);

  return (
    <div className="kitch-tabs-wrap">
      <div className="kitch-tabs" ref={scrollRef} onScroll={updateFade}>
        {categories.map((cat) => {
          const isActive = activeKey === cat.key;
          return (
            <button
              key={cat.key}
              ref={isActive ? activeRef : null}
              className={`kitch-tab${isActive ? ' is-active' : ''}`}
              onClick={() => onSelect(cat.key)}
            >
              <div className="kitch-tab-circle">
                <span className="kitch-tab-icon">{cat.icon}</span>
              </div>
              <span className="kitch-tab-label">{cat.label}</span>
            </button>
          );
        })}
      </div>
      <span className={`kitch-tabs-fade kitch-tabs-fade--left${canScrollLeft ? ' is-visible' : ''}`} aria-hidden="true" />
      <span className={`kitch-tabs-fade kitch-tabs-fade--right${canScrollRight ? ' is-visible' : ''}`} aria-hidden="true" />
    </div>
  );
}
