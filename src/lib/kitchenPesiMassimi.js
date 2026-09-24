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
// - `includesBeerId` = birra inclusa, risolta in nota da
//   `kitchenServiceRules.buildIncludedBeersNote`.
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
