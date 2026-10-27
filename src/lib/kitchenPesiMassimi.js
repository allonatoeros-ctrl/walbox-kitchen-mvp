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
// - `baseId` = vero id del combo (es. `item-040`): quello che va nel payload RPC
//   (`kitchen_customer_create_order`) e nell'allowlist promo, MAI l'id composito;
// - `includesBeerId` = bevanda inclusa (birra O bibita: il nome del campo resta per compatibilita'
//   con i carrelli gia' salvati in localStorage e con la cassa), risolta in nota da
//   `kitchenServiceRules.buildIncludedBeersNote`.
//
// Bibite nel MENU (H4, 2026-10-27): stesso prezzo del combo con qualunque bevanda. Sono ammesse
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

export function buildFalloPesanteCartLine(combo, beer, qty = 1) {
  return {
    id: `${combo.id}::${beer.id}`,
    baseId: combo.id,
    name: `${combo.name} · ${beer.name}`,
    price: combo.price,
    qty,
    image: combo.image,
    includesBeerId: beer.id,
  };
}
