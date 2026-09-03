import { useState } from 'react';
import './PaniniSection.css';

/**
 * Blocco PANINI (categoria `panini`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   LISTA (CLOSED) 162:2 · EXPANDED (una card per panino) 167:2 / 167:121 / 167:240 /
 *   167:359 / 170:2 / 170:121 / 170:240 / 170:359
 *
 * Interazione: CLOSED → tap card o "VEDI IL PANINO" → EXPANDED in-place (una card
 * aperta alla volta, le altre restano CLOSED nella stessa posizione — stesso pattern
 * di PesiMassimiSection). "CHIUDI" o il caret ricollassano la card (= "back dettaglio
 * → lista PANINI"). Il back "lista PANINI → MENU CATEGORIE" resta il topbar esistente
 * di CustomerKitchenMenu (kh-menu-topbar), non duplicato qui.
 *
 * "VEDI IL PANINO" (apri dettaglio) è sempre attivo. "LO VOGLIO" (aggiungi al sacco)
 * è disabilitato quando price === null, mostra "PREZZO IN ARRIVO" — nessun prezzo
 * inventato. Nessun upsell "FALLO PESANTE": il nodo EXPANDED approvato per i panini
 * non lo prevede (a differenza di Pesi Massimi).
 */

// Ordine approvato Figma 162:2 (card CRUDO MA EDUCATO → VEGETARIANO, dall'alto in basso).
const PANINI_LIST_ORDER = [
  'item-014', // CRUDO MA EDUCATO
  'item-017', // MORTAZZA CLASSE ALTA
  'item-012', // CRUDO VERO
  'item-015', // SPECKTACOLO
  'item-016', // WRAPTOR
  'item-032', // PORCA FIGURA
  'item-033', // PANINO STRACCETTI
  'item-013', // VEGETARIANO
];

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function PaniniSection({ items, onAdd }) {
  const [openId, setOpenId] = useState(null);

  if (!items || items.length === 0) return null;

  const orderedItems = PANINI_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !PANINI_LIST_ORDER.includes(i.id)));

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="pn-list">
      {orderedItems.map((item) => {
        const isOpen = openId === item.id;
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        return (
          <article
            key={item.id}
            className={`pn-card${isOpen ? ' pn-card--open' : ''}${soldOut ? ' pn-card--soldout' : ''}`}
          >
            {/* ── CLOSED ── */}
            <button
              type="button"
              className="pn-card-closed"
              onClick={() => toggle(item.id)}
              aria-expanded={isOpen}
              tabIndex={isOpen ? -1 : 0}
            >
              <span className="pn-card-photo-wrap">
                {item.image ? (
                  <img className="pn-card-photo" src={item.image} alt={item.name} />
                ) : (
                  <span className="pn-card-photo-placeholder">FOTO IN ARRIVO</span>
                )}
              </span>
              <span className="pn-card-accent" />
              <span className="pn-card-closed-body">
                <span className="pn-card-name">{item.name.toUpperCase()}</span>
                <span className={`pn-card-price${noPrice ? ' pn-card-price--soon' : ''}`}>
                  {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                </span>
                <span className="pn-card-open-cta">
                  {soldOut ? 'ESAURITO' : 'VEDI IL PANINO'}
                  <span className="pn-caret" aria-hidden="true" />
                </span>
              </span>
            </button>

            {/* ── EXPANDED ── */}
            <div className="pn-card-body">
              <div className="pn-card-body-content">
                <div className="pn-card-body-photo-wrap">
                  {item.image ? (
                    <img className="pn-card-body-photo" src={item.image} alt={item.name} />
                  ) : (
                    <span className="pn-card-photo-placeholder">FOTO IN ARRIVO</span>
                  )}
                </div>
                <div className="pn-card-accent-line" />
                <div className="pn-card-body-inner">
                  <h3 className="pn-card-body-name">{item.name.toUpperCase()}</h3>
                  <p className="pn-card-ingredients">{item.ingredients}</p>
                  <p className="pn-card-microcopy">{item.description}</p>
                  <div className="pn-rule" />
                  <div className="pn-price-row">
                    <span className={`pn-price-value${noPrice ? ' pn-card-price--soon' : ''}`}>
                      {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                    </span>
                    <button
                      type="button"
                      className="pn-btn-want"
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
                    className="pn-card-close"
                    onClick={() => setOpenId(null)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    CHIUDI
                    <span className="pn-caret pn-caret--up" aria-hidden="true" />
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
