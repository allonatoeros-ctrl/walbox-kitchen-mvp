import { useRef, useState } from 'react';
import { kitchenPesiMassimiCombos } from '../../data/kitchenMockData';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import AllergenBadges from './AllergenBadges';
import './PesiMassimiSection.css';

/**
 * Blocco PESI MASSIMI (categoria `bbq`) del menu cliente.
 * Source of truth visiva: Figma WALRUS_KITCHEN_MENU_TARGET_V1_APPROVED — Page 4
 *   HERO 128:2 · CLOSED 129:2 · EXPANDED 130:59 / 130:121 / 130:183
 *
 * Interazione: CLOSED → tap → EXPANDED (una card aperta alla volta) → CHIUDI ↑.
 * LO VOGLIO aggiunge il panino singolo, FALLO PESANTE aggiunge il combo relativo:
 * entrambi passano dallo stesso `onAdd` (= addItem del menu), quindi il payload
 * ordine resta invariato.
 *
 * Scelta birra inclusa (BEER SPRINT V1 Fase E, 2026-09-14, decisione Eros): il
 * prezzo del combo NON cambia in base alla birra scelta — resta lo stesso
 * `combo.price` fisso di sempre, nessuna logica prezzo nuova. La birra scelta va
 * solo nel `name` della riga carrello (comanda cucina), mentre `itemId` inviato
 * all'ordine resta il vero id del combo (`combo.id`, es. `item-040`) invariato:
 * è quello che il redeem promo (`kitchen_promo_pass_redeem_for_order`) e ogni
 * altra logica lato server già riconoscono — cambiarlo avrebbe rotto quella
 * allowlist. Per distinguere comunque le quantità quando lo stesso combo viene
 * scelto due volte con birre diverse, la riga carrello usa un id composito
 * (`combo.id::beerId`, campo `baseId` = `combo.id` per il payload reale), gestito
 * in `CustomerKitchenMenu.jsx` (`addItem`/`handleSubmit`). Krombacher segue la
 * stessa regola `evening_only` di BirreSection (§3 missione, soglia 18:00 in
 * `kitchenServiceRules.js`).
 *
 * FINAL UX POLISH (2026-09-16): due interventi.
 *  1. BEER DISCOVERY — il selettore birra di FALLO PESANTE non sceglie più "alla cieca":
 *     tap su una birra apre il suo dettaglio in-place (foto, nome, `choiceLabel`, `story`,
 *     taste signals, formato) e la scelta si conferma con "SCEGLI QUESTA BIRRA". Dopo la
 *     conferma la riga "BIRRA INCLUSA SCELTA" rende esplicita la selezione, con "CAMBIA"
 *     per riaprire il dettaglio. Zero duplicazione dati: legge gli stessi campi di
 *     `kitchenMockData` già usati da BirreSection. Il prezzo del combo resta invariato —
 *     il dettaglio mostra solo formato + "INCLUSA NEL COMBO" (nessun prezzo di listino) — e il
 *     payload di `onAdd` (id composito, `baseId`, `includesBeerId`) non cambia.
 *  2. HERO — il badge "WALRUS SPECIAL" non è più in overlay sulle foto dei panini: vive
 *     nel blocco contenuto, sopra il titolo PESI MASSIMI (vedi PesiMassimiSection.css).
 *
 * MENU POLISH SPRINT (2026-09-16): la CTA della card chiusa e la nota prezzo dell'EXPANDED
 * accettano un override per-item (`item.detailCtaLabel` / `item.priceNote`). Serve al
 * Box Pulled Pork (`item-018`), che sta in PESI MASSIMI per decisione di Eros ma non è un
 * panino: mostra "VEDI IL BOX" / "SOLO BOX". Senza override, i 3 panini smoked restano su
 * "VEDI IL PANINO" / "SOLO PANINO" — nessun id hardcoded qui dentro.
 */

const CARET_SRC = '/assets/kitchen/pesi-massimi-caret.svg';

function formatPrice(value, forceDecimals = false) {
  if (value == null) return '';
  if (!forceDecimals && Number.isInteger(value)) return `€${value}`;
  return `€${value.toFixed(2).replace('.', ',')}`;
}

/**
 * Props opzionali (additive, non cambiano il rendering approvato):
 *  - heroOnly: renderizza SOLO la hero fotografica (128:2), usata nella Home.
 *  - onHeroCta: override del CTA `SCOPRI →` (default: scroll alla lista CLOSED).
 *  - hideCombo: nasconde il blocco upsell FALLO PESANTE. Serve a /kitchen/promo,
 *    dove il menu mostra solo panini singoli. Default false = menu invariato.
 *  - forceDecimals: forza i due decimali anche sui prezzi interi (€15,00 invece
 *    di €15). Default false = formattazione approvata del menu invariata.
 *  - beerOptions: catalogo birre reali (categoria `birre`, tag `birre-v1`) tra cui
 *    scegliere per FALLO PESANTE. Default `[]` = nessuna birra disponibile, il
 *    selettore non appare (stesso comportamento di prima di Fase E).
 */
export default function PesiMassimiSection({
  items,
  onAdd,
  heroOnly = false,
  onHeroCta,
  hideCombo = false,
  forceDecimals = false,
  beerOptions = [],
}) {
  const [openId, setOpenId] = useState(null);
  const [selectedBeerByItem, setSelectedBeerByItem] = useState({});
  const [previewBeerByItem, setPreviewBeerByItem] = useState({});
  const listRef = useRef(null);
  const bodyRefs = useRef({});

  if (!items || items.length === 0) return null;

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <section className="pm-root" aria-label="Pesi Massimi">
      {/* ── HERO FOTOGRAFICA (128:2) ── */}
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

      {/* ── LISTA CLOSED / EXPANDED ── */}
      {!heroOnly && (
      <div className="pm-list" ref={listRef}>
        {items.map((item) => {
          const isOpen = openId === item.id;
          const soldOut = item.available === false;
          const combo = hideCombo ? null : kitchenPesiMassimiCombos[item.id];
          const chosenBeer = beerOptions.find((b) => b.id === selectedBeerByItem[item.id]) ?? null;
          const previewBeer = beerOptions.find((b) => b.id === previewBeerByItem[item.id]) ?? null;
          const previewLocked =
            previewBeer?.availability === 'evening_only' && !isEveningServiceActive();
          return (
            <article
              key={item.id}
              className={`pm-card${isOpen ? ' pm-card--open' : ''}${soldOut ? ' pm-card--soldout' : ''}`}
            >
              <div className="pm-card-media">
                <img className="pm-card-photo" src={item.image} alt={item.name} />
                <div className="pm-card-photo-scrim" />
                <div className="pm-card-accent" />
                <h3 className="pm-card-hero-name">{item.name.toUpperCase()}</h3>

                <button
                  type="button"
                  className="pm-card-close"
                  onClick={() => setOpenId(null)}
                  tabIndex={isOpen ? 0 : -1}
                >
                  CHIUDI
                  <img className="pm-caret" src={CARET_SRC} alt="" />
                </button>

                <button
                  type="button"
                  className="pm-card-closed"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  tabIndex={isOpen ? -1 : 0}
                >
                  <span className="pm-card-closed-name">{item.name.toUpperCase()}</span>
                  <span className="pm-card-closed-price">{formatPrice(item.price, forceDecimals)}</span>
                  <span className="pm-card-open-cta">
                    {soldOut ? 'ESAURITO' : (item.detailCtaLabel ?? 'VEDI IL PANINO')}
                  </span>
                  <img className="pm-caret pm-card-caret" src={CARET_SRC} alt="" />
                </button>
              </div>

              <div
                className="pm-card-body"
                ref={(el) => { bodyRefs.current[item.id] = el; }}
                onTransitionEnd={(e) => {
                  if (e.propertyName === 'grid-template-rows' && isOpen) {
                    bodyRefs.current[item.id]?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }
                }}
              >
                <div className="pm-card-body-inner">
                  <p className="pm-card-ingredients">{item.ingredients}</p>
                  <AllergenBadges allergens={item.allergens} />
                  <div className="pm-card-rule" />
                  <div className="pm-price-row">
                    <span className="pm-price-block">
                      <span className="pm-price-value">{formatPrice(item.price, forceDecimals)}</span>
                      <span className="pm-price-note">{item.priceNote ?? 'SOLO PANINO'}</span>
                    </span>
                    <button
                      type="button"
                      className="pm-btn-want"
                      disabled={soldOut}
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

                  {combo && (
                    <div className="pm-upsell">
                      <div className="pm-upsell-accent" />
                      <p className="pm-upsell-title">FALLO PESANTE</p>
                      <p className="pm-upsell-sub">{combo.subtitle}</p>

                      {beerOptions.length > 0 && (
                        <div className="pm-upsell-beer-picker" role="group" aria-label="Scegli la birra inclusa">
                          <p className="pm-upsell-beer-label">
                            {chosenBeer ? 'BIRRA INCLUSA SCELTA' : 'SCEGLI LA BIRRA INCLUSA'}
                          </p>

                          {chosenBeer && (
                            <div className="pm-beer-chosen">
                              {chosenBeer.image && (
                                <img className="pm-beer-chosen-photo" src={chosenBeer.image} alt="" />
                              )}
                              <span className="pm-beer-chosen-name">{chosenBeer.name.toUpperCase()}</span>
                              <button
                                type="button"
                                className="pm-beer-chosen-change"
                                tabIndex={isOpen ? 0 : -1}
                                onClick={() => setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: chosenBeer.id }))}
                              >
                                CAMBIA
                              </button>
                            </div>
                          )}

                          <div className="pm-upsell-beer-list">
                            {beerOptions.map((beer) => {
                              const beerLocked = beer.availability === 'evening_only' && !isEveningServiceActive();
                              const isSelected = selectedBeerByItem[item.id] === beer.id;
                              const isPreview = previewBeer?.id === beer.id;
                              return (
                                <button
                                  key={beer.id}
                                  type="button"
                                  className={`pm-beer-pill${isSelected ? ' pm-beer-pill--selected' : ''}${isPreview ? ' pm-beer-pill--preview' : ''}`}
                                  disabled={beerLocked}
                                  aria-expanded={isPreview}
                                  tabIndex={isOpen ? 0 : -1}
                                  onClick={() => setPreviewBeerByItem((prev) => ({
                                    ...prev,
                                    [item.id]: prev[item.id] === beer.id ? null : beer.id,
                                  }))}
                                >
                                  {beer.image && (
                                    <img className="pm-beer-pill-photo" src={beer.image} alt="" />
                                  )}
                                  <span className="pm-beer-pill-name">{beer.name}</span>
                                  {beerLocked && <span className="pm-beer-pill-lock"> · SOLO LA SERA</span>}
                                </button>
                              );
                            })}
                          </div>

                          {previewBeer && (
                            <div className="pm-beer-detail">
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
                                    decisione Eros): dentro il combo la birra e' inclusa, mostrarne
                                    il prezzo suggeriva un costo aggiuntivo che non esiste. Resta il
                                    formato + INCLUSA NEL COMBO. */}
                                <p className="pm-beer-detail-meta">
                                  {previewBeer.format ? `${previewBeer.format.toUpperCase()} · ` : ''}
                                  INCLUSA NEL COMBO
                                </p>
                                <div className="pm-beer-detail-actions">
                                  <button
                                    type="button"
                                    className="pm-beer-detail-cta"
                                    disabled={previewLocked}
                                    tabIndex={isOpen ? 0 : -1}
                                    onClick={() => {
                                      setSelectedBeerByItem((prev) => ({ ...prev, [item.id]: previewBeer.id }));
                                      setPreviewBeerByItem((prev) => ({ ...prev, [item.id]: null }));
                                    }}
                                  >
                                    {previewLocked ? 'SOLO LA SERA' : 'SCEGLI QUESTA BIRRA'}
                                  </button>
                                  <button
                                    type="button"
                                    className="pm-beer-detail-close"
                                    tabIndex={isOpen ? 0 : -1}
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

                      <div className="pm-upsell-row">
                        <p className="pm-upsell-price">{formatPrice(combo.price, forceDecimals)}</p>
                        <button
                          type="button"
                          className="pm-btn-heavy"
                          disabled={soldOut || (beerOptions.length > 0 && !selectedBeerByItem[item.id])}
                          tabIndex={isOpen ? 0 : -1}
                          onClick={() => {
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
                          FALLO PESANTE
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      )}
    </section>
  );
}
