import { useState } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';
import PesiMassimiSection from '../components/kitchen/PesiMassimiSection';
import './KitchenPromo.css';

/**
 * /kitchen/promo — teaser pre-apertura "PERSONALITÀ DISCUTIBILE PASS".
 * Concept A APPROVATO · source of truth visiva: Figma
 * WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED (nodo 74:2).
 *
 * Riuso dal prodotto reale (nessun asset sostitutivo creato):
 *  - header `/assets/kitchen/01_header_walrus_kitchen.webp` e sua geometria (111:59-64),
 *    montato UNA VOLTA sopra le scene: resta fermo mentre il corpo cambia, così la
 *    promo è riconoscibile come l'app reale dal primo frame.
 *  - font Barlow Condensed + palette Kitchen (identiche a .kh-* / .pm-*)
 *  - hero + card PESI MASSIMI reali via <PesiMassimiSection>
 *  - foto e prezzi reali da kitchenMockData (13,90 · 14,50 · 15,00)
 *
 * Narrativa LOCKED: non riscrivere le stringhe delle scene senza approvazione.
 * Il Pass mostra uno slot VISIVO per il futuro codice personale: nessun backend
 * promo, nessuna scrittura su Supabase, nessun valore generato lato client.
 */

const SCENES = { hook: 'hook', pass: 'pass', menu: 'menu' };

export default function KitchenPromo() {
  const [scene, setScene] = useState(SCENES.hook);
  const [rush, setRush] = useState(false);
  const [closing, setClosing] = useState(false);

  const pesiMassimiItems = kitchenMenuItems.filter((item) => item.category === 'bbq');

  // Ogni cambio scena riparte dall'alto e con i delay pieni: il reveal è
  // pensato dal primo beat, non a metà sequenza.
  const goScene = (next) => {
    setScene(next);
    setRush(false);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Solo LO VOGLIO porta al secondo scherzo: esplorare il menu resta libero.
  const blockProceed = () => setClosing(true);

  return (
    <div
      className={`kp-page${rush ? ' kp-rush' : ''}`}
      onClick={() => { if (!rush) setRush(true); }}
    >
      {/* ── HEADER REALE, PERSISTENTE ──────────────────────────────
          Non è dentro le scene: non si rimonta e non si ri-anima, quindi il
          passaggio hook → pass → menu è una continuità, non un taglio. */}
      <header className="kp-header">
        <img
          src="/assets/kitchen/01_header_walrus_kitchen.webp"
          alt="Walrus Kitchen"
          className="kp-header-img"
        />
        <span className="kp-header-frame" aria-hidden="true" />
        <span className="kp-header-claim-cover" aria-hidden="true" />
        <span className="kp-header-claim-rule" aria-hidden="true" />
        <p className="kp-header-claim">PANINI SERI. PERSONALITÀ DISCUTIBILE.</p>
        <span className="kp-header-baseline" aria-hidden="true" />
      </header>

      {/* Barra promo: compare col reward e resta fino al menu. */}
      {scene !== SCENES.hook && (
        <div className="kp-promobar">
          <p className="kp-promobar-text">Personalità Discutibile Pass · attivo</p>
        </div>
      )}

      {/* ── SCENA 1 · HOOK ── headline → pausa → context → punchline → teaser → CTA ── */}
      {scene === SCENES.hook && (
        <section className="kp-scene kp-hook">
          <p className="kp-hook-kicker kp-beat" style={{ '--kp-d': '120ms' }}>
            WALRUS KITCHEN · NOTTE BIANCA
          </p>

          <h1 className="kp-hook-title kp-cut" style={{ '--kp-d': '340ms' }}>
            AH. L’HAI FATTO DAVVERO.
          </h1>

          {/* Il filetto oro è la pausa: si scrive da solo prima del contesto. */}
          <div className="kp-rule" style={{ '--kp-d': '1250ms' }} />

          <p className="kp-hook-line kp-beat" style={{ '--kp-d': '1520ms' }}>
            Hai scansionato un QR sconosciuto durante la Notte Bianca.
          </p>

          <p className="kp-hook-punch kp-cut" style={{ '--kp-d': '2220ms' }}>
            Ottimo processo decisionale.
          </p>

          {/* Teaser fotografico dei 3 Pesi Massimi — foto reali del menu,
              rivelate a tendina una dopo l'altra: è l'esca, non un ornamento. */}
          <div className="kp-teaser">
            <div className="kp-teaser-strip">
              {pesiMassimiItems.map((item, i) => (
                <figure
                  className="kp-teaser-cell"
                  key={item.id}
                  style={{ '--kp-d': `${2750 + i * 170}ms` }}
                >
                  <img src={item.image} alt={item.name} className="kp-teaser-img" />
                  <span className="kp-teaser-scrim" aria-hidden="true" />
                  <figcaption className="kp-teaser-name">
                    {item.name.toUpperCase()}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="kp-teaser-foot kp-beat" style={{ '--kp-d': '3360ms' }}>
              <span className="kp-teaser-foot-tag">PESI MASSIMI</span>
              AFFUMICATO. ESAGERATO. SENZA SCUSE.
            </p>
          </div>

          <button
            type="button"
            className="kp-cta kp-beat"
            style={{ '--kp-d': '3620ms' }}
            onClick={() => goScene(SCENES.pass)}
          >
            CONTINUA A SBAGLIARE →
          </button>
        </section>
      )}

      {/* ── SCENA 2 · REWARD + PASS ── */}
      {scene === SCENES.pass && (
        <section className="kp-scene kp-pass-scene">
          <div className="kp-reward">
            <p className="kp-reward-brand kp-cut" style={{ '--kp-d': '120ms' }}>
              WALRUS KITCHEN
            </p>

            <p className="kp-reward-sub kp-beat" style={{ '--kp-d': '520ms' }}>
              Visto che evidentemente non sai seguire le istruzioni…
            </p>

            {/* Timbro: entra grande e sfocato, si assesta ruotato. */}
            <div className="kp-stamp" style={{ '--kp-d': '1050ms' }}>−10%</div>
          </div>

          <article className="kp-pass" style={{ '--kp-d': '2250ms' }}>
            <div className="kp-pass-accent" />
            <div className="kp-pass-head">
              <p className="kp-pass-label">WALRUS KITCHEN</p>
              <h2 className="kp-pass-title">PERSONALITÀ DISCUTIBILE PASS</h2>
              <p className="kp-pass-benefit">-10% SUL PRIMO PANINO</p>
              <p className="kp-pass-copy">
                Hai trasformato una pessima decisione in uno sconto.
              </p>
              <p className="kp-pass-copy kp-pass-copy--punch">
                Finalmente un talento utile.
              </p>
            </div>

            <div className="kp-pass-perf" aria-hidden="true">
              <span className="kp-pass-perf-notch kp-pass-perf-notch--l" />
              <span className="kp-pass-perf-notch kp-pass-perf-notch--r" />
            </div>

            {/* Slot codice: spazio riservato al futuro codice personale.
                Placeholder tipografico, nessun codice generato o persistito. */}
            <div className="kp-pass-code">
              <p className="kp-pass-code-label">IL TUO CODICE</p>
              <div className="kp-pass-code-slot" aria-hidden="true">••••••</div>
            </div>
          </article>

          <button
            type="button"
            className="kp-cta kp-beat"
            style={{ '--kp-d': '3000ms' }}
            onClick={() => goScene(SCENES.menu)}
          >
            ADESSO FAMMI VEDERE ’STI PANINI →
          </button>
        </section>
      )}

      {/* ── SCENA 3 · MENU REALE (esplorabile, non ordinabile) ── */}
      {scene === SCENES.menu && (
        <section className="kp-scene">
          {/* Card reali: stesso componente approvato del menu cliente.
              `hideCombo` toglie FALLO PESANTE (promo = solo panini singoli),
              `forceDecimals` scrive €15,00. `onAdd` non ordina: è LO VOGLIO,
              l'unico gesto che apre il secondo scherzo. */}
          <div className="kp-menu-body" style={{ '--kp-d': '280ms' }}>
            <PesiMassimiSection
              items={pesiMassimiItems}
              onAdd={blockProceed}
              hideCombo
              forceDecimals
            />
          </div>
        </section>
      )}

      {/* ── CHIUSURA · solo da LO VOGLIO ── */}
      {closing && (
        <div
          className="kp-closing"
          role="dialog"
          aria-modal="true"
          aria-label="Non abbiamo ancora aperto"
          onClick={(e) => { if (e.target === e.currentTarget) setClosing(false); }}
        >
          <div className="kp-closing-sheet">
            <h2 className="kp-closing-title">CALMA. NON ABBIAMO ANCORA APERTO.</h2>
            <p className="kp-closing-line">
              Ti abbiamo fatto venire fame per niente.
            </p>
            <p className="kp-closing-line">Però tranquillo:</p>
            <p className="kp-closing-true">il tuo -10% è vero.</p>
            <p className="kp-closing-sign">CI VEDIAMO ALL’APERTURA.</p>
            <button
              type="button"
              className="kp-closing-back"
              onClick={() => setClosing(false)}
            >
              TORNA A GUARDARE I PANINI
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
