import './MenuHero.css';

/**
 * Hero del menu cliente (restyling hero, 2026-10-25): titolo + CTA e foto del panino nella STESSA fascia.
 * Riferimento: ai-ops/reports/visual/restyling-hero/riferimento-grande.webp (solo composizione, mai incorporato).
 * La foto è una foto reale del pub (pulled pork su carta Walrus con il fumo, data da Eros 2026-10-29), solo ritagliata
 * (via il logo scritto nell'originale) e ridimensionata con `cwebp` (niente AI, nessun ritocco sul cibo).
 *
 * Props:
 *  - onDiscover  tocco sulla CTA "SCOPRI I NOSTRI PANINI" (il padre apre la linguetta Panini)
 */
export default function MenuHero({ onDiscover }) {
  return (
    <section className="mh-hero" aria-label="Oggi ti facciamo venire fame">
      <img
        className="mh-photo"
        src="/assets/kitchen/menu/hero/hero-pulled-pork-fumo.webp"
        alt=""
        width="1080"
        height="991"
        fetchPriority="high"
        decoding="async"
      />
      <span className="mh-shade" aria-hidden="true" />
      <div className="mh-copy">
        <p className="mh-kicker" aria-hidden="true">OGGI TI FACCIAMO</p>
        <p className="mh-title" aria-hidden="true">
          <span>VENIRE</span>
          <em>FAME.</em>
        </p>
        <button type="button" className="mh-cta" onClick={onDiscover}>
          <span>SCOPRI I NOSTRI PANINI</span>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M3 12h16m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
          </svg>
        </button>
      </div>
    </section>
  );
}
