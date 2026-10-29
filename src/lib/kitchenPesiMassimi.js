// FALLO PESANTE — forma condivisa della riga carrello (PESI MASSIMI MENU PARITY, 2026-09-24).
//
// Modulo NEUTRO, volutamente NON dentro `kitchenCart.js`: `kitchenCart` è il carrello persistito
// del CLIENTE, e la cassa (`CounterAssistedOrder`) non deve conoscerlo (vedi
// `kitchenCart.test.js` — "la cassa non deve nemmeno conoscere il modulo carrello cliente").
// La cassa ha il proprio carrello in stato React; qui c'è solo la *forma* di una riga combo,
// riusata da entrambe le superfici per non duplicarla.
//
// Contratto:
// - `id` composito `combo::birra` = solo UI, per tenere distinte le quantità quando lo stesso
//   combo è scelto con birre diverse;
// - `baseId` = vero id della variante del combo (es. `item-040` birra, `item-060` bibita): quello che va nel payload RPC
//   (`kitchen_customer_create_order`) e nell'allowlist promo, MAI l'id composito;
// - `includesBeerId` = bevanda inclusa (birra O bibita: il nome del campo resta per compatibilita'
//   con i carrelli gia' salvati in localStorage e con la cassa), risolta in nota da
//   `kitchenServiceRules.buildIncludedBeersNote`.
//
// Bibite nel MENU (H4, 2026-10-27; prezzo per variante da MENU OTTOBRE, vedi sotto). Sono ammesse
// le `bevande` ordinabili TRANNE l'acqua: una sola costante qui, mai id hardcoded nei componenti.
export const FALLO_PESANTE_EXCLUDED_DRINK_IDS = ['item-038']; // Acqua

/** True se la voce di catalogo e' una bibita ammessa nel MENU (categoria `bevande`, acqua esclusa).
 *  Non guarda la disponibilita': per quella vedi `falloPesanteDrinkOptions`. */
export function isFalloPesanteDrinkAllowed(item) {
  return !!item
    && item.category === 'bevande'
    && !FALLO_PESANTE_EXCLUDED_DRINK_IDS.includes(item.id);
}

/** Bibite selezionabili nel MENU: ammesse + ordinabili (con prezzo e non esaurite). */
export function falloPesanteDrinkOptions(menuItems) {
  return (menuItems ?? []).filter(
    (i) => isFalloPesanteDrinkAllowed(i) && i.price != null && i.available !== false,
  );
}

// MENU OTTOBRE (2026-10-28, decisione Eros): ogni MENU ha due varianti di catalogo.
// - birra  → `combo.id/name/price` (id storico item-040/041/042);
// - bibita → `combo.softDrink.id/name/price` (item-060/061/062), scelta se la bevanda e' una
//   bibita ammessa (`isFalloPesanteDrinkAllowed`). Il server prezza per item_id: l'id della
//   variante e' quello che va nel payload, quindi variante e prezzo derivano SEMPRE dalla bevanda.
// Senza bevanda (o combo senza `softDrink`) vale la variante birra.

/** Variante di catalogo `{ id, name, price }` del MENU per la bevanda scelta. */
export function falloPesanteVariant(combo, drink) {
  if (drink && isFalloPesanteDrinkAllowed(drink) && combo?.softDrink) return combo.softDrink;
  return { id: combo.id, name: combo.name, price: combo.price };
}

/** True se il MENU include le Patate al Forno a parte (non il Box, che le ha gia' dentro).
 *  Assenza del campo = incluso (scelta prudente: il vincolo patate non sparisce per errore). */
export function falloPesanteNeedsSide(combo) {
  return !!combo && combo.includesSide !== false;
}

/** Trova il MENU da un id variante (birra o bibita). Ritorna `{ baseItemId, combo }` o null. */
export function findFalloPesanteCombo(combos, variantId) {
  if (!variantId) return null;
  for (const [baseItemId, combo] of Object.entries(combos ?? {})) {
    if (combo?.id === variantId || combo?.softDrink?.id === variantId) return { baseItemId, combo };
  }
  return null;
}

export function buildFalloPesanteCartLine(combo, beer, qty = 1) {
  const variant = falloPesanteVariant(combo, beer);
  return {
    id: `${variant.id}::${beer.id}`,
    baseId: variant.id,
    name: `${variant.name} · ${beer.name}`,
    price: variant.price,
    qty,
    image: combo.image,
    includesBeerId: beer.id,
  };
}

// ── Scheda chiara (H7 fase 1, 2026-10-29) ────────────────────────────────────────────────────
// Solo presentazione: supplementi e testi calcolati dai dati, mai scritti a mano. Non cambiano
// ne' la riga carrello ne' cosa va al server (quelli restano `buildFalloPesanteCartLine`).

const roundCents = (n) => Math.round(n * 100) / 100;

/** Supplemento del MENU rispetto al solo panino: variante piu' economica ordinabile (bibita se
 *  ce n'e' almeno una, altrimenti birra) meno il prezzo del panino. null se manca un prezzo. */
export function falloPesanteMenuSupplement(basePrice, combo, hasSoftDrinks = true) {
  if (!combo || basePrice == null || basePrice === '') return null;
  const base = Number(basePrice);
  const soft = hasSoftDrinks ? combo.softDrink?.price : null;
  const cheapest = soft != null ? Math.min(combo.price, soft) : combo.price;
  if (!Number.isFinite(base) || !Number.isFinite(cheapest)) return null;
  return roundCents(cheapest - base);
}

/** Extra della birra rispetto alla bibita nel MENU (prezzo birra − prezzo bibita). 0 se il MENU
 *  non ha la variante bibita o se non ci sono bibite ordinabili (la birra e' l'unica scelta). */
export function falloPesanteBeerExtra(combo, hasSoftDrinks = true) {
  if (!combo || !hasSoftDrinks || combo.softDrink?.price == null) return 0;
  return Math.max(0, roundCents(combo.price - combo.softDrink.price));
}

/** Sottotitolo fisso della scelta MENU: cosa contiene. Il Box ha gia' le patate dentro. */
export function falloPesanteIncludesLabel(combo) {
  return falloPesanteNeedsSide(combo)
    ? 'MENU · PANINO + PATATE + DA BERE'
    : 'MENU · BOX CON PATATE + DA BERE';
}
