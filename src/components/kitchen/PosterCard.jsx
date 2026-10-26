import { useEffect, useRef, useState } from 'react';
import { ALLERGEN_LABEL } from './AllergenBadges';
import { formatPrice } from '../../lib/kitchenPrice';
import './PosterCard.css';

/**
 * "Locandina" del menu cliente (Fase 3.2 restyling, direzione B "Poster da pub").
 * Usata da Panini, Pesi Massimi, Insalatone, Tartare, Taglieri e Cicchetti (stesso schema per tutti).
 *
 * Fase 3.4f: card SEMPRE APERTA, foto come in HEAD f5ed050 (cornice 4:3, `objectPosition` per id,
 * nessuno zoom) con nome (crema) + prezzo (oro) di nuovo SOPRA la foto, in basso:
 *  - sfumatura leggera solo nel terzo basso della foto + ombra del testo leggera (leggibilità);
 *  - sulla foto anche N°/VEG in alto a sinistra, badge ×N in alto a destra se il prodotto è già
 *    nel sacco, timbro ESAURITO;
 *  - sotto la foto: descrizione in 3 blocchi con aria (battuta in corsivo → ingredienti → ALLERGENI oro), poi
 *    `children` (es. scelta SOLO PANINO / MENU dei Pesi Massimi) e CTA → stepper − N +, sempre visibili.
 *  Niente stato aperta/chiusa: nessun tocco sulla foto, nessun "+" nell'angolo, nessuno scroll
 *  "all'apertura". Resta lo scroll al primo AGGIUNGI: quando compare il dock del sacco lo stepper
 *  viene portato sopra il dock e sopra il toast "aggiunto" (anche con prefers-reduced-motion: scroll istantaneo).
 *
 * Props:
 *  - item        { id, name, description, ingredients, price, image, allergens, tags, available }
 *  - index       posizione 0-based nella lista (per il N° "01")
 *  - qty         quantità già nel carrello (0 = mostra AGGIUNGI)
 *  - onAdd(p)    p = { id, name, price, image } (stesso payload che usava la card Panini)
 *  - onRemove(id) toglie 1 dal carrello
 *  - objectPosition  ritaglio 4:3 della foto quadrata (default centro)
 *  - children    (opzionale) spazio extra dentro la card, prima della CTA (Fase 3.4b: scelta
 *                SOLO PANINO / MENU di Pesi Massimi). Assente = nessun cambiamento.
 *  - compact     (opzionale, default false) restyling hero: scheda bassa come nel riferimento, foto a sinistra e
 *                a destra nome, ingredienti, prezzo e "+" giallo tondo (o stepper − N +). Stessi dati, stessi
 *                handler, stessi aria-label; la battuta in corsivo non si mostra. Default = nessun cambiamento.
 *  - photoZoom   (opzionale, solo compact, default 1) ingrandisce la foto attorno a `objectPosition`: le foto
 *                quadrate con il panino piccolo (Pesi Massimi) nel riquadro stretto della scheda compatta.
 *  - displayName (opzionale, solo compact) titolo mostrato al posto di `item.name` (nel sacco resta `item.name`).
 *  - meta        (opzionale, solo compact) riga piccola sotto il nome (formato / scelta di una birra o bevanda).
 *  - lockedLabel (opzionale, solo compact) blocca l'ordine con un motivo (es. "SOLO LA SERA" per la birra alla
 *                spina fuori orario): CTA spenta, etichetta sulla foto, aria-label col motivo.
 *  - photoFit    (opzionale, solo compact, default cover) "contain" per le foto verticali (bottiglie).
 *  - hideCta     (opzionale, default false) nasconde CTA/stepper della card: lo usa chi mette nei
 *                `children` una propria CTA (MENU). Default = nessun cambiamento.
 *
 * Fallback: price null/vuoto → nessun prezzo accanto al nome, CTA spenta "PREZZO IN ARRIVO" (nessun
 * prezzo inventato); available === false → timbro ESAURITO sulla foto + prezzo spento + CTA spenta
 * "ESAURITO"; foto assente o rotta → riquadro "FOTO IN ARRIVO" (stessa cornice, niente salti).
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

// Porta `el` sopra il dock fisso del sacco (altezza reale misurata, fallback 96 px =
// .kitch-bottom-spacer) e, se c'è, sopra il toast "aggiunto al sacco" (fisso sopra il dock per 1,2 s:
// senza questo copriva "1 NEL CARRELLO"), rispettando prefers-reduced-motion.
function scrollAboveDock(el, reduce) {
  if (!el) return;
  const place = () => {
    const dock = document.querySelector('.kitch-bottom-bar');
    const dockH = dock ? dock.getBoundingClientRect().height : 96;
    const toast = document.querySelector('.kitch-add-toast');
    // +28 px: il toast entra salendo di 12 px (kitchToastIn, qui lo si può misurare ancora in basso) + 16 px di aria.
    const toastH = toast ? window.innerHeight - toast.getBoundingClientRect().top + 28 : 0;
    el.style.scrollMarginBottom = `${Math.ceil(Math.max(dockH + 16, toastH))}px`;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  };
  place();
  // Al primo toast della sessione il suo font si scarica in quel momento e il toast cresce di una
  // riga: a font arrivato si rimisura (se serve, piccola correzione dello scroll).
  if (document.querySelector('.kitch-add-toast') && document.fonts?.status === 'loading') {
    document.fonts.ready.then(place);
  }
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

export default function PosterCard({
  item,
  index = 0,
  qty = 0,
  onAdd,
  onRemove,
  objectPosition = '50% 50%',
  children = null,
  hideCta = false,
  compact = false,
  photoZoom = 1,
  displayName = null,
  meta = null,
  lockedLabel = null,
  photoFit = 'cover',
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
        // Al primo add compare il dock fisso del sacco: porta lo stepper sopra il dock.
        scrollAboveDock(stepperRef.current, prefersReducedMotion());
      }
    } else {
      // stepper → CTA: il focus torna su AGGIUNGI invece di perdersi sul body.
      ctaRef.current?.focus({ preventScroll: true });
    }
  }, [qty]);

  const soldOut = item.available === false;
  const noPrice = item.price == null || item.price === '';
  const canAdd = !soldOut && !noPrice && !lockedLabel;
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
  else if (lockedLabel) ctaLabel = lockedLabel;
  else if (noPrice) ctaLabel = 'PREZZO IN ARRIVO';

  if (compact) {
    // Se gli ingredienti ripetono il nome ("Acqua." sotto ACQUA) la riga utile e' la descrizione.
    const sameAsName = (t) => String(t ?? '').trim().replace(/\.$/, '').toLowerCase()
      === String(item.name ?? '').trim().replace(/\.$/, '').toLowerCase();
    // N-06: mai mostrare al cliente note interne dei dati ("Patate al forno, standalone."): un testo che contiene
    // "standalone" e' scartato. Se resta solo un testo che ripete il nome, nessuna riga.
    const isInternalNote = (t) => /standalone/i.test(String(t ?? ''));
    const usable = (t) => Boolean(t) && !isInternalNote(t);
    let blurb = null;
    if (usable(item.ingredients) && !sameAsName(item.ingredients)) blurb = item.ingredients;
    else if (usable(item.description) && !sameAsName(item.description)) blurb = item.description;
    return (
      <article
        className={`pc-card pc-card--compact${soldOut ? ' pc-card--soldout' : ''}`}
        data-testid="poster-card"
      >
        <div className="pc-row">
          <div className={`pc-shot${photoFit === 'contain' ? ' pc-shot--contain' : ''}`}>
            {showPhoto ? (
              <img
                className="pc-photo"
                src={item.image}
                alt=""
                style={photoZoom > 1
                  ? { objectPosition, transform: `scale(${photoZoom})`, transformOrigin: objectPosition }
                  : { objectPosition, objectFit: photoFit }}
                loading={index < 2 ? 'eager' : 'lazy'}
                decoding="async"
                onError={() => setFailedSrc(item.image)}
              />
            ) : (
              <span className="pc-photo-missing" aria-hidden="true">FOTO IN ARRIVO</span>
            )}
            {(isVeg || (lockedLabel && !soldOut)) && (
              <span className="pc-tags">
                {isVeg && <span className="pc-veg">VEG</span>}
                {lockedLabel && !soldOut && <span className="pc-lock">{lockedLabel}</span>}
              </span>
            )}
            {qty > 0 && (
              <span className="pc-qty-badge" data-testid="poster-card-qty">
                <span aria-hidden="true">×{qty}</span>
                <span className="pc-sr">{qty} nel sacco</span>
              </span>
            )}
            {soldOut && <span className="pc-soldout-stamp">ESAURITO</span>}
          </div>
          <div className="pc-info">
            <h3 className="pc-name">{displayName ?? item.name}</h3>
            {meta && <p className="pc-meta">{meta}</p>}
            {blurb && <p className="pc-ingredients">{blurb}</p>}
            <div className="pc-buy">
              {noPrice ? (
                <span className="pc-price pc-price--soon">PREZZO IN ARRIVO</span>
              ) : hideCta ? <span /> : (
                // Con la CTA nascosta (Pesi Massimi: scelto il MENU) il prezzo della riga alta sarebbe quello del
                // solo panino: la scelta sotto mostra già il prezzo giusto.
                <span className="pc-price">{formatPrice(item.price)}</span>
              )}
              {hideCta ? null : qty > 0 ? (
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
                    <span aria-hidden="true">{qty}</span>
                    <span className="pc-sr">{qty} nel carrello</span>
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
                  <span aria-hidden="true">+</span>
                </button>
              )}
            </div>
          </div>
        </div>
        {(allergens.length > 0 || children) && (
          <div className="pc-under">
            {allergens.length > 0 && (
              <p className="pc-allergens">
                Allergeni:{' '}
                {allergens.map(allergenText).join(' · ')}
              </p>
            )}
            {children}
          </div>
        )}
      </article>
    );
  }

  return (
    <article
      className={`pc-card${soldOut ? ' pc-card--soldout' : ''}`}
      data-testid="poster-card"
    >
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
          <span className="pc-photo-missing" aria-hidden="true">FOTO IN ARRIVO</span>
        )}
        <span className="pc-scrim" aria-hidden="true" />
        <span className="pc-tags">
          <span className="pc-num" aria-hidden="true">N°{number}</span>
          {isVeg && <span className="pc-veg">VEG</span>}
        </span>
        {qty > 0 && (
          <span className="pc-qty-badge" data-testid="poster-card-qty">
            <span aria-hidden="true">×{qty}</span>
            <span className="pc-sr">{qty} nel sacco</span>
          </span>
        )}
        {soldOut && <span className="pc-soldout-stamp">ESAURITO</span>}
        <div className="pc-over">
          <h3 className="pc-name">
            {nameLines ? (<>{nameLines[0]}<br />{nameLines[1]}</>) : item.name}
          </h3>
          {!noPrice && (
            <span className="pc-price">
              <PriceBig value={item.price} />
            </span>
          )}
        </div>
      </div>

      <div className="pc-under">
        {item.description && !/standalone/i.test(item.description) && <p className="pc-quip">{item.description}</p>}
        {item.ingredients && <p className="pc-ingredients">{item.ingredients}</p>}
        {allergens.length > 0 && (
          <p className="pc-allergens">
            Allergeni:{' '}
            {allergens.map(allergenText).join(' · ')}
          </p>
        )}

        {children}

        {hideCta ? null : qty > 0 ? (
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
