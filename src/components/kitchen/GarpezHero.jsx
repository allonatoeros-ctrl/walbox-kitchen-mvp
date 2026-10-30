import { useState, useRef, useEffect } from 'react';
import { formatPrice } from '../../lib/kitchenPrice';
import './GarpezHero.css';

/**
 * Poster GARPEZ della home in modalità evento (ANNIVERSARIO 15 ANNI).
 * 2026-10-14 (conversione, piano approvato da Eros): il banner 15 anni è fuso nel poster
 * (ora e' un componente a parte: AnniversaryBanner), la CTA e i classici aggiungono DIRETTAMENTE
 * al sacco (un tap, niente passaggio dal menu), sotto c'è la riga "E DA BERE?" con birre e
 * bevande. Nessuna logica d'ordine propria: tutto passa da `onAdd` (= addItem del menu).
 * Il panino speciale si riconosce dal tag `anniversario`, nessun id hardcoded.
 * Se il panino speciale non è ordinabile (esaurito) la card sparisce e i classici restano i protagonisti.
 * 2026-10-15: tra i classici c'è anche l'Orto Cattivo (tag `veg`): stessa misura, etichetta VEG testuale.
 * 2026-10-16 (Opzione C, Eros): i classici passano a lista stile delivery (testo a sinistra, foto con "+" a destra) con etichette "avvertenze da pub" (mappa per id
 * solo qui, non nei dati), max 2 righe di ingredienti reali e feedback "aggiunto" sul "+".
 */
const BILLING_BY_ID = {
  'item-009': 'SPORCA. TANTO.',
  'item-010': 'TOVAGLIOLI A PARTE',
  'item-011': 'NON È FRETTOLOSO',
  'item-013': 'SÌ, È VERDURA. E ALLORA?',
};
// Foto larghe (ciabatta lunga): nel quadrato si mostrano intere invece di essere tagliate.
// 2026-10-24: l'Orto Cattivo ora e' una foto quadrata 1254x1254, lo slot largo 3:2 lasciava bande nere:
// vuoto di proposito (il meccanismo resta per eventuali foto 3:2 future).
const WIDE_PHOTO_IDS = new Set([]);

function toCartItem(item) {
  return { id: item.id, name: item.name, price: item.price, image: item.image };
}

function isOrderable(item) {
  return item.available !== false && item.price != null;
}

export default function GarpezHero({ featured, others = [], onAdd }) {
  // Conferma breve sulla CTA dopo il tap ("NEL SACCO ✓"), poi torna l'invito a prenderne un altro.
  const [justAdded, setJustAdded] = useState(false);
  const timerRef = useRef(null);
  // Stesso feedback sui classici, per singola card ("+" diventa "✓" per un attimo).
  const [addedId, setAddedId] = useState(null);
  const chipTimerRef = useRef(null);
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(chipTimerRef.current);
  }, []);

  if (!featured) return null;
  const soldOut = !isOrderable(featured);

  const addFeatured = () => {
    onAdd?.(toCartItem(featured));
    setJustAdded(true);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setJustAdded(false), 1400);
  };

  const addOther = (item) => {
    onAdd?.(toCartItem(item));
    setAddedId(item.id);
    clearTimeout(chipTimerRef.current);
    chipTimerRef.current = window.setTimeout(() => setAddedId(null), 1200);
  };

  return (
    <section className="gzh-root" aria-label={`Walrus 15 anni: ${featured.name}`}>
      {!soldOut && (
      <article className="gzh-card">
        <div className="gzh-media">
          <img className="gzh-photo" src={featured.image} alt={featured.name} />
          <div className="gzh-scrim" aria-hidden="true" />
        </div>
        <div className="gzh-body">
          <p className="gzh-billing">VIETATO AI DEBOLI</p>
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
              const added = addedId === item.id;
              const billing = BILLING_BY_ID[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`gzh-chip${added ? ' gzh-chip--added' : ''}`}
                  onClick={() => addOther(item)}
                  disabled={off}
                  aria-label={`${off ? `${item.name}, esaurito` : `Aggiungi ${item.name} al sacco`}${item.tags?.includes('veg') ? ', vegetariano' : ''}`}
                >
                  <span className="gzh-chip-text">
                    {billing && <span className="gzh-chip-billing">{billing}</span>}
                    <span className="gzh-chip-name">
                      {item.tags?.includes('veg') && <span className="gzh-chip-veg">VEG</span>}
                      {item.name.toUpperCase()}
                    </span>
                    {item.ingredients && <span className="gzh-chip-ingredients">{item.ingredients}</span>}
                    <span className="gzh-chip-price">{off ? 'ESAURITO' : formatPrice(item.price)}</span>
                  </span>
                  <span className={`gzh-chip-media${WIDE_PHOTO_IDS.has(item.id) ? ' gzh-chip-media--wide' : ''}`}>
                    <img className={`gzh-chip-photo${WIDE_PHOTO_IDS.has(item.id) ? ' gzh-chip-photo--wide' : ''}`} src={item.image} alt="" />
                    {!off && <span className="gzh-chip-plus" aria-hidden="true">{added ? '✓' : '+'}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
