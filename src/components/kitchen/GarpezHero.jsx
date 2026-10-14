import { useState, useRef, useEffect } from 'react';
import './GarpezHero.css';

/**
 * Poster GARPEZ della home in modalità evento (ANNIVERSARIO 15 ANNI).
 * 2026-10-14 (conversione, piano approvato da Eros): il banner 15 anni è fuso nel poster
 * (ora e' un componente a parte: AnniversaryBanner), la CTA e i classici aggiungono DIRETTAMENTE
 * al sacco (un tap, niente passaggio dal menu), sotto c'è la riga "E DA BERE?" con birre e
 * bevande. Nessuna logica d'ordine propria: tutto passa da `onAdd` (= addItem del menu).
 * Il panino speciale si riconosce dal tag `anniversario`, nessun id hardcoded.
 * Se il panino speciale non è ordinabile (esaurito) la card sparisce e i classici restano i protagonisti.
 */
function formatPrice(value) {
  if (value == null) return '';
  return Number.isInteger(value) ? `€${value}` : `€${value.toFixed(2).replace('.', ',')}`;
}

function toCartItem(item) {
  return { id: item.id, name: item.name, price: item.price, image: item.image };
}

function isOrderable(item) {
  return item.available !== false && item.price != null;
}

export default function GarpezHero({ featured, others = [], drinks = [], onAdd, onOpen }) {
  // Conferma breve sulla CTA dopo il tap ("NEL SACCO ✓"), poi torna l'invito a prenderne un altro.
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!featured) return null;
  const soldOut = !isOrderable(featured);

  const addFeatured = () => {
    onAdd?.(toCartItem(featured));
    setJustAdded(true);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setJustAdded(false), 1400);
  };

  const orderableDrinks = drinks.filter(isOrderable);

  return (
    <section className="gzh-root" aria-label={`Walrus 15 anni: ${featured.name}`}>
      {!soldOut && (
      <article className="gzh-card">
        <div className="gzh-media">
          <img className="gzh-photo" src={featured.image} alt={featured.name} />
          <div className="gzh-scrim" aria-hidden="true" />
        </div>
        <div className="gzh-body">
          <p className="gzh-edition">IL PANINO DEI 15 ANNI · SOLO STASERA</p>
          <div className="gzh-title-row">
            <h2 className="gzh-name">{featured.name.toUpperCase()}</h2>
            <p className="gzh-price">{formatPrice(featured.price)}</p>
          </div>
          <p className="gzh-ingredients">{featured.ingredients}</p>
          <button
            type="button"
            className={`gzh-cta${justAdded ? ' gzh-cta--added' : ''}`}
            onClick={addFeatured}
          >
            {justAdded ? 'NEL SACCO ✓' : `VOGLIO IL ${featured.name.toUpperCase()} · ${formatPrice(featured.price)}`}
          </button>
        </div>
      </article>
      )}

      {others.length > 0 && (
        <div className="gzh-strip">
          <p className="gzh-strip-label">{soldOut ? 'I CLASSICI DI STASERA' : 'ANCHE STASERA'}</p>
          <div className="gzh-others-row">
            {others.map((item) => {
              const off = !isOrderable(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  className="gzh-chip"
                  onClick={() => onAdd?.(toCartItem(item))}
                  disabled={off}
                  aria-label={off ? `${item.name}, esaurito` : `Aggiungi ${item.name} al sacco`}
                >
                  <img className="gzh-chip-photo" src={item.image} alt="" />
                  <span className="gzh-chip-name">{item.name.toUpperCase()}</span>
                  <span className="gzh-chip-foot">
                    <span className="gzh-chip-price">{off ? 'ESAURITO' : formatPrice(item.price)}</span>
                    {!off && <span className="gzh-chip-plus" aria-hidden="true">+</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {orderableDrinks.length > 0 && (
        <div className="gzh-strip">
          <p className="gzh-strip-label">E DA BERE?</p>
          <div className="gzh-drinks-row">
            {orderableDrinks.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gzh-drink"
                onClick={() => onAdd?.(toCartItem(item))}
                aria-label={`Aggiungi ${item.name} al sacco`}
              >
                <img className="gzh-drink-photo" src={item.image} alt="" loading="lazy" />
                <span className="gzh-drink-name">{(item.displayName || item.name).toUpperCase()}</span>
                <span className="gzh-chip-foot">
                  <span className="gzh-chip-price">{formatPrice(item.price)}</span>
                  <span className="gzh-chip-plus" aria-hidden="true">+</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {onOpen && (
        <button type="button" className="gzh-link" onClick={onOpen}>
          VEDI IL MENU DELLA SERATA →
        </button>
      )}
    </section>
  );
}
