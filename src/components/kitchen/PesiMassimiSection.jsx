import { useRef, useState } from 'react';
import { kitchenPesiMassimiCombos } from '../../data/kitchenMockData';
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
 */

const CARET_SRC = '/assets/kitchen/pesi-massimi-caret.svg';

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

/**
 * Props opzionali (additive, non cambiano il rendering approvato):
 *  - heroOnly: renderizza SOLO la hero fotografica (128:2), usata nella Home.
 *  - onHeroCta: override del CTA `SCOPRI →` (default: scroll alla lista CLOSED).
 */
export default function PesiMassimiSection({ items, onAdd, heroOnly = false, onHeroCta }) {
  const [openId, setOpenId] = useState(null);
  const listRef = useRef(null);

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
        <div className="pm-hero-badge">WALRUS SPECIAL</div>
        <div className="pm-hero-body">
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
                <p className="pm-hero-price-value">{formatPrice(item.price)}</p>
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
          const combo = kitchenPesiMassimiCombos[item.id];
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
                  <span className="pm-card-closed-price">{formatPrice(item.price)}</span>
                  <span className="pm-card-open-cta">
                    {soldOut ? 'ESAURITO' : 'VEDI IL PANINO'}
                  </span>
                  <img className="pm-caret pm-card-caret" src={CARET_SRC} alt="" />
                </button>
              </div>

              <div className="pm-card-body">
                <div className="pm-card-body-inner">
                  <p className="pm-card-ingredients">{item.ingredients}</p>
                  <div className="pm-card-rule" />
                  <div className="pm-price-row">
                    <span className="pm-price-block">
                      <span className="pm-price-value">{formatPrice(item.price)}</span>
                      <span className="pm-price-note">SOLO PANINO</span>
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
                        <p className="pm-upsell-price">{formatPrice(combo.price)}</p>
                        <button
                          type="button"
                          className="pm-btn-heavy"
                          disabled={soldOut}
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => onAdd({
                            id: combo.id,
                            name: combo.name,
                            price: combo.price,
                            image: combo.image,
                          })}
                        >
                          FALLO PESANTE
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
