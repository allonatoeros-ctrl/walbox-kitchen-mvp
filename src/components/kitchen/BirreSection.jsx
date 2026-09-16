import { useState } from 'react';
import AllergenBadges from './AllergenBadges';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import './BirreSection.css';

/**
 * Blocco BIRRE (categoria `birre`) del menu cliente — BEER SPRINT V1
 * (ai-ops/current/BEER_SPRINT_V1.md §4/§7-B), esteso dal MENU POLISH & STORYTELLING
 * SPRINT (2026-09-16, Gate 1 approvato da Eros).
 *
 * Nessun frame Figma dedicato per questa categoria. Fino a questo sprint la card era
 * closed-only; ora tutte e 7 sono apribili, con lo stesso pattern accordion approvato
 * di Panini/Pesi Massimi/Taglieri: una sola card aperta alla volta, EXPANDED in-place,
 * "CHIUDI" per ricollassare.
 *
 *  - CLOSED = info essenziali: foto, nome, `choiceLabel`, formato, prezzo, badge di
 *    servizio (ESAURITO / SOLO LA SERA). Niente CTA d'ordine qui: si passa dal dettaglio.
 *  - EXPANDED = `story` (copy approvato da Eros) + taste signals + allergeni +
 *    formato/prezzo + regola di servizio + CTA d'ordine.
 *
 * Nessun dato tecnico inventato: ABV, IBU, birrificio e stile ufficiale non sono
 * confermati da nessuna fonte e non vengono mostrati. `format` resta `null` per
 * Krombacher (cl non confermati) — `choiceLabel: 'ALLA SPINA'` copre quel posto.
 *
 * Choice architecture e regole di servizio invariate: `evening_only` (Krombacher)
 * mostra il badge "SOLO LA SERA" ed è disabilitata fuori orario sera — soglia 18:00
 * locale del device (`kitchenServiceRules.js`), confermata da Eros come regola
 * definitiva (BEER SPRINT V1 Fase E). Prezzo €6 confermato, ordinabile la sera.
 * Stesso linguaggio CTA del resto del menu ("LO VOGLIO" / "ESAURITO" /
 * "PREZZO IN ARRIVO"), nessun secondo linguaggio introdotto.
 */

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function BirreSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="br-list">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        const eveningOnly = item.availability === 'evening_only';
        const eveningLocked = eveningOnly && !isEveningServiceActive();
        const disabled = soldOut || noPrice || eveningLocked;

        let ctaLabel = 'LO VOGLIO';
        if (soldOut) ctaLabel = 'ESAURITO';
        else if (eveningLocked) ctaLabel = 'SOLO LA SERA';
        else if (noPrice) ctaLabel = 'PREZZO IN ARRIVO';

        return (
          <article
            key={item.id}
            className={`br-card${isOpen ? ' br-card--open' : ''}${soldOut ? ' br-card--soldout' : ''}`}
          >
            {/* ── CLOSED ── */}
            <button
              type="button"
              className="br-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="br-card-photo-wrap">
                {item.image ? (
                  <img className="br-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="br-card-photo-placeholder" aria-hidden="true">🍺</span>
                )}
                {soldOut && <span className="br-card-soldout-badge">ESAURITO</span>}
                {!soldOut && eveningOnly && (
                  <span className="br-card-evening-badge">SOLO LA SERA</span>
                )}
              </span>
              <span className="br-card-accent" />
              <span className="br-card-closed-body">
                <span className="br-card-name">{item.name.toUpperCase()}</span>
                {item.choiceLabel && <span className="br-card-choice">{item.choiceLabel}</span>}
                <span className="br-card-closed-meta">
                  {item.format && <span className="br-card-format">{item.format.toUpperCase()}</span>}
                  <span className={`br-card-price${noPrice ? ' br-card-price--soon' : ''}`}>
                    {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                  </span>
                </span>
                <span className="br-card-open-cta">
                  VEDI LA BIRRA
                  <span className="br-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED ── */}
            <div className="br-card-body">
              <div className="br-card-body-content">
                <div className="br-card-body-photo-wrap">
                  {item.image ? (
                    <img className="br-card-body-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="br-card-photo-placeholder" aria-hidden="true">🍺</span>
                  )}
                </div>
                <div className="br-card-accent-line" />
                <div className="br-card-body-inner">
                  <h3 className="br-card-body-name">{item.name.toUpperCase()}</h3>
                  {item.choiceLabel && <p className="br-card-body-choice">{item.choiceLabel}</p>}
                  {item.story && <p className="br-card-story">{item.story}</p>}
                  {item.tasteSignals && item.tasteSignals.length > 0 && (
                    <p className="br-card-taste">{item.tasteSignals.slice(0, 2).join(' · ')}</p>
                  )}
                  <AllergenBadges allergens={item.allergens} />
                  {eveningOnly && (
                    <p className="br-card-service-rule">
                      Alla spina: ordinabile solo la sera, dalle 18:00.
                    </p>
                  )}
                  <div className="br-rule" />
                  <div className="br-price-row">
                    <span className="br-price-block">
                      <span className={`br-price-value${noPrice ? ' br-card-price--soon' : ''}`}>
                        {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                      </span>
                      {item.format && (
                        <span className="br-price-note">{item.format.toUpperCase()}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="br-btn-want"
                      disabled={disabled}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => onAdd?.({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        image: item.image,
                      })}
                    >
                      {ctaLabel}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="br-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="br-caret br-caret--up" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
