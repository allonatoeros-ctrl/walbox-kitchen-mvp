import { useEffect, useRef, useState } from 'react';
import { kitchenPesiMassimiCombos } from '../../data/kitchenMockData';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import PosterCard from './PosterCard';
import { formatPrice } from '../../lib/kitchenPrice';
import {
  buildFalloPesanteCartLine,
  falloPesanteBeerExtra,
  falloPesanteIncludesLabel,
  falloPesanteMenuSupplement,
  falloPesanteNeedsSide,
  falloPesanteVariant,
} from '../../lib/kitchenPesiMassimi';
import './PesiMassimiSection.css';

/*
 * H7 fase 1 (2026-10-29, "menu chiaro"): per i Pesi Massimi CON menu la riga prezzo della scheda mostra solo il
 * prezzo del panino (nessun "+" che aggiunge prima della scelta: `hideAdd`). Sotto, due scelte che sembrano scelte,
 * non pulsanti: "SOLO PANINO" (senza prezzo) e "FALLO PESANTE" (sottotitolo fisso + supplemento "+X €" calcolato dai
 * dati). Col menu: "SCEGLI DA BERE" con prima le bibite (comprese) poi le birre (+Y €). UN solo pulsante d'acquisto in
 * fondo che segue la scelta ("AGGIUNGI PANINO · X" / "AGGIUNGI IL MENU · X"); dopo l'add "AGGIUNTO ✓" ~1,5 s e
 * spento. La riga carrello e la nota "BIRRA/BIBITA INCLUSA" sono identiche a prima (stessi payload, stessi helper).
 * Senza menu (Pulled Pork panino, Garpez, o `hideCombo`) la scheda resta quella di prima, col "+" / stepper.
 *
 * MENU OTTOBRE (2026-10-28, decisione Eros) — due prezzi per MENU: con birra (`combo.price`) o con
 * bibita (`combo.softDrink.price`). Prezzo e pulsante seguono la bevanda scelta (`falloPesanteVariant`), e la riga
 * carrello la costruisce `buildFalloPesanteCartLine` (id/baseId/prezzo della variante giusta). Il menu Pulled Pork
 * ora sta sul BOX (`includesSide: false`): niente patate a parte, quindi il vincolo "patate finite" vale solo con
 * `includesSide`. Etichetta della scelta singola: `item.priceNote` ("SOLO BOX") o "SOLO PANINO".
 */

/**
 * Blocco PESI MASSIMI (categoria `bbq`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   HERO 128:2 · CLOSED 129:2 · EXPANDED 130:59 / 130:121 / 130:183
 *
 * FASE 3.4b (restyling poster): ogni Pesi Massimi è una `PosterCard` (3.4f: sempre aperta, foto 4:3
 * come HEAD f5ed050 con nome e prezzo sopra; il blocco SOLO PANINO / MENU è sempre visibile nella card);
 * la testata manifesto `kp-head` la rende CustomerKitchenMenu, qui non c'è nessuna hero dentro la
 * categoria. Il blocco SCEGLI COME LO VUOI vive nello spazio `children` della PosterCard; la logica
 * sotto è invariata.
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
 * "SCEGLI QUESTA BIRRA". Il prezzo del combo NON cambia in base a QUALE birra si sceglie (da
 * MENU OTTOBRE cambia solo tra birra e bibita, vedi sopra) e la birra va nel `name` della riga carrello, mentre
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
 * MENU POLISH SPRINT (2026-09-16): la CTA della card chiusa e la nota prezzo dell'EXPANDED
 * accettano un override per-item (`item.detailCtaLabel` / `item.priceNote`). Serve al
 * Box Pulled Pork (`item-018`), che sta in PESI MASSIMI per decisione di Eros ma non è un
 * panino: mostra "VEDI IL BOX" / "SOLO BOX". Senza override, i 3 panini smoked restano su
 * "VEDI IL PANINO" / "SOLO PANINO" — nessun id hardcoded qui dentro.
 */


/**
 * Props opzionali (additive, non cambiano il rendering approvato):
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
 *    selettore non appare (a meno che non ci siano bibite).
 *  - drinkOptions (H4, 2026-10-27): bibite ammesse nel MENU al posto della birra, stesso prezzo
 *    (lista calcolata da `falloPesanteDrinkOptions` in kitchenPesiMassimi.js: acqua esclusa).
 *    La scelta e' diretta (nessuna anteprima: una bibita non ha storytelling). Default `[]`.
 *    La bevanda scelta, birra o bibita, viaggia in `includesBeerId` (nome campo invariato).
 */
// Ritaglio 4:3 delle foto quadrate (stessa idea di PaniniSection). Default: centro.
// Fase 3.4f: torna esattamente il ritaglio di HEAD f5ed050 (niente zoom).
const OBJECT_POSITION_BY_ID = {
  'item-018': '75% 62%', // Box Pulled Pork: scatola a sinistra, panino a destra
  // Pulled Pork, Pastrami, Brisket: il panino arriva al bordo destro della foto, così non si taglia.
  'item-009': '100% 62%',
  'item-010': '100% 62%',
  'item-011': '100% 62%',
};
// Scheda compatta: riquadro stretto, il panino sta nella metà destra della foto quadrata (scatola Walrus a sinistra).
const COMPACT_OBJECT_POSITION = '72% 62%';
const COMPACT_PHOTO_ZOOM = 1.3;
// Pulled Pork, Pastrami, Brisket: foto intera senza ingrandimento (con 1.3 il panino veniva tagliato).
const PHOTO_ZOOM_BY_ID = {
  'item-009': 1,
  'item-010': 1,
  'item-011': 1,
};
// H7: dopo l'aggiunta il pulsante mostra "AGGIUNTO ✓" ed e' spento per questo tempo (niente doppio tap = 2 menu).
const ADDED_FLASH_MS = 1500;
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
  hideCombo = false,
  forceDecimals = false,
  includedSide = null,
  beerOptions = [],
  drinkOptions = [],
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
  // Scroll dopo il render: { id, kind: 'detail' | 'pick' } (dettaglio birra aperto / birra confermata).
  const pendingScrollRef = useRef(null);
  const detailRefs = useRef({});
  const pickRefs = useRef({});
  // H7: "AGGIUNTO ✓" per scheda. Il lock in ref blocca il doppio tap anche prima del re-render.
  const [justAddedByItem, setJustAddedByItem] = useState({});
  const addLockRef = useRef({});
  const addTimersRef = useRef({});

  useEffect(() => {
    const timers = addTimersRef.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const flashAdded = (id) => {
    addLockRef.current[id] = true;
    setJustAddedByItem((prev) => ({ ...prev, [id]: true }));
    clearTimeout(addTimersRef.current[id]);
    addTimersRef.current[id] = setTimeout(() => {
      addLockRef.current[id] = false;
      setJustAddedByItem((prev) => ({ ...prev, [id]: false }));
    }, ADDED_FLASH_MS);
  };

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
      {/* ── LISTA: PosterCard sempre aperte ── */}
      <div className="pm-list">
        {orderedItems.map((item, index) => {
          const soldOut = item.available === false;
          const combo = hideCombo ? null : kitchenPesiMassimiCombos[item.id];
          // `selectedBeerByItem` tiene la bevanda scelta: una birra O una bibita (mai entrambe).
          const chosenBeer = beerOptions.find((b) => b.id === selectedBeerByItem[item.id]) ?? null;
          const chosenDrink = drinkOptions.find((d) => d.id === selectedBeerByItem[item.id]) ?? null;
          const chosenDrinkOrBeer = chosenBeer ?? chosenDrink;
          const hasDrinkChoice = beerOptions.length > 0 || drinkOptions.length > 0;
          const previewBeer = beerOptions.find((b) => b.id === previewBeerByItem[item.id]) ?? null;
          const previewLocked =
            previewBeer?.availability === 'evening_only' && !isEveningServiceActive();
          // Inclusi del combo: contorno (`side`, solo se `includesSide`: il Box ha gia' le patate) +
          // bevanda a scelta (`beerOptions`/`drinkOptions`, se presenti).
          const sideMissing = falloPesanteNeedsSide(combo)
            && (!includedSide || includedSide.available === false || includedSide.price == null);
          const soloLabel = item.priceNote ?? 'SOLO PANINO';
          // "SOLO PANINO" → "PANINO", "SOLO BOX" → "BOX" (testo del pulsante d'acquisto).
          const soloNoun = soloLabel.replace(/^SOLO\s+/i, '');
          // Prezzo del MENU per la bevanda scelta (variante birra/bibita).
          const comboVariant = combo ? falloPesanteVariant(combo, chosenDrinkOrBeer) : null;
          // Supplemento ed extra birra: calcolati dai dati (kitchenPesiMassimi.js), mai scritti a mano.
          // Le bibite contano solo se c'e' almeno una bibita ordinabile.
          const hasSoftDrinks = drinkOptions.length > 0;
          const menuSupplement = combo ? falloPesanteMenuSupplement(item.price, combo, hasSoftDrinks) : null;
          const beerExtra = combo ? falloPesanteBeerExtra(combo, hasSoftDrinks) : 0;
          const noPrice = item.price == null || item.price === '';
          const canAddSolo = !soldOut && !noPrice;
          const isJustAdded = Boolean(justAddedByItem[item.id]);
          const comboBlocked = soldOut || sideMissing;
          const beerNotChosen = hasDrinkChoice && !chosenDrinkOrBeer;
          // SCEGLI COME LO VUOI (2026-09-24): default SOLO PANINO, il MENU si sceglie.
          const isMenuChoice = Boolean(combo) && !comboBlocked && (choiceByItem[item.id] ?? 'solo') === 'menu';

          const choiceBlock = combo ? (
            <div className={`pmx${soldOut ? ' pmx--off' : ''}`}>
              <p className="pmx-title">SCEGLI COME LO VUOI</p>
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
                    <span className="pmx-opt-name">{soloLabel}</span>
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
                    <span className="pmx-opt-name">FALLO PESANTE</span>
                    <span className="pmx-opt-sub" data-testid="fallo-pesante-includes">
                      {sideMissing && !soldOut ? `PATATE FINITE: ${soloLabel}` : falloPesanteIncludesLabel(combo)}
                    </span>
                    {menuSupplement != null && menuSupplement > 0 && !(sideMissing && !soldOut) && (
                      <span className="pmx-opt-price" data-testid="fallo-pesante-price">
                        +{formatPrice(menuSupplement, forceDecimals)}
                      </span>
                    )}
                  </span>
                </button>
              </div>

              {/* Il selettore "SCEGLI DA BERE" esiste SOLO quando il MENU è selezionato: con
                  SOLO PANINO resta nascosto (non disabilitato). Prima le bibite (comprese), poi le birre (+Y). */}
              {isMenuChoice && !comboBlocked && hasDrinkChoice && (
                <div className="pmx-beer" role="group" aria-label="Scegli da bere">
                  <h4 className="pmx-beer-title" data-testid="fallo-pesante-beer-step">
                    SCEGLI DA BERE
                  </h4>

                  {drinkOptions.length > 0 && (
                    <>
                      <p className="pm-drink-label" data-testid="fallo-pesante-drinks-label">BIBITE · comprese</p>
                      <div className="pm-beer-pills pm-drink-pills" data-testid="fallo-pesante-drinks">
                        {drinkOptions.map((drink) => {
                          const isSelected = selectedBeerByItem[item.id] === drink.id;
                          return (
                            <button
                              key={drink.id}
                              type="button"
                              className={`pm-drink-pill${isSelected ? ' pm-drink-pill--on' : ''}`}
                              aria-pressed={isSelected}
                              data-testid={`fallo-pesante-drink-${drink.id}`}
                              onClick={() => {
                                // Scelta diretta: niente anteprima. Chiude l'eventuale dettaglio birra aperto.
                                pendingScrollRef.current = { id: item.id, kind: 'pick' };
                                setSelectedBeerByItem((prev) => ({ ...prev, [item.id]: drink.id }));
                                setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: null }));
                              }}
                            >
                              {drink.image ? (
                                <img className="pm-beer-pill-photo" src={drink.image} alt="" />
                              ) : (
                                <span className="pm-beer-pill-photo pm-beer-pill-photo--empty" aria-hidden="true" />
                              )}
                              <span className="pm-beer-pill-name">{drink.name.toUpperCase()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {beerOptions.length > 0 && (
                    <>
                      <p className="pm-drink-label" data-testid="fallo-pesante-beers-label">
                        {beerExtra > 0 ? `BIRRE · +${formatPrice(beerExtra, forceDecimals)}` : 'BIRRE · comprese'}
                      </p>
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
                              {beer.image ? (
                                <img className="pm-beer-pill-photo" src={beer.image} alt="" />
                              ) : (
                                <span className="pm-beer-pill-photo pm-beer-pill-photo--empty" aria-hidden="true" />
                              )}
                              <span className="pm-beer-pill-name">{beerNameNodes(beer.name)}</span>
                              {beerLocked && <span className="pm-beer-pill-lock"> · SOLO LA SERA</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

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
                        {/* Il prezzo di listino della birra e' stato rimosso (2026-09-16, decisione Eros):
                            nel MENU conta solo l'extra rispetto alla bibita (H7, calcolato dai dati). */}
                        <p className="pm-beer-detail-meta" data-testid="beer-detail-meta">
                          {previewBeer.format ? `${previewBeer.format.toUpperCase()} · ` : ''}
                          {beerExtra > 0 ? `NEL MENU +${formatPrice(beerExtra, forceDecimals)}` : 'COMPRESA NEL MENU'}
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

              {/* UN solo pulsante d'acquisto, in fondo, che segue la scelta. Il prezzo finale compare solo qui.
                  Dopo l'add: "AGGIUNTO ✓" ~1,5 s e disabilitato (niente doppio tap = 2 menu). */}
              <div className="pmx-pick" ref={(el) => { pickRefs.current[item.id] = el; }}>
                {isMenuChoice && chosenDrinkOrBeer && (
                  <div className="pm-beer-chosen">
                    {chosenDrinkOrBeer.image && (
                      <img className="pm-beer-chosen-photo" src={chosenDrinkOrBeer.image} alt="" />
                    )}
                    <span className="pm-beer-chosen-name" data-testid="fallo-pesante-beer-chosen">
                      DA BERE: {chosenDrinkOrBeer.name.toUpperCase()}
                    </span>
                    {chosenBeer && (
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
                    )}
                  </div>
                )}

                {isMenuChoice ? (
                  <button
                    type="button"
                    className={`pc-cta pmx-menu-cta pmx-buy${isJustAdded ? ' pmx-buy--done' : ''}`}
                    disabled={comboBlocked || beerNotChosen || isJustAdded}
                    data-testid="fallo-pesante-cta"
                    onClick={() => {
                      if (comboBlocked || beerNotChosen || addLockRef.current[item.id]) return;
                      // Dopo l'add compare il dock del sacco (e il toast): porta il pulsante sopra.
                      pendingScrollRef.current = { id: item.id, kind: 'pick' };
                      flashAdded(item.id);
                      // Riga carrello dalla lib condivisa (stessa della cassa e del reconcile):
                      // variante birra/bibita → id, baseId e prezzo giusti per il server.
                      onAdd(chosenDrinkOrBeer
                        ? buildFalloPesanteCartLine(combo, chosenDrinkOrBeer)
                        : { id: combo.id, baseId: combo.id, name: combo.name, price: combo.price, image: combo.image });
                    }}
                  >
                    {isJustAdded
                      ? 'AGGIUNTO ✓'
                      : soldOut
                        ? 'ESAURITO'
                        : beerNotChosen
                          ? 'SCEGLI DA BERE'
                          : `AGGIUNGI IL MENU · ${formatPrice(comboVariant.price, forceDecimals)}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`pc-cta pmx-menu-cta pmx-buy${isJustAdded ? ' pmx-buy--done' : ''}`}
                    disabled={!canAddSolo || isJustAdded}
                    data-testid="pmx-solo-cta"
                    aria-label={canAddSolo
                      ? `Aggiungi ${item.name}, ${soloNoun.toLowerCase()} · ${formatPrice(item.price, forceDecimals)}`
                      : undefined}
                    onClick={() => {
                      if (!canAddSolo || addLockRef.current[item.id]) return;
                      pendingScrollRef.current = { id: item.id, kind: 'pick' };
                      flashAdded(item.id);
                      // Stesso payload che mandava il "+" della PosterCard: la riga ordine non cambia.
                      onAdd({ id: item.id, name: item.name, price: item.price, image: item.image });
                    }}
                  >
                    {isJustAdded
                      ? 'AGGIUNTO ✓'
                      : soldOut
                        ? 'ESAURITO'
                        : noPrice
                          ? 'PREZZO IN ARRIVO'
                          : `AGGIUNGI ${soloNoun} · ${formatPrice(item.price, forceDecimals)}`}
                  </button>
                )}
              </div>
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
              photoZoom={PHOTO_ZOOM_BY_ID[item.id] ?? COMPACT_PHOTO_ZOOM}
              hideAdd={Boolean(combo)}
              compact
            >
              {choiceBlock}
            </PosterCard>
          );
        })}
      </div>
    </section>
  );
}
