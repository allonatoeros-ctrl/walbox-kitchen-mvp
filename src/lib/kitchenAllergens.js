// Unica fonte per gli allergeni mostrati allo STAFF (P0-3, 2026-09-16).
//
// Prima di questo file `KitchenSoloService.jsx` e `AlertView.jsx` avevano ognuno la propria
// copia di `getAllergens()`, identica e con lo stesso difetto:
//
//   kitchenMenuItems.find((m) => m.id === item.itemId)  →  if (mi?.allergens) …
//
// Due buchi reali, entrambi sullo stesso ramo:
//   1. un `itemId` che non sta in `kitchenMenuItems` contribuisce ZERO e sparisce in silenzio,
//      quindi un ordine di soli item sconosciuti veniva presentato come "Nessun allergene
//      dichiarato" — `unknown` era indistinguibile da "nessun allergene";
//   2. i tre FALLO PESANTE (`item-040/041/042`) vivono in `kitchenPesiMassimiCombos`, NON in
//      `kitchenMenuItems`, e quella struttura non ha un campo `allergens`: un combo
//      PANINO + BIRRA + PATATE AL FORNO finiva quindi nel caso 1.
//
// Qui gli allergeni di un combo sono l'UNIONE DERIVATA dai suoi componenti dichiarati — nessun
// allergene inventato, nessun valore hardcoded che possa divergere dai dati:
//   base (il Peso Massimo che il combo potenzia) ∪ contorno (Patate al Forno) ∪ birre incluse.
// L'unione usa TUTTE le birre selezionabili nel combo, non quella scelta dal cliente: la scelta
// non viaggia nel payload per item (vedi P0-2, arriva in `customer_note`), e mostrare l'unione è
// la lettura prudente — mai meno allergeni di quelli realmente possibili nel piatto. Dopo la
// rimozione di Krombacher (correzione Eros, 2026-09-22) `falloPesanteBeerOptions()` filtra solo
// le 6 bottiglie rimaste, quindi l'unione segue da sola.
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';

// Contorno incluso in ogni FALLO PESANTE (subtitle dei combo: "PANINO + BIRRA + PATATE AL FORNO").
export const FALLO_PESANTE_SIDE_ITEM_ID = 'item-058';
// Stesso filtro usato da CustomerKitchenMenu per costruire le birre selezionabili nel combo
// (`category === 'birre' && tags.includes('birre-v1')`): se il catalogo birre cambia, l'unione
// segue da sola.
export const FALLO_PESANTE_BEER_TAG = 'birre-v1';

function menuItemById(itemId) {
  return kitchenMenuItems.find((m) => m.id === itemId) ?? null;
}

export function falloPesanteBeerOptions() {
  return kitchenMenuItems.filter(
    (i) => i.category === 'birre' && i.tags?.includes(FALLO_PESANTE_BEER_TAG),
  );
}

function comboById(itemId) {
  const entry = Object.entries(kitchenPesiMassimiCombos).find(([, combo]) => combo?.id === itemId);
  return entry ? { baseItemId: entry[0], combo: entry[1] } : null;
}

/**
 * Allergeni di un singolo `itemId` di ordine.
 * `known: false` significa "questo id non è nel catalogo di questo device": NON significa
 * "nessun allergene". Chi renderizza deve trattare i due casi in modo diverso.
 */
export function resolveItemAllergens(itemId) {
  const direct = menuItemById(itemId);
  // `allergensVerified: false` (fix prudenziale 2026-09-16) = "questa riga ha allergens: [] ma
  // quel vuoto non e' affidabile" (oggi item-018 e item-043, vedi i commenti in
  // kitchenMockData.js). Si tratta come un item non risolvibile: nessun allergene inventato, ma
  // nemmeno presentato come "nessun allergene dichiarato". Assente/true = verificato, quindi il
  // resto del catalogo non cambia comportamento.
  if (direct && direct.allergensVerified === false) return { allergens: [], known: false };
  if (direct) return { allergens: [...(direct.allergens ?? [])], known: true };

  const comboRef = comboById(itemId);
  if (comboRef) {
    const beers = falloPesanteBeerOptions();
    if (beers.length === 0) return { allergens: [], known: false };
    // Un componente non risolvibile O non verificato rende l'intero combo non verificabile:
    // meglio dichiarare "non verificati" che pubblicare un'unione parziale come se fosse
    // completa. Si passa dal resolver, non da `.allergens` diretto, proprio per ereditare il
    // flag allergensVerified dei componenti.
    const components = [
      resolveItemAllergens(comboRef.baseItemId),
      resolveItemAllergens(FALLO_PESANTE_SIDE_ITEM_ID),
      ...beers.map((b) => resolveItemAllergens(b.id)),
    ];
    if (components.some((c) => !c.known)) return { allergens: [], known: false };
    return { allergens: [...new Set(components.flatMap((c) => c.allergens))], known: true };
  }

  return { allergens: [], known: false };
}

/**
 * Allergeni di un ordine intero.
 * Ritorna anche gli item non risolvibili, perché la UI staff deve poter dire QUALE riga non è
 * verificata invece di mostrare un generico "nessun allergene".
 */
export function resolveOrderAllergens(order) {
  const set = new Set();
  const unknownItems = [];
  (order?.items ?? []).forEach((item) => {
    const { allergens, known } = resolveItemAllergens(item.itemId);
    if (!known) {
      unknownItems.push({ itemId: item.itemId, name: item.name });
      return;
    }
    allergens.forEach((a) => set.add(a));
  });
  return { allergens: [...set], unknownItems, hasUnknown: unknownItems.length > 0 };
}

/**
 * PREP_FOOD vs GRAB_SERVE per il Production Board (`/kitchen/prep`), vedi
 * ai-ops/reports/prep-v1-grab-serve-classification-audit.md.
 * Segnale: `tags.includes('drink')` su `kitchenMenuItems` — 1:1 con birre/bevande oggi.
 * I FALLO PESANTE (`kitchenPesiMassimiCombos`) sono sempre PREP_FOOD: atomici, richiedono
 * comunque cottura/assemblaggio (vedi COMBO_BEHAVIOR nell'audit). Id sconosciuto → PREP_FOOD
 * (fallback prudenziale: mai far sparire silenziosamente un item potenzialmente da preparare).
 */
export function isGrabServeItem(itemId) {
  const direct = menuItemById(itemId);
  if (direct) return Boolean(direct.tags?.includes('drink'));
  return false;
}
