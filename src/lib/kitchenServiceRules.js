// Regola di servizio condivisa (BEER SPRINT V1 §3/§7-E, confermata da Eros come regola
// definitiva il 2026-09-14): le birre `evening_only` (oggi solo Krombacher Pils) diventano
// ordinabili solo dalle 18:00 locali del device. Unica fonte del gate: BirreSection.jsx e
// il selettore birra di FALLO PESANTE (PesiMassimiSection.jsx) lo importano da qui — mai
// duplicato, per restare testabile in un solo punto.

export const EVENING_SERVICE_START_HOUR = 18;

export function isEveningServiceActive(date = new Date()) {
  return date.getHours() >= EVENING_SERVICE_START_HOUR;
}

// P0-2 (2026-09-16) — la birra scelta in FALLO PESANTE deve arrivare in cucina.
//
// Il payload per-item della RPC e' chiuso: `kitchen_customer_create_order` proietta
// `jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)` e riscrive `name`/`price`
// dal catalogo (20260913130000). Quindi ne' `includesBeerId` ne' il nome composito costruito da
// PesiMassimiSection sopravvivono: la comanda diceva solo "Pulled Pork - Fallo Pesante" e lo staff
// non sapeva quale birra spillare.
//
// Canale usato: `customer_note` -> `p_customer_note` -> `kitchen_orders.customer_note` -> `note`
// (useKitchenOrders.mapSupabaseOrder) -> card "MODIFICHE / NOTE" di /kitchen/solo. Tutti campi
// esistenti, nessuna migration, nessun id composito nel payload (l'allowlist promo su
// item-040/041/042 resta intatta) e nessuna riga catalogo a prezzo 0 da poter ordinare gratis.
//
// Il nome della birra e' risolto da `includesBeerId` sul catalogo, MAI ricavato dal nome della
// riga carrello: nessun parsing fragile.
export const INCLUDED_BEER_NOTE_PREFIX = 'BIRRA INCLUSA';

export function buildIncludedBeersNote(orderItems, menuItems) {
  const comboLines = (orderItems ?? []).filter((o) => o.includesBeerId);
  if (comboLines.length === 0) return '';
  // Piu' combo con la stessa birra nello stesso carrello vanno sommati, non ripetuti.
  const byBeer = new Map();
  comboLines.forEach((line) => {
    byBeer.set(line.includesBeerId, (byBeer.get(line.includesBeerId) ?? 0) + (line.qty ?? 1));
  });
  const parts = [...byBeer.entries()].map(([beerId, qty]) => {
    const beer = (menuItems ?? []).find((m) => m.id === beerId);
    const label = (beer?.name ?? beerId).toUpperCase();
    return qty > 1 ? `${qty}x ${label}` : label;
  });
  return `\u{1F37A} ${INCLUDED_BEER_NOTE_PREFIX}: ${parts.join(' \u00B7 ')}`;
}
