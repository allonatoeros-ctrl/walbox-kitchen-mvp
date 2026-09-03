import { useState } from 'react';
import './InsalatoneSection.css';

/**
 * Blocco INSALATONE (categoria `insalatone`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   LISTA 164:65 (CAESAR / SALMON / VEGGY) — replicata 1:1 (CLOSED).
 *
 * Nessun frame "INSALATONE — EXPANDED" esiste in Page 4 (verificato via get_metadata,
 * come per CICCHETTI/TARTARE). Stesso pattern EXPANDED riusato da PaniniSection/
 * CicchettiSection: tap sulla card CLOSED → dettaglio in-place, una card aperta alla
 * volta, CTA "LO VOGLIO" (disabilitata se price=null → "PREZZO IN ARRIVO"). Nessun
 * upsell "FALLO PESANTE".
 */

const INSALATONE_LIST_ORDER = [
  'item-024', // CAESAR
  'item-025', // SALMON
  'item-027', // VEGGY
];

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function InsalatoneSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const orderedItems = INSALATONE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !INSALATONE_LIST_ORDER.includes(i.id)));

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="is-list">
      {orderedItems.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        return (
          <article
            key={item.id}
            className={`is-card${isOpen ? ' is-card--open' : ''}${soldOut ? ' is-card--soldout' : ''}`}
          >
            {/* ── CLOSED (1:1 Figma 164:65) ── */}
            <button
              type="button"
              className="is-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="is-card-photo-wrap">
                {item.image ? (
                  <img className="is-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="is-card-photo-placeholder">FOTO IN ARRIVO</span>
                )}
                {soldOut && <span className="is-card-soldout-badge">ESAURITO</span>}
              </span>
              <span className="is-card-accent" />
              <span className="is-card-body">
                <span className="is-card-name">{item.name.toUpperCase()}</span>
                <span className="is-card-ingredients">{item.ingredients}</span>
                <span className="is-card-bottom-row">
                  <span className={`is-card-price${noPrice ? ' is-card-price--soon' : ''}`}>
                    {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                  </span>
                  <span className="is-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED (pattern PaniniSection, adattato) ── */}
            <div className="is-card-open-body">
              <div className="is-card-open-content">
                <div className="is-card-open-photo-wrap">
                  {item.image ? (
                    <img className="is-card-open-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="is-card-photo-placeholder">FOTO IN ARRIVO</span>
                  )}
                </div>
                <div className="is-card-open-accent-line" />
                <div className="is-card-open-inner">
                  <h3 className="is-card-open-name">{item.name.toUpperCase()}</h3>
                  <p className="is-card-open-ingredients">{item.ingredients}</p>
                  <p className="is-card-open-microcopy">{item.description}</p>
                  <div className="is-rule" />
                  <div className="is-price-row">
                    <span className={`is-price-value${noPrice ? ' is-card-price--soon' : ''}`}>
                      {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                    </span>
                    <button
                      type="button"
                      className="is-btn-want"
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
                    className="is-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="is-caret is-caret--up" aria-hidden="true" />
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
