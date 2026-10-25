import { useEffect, useRef, useState } from 'react';
import { ALLERGEN_LABEL } from './AllergenBadges';
import { formatPrice } from '../../lib/kitchenPrice';
import './PosterCard.css';

/**
 * "Locandina" del menu cliente (Fase 3.2 restyling, direzione B "Poster da pub").
 * Usata da PaniniSection (pilota) e InsalatoneSection e TartareSection. Le altre categorie restano col look attuale.
 *
 * Sempre "aperta" (niente accordion): foto 4:3 a tutta larghezza con nome + prezzo sopra lo
 * scrim, sotto descrizione, ingredienti e allergeni come testo, CTA piena che diventa
 * stepper − N + quando il prodotto è già nel sacco.
 *
 * Props:
 *  - item        { id, name, description, ingredients, price, image, allergens, tags, available }
 *  - index       posizione 0-based nella lista (per il N° "01")
 *  - qty         quantità già nel carrello (0 = mostra AGGIUNGI)
 *  - onAdd(p)    p = { id, name, price, image } (stesso payload che usava la card Panini)
 *  - onRemove(id) toglie 1 dal carrello
 *  - objectPosition  ritaglio 4:3 della foto quadrata (default centro)
 *
 * Fallback: price null/vuoto → CTA spenta "PREZZO IN ARRIVO" (nessun prezzo inventato);
 * available === false → CTA spenta "ESAURITO"; foto assente o rotta → riquadro "FOTO IN ARRIVO".
 */

// Etichetta allergene senza emoji iniziale (le emoji sono solo nei badge gialli di AllergenBadges).
function allergenText(key) {
  const label = ALLERGEN_LABEL[key];
  if (!label) return String(key).replace(/_/g, ' ');
  return label.replace(/^[^\p{L}]+/u, '');
}

// Nome su 2 righe "da manifesto" come nel mockup B (<br> a mano): spezza al confine di parola più
// bilanciato, solo se entrambe le metà sono corte. Nomi lunghi o di una parola: a capo naturale.
function splitName(name) {
  const words = String(name || '').trim().split(/\s+/);
  if (words.length < 2) return null;
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (!best || diff < best.diff) best = { a, b, diff };
  }
  return best.a.length <= 14 && best.b.length <= 14 ? [best.a, best.b] : null;
}

// Prezzo come nel mockup: cifra grande + "€" piccolo ("8€", "14,50€").
function PriceBig({ value }) {
  const text = formatPrice(value);
  const m = text.match(/^(.*?)[\s\u00A0]*€$/);
  if (!m) return text;
  return (<>{m[1]}<small>€</small></>);
}

export default function PosterCard({
  item,
  index = 0,
  qty = 0,
  onAdd,
  onRemove,
  objectPosition = '50% 50%',
}) {
  // Salva l'URL che ha fallito (non un booleano): se cambia `item.image` la foto riprova da sola.
  const [failedSrc, setFailedSrc] = useState(null);

  // Azione utente in attesa di essere applicata dopo il render (focus + scroll sopra il dock).
  const pendingRef = useRef(null);
  const stepperRef = useRef(null);
  const plusRef = useRef(null);
  const ctaRef = useRef(null);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    if (qty > 0) {
      // CTA → stepper: il bottone AGGIUNGI è stato smontato, il focus passa al "+".
      plusRef.current?.focus({ preventScroll: true });
      if (pending.scroll && stepperRef.current) {
        // Al primo add compare il dock fisso del sacco: porta lo stepper sopra il dock, con
        // l'altezza reale misurata (fallback 96 px = .kitch-bottom-spacer).
        const dock = document.querySelector('.kitch-bottom-bar');
        const dockH = dock ? dock.getBoundingClientRect().height : 96;
        stepperRef.current.style.scrollMarginBottom = `${Math.ceil(dockH) + 16}px`;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        stepperRef.current.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
      }
    } else {
      // stepper → CTA: il focus torna su AGGIUNGI invece di perdersi sul body.
      ctaRef.current?.focus({ preventScroll: true });
    }
  }, [qty]);

  const soldOut = item.available === false;
  const noPrice = item.price == null || item.price === '';
  const canAdd = !soldOut && !noPrice;
  const isVeg = Array.isArray(item.tags) && item.tags.includes('veg');
  const showPhoto = Boolean(item.image) && failedSrc !== item.image;
  const number = String(index + 1).padStart(2, '0');
  const allergens = Array.isArray(item.allergens) ? item.allergens : [];

  const handleAdd = () => {
    if (!canAdd) return;
    if (qty === 0) pendingRef.current = { scroll: true };
    onAdd?.({ id: item.id, name: item.name, price: item.price, image: item.image });
  };

  const nameLines = splitName(item.name);
  let ctaLabel = '+ AGGIUNGI';
  if (soldOut) ctaLabel = 'ESAURITO';
  else if (noPrice) ctaLabel = 'PREZZO IN ARRIVO';

  return (
    <article className={`pc-card${soldOut ? ' pc-card--soldout' : ''}`}>
      <div className="pc-shot">
        {showPhoto ? (
          <img
            className="pc-photo"
            src={item.image}
            alt=""
            style={{ objectPosition }}
            loading={index < 2 ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setFailedSrc(item.image)}
          />
        ) : (
          <span className="pc-photo-missing">FOTO IN ARRIVO</span>
        )}
        <span className="pc-scrim" aria-hidden="true" />
        <span className="pc-num" aria-hidden="true">N°{number}</span>
        {isVeg && <span className="pc-veg">VEG</span>}
        <div className="pc-over">
          <h3 className="pc-name">
            {nameLines ? (<>{nameLines[0]}<br />{nameLines[1]}</>) : item.name}
          </h3>
          {!noPrice && <span className="pc-price"><PriceBig value={item.price} /></span>}
        </div>
      </div>

      <div className="pc-under">
        {item.description && <p className="pc-quip">{item.description}</p>}
        {item.ingredients && <p className="pc-ingredients">{item.ingredients}</p>}
        {allergens.length > 0 && (
          <p className="pc-allergens">
            Allergeni:{' '}
            {allergens.map(allergenText).join(' · ')}
          </p>
        )}

        {qty > 0 ? (
          <div ref={stepperRef} className="pc-stepper" role="group" aria-label={`Quantità nel sacco: ${item.name}`}>
            <button
              type="button"
              className="pc-step-btn"
              onClick={() => {
                if (qty === 1) pendingRef.current = { scroll: false };
                onRemove?.(item.id);
              }}
              aria-label={`Diminuisci quantità: ${item.name}`}
            >
              −
            </button>
            <output className="pc-step-qty" aria-live="polite">
              {qty} nel carrello
            </output>
            <button
              ref={plusRef}
              type="button"
              className="pc-step-btn"
              onClick={handleAdd}
              disabled={!canAdd}
              aria-label={`Aumenta quantità: ${item.name}`}
            >
              +
            </button>
          </div>
        ) : (
          <button
            ref={ctaRef}
            type="button"
            className="pc-cta"
            onClick={handleAdd}
            disabled={!canAdd}
            aria-label={canAdd ? `Aggiungi ${item.name}` : `${ctaLabel}: ${item.name}`}
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </article>
  );
}
