import './AnniversaryBanner.css';

/**
 * Banner ANNIVERSARIO 15 ANNI (home cliente, solo modalità evento): fascia centrale a tutta
 * larghezza tra l'header "WALRUS KITCHEN" e il panino. Autonomo, fuori dalla card GARPEZ.
 * Il mount condizionale sta in CustomerKitchenMenu.
 * Logo: la W del Walrus fornita da Eros (JPG quadrato su nero), ritagliata a cerchio in CSS.
 * Animazione d'ingresso una sola volta (< 5 s, WCAG 2.2.2), solo transform/opacity;
 * con prefers-reduced-motion resta la grafica statica.
 */
const CONFETTI = 16;

export default function AnniversaryBanner() {
  return (
    <section className="anv-root" aria-label="Walrus, 15 anni">
      <span className="anv-rays" aria-hidden="true" />
      <div className="anv-confetti" aria-hidden="true">
        {Array.from({ length: CONFETTI }, (_, i) => <span key={i} style={{ '--i': i }} />)}
      </div>
      <p className="anv-kicker">STASERA SI FESTEGGIA</p>
      <div className="anv-main">
        <div className="anv-logo-wrap">
          <img className="anv-logo" src="/assets/kitchen/walrus-logo-w.webp" alt="Walrus" />
        </div>
        <p className="anv-title">
          <span className="anv-num">15</span>
          <span className="anv-word">ANNI</span>
        </p>
      </div>
      <p className="anv-sub">Grazie per averci sopportato.</p>
    </section>
  );
}
