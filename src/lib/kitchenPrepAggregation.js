// PREP V1 — Production Board (2026-09-17). Aggregazione pura, read-only, sopra gli ordini gia'
// forniti da useKitchenOrders. Nessuna query/RPC nuova: solo GROUP BY in memoria su dati gia'
// fetchati (vedi ai-ops/reports/prep-v1-production-board-audit.md, PREP_V1_POSSIBLE_NOW).
//
// received -> IN CODA (non ancora iniziato), preparing -> DA PREPARARE ORA (in lavorazione).
// Nessun nuovo stato ordine, nessun parsing di customer_note: le note/allergeni vengono
// mostrati as-is, mai interpretati come varianti strutturate (vedi audit §2/§4 sul limite reale
// della birra inclusa in FALLO PESANTE).
import { isGrabServeItem, resolveItemAllergens, resolveOrderAllergens } from './kitchenAllergens.js';

export const PREP_BOARD_STATUS_GROUPS = {
  preparing: 'now',
  received: 'queue',
};

const DEFAULT_ORDER_CODE_LIMIT = 6;
// ATTENZIONE è un board passivo (TV cucina, nessuna interazione da staff): non può mai
// richiedere scroll. Le allergie (dichiarate o non verificate) sono safety-critical e non
// vengono MAI cappate — sono raggruppate per allergene (bounded dal catalogo, non dal numero di
// ordini), quindi la loro altezza resta limitata anche a 30 ordini concorrenti. Solo le NOTE
// cliente (a bassa priorità, testo libero non strutturato) possono eccedere lo spazio e vengono
// troncate con un "+N" — mai gli allergeni (fix P0 2026-09-17, vedi visual QA).
const DEFAULT_NOTE_CODE_LIMIT = 12;

/**
 * Aggrega una lista di ordini in due gruppi (now/queue) per il Production Board.
 * Ogni riga rappresenta un prodotto (itemId), con quantita' totale e gli order code di
 * provenienza (capped per leggibilita' — vedi orderCodeLimit, requisito 20-30 ordini simultanei).
 */
export function aggregatePrepBoard(
  orders,
  { orderCodeLimit = DEFAULT_ORDER_CODE_LIMIT, noteCodeLimit = DEFAULT_NOTE_CODE_LIMIT } = {},
) {
  const list = Array.isArray(orders) ? orders : [];
  const byGroup = { now: new Map(), queue: new Map() };
  const groupOrderCount = { now: 0, queue: 0 };
  const allergenOrderCodes = new Map(); // allergen key -> Set(orderCode) — mai cappato
  const unverifiedOrderCodes = new Set(); // mai cappato, e' comunque un rischio allergene
  const noteOrderCodes = new Set(); // unico punto che puo' andare in overflow

  list.forEach((order) => {
    const groupKey = PREP_BOARD_STATUS_GROUPS[order?.status];
    if (!groupKey) return; // ready/delivered/cancelled/pending_counter_payment: fuori scope board
    groupOrderCount[groupKey] += 1;

    const orderCode = order.orderCode ?? order.id ?? '—';
    const note = typeof order.note === 'string' ? order.note.trim() : '';
    if (note) noteOrderCodes.add(orderCode);

    const { allergens, hasUnknown } = resolveOrderAllergens(order);
    allergens.forEach((allergen) => {
      const set = allergenOrderCodes.get(allergen) ?? new Set();
      set.add(orderCode);
      allergenOrderCodes.set(allergen, set);
    });
    if (hasUnknown) unverifiedOrderCodes.add(orderCode);

    const flagged = Boolean(note) || allergens.length > 0 || hasUnknown;

    (order.items ?? []).forEach((line) => {
      const itemId = line.itemId;
      if (!itemId) return;
      if (isGrabServeItem(itemId)) return; // PREP V1: drink non richiedono preparazione in cucina
      const quantity = Number(line.quantity) || 0;
      if (quantity <= 0) return;

      const map = byGroup[groupKey];
      const existing = map.get(itemId);
      const row = existing ?? {
        itemId,
        name: line.name ?? itemId,
        quantity: 0,
        orders: new Map(), // orderCode -> qty in that order
        flaggedOrderCodes: new Set(),
      };
      row.quantity += quantity;
      row.orders.set(orderCode, (row.orders.get(orderCode) ?? 0) + quantity);
      if (flagged) row.flaggedOrderCodes.add(orderCode);
      map.set(itemId, row);
    });
  });

  const finalizeGroup = (groupKey) => {
    const rows = [...byGroup[groupKey].values()]
      .map((row) => {
        const allOrderCodes = [...row.orders.entries()].sort((a, b) =>
          String(a[0]).localeCompare(String(b[0])),
        );
        const visible = allOrderCodes.slice(0, orderCodeLimit);
        const overflowCount = Math.max(0, allOrderCodes.length - visible.length);
        const { allergens, known } = resolveItemAllergens(row.itemId);
        return {
          itemId: row.itemId,
          name: row.name,
          quantity: row.quantity,
          orderCodes: visible.map(([code, qty]) => ({ code, qty })),
          overflowCount,
          isFlagged: row.flaggedOrderCodes.size > 0,
          allergens,
          allergensKnown: known,
        };
      })
      // Piu' urgente (quantita' piu' alta) in cima: aiuta la lettura a colpo d'occhio con molte righe.
      .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
    return { orderCount: groupOrderCount[groupKey], rows };
  };

  // Allergie: SEMPRE tutte, raggruppate per allergene (una riga per allergene, non per ordine) —
  // l'altezza scala col numero di allergeni distinti nel catalogo (finito), non col numero di
  // ordini. Ordinate per etichetta per un board stabile/prevedibile a colpo d'occhio.
  const allergensSorted = [...allergenOrderCodes.entries()]
    .map(([allergen, codes]) => ({ allergen, orderCodes: [...codes].sort() }))
    .sort((a, b) => a.allergen.localeCompare(b.allergen));

  const noteCodesSorted = [...noteOrderCodes].sort();
  const visibleNoteCodes = noteCodesSorted.slice(0, noteCodeLimit);
  const noteOverflowCount = Math.max(0, noteCodesSorted.length - visibleNoteCodes.length);

  return {
    now: finalizeGroup('now'),
    queue: finalizeGroup('queue'),
    attention: {
      allergens: allergensSorted, // mai cappato
      unverified: { orderCodes: [...unverifiedOrderCodes].sort() }, // mai cappato
      notes: { orderCodes: visibleNoteCodes, overflowCount: noteOverflowCount }, // unico overflow possibile
    },
  };
}

const DEFAULT_TICKET_LIMIT = 6;

/**
 * PASSIVE KDS V2 — ticket singoli per gli ordini `preparing` (CENTER del board), a differenza di
 * `aggregatePrepBoard` che aggrega per prodotto. Ogni ticket è un ordine reale (orderCode, TUTTE
 * le righe incluse allergeni, nota), mai un'interazione: e' un display passivo.
 * - ticket ordine completo (decisione prodotto 2026-09-22): drink/grab-serve restano nel ticket,
 *   marcati con `isGrabServe: true` per riga (la view li distingue visivamente, stesso pattern del
 *   tag staff), cosi' un ordine di sole bevande produce comunque un ticket visibile.
 * - le METRICHE di carico cucina (`aggregatePrepBoard`, bande ORA/IN CODA) restano invariate: solo
 *   PREP_FOOD, i drink continuano a non contribuire a righe/quantita' aggregate.
 * - FALLO PESANTE resta atomico: e' una singola riga combo, mai scomposto.
 * - ordinati per `createdAt` crescente (il piu' vecchio in preparazione per primo); fallback su
 *   `orderCode` se `createdAt` manca (dati di test/fixture minimi).
 * - cappati a `limit` (default 6, requisito esplicito "max 6 ticket grandi"): il resto e' un
 *   conteggio passivo (`overflowCount`), mai un altro layout o scroll.
 */
export function buildPreparingTickets(orders, { limit = DEFAULT_TICKET_LIMIT } = {}) {
  const list = Array.isArray(orders) ? orders : [];

  const tickets = list
    .filter((order) => order?.status === 'preparing')
    .map((order) => {
      const orderCode = order.orderCode ?? order.id ?? '—';
      const note = typeof order.note === 'string' ? order.note.trim() : '';
      const { allergens, hasUnknown } = resolveOrderAllergens(order);
      const items = (order.items ?? [])
        .filter((line) => line.itemId)
        .map((line) => ({
          itemId: line.itemId,
          name: line.name ?? line.itemId,
          quantity: Number(line.quantity) || 0,
          isGrabServe: isGrabServeItem(line.itemId),
        }))
        .filter((line) => line.quantity > 0);
      return {
        orderCode,
        createdAt: order.createdAt ?? null,
        items,
        allergens,
        allergensUnverified: hasUnknown,
        note,
      };
    })
    // Nessun item con itemId/quantita' valida (fixture minime): niente ticket fantasma.
    .filter((ticket) => ticket.items.length > 0)
    .sort((a, b) => {
      if (a.createdAt && b.createdAt) return new Date(a.createdAt) - new Date(b.createdAt);
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return String(a.orderCode).localeCompare(String(b.orderCode));
    });

  const visible = tickets.slice(0, limit);
  return {
    tickets: visible,
    totalCount: tickets.length,
    overflowCount: Math.max(0, tickets.length - visible.length),
  };
}
