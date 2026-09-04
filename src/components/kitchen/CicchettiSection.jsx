import { useState } from 'react';
import AllergenBadges from './AllergenBadges';
import './CicchettiSection.css';

/**
 * Blocco CICCHETTI (categoria `cicchetti`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   LISTA 164:2 (unico stato approvato per questa categoria — invariata, 1:1).
 *
 * Figma non ha uno stato EXPANDED per CICCHETTI (verificato via get_metadata su tutta
 * Page 4: nessun frame "CICCHETTI — EXPANDED" esiste, a differenza di PANINI/PESI MASSIMI).
 * Decisione Eros (2026-09-04, run completamento catalogo): aggiungere comunque
 * un'interazione tap → EXPANDED riusando il pattern già approvato/shippato di
 * PaniniSection (stesso meccanismo "una card aperta alla volta"), popolato coi dati
 * reali cicchetti — la LISTA (card CLOSED) resta visivamente 1:1 a 164:2, nessuna
 * ridisegnazione: si aggiunge solo tappabilità + pannello dettaglio + CTA "LO VOGLIO"
 * (prima assente: senza EXPANDED i cicchetti non erano ordinabili).
 *
 * price=null → "PREZZO IN ARRIVO" (nessun prezzo inventato), CTA "LO VOGLIO" disabilitata.
 * Nessun upsell "FALLO PESANTE": non presente in nessun frame approvato per questa categoria.
 */

const CICCHETTI_LIST_ORDER = [
  'item-034', // MORTAZZA
  'item-035', // LARDO & NOCI
  'item-036', // SCAMORZA & CIPOLLE
  'item-037', // CIAPPI VEG
];

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function CicchettiSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const orderedItems = CICCHETTI_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !CICCHETTI_LIST_ORDER.includes(i.id)));

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="cc-list">
      {orderedItems.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        return (
          <article
            key={item.id}
            className={`cc-card${isOpen ? ' cc-card--open' : ''}${soldOut ? ' cc-card--soldout' : ''}`}
          >
            {/* ── CLOSED (1:1 Figma 164:2) ── */}
            <button
              type="button"
              className="cc-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="cc-card-photo-wrap">
                {item.image ? (
                  <img className="cc-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="cc-card-photo-placeholder">FOTO IN ARRIVO</span>
                )}
                {soldOut && <span className="cc-card-soldout-badge">ESAURITO</span>}
              </span>
              <span className="cc-card-accent" />
              <span className="cc-card-body">
                <span className="cc-card-name">{item.name.toUpperCase()}</span>
                <span className="cc-card-ingredients">{item.ingredients}</span>
                <span className="cc-card-bottom-row">
                  <span className={`cc-card-price${noPrice ? ' cc-card-price--soon' : ''}`}>
                    {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                  </span>
                  <span className="cc-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED (pattern PaniniSection, adattato) ── */}
            <div className="cc-card-open-body">
              <div className="cc-card-open-content">
                <div className="cc-card-open-photo-wrap">
                  {item.image ? (
                    <img className="cc-card-open-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="cc-card-photo-placeholder">FOTO IN ARRIVO</span>
                  )}
                </div>
                <div className="cc-card-open-accent-line" />
                <div className="cc-card-open-inner">
                  <h3 className="cc-card-open-name">{item.name.toUpperCase()}</h3>
                  <p className="cc-card-open-ingredients">{item.ingredients}</p>
                  <p className="cc-card-open-microcopy">{item.description}</p>
                  <AllergenBadges allergens={item.allergens} />
                  <div className="cc-rule" />
                  <div className="cc-price-row">
                    <span className={`cc-price-value${noPrice ? ' cc-card-price--soon' : ''}`}>
                      {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                    </span>
                    <button
                      type="button"
                      className="cc-btn-want"
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
                    className="cc-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="cc-caret cc-caret--up" aria-hidden="true" />
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
