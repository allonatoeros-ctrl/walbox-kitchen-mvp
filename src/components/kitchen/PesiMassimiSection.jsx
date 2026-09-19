import { useRef, useState } from 'react';
import { kitchenPesiMassimiCombos } from '../../data/kitchenMockData';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import AllergenBadges from './AllergenBadges';
import './PesiMassimiSection.css';

/**
 * Blocco PESI MASSIMI (categoria `bbq`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   HERO 128:2 · CLOSED 129:2 · EXPANDED 130:59 / 130:121 / 130:183
 *
 * Interazione: CLOSED → tap → EXPANDED (una card aperta alla volta) → CHIUDI ↑.
 * LO VOGLIO aggiunge il panino singolo, FALLO PESANTE aggiunge il combo relativo:
 * entrambi passano dallo stesso `onAdd` (= addItem del menu), quindi il payload
 * ordine resta invariato.
 *
 * FALLO PESANTE — composizione FISSA (2026-09-19, decisione Eros). Il combo non ha più
 * una birra a scelta: è sempre `panino scelto + Patate al Forno + Krombacher Pils`, quindi
 * il selettore birra (pill + dettaglio + conferma) è stato rimosso interamente. Gli inclusi
 * arrivano dalle prop `includedBeer` / `includedSide`, risolte dal catalogo reale in
 * `CustomerKitchenMenu.jsx` a partire da `FALLO_PESANTE_INCLUDED_BEER_ID` /
 * `FALLO_PESANTE_INCLUDED_SIDE_ID` — nessun id hardcoded qui dentro.
 *
 * Availability: si riusa quella esistente, non se ne introduce una nuova. FALLO PESANTE è
 * disabilitato se il panino è ESAURITO, se uno dei due inclusi è ESAURITO/senza prezzo, o se
 * Krombacher è fuori dal suo orario di servizio (`evening_only`, soglia 18:00 in
 * `kitchenServiceRules.js`, stessa regola di BirreSection). La CTA dice sempre il perché
 * ("ESAURITO" / "NON DISPONIBILE" / "SOLO LA SERA"), mai un bottone spento e muto.
 *
 * Prezzo e payload invariati: `combo.price` fisso, `itemId` inviato all'ordine = `combo.id`
 * (es. `item-040`) — è l'id che il redeem promo (`kitchen_promo_pass_redeem_for_order`) e il
 * catalogo server già riconoscono. La riga carrello mantiene l'id composito
 * `combo.id::beerId` con `baseId` = `combo.id` (gestito in `CustomerKitchenMenu.jsx` e
 * `kitchenCart.js`) e `includesBeerId`, che è ciò che porta la birra sulla comanda via
 * `buildIncludedBeersNote`: contratto carrello/ordine invariato, cambia solo chi sceglie
 * la birra (prima il cliente, ora il combo stesso).
 *
 * HERO (FINAL UX POLISH 2026-09-16): il badge "WALRUS SPECIAL" non è in overlay sulle foto
 * dei panini, vive nel blocco contenuto sopra il titolo PESI MASSIMI (vedi il CSS).
 *
 * MENU POLISH SPRINT (2026-09-16): la CTA della card chiusa e la nota prezzo dell'EXPANDED
 * accettano un override per-item (`item.detailCtaLabel` / `item.priceNote`). Serve al
 * Box Pulled Pork (`item-018`), che sta in PESI MASSIMI per decisione di Eros ma non è un
 * panino: mostra "VEDI IL BOX" / "SOLO BOX". Senza override, i 3 panini smoked restano su
 * "VEDI IL PANINO" / "SOLO PANINO" — nessun id hardcoded qui dentro.
 */

const CARET_SRC = '/assets/kitchen/pesi-massimi-caret.svg';

function formatPrice(value, forceDecimals = false) {
  if (value == null) return '';
  if (!forceDecimals && Number.isInteger(value)) return `€${value}`;
  return `€${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Props opzionali (additive, non cambiano il rendering approvato):
 *  - heroOnly: renderizza SOLO la hero fotografica (128:2), usata nella Home.
 *  - onHeroCta: override del CTA `SCOPRI →` (default: scroll alla lista CLOSED).
 *  - hideCombo: nasconde il blocco upsell FALLO PESANTE. Serve a /kitchen/promo,
 *    dove il menu mostra solo panini singoli. Default false = menu invariato.
 *  - forceDecimals: forza i due decimali anche sui prezzi interi (€15,00 invece
 *    di €15). Default false = formattazione approvata del menu invariata.
 *  - includedBeer / includedSide: le due voci di catalogo incluse nel combo
 *    (Krombacher Pils e Patate al Forno). Servono solo a leggerne availability e
 *    regola di servizio. Default `null` = incluso non risolvibile → FALLO PESANTE
 *    non ordinabile, mai un combo venduto con dentro qualcosa che non c'è.
 */
export default function PesiMassimiSection({
  items,
  onAdd,
  heroOnly = false,
  onHeroCta,
  hideCombo = false,
  forceDecimals = false,
  includedBeer = null,
  includedSide = null,
}) {
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);
  const bodyRefs = useRef({});

  if (!items || items.length === 0) return null;

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section className="pm-root" aria-label="Pesi Massimi">
      {/* ── HERO FOTOGRAFICA (128:2) ── */}
      <div className="pm-hero">
        <div className="pm-hero-photos" aria-hidden="true">
          {items.map((item) => (
            <img key={item.id} src={item.image} alt="" className="pm-hero-photo" />
          ))}
        </div>
        <div className="pm-hero-scrim" />
        <div className="pm-accent-bar" />
        <div className="pm-hero-body">
          <p className="pm-hero-badge">WALRUS SPECIAL</p>
          <h2 className="pm-hero-title">PESI MASSIMI</h2>
          <p className="pm-hero-sub">
            {items.map((i) => i.name.toUpperCase()).join(' · ')}
          </p>
          <div className="pm-hero-cta-row">
            <p className="pm-hero-tagline">AFFUMICATO. ESAGERATO. SENZA SCUSE.</p>
            <button
              type="button"
              className="pm-hero-cta"
              onClick={() => {
                if (onHeroCta) onHeroCta();
                else listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              SCOPRI →
            </button>
          </div>
          <div className="pm-hero-rule" />
          <div className="pm-hero-prices">
            {items.map((item) => (
              <div key={item.id}>
                <p className="pm-hero-price-label">{item.name.toUpperCase()}</p>
                <p className="pm-hero-price-value">{formatPrice(item.price, forceDecimals)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LISTA CLOSED / EXPANDED ── */}
      {!heroOnly && (
      <div className="pm-list" ref={listRef}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          const soldOut = item.available === false;
          const combo = hideCombo ? null : kitchenPesiMassimiCombos[item.id];
          // Inclusi del combo: stessa nozione di "servibile" del resto del menu
          // (`available !== false` + prezzo a catalogo), più il gate serale di Krombacher.
          const beerEveningLocked =
            includedBeer?.availability === 'evening_only' && !isEveningServiceActive();
          const beerMissing = !includedBeer || includedBeer.available === false || includedBeer.price == null;
          const sideMissing = !includedSide || includedSide.available === false || includedSide.price == null;
          const comboBlocked = soldOut || beerMissing || sideMissing || beerEveningLocked;
          let comboCtaLabel = 'FALLO PESANTE';
          if (soldOut) comboCtaLabel = 'ESAURITO';
          else if (beerMissing || sideMissing) comboCtaLabel = 'NON DISPONIBILE';
          else if (beerEveningLocked) comboCtaLabel = 'SOLO LA SERA';
          return (
            <article
              key={item.id}
              className={`pm-card${isOpen ? ' pm-card--open' : ''}${soldOut ? ' pm-card--soldout' : ''}`}
            >
              <div className="pm-card-media">
                <img className="pm-card-photo" src={item.image} alt={item.name} />
                <div className="pm-card-photo-scrim" />
                <div className="pm-card-accent" />
                <h3 className="pm-card-hero-name">{item.name.toUpperCase()}</h3>

                <button
                  type="button"
                  className="pm-card-close"
                  onClick={() => setOpenId(null)}
                  tabIndex={isOpen ? 0 : -1}
                >
                  CHIUDI
                  <img className="pm-caret" src={CARET_SRC} alt="" />
                </button>

                <button
                  type="button"
                  className="pm-card-closed"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  tabIndex={isOpen ? -1 : 0}
                >
                  <span className="pm-card-closed-name">{item.name.toUpperCase()}</span>
                  <span className="pm-card-closed-price">{formatPrice(item.price, forceDecimals)}</span>
                  <span className="pm-card-open-cta">
                    {soldOut ? 'ESAURITO' : (item.detailCtaLabel ?? 'VEDI IL PANINO')}
                  </span>
                  <img className="pm-caret pm-card-caret" src={CARET_SRC} alt="" />
                </button>
              </div>

              <div
                className="pm-card-body"
                ref={(el) => { bodyRefs.current[item.id] = el; }}
                onTransitionEnd={(e) => {
                  if (e.propertyName === 'grid-template-rows' && isOpen) {
                    bodyRefs.current[item.id]?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }
                }}
              >
                <div className="pm-card-body-inner">
                  <p className="pm-card-ingredients">{item.ingredients}</p>
                  <AllergenBadges allergens={item.allergens} />
                  <div className="pm-card-rule" />
                  <div className="pm-price-row">
                    <span className="pm-price-block">
                      <span className="pm-price-value">{formatPrice(item.price, forceDecimals)}</span>
                      <span className="pm-price-note">{item.priceNote ?? 'SOLO PANINO'}</span>
                    </span>
                    <button
                      type="button"
                      className="pm-btn-want"
                      disabled={soldOut}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => onAdd({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        image: item.image,
                      })}
                    >
                      {soldOut ? 'ESAURITO' : 'LO VOGLIO'}
                    </button>
                  </div>

                  {combo && (
                    <div className="pm-upsell">
                      <div className="pm-upsell-accent" />
                      <p className="pm-upsell-title">FALLO PESANTE</p>
                      <p className="pm-upsell-sub">{combo.subtitle}</p>

                      <div className="pm-upsell-row">
                        <p className="pm-upsell-price">{formatPrice(combo.price, forceDecimals)}</p>
                        <button
                          type="button"
                          className="pm-btn-heavy"
                          disabled={comboBlocked}
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => {
                            if (comboBlocked) return;
                            onAdd({
                              id: `${combo.id}::${includedBeer.id}`,
                              baseId: combo.id,
                              name: `${combo.name} · ${includedBeer.name}`,
                              price: combo.price,
                              image: combo.image,
                              includesBeerId: includedBeer.id,
                            });
                          }}
                        >
                          {comboCtaLabel}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}
    </section>
  );
}
