import { useState } from 'react';
import AllergenBadges from './AllergenBadges';
import './TagliereSection.css';

/**
 * Blocco TAGLIERI (categoria `tagliere`) del menu cliente — MENU POLISH &
 * STORYTELLING SPRINT (2026-09-16, Gate 1 approvato da Eros).
 *
 * Nessun frame Figma dedicato per questa categoria: il layout ricalca 1:1 il pattern
 * approvato di PaniniSection (CLOSED foto 132×132 + nome/prezzo/CTA → EXPANDED in-place
 * con foto piena larghezza, ingredienti, copy, allergeni, prezzo, LO VOGLIO, CHIUDI),
 * così i TAGLIERI non introducono un secondo linguaggio di interazione nel menu.
 * Una sola card aperta alla volta, come Panini e Pesi Massimi.
 *
 * Prima di questo sprint i 3 taglieri cadevano nel fallback generico `kitch-menu-list`
 * di CustomerKitchenMenu.jsx: card sempre aperta, nessun accordion, campo `ingredients`
 * mai mostrato al cliente.
 *
 * CTA dettaglio: "VEDI IL TAGLIERE" (mai "VEDI IL PANINO" — non sono panini).
 * "LO VOGLIO" è disabilitato quando `price === null` e mostra "PREZZO IN ARRIVO":
 * nessun prezzo inventato. Nessun upsell FALLO PESANTE (è solo di Pesi Massimi).
 *
 * Immagini e prezzi restano quelli già in `kitchenMockData.js`, invariati.
 */

// Ordine menu approvato (stesso di getCategorySubtitle in CustomerKitchenMenu.jsx):
// SALUMI SERISSIMI · FORMAGGI DISCUTIBILI · PACE FATTA.
const TAGLIERE_LIST_ORDER = [
  'item-043', // SALUMI SERISSIMI
  'item-044', // FORMAGGI DISCUTIBILI
  'item-045', // PACE FATTA
];

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function TagliereSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const orderedItems = TAGLIERE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !TAGLIERE_LIST_ORDER.includes(i.id)));

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="tg-list">
      {orderedItems.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        return (
          <article
            key={item.id}
            className={`tg-card${isOpen ? ' tg-card--open' : ''}${soldOut ? ' tg-card--soldout' : ''}`}
          >
            {/* ── CLOSED ── */}
            <button
              type="button"
              className="tg-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="tg-card-photo-wrap">
                {item.image ? (
                  <img className="tg-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="tg-card-photo-placeholder">FOTO IN ARRIVO</span>
                )}
              </span>
              <span className="tg-card-accent" />
              <span className="tg-card-closed-body">
                <span className="tg-card-name">{item.name.toUpperCase()}</span>
                <span className={`tg-card-price${noPrice ? ' tg-card-price--soon' : ''}`}>
                  {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                </span>
                <span className="tg-card-open-cta">
                  {soldOut ? 'ESAURITO' : 'VEDI IL TAGLIERE'}
                  <span className="tg-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED ── */}
            <div className="tg-card-body">
              <div className="tg-card-body-content">
                <div className="tg-card-body-photo-wrap">
                  {item.image ? (
                    <img className="tg-card-body-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="tg-card-photo-placeholder">FOTO IN ARRIVO</span>
                  )}
                </div>
                <div className="tg-card-accent-line" />
                <div className="tg-card-body-inner">
                  <h3 className="tg-card-body-name">{item.name.toUpperCase()}</h3>
                  <p className="tg-card-ingredients">{item.ingredients}</p>
                  <p className="tg-card-microcopy">{item.description}</p>
                  <AllergenBadges allergens={item.allergens} />
                  <div className="tg-rule" />
                  <div className="tg-price-row">
                    <span className={`tg-price-value${noPrice ? ' tg-card-price--soon' : ''}`}>
                      {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                    </span>
                    <button
                      type="button"
                      className="tg-btn-want"
                      disabled={soldOut || noPrice}
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
                  <button
                    type="button"
                    className="tg-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="tg-caret tg-caret--up" aria-hidden="true" />
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
