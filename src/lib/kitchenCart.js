// Persistenza del SACCO (carrello cliente) — 2026-09-16.
//
// Prima il carrello viveva solo in uno stato React di CustomerKitchenMenu: un refresh, un back
// che usciva da /kitchen o la riapertura della pagina lo azzeravano in silenzio. In un pub, dove
// il telefono si blocca, arriva una notifica o si sbaglia gesture, significava ricominciare
// l'ordine da capo.
//
// Separazione dalle superfici staff (stesso principio di useKitchenOrders): questa chiave e'
// SOLO del cliente. La cassa (`CounterAssistedOrder`) tiene il proprio carrello in stato React e
// non legge ne' scrive qui: un tablet usato al banco non puo' ritrovarsi il sacco di un cliente,
// ne' viceversa.
//
// Cosa NON fa: non si fida dei prezzi salvati. Al ripristino ogni riga viene riconciliata col
// catalogo corrente (vedi reconcileCartItems): nome e prezzo tornano dal catalogo, e cio' che non
// e' piu' ordinabile viene scartato. Il totale e' sempre ricalcolato, mai lo snapshot salvato.
import { buildFalloPesanteCartLine, findFalloPesanteCombo, isFalloPesanteDrinkAllowed } from './kitchenPesiMassimi.js';
import { PICKUP_FULFILLMENT, sanitizePickupSlot } from './kitchenPickup.js';

export const CART_STORAGE_KEY = 'walbox_kitchen_cart_v1';

const MAX_QTY = 99;
const EMPTY = { items: [], note: '', fulfillmentType: null, pickupSlot: null };
// Scelte di ritiro salvabili: 'pickup' (RITIRO AL WALRUS, 2026-10-28) e' il valore UI, al server
// arriva takeaway + orario (vedi kitchenPickup.toServerFulfillment).
const SAVED_FULFILLMENT = new Set(['eat_here', 'takeaway', PICKUP_FULFILLMENT]);

function storageOr(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function sanitizeLine(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const qty = Math.floor(Number(raw.qty));
  if (!Number.isFinite(qty) || qty < 1) return null;
  return {
    id: raw.id,
    baseId: typeof raw.baseId === 'string' && raw.baseId ? raw.baseId : raw.id,
    qty: Math.min(qty, MAX_QTY),
    includesBeerId: typeof raw.includesBeerId === 'string' && raw.includesBeerId ? raw.includesBeerId : undefined,
  };
}

/** Legge il carrello grezzo. Non riconcilia: quello e' compito di reconcileCartItems.
 *  Un orario di ritiro salvato ma ormai non piu' prenotabile (`now`, ora di Roma) torna null:
 *  resta la scelta RITIRO, il cliente risceglie l'orario. Carrelli salvati prima del ritiro
 *  (senza `pickupSlot`) si leggono come sempre. */
export function loadCart(storage, { now = Date.now() } = {}) {
  const store = storageOr(storage);
  if (!store) return { ...EMPTY };
  try {
    const parsed = JSON.parse(store.getItem(CART_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY };
    const fulfillmentType = SAVED_FULFILLMENT.has(parsed.fulfillmentType) ? parsed.fulfillmentType : null;
    return {
      items: Array.isArray(parsed.items) ? parsed.items.map(sanitizeLine).filter(Boolean) : [],
      note: typeof parsed.note === 'string' ? parsed.note : '',
      fulfillmentType,
      pickupSlot: fulfillmentType === PICKUP_FULFILLMENT ? sanitizePickupSlot(parsed.pickupSlot, now) : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Salva solo l'essenziale: identita' riga, quantita', bevanda scelta (birra o bibita), nota e scelta di ritiro.
 *  Nome/prezzo/immagine NON si salvano: si ricavano sempre dal catalogo al ripristino. */
export function saveCart({ items, note, fulfillmentType, pickupSlot }, storage) {
  const store = storageOr(storage);
  if (!store) return;
  try {
    store.setItem(CART_STORAGE_KEY, JSON.stringify({
      v: 1,
      items: (items ?? []).map((o) => ({
        id: o.id,
        baseId: o.baseId ?? o.id,
        qty: o.qty,
        ...(o.includesBeerId ? { includesBeerId: o.includesBeerId } : {}),
      })),
      note: note ?? '',
      fulfillmentType: fulfillmentType ?? null,
      pickupSlot: fulfillmentType === PICKUP_FULFILLMENT ? (pickupSlot ?? null) : null,
    }));
  } catch { /* storage pieno o non disponibile: il carrello resta comunque in memoria */ }
}

export function clearCart(storage) {
  const store = storageOr(storage);
  if (!store) return;
  try { store.removeItem(CART_STORAGE_KEY); } catch { }
}

function isOrderable(item) {
  return !!item && item.price != null && item.available !== false;
}

/**
 * Ricostruisce le righe carrello dai dati CORRENTI (catalogo + combo).
 * Scarta in silenzio cio' che non e' piu' servibile, invece di lasciare in carrello un piatto
 * esaurito che il server rifiuterebbe comunque con item_not_orderable.
 * Ritorna anche `dropped`, cosi' chi chiama puo' decidere se dirlo al cliente.
 */
export function reconcileCartItems(savedItems, menuItems, combos) {
  const byId = new Map((menuItems ?? []).map((i) => [i.id, i]));
  const items = [];
  const dropped = [];

  for (const line of savedItems ?? []) {
    // MENU OTTOBRE: il combo si riconosce sia dall'id variante birra (item-040/041/042) sia da
    // quello bibita (item-060/061/062). La riga viene RICOSTRUITA: variante, id e prezzo derivano
    // dalla bevanda salvata, mai dal `baseId`/prezzo salvati (carrelli vecchi a 19/20 si riprezzano).
    const comboRef = findFalloPesanteCombo(combos, line.baseId);
    if (comboRef) {
      // Un FALLO PESANTE vale solo con la sua bevanda (`includesBeerId` = birra o bibita): se non
      // e' piu' servibile, o non e' una birra ne' una bibita ammessa (acqua, bibite tolte), la riga
      // cade, perche' il combo senza bevanda non e' un prodotto che esiste a menu.
      const beer = line.includesBeerId ? byId.get(line.includesBeerId) : null;
      const allowedDrink = !!beer && (beer.category === 'birre' || isFalloPesanteDrinkAllowed(beer));
      if (!beer || !isOrderable(beer) || !allowedDrink) { dropped.push(line.baseId); continue; }
      const base = byId.get(comboRef.baseItemId);
      if (!isOrderable(base)) { dropped.push(line.baseId); continue; }
      items.push(buildFalloPesanteCartLine(comboRef.combo, beer, line.qty));
      continue;
    }

    const item = byId.get(line.baseId);
    if (!isOrderable(item)) { dropped.push(line.baseId); continue; }
    items.push({
      id: item.id,
      baseId: item.id,
      name: item.name,
      price: item.price,
      qty: line.qty,
      image: item.image,
    });
  }

  return { items, dropped };
}

export function cartTotal(items) {
  return (items ?? []).reduce((sum, o) => sum + o.price * o.qty, 0);
}
