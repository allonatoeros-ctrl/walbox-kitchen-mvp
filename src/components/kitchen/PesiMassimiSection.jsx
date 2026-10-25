import { useEffect, useRef, useState } from 'react';
import { kitchenPesiMassimiCombos } from '../../data/kitchenMockData';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import PosterCard from './PosterCard';
import { formatPrice } from '../../lib/kitchenPrice';
import './PesiMassimiSection.css';

/**
 * Blocco PESI MASSIMI (categoria `bbq`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   HERO 128:2 · CLOSED 129:2 · EXPANDED 130:59 / 130:121 / 130:183
 *
 * FASE 3.4b (restyling poster): ogni Pesi Massimi è una `PosterCard` (3.4f: sempre aperta, foto 4:3
 * come HEAD f5ed050 con nome e prezzo sopra; il blocco SOLO PANINO / MENU è sempre visibile nella card);
 * la testata manifesto `kp-head` la rende CustomerKitchenMenu, qui non c'è più la hero dentro la
 * categoria (resta solo il ramo `heroOnly`, oggi non usato dal menu). Il blocco SCEGLI COME LO VUOI
 * vive nello spazio `children` della PosterCard; la logica sotto è invariata.
 * (Storico) Interazione pre-3.4b: CLOSED → tap → EXPANDED (una card aperta alla volta) → CHIUDI ↑.
 * SCEGLI COME LO VUOI (2026-09-24): nel prodotto aperto la scelta SOLO PANINO / MENU ·
 * FALLO PESANTE è esplicita, con default SOLO PANINO. Il selettore birra appare solo col
 * MENU; la CTA finale è unica e dinamica ("AGGIUNGI SOLO PANINO · €X" / "AGGIUNGI IL MENU
 * · €X"). Entrambi i rami passano dallo stesso `onAdd` (= addItem del menu), quindi il
 * payload ordine resta invariato.
 *
 * REGRESSION FIX (2026-09-22, correzione Eros): dopo la rimozione di Krombacher dal
 * catalogo, un passaggio precedente aveva erroneamente rimosso la scelta birra dal
 * combo. Regola prodotto corretta: FALLO PESANTE include sempre `panino scelto +
 * Patate al Forno + 1 birra a scelta` tra le bottiglie rimaste (Krombacher esclusa,
 * nessun id hardcoded qui: le opzioni arrivano dalla prop `beerOptions`). Selettore a
 * pillole ripristinato (BEER SPRINT V1 Fase E, 2026-09-14): tap su una birra apre il
 * dettaglio in-place, la scelta si conferma con
 * "SCEGLI QUESTA BIRRA". Il prezzo del combo NON cambia in base alla birra scelta — resta
 * `combo.price` fisso — e la birra scelta va solo nel `name` della riga carrello, mentre
 * `itemId` inviato all'ordine resta il vero id del combo (`combo.id`, es. `item-040`),
 * invariato per non rompere l'allowlist del redeem promo
 * (`kitchen_promo_pass_redeem_for_order`). Per distinguere le quantità quando lo stesso
 * combo è scelto due volte con birre diverse, la riga carrello usa un `id` composito solo
 * lato UI (`combo.id::beerId`), con `baseId` = vero id del combo (gestito in
 * `CustomerKitchenMenu.jsx`/`kitchenCart.js`).
 *
 * Availability: FALLO PESANTE è disabilitato se il panino è ESAURITO, se l'incluso
 * `includedSide` (Patate al Forno) è ESAURITO/senza prezzo, o se non è stata scelta
 * ancora una birra (quando `beerOptions` non è vuoto). Il gate `evening_only` resta
 * infrastruttura viva in `kitchenServiceRules.js` per birre future — nessuna delle 6
 * birre attuali lo usa, quindi oggi non blocca nulla.
 *
 * HERO (FINAL UX POLISH 2026-09-16): il badge "WALRUS SPECIAL" non è in overlay sulle foto
 * dei panini, vive nel blocco contenuto sopra il titolo PESI MASSIMI (vedi il CSS).
 *
 * MENU POLISH SPRINT (2026-09-16): la CTA della card chiusa e la nota prezzo dell'EXPANDED
 * accettano un override per-item (`item.detailCtaLabel` / `item.priceNote`). Serve al
 * Box Pulled Pork (`item-018`), che sta in PESI MASSIMI per decisione di Eros ma non è un
 * panino: mostra "VEDI IL BOX" / "SOLO BOX". Senza override, i 3 panini smoked restano su
 * "VEDI IL PANINO" / "SOLO PANINO" — nessun id hardcoded qui dentro.
 */


/**
 * Props opzionali (additive, non cambiano il rendering approvato):
 *  - heroOnly: renderizza SOLO la hero fotografica (128:2), usata nella Home.
 *  - onHeroCta: override del CTA `SCOPRI →` (default: scroll alla lista CLOSED).
 *  - hideCombo: nasconde il blocco upsell FALLO PESANTE. Serve a /kitchen/promo,
 *    dove il menu mostra solo panini singoli. Default false = menu invariato.
 *  - forceDecimals: forza i due decimali anche sui prezzi interi (€19,00 invece
 *    di €19). Default false = formattazione approvata del menu invariata.
 *  - includedSide: la voce di catalogo inclusa nel combo (Patate al Forno). Serve solo a
 *    leggerne availability e prezzo. Default `null` = incluso non risolvibile → FALLO PESANTE
 *    non ordinabile, mai un combo venduto con dentro qualcosa che non c'è.
 *  - onRemove / qtyById: stepper − N + della PosterCard per il SOLO PANINO (come Panini).
 *  - beerOptions: catalogo birre reali (categoria `birre`, tag `birre-v1`) tra cui
 *    scegliere per FALLO PESANTE. Default `[]` = nessuna birra disponibile, il
 *    selettore non appare.
 */
// Ritaglio 4:3 delle foto quadrate (stessa idea di PaniniSection). Default: centro.
// Fase 3.4f: torna esattamente il ritaglio di HEAD f5ed050 (niente zoom).
const OBJECT_POSITION_BY_ID = {
  'item-018': '75% 62%', // Box Pulled Pork: scatola a sinistra, panino a destra
};
// Scheda compatta: riquadro stretto, il panino sta nella metà destra della foto quadrata (scatola Walrus a sinistra).
const COMPACT_OBJECT_POSITION = '72% 62%';
const COMPACT_PHOTO_ZOOM = 1.3;
// Fase 3.4f: niente più scrim speciale per il Box (sacchetto bianco): con la sfumatura e l'ombra
// del testo della PosterCard il nome sta già sopra 4,5:1 (misurato), quindi via il wrapper scuro.

// Nome birra: le parole col trattino (LAND-PILS) non si spezzano a capo sul trattino.
function beerNameNodes(name) {
  return String(name).split(' ').map((w, i, arr) => (
    <span key={i}>
      {w.includes('-') ? <span className="pm-nobreak">{w}</span> : w}
      {i < arr.length - 1 ? ' ' : ''}
    </span>
  ));
}

// Porta `el` sopra il dock fisso del sacco (altezza reale misurata, fallback 96 px) e, se c'è,
// sopra il toast "aggiunto al sacco" (3.4f), con `prefers-reduced-motion` rispettato. Nessuna
// dipendenza da transitionend.
function scrollAboveDock(el) {
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
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

export default function PesiMassimiSection({
  items,
  onAdd,
  heroOnly = false,
  onHeroCta,
  hideCombo = false,
  forceDecimals = false,
  includedSide = null,
  beerOptions = [],
  featuredTag = null,
  onRemove,
  qtyById,
}) {
  // Evento 15 anni: l'item col `featuredTag` va in cima (fuori scope 3.4b: nessun look speciale). Senza `featuredTag` nulla cambia.
  const featuredItem = featuredTag ? items?.find((i) => i.tags?.includes(featuredTag)) ?? null : null;
  const [selectedBeerByItem, setSelectedBeerByItem] = useState({});
  const [previewBeerByItem, setPreviewBeerByItem] = useState({});
  // SCEGLI COME LO VUOI (2026-09-24): scelta esplicita e visibile tra SOLO PANINO e MENU
  // per ogni prodotto aperto. Default SOLO PANINO — il selettore birra compare solo col MENU.
  const [choiceByItem, setChoiceByItem] = useState({});
  const listRef = useRef(null);
  // Scroll dopo il render: { id, kind: 'detail' | 'pick' } (dettaglio birra aperto / birra confermata).
  const pendingScrollRef = useRef(null);
  const detailRefs = useRef({});
  const pickRefs = useRef({});

  useEffect(() => {
    const p = pendingScrollRef.current;
    if (!p) return;
    pendingScrollRef.current = null;
    scrollAboveDock(p.kind === 'detail' ? detailRefs.current[p.id] : pickRefs.current[p.id]);
  }, [previewBeerByItem, selectedBeerByItem, qtyById]);

  if (!items || items.length === 0) return null;

  const orderedItems = featuredItem ? [featuredItem, ...items.filter((i) => i.id !== featuredItem.id)] : items;

  return (
    <section className="pm-root" aria-label="Pesi Massimi">
      {/* ── HERO FOTOGRAFICA (128:2): solo `heroOnly` (ex Home, oggi non usato dal menu) ── */}
      {heroOnly && (
      <div className="pm-hero">
        <div className="pm-hero-photos" aria-hidden="true">
          {items.map((item) => (
            <img key={item.id} src={item.image} alt="" className="pm-hero-photo" />
          ))}
        </div>
        <div className="pm-hero-scrim" />
        <div className="pm-accent-bar" />
        <div className="pm-hero-body">
          <p className="pm-hero-badge">WALRUS SPECIAL</p>
          <h2 className="pm-hero-title">PESI MASSIMI</h2>
          <p className="pm-hero-sub">
            {items.map((i) => i.name.toUpperCase()).join(' · ')}
          </p>
          <div className="pm-hero-cta-row">
            <p className="pm-hero-tagline">AFFUMICATO. ESAGERATO. SENZA SCUSE.</p>
            <button
              type="button"
              className="pm-hero-cta"
              onClick={() => {
                if (onHeroCta) onHeroCta();
                else listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              SCOPRI →
            </button>
          </div>
          <div className="pm-hero-rule" />
          <div className="pm-hero-prices">
            {items.map((item) => (
              <div key={item.id}>
                <p className="pm-hero-price-label">{item.name.toUpperCase()}</p>
                <p className="pm-hero-price-value">{formatPrice(item.price, forceDecimals)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* ── LISTA: PosterCard sempre aperte ── */}
      {!heroOnly && (
      <div className="pm-list" ref={listRef}>
        {orderedItems.map((item, index) => {
          const soldOut = item.available === false;
          const combo = hideCombo ? null : kitchenPesiMassimiCombos[item.id];
          const chosenBeer = beerOptions.find((b) => b.id === selectedBeerByItem[item.id]) ?? null;
          const previewBeer = beerOptions.find((b) => b.id === previewBeerByItem[item.id]) ?? null;
          const previewLocked =
            previewBeer?.availability === 'evening_only' && !isEveningServiceActive();
          // Inclusi del combo: contorno (`side`, sempre) + birra a scelta (`beerOptions`, se presenti).
          const sideMissing = !includedSide || includedSide.available === false || includedSide.price == null;
          const comboBlocked = soldOut || sideMissing;
          const beerNotChosen = beerOptions.length > 0 && !selectedBeerByItem[item.id];
          // SCEGLI COME LO VUOI (2026-09-24): default SOLO PANINO, il MENU si sceglie.
          const isMenuChoice = Boolean(combo) && !comboBlocked && (choiceByItem[item.id] ?? 'solo') === 'menu';

          const choiceBlock = combo ? (
            <div className={`pmx${soldOut ? ' pmx--off' : ''}`}>
              <p className="pmx-title">1 · SCEGLI COME LO VUOI</p>
              <div
                className="pmx-choose"
                data-testid="fallo-pesante-choose"
                role="group"
                aria-label="Scegli come lo vuoi"
              >
                <button
                  type="button"
                  className={`pmx-opt${!isMenuChoice ? ' pmx-opt--on' : ''}`}
                  aria-pressed={!isMenuChoice}
                  disabled={soldOut}
                  data-testid="choose-solo"
                  onClick={() => setChoiceByItem((prev) => ({ ...prev, [item.id]: 'solo' }))}
                >
                  <span className="pmx-radio" aria-hidden="true" />
                  <span className="pmx-opt-body">
                    <span className="pmx-opt-name">SOLO PANINO</span>
                    <span className="pmx-opt-price">{formatPrice(item.price, forceDecimals)}</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={`pmx-opt${isMenuChoice ? ' pmx-opt--on' : ''}${comboBlocked ? ' pmx-opt--blocked' : ''}`}
                  aria-pressed={isMenuChoice}
                  disabled={comboBlocked}
                  data-testid="choose-menu"
                  onClick={() => setChoiceByItem((prev) => ({ ...prev, [item.id]: 'menu' }))}
                >
                  <span className="pmx-radio" aria-hidden="true" />
                  <span className="pmx-opt-body">
                    <span className="pmx-opt-name">MENU · FALLO PESANTE</span>
                    <span className="pmx-opt-sub" data-testid="fallo-pesante-includes">
                      {sideMissing && !soldOut ? 'PATATE FINITE: SOLO PANINO' : combo.subtitle}
                    </span>
                    <span className="pmx-opt-price">{formatPrice(combo.price, forceDecimals)}</span>
                  </span>
                </button>
              </div>

              {/* Il selettore birra esiste SOLO quando il MENU è selezionato: con
                  SOLO PANINO resta nascosto (non disabilitato). */}
              {isMenuChoice && !comboBlocked && beerOptions.length > 0 && (
                <div className="pmx-beer" role="group" aria-label="Scegli la birra inclusa">
                  <div className="pmx-beer-head">
                    <h4 className="pmx-beer-title" data-testid="fallo-pesante-beer-step">
                      2 · SCEGLI LA TUA BIRRA
                    </h4>
                    <span className="pmx-beer-badge">OBBLIGATORIO</span>
                  </div>
                  <p className="pmx-beer-sub">Seleziona una birra inclusa nel menu</p>

                  {chosenBeer && (
                    <div className="pm-beer-chosen">
                      {chosenBeer.image && (
                        <img className="pm-beer-chosen-photo" src={chosenBeer.image} alt="" />
                      )}
                      <span className="pm-beer-chosen-name" data-testid="fallo-pesante-beer-chosen">
                        ✓ {chosenBeer.name.toUpperCase()} SELEZIONATA
                      </span>
                      <button
                        type="button"
                        className="pm-beer-chosen-change"
                        onClick={() => {
                          pendingScrollRef.current = { id: item.id, kind: 'detail' };
                          setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: chosenBeer.id }));
                        }}
                      >
                        CAMBIA
                      </button>
                    </div>
                  )}

                  <div className="pm-beer-pills">
                    {beerOptions.map((beer) => {
                      const beerLocked = beer.availability === 'evening_only' && !isEveningServiceActive();
                      const isSelected = selectedBeerByItem[item.id] === beer.id;
                      const isPreview = previewBeer?.id === beer.id;
                      return (
                        <button
                          key={beer.id}
                          type="button"
                          className={`pm-beer-pill${isSelected ? ' pm-beer-pill--on' : ''}${isPreview ? ' pm-beer-pill--preview' : ''}`}
                          disabled={beerLocked}
                          aria-expanded={isPreview}
                          onClick={() => {
                            if (previewBeerByItem[item.id] !== beer.id) {
                              pendingScrollRef.current = { id: item.id, kind: 'detail' };
                            }
                            setPreviewBeerByItem((prev) => ({
                              ...prev,
                              [item.id]: prev[item.id] === beer.id ? null : beer.id,
                            }));
                          }}
                        >
                          {beer.image && (
                            <img className="pm-beer-pill-photo" src={beer.image} alt="" />
                          )}
                          <span className="pm-beer-pill-name">{beerNameNodes(beer.name)}</span>
                          {beerLocked && <span className="pm-beer-pill-lock"> · SOLO LA SERA</span>}
                        </button>
                      );
                    })}
                  </div>

                  {previewBeer && (
                    <div className="pm-beer-detail" ref={(el) => { detailRefs.current[item.id] = el; }}>
                      <div className="pm-beer-detail-media">
                        {previewBeer.image ? (
                          <img className="pm-beer-detail-photo" src={previewBeer.image} alt={previewBeer.name} />
                        ) : (
                          <span className="pm-beer-detail-placeholder" aria-hidden="true">🍺</span>
                        )}
                      </div>
                      <div className="pm-beer-detail-body">
                        <h4 className="pm-beer-detail-name">{previewBeer.name.toUpperCase()}</h4>
                        {previewBeer.choiceLabel && (
                          <p className="pm-beer-detail-choice">{previewBeer.choiceLabel}</p>
                        )}
                        {previewBeer.story && (
                          <p className="pm-beer-detail-story">{previewBeer.story}</p>
                        )}
                        {previewBeer.tasteSignals && previewBeer.tasteSignals.length > 0 && (
                          <p className="pm-beer-detail-taste">
                            {previewBeer.tasteSignals.slice(0, 2).join(' · ')}
                          </p>
                        )}
                        {/* Il prezzo di listino della birra e' stato rimosso (2026-09-16,
                            decisione Eros): dentro il combo la birra e' inclusa. */}
                        <p className="pm-beer-detail-meta">
                          {previewBeer.format ? `${previewBeer.format.toUpperCase()} · ` : ''}
                          INCLUSA NEL COMBO
                        </p>
                        <div className="pm-beer-detail-actions">
                          <button
                            type="button"
                            className="pm-beer-detail-cta"
                            disabled={previewLocked}
                            onClick={() => {
                              pendingScrollRef.current = { id: item.id, kind: 'pick' };
                              setSelectedBeerByItem((prev) => ({ ...prev, [item.id]: previewBeer.id }));
                              setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: null }));
                            }}
                          >
                            {previewLocked ? 'SOLO LA SERA' : 'SCEGLI QUESTA BIRRA'}
                          </button>
                          <button
                            type="button"
                            className="pm-beer-detail-close"
                            onClick={() => setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: null }))}
                          >
                            CHIUDI
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CTA del MENU (con SOLO PANINO la CTA è quella della PosterCard). */}
              {isMenuChoice && (
                <div className="pmx-pick" ref={(el) => { pickRefs.current[item.id] = el; }}>
                  {chosenBeer && (
                    <p className="pmx-pick-beer">BIRRA: {chosenBeer.name.toUpperCase()}</p>
                  )}
                <button
                  type="button"
                  className="pc-cta pmx-menu-cta"
                  disabled={comboBlocked || beerNotChosen}
                  data-testid="fallo-pesante-cta"
                  onClick={() => {
                    if (comboBlocked || beerNotChosen) return;
                    // Dopo l'add compare il dock del sacco (e il toast): porta la CTA del MENU sopra.
                    pendingScrollRef.current = { id: item.id, kind: 'pick' };
                    onAdd({
                      id: chosenBeer ? `${combo.id}::${chosenBeer.id}` : combo.id,
                      baseId: combo.id,
                      name: chosenBeer ? `${combo.name} · ${chosenBeer.name}` : combo.name,
                      price: combo.price,
                      image: combo.image,
                      includesBeerId: chosenBeer?.id,
                    });
                  }}
                >
                  {soldOut
                    ? 'ESAURITO'
                    : sideMissing
                      ? 'NON DISPONIBILE'
                      : beerNotChosen
                        ? 'SCEGLI UNA BIRRA PER CONTINUARE'
                        : `AGGIUNGI IL MENU · ${formatPrice(combo.price, forceDecimals)}`}
                </button>
                </div>
              )}
            </div>
          ) : null;

          return (
            <PosterCard
              key={item.id}
              item={item}
              index={index}
              qty={qtyById?.[item.id] ?? 0}
              onAdd={onAdd}
              onRemove={onRemove}
              objectPosition={OBJECT_POSITION_BY_ID[item.id] ?? COMPACT_OBJECT_POSITION}
              photoZoom={COMPACT_PHOTO_ZOOM}
              hideCta={isMenuChoice}
              compact
            >
              {choiceBlock}
            </PosterCard>
          );
        })}
      </div>
      )}
    </section>
  );
}
