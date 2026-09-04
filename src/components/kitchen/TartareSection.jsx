import { useState } from 'react';
import AllergenBadges from './AllergenBadges';
import './TartareSection.css';

/**
 * Blocco TARTARE (categoria `tartare`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   LISTA 164:116 (TARTARE 1 / TARTARE 2) — replicata 1:1 (CLOSED).
 *
 * Nessun frame "TARTARE — EXPANDED" esiste in Page 4 (verificato via get_metadata,
 * come per CICCHETTI/INSALATONE). Stesso pattern EXPANDED riusato da PaniniSection/
 * CicchettiSection: tap sulla card CLOSED → dettaglio in-place, una card aperta alla
 * volta, CTA "LO VOGLIO" (disabilitata se price=null → "PREZZO IN ARRIVO"). Nessun
 * upsell "FALLO PESANTE".
 */

const TARTARE_LIST_ORDER = [
  'item-020', // TARTARE 1
  'item-021', // TARTARE 2
];

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function TartareSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const orderedItems = TARTARE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !TARTARE_LIST_ORDER.includes(i.id)));

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="tr-list">
      {orderedItems.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        return (
          <article
            key={item.id}
            className={`tr-card${isOpen ? ' tr-card--open' : ''}${soldOut ? ' tr-card--soldout' : ''}`}
          >
            {/* ── CLOSED (1:1 Figma 164:116) ── */}
            <button
              type="button"
              className="tr-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="tr-card-photo-wrap">
                {item.image ? (
                  <img className="tr-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="tr-card-photo-placeholder">FOTO IN ARRIVO</span>
                )}
                {soldOut && <span className="tr-card-soldout-badge">ESAURITO</span>}
              </span>
              <span className="tr-card-accent" />
              <span className="tr-card-body">
                <span className="tr-card-name">{item.name.toUpperCase()}</span>
                <span className="tr-card-ingredients">{item.ingredients}</span>
                <span className="tr-card-bottom-row">
                  <span className={`tr-card-price${noPrice ? ' tr-card-price--soon' : ''}`}>
                    {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                  </span>
                  <span className="tr-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED (pattern PaniniSection, adattato) ── */}
            <div className="tr-card-open-body">
              <div className="tr-card-open-content">
                <div className="tr-card-open-photo-wrap">
                  {item.image ? (
                    <img className="tr-card-open-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="tr-card-photo-placeholder">FOTO IN ARRIVO</span>
                  )}
                </div>
                <div className="tr-card-open-accent-line" />
                <div className="tr-card-open-inner">
                  <h3 className="tr-card-open-name">{item.name.toUpperCase()}</h3>
                  <p className="tr-card-open-ingredients">{item.ingredients}</p>
                  <p className="tr-card-open-microcopy">{item.description}</p>
                  <AllergenBadges allergens={item.allergens} />
                  <div className="tr-rule" />
                  <div className="tr-price-row">
                    <span className={`tr-price-value${noPrice ? ' tr-card-price--soon' : ''}`}>
                      {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                    </span>
                    <button
                      type="button"
                      className="tr-btn-want"
                      disabled={soldOut || noPrice}
                      tabIndex={isOpen ? 0 : -1}
                      onClick={() => onAdd?.({
                        id: item.id,
                        name: item.name,
                        price: item.price,
                        image: item.image,
                      })}
                    >
                      {soldOut ? 'ESAURITO' : 'LO VOGLIO'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className="tr-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="tr-caret tr-caret--up" aria-hidden="true" />
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
