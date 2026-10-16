/**
 * Modalità evento — serata dei 15 anni (ANNIVERSARIO 15 ANNI, decisioni Eros 2026-10-13/14).
 *
 * A modalità accesa il menu cliente mostra i panini PESI MASSIMI "special"
 * (Pastrami, Pulled Pork, Brisket, GARPEZ), l'Orto Cattivo e le Patate al Forno. Birre e bevande
 * NON ci sono (decisione Eros 2026-10-16, si prendono al banco). Il resto è nascosto e i Box (categoria `bbq` ma senza tag
 * `special`) sono esclusi. Carrello, checkout e pagamenti non cambiano.
 *
 * Interruttore, niente finestre di date e niente DB:
 *  - `EVENT_MODE_ON`: Eros lo mette a `true` la sera della festa e lo rimette a `false` dopo.
 *    La modalità NON si spegne da sola.
 *  - override URL `?evento=1` (accende) / `?evento=0` (spegne) per provare e per spegnere al volo.
 */
export const EVENT_MODE_ON = true;

export const EVENT_CATEGORY = 'bbq';

// 2026-10-15 (decisione Eros): alla festa servono anche un'alternativa vegetariana e un contorno
// ordinabile a parte. Lista di id ESPLICITA (non per categoria) perché `panini` e `contorni`
// contengono altro che stasera non si serve, e `kitchenMockData.js` resta intatto:
//  - `item-013` Orto Cattivo (panini, veg, 8 €): sta nella riga dei classici, mai sopra il GARPEZ.
//  - `item-058` Patate al Forno (contorni, 5 €): ordinabili a parte, suggerite con un chip non modale.
export const EVENT_EXTRA_ITEM_IDS = ['item-013', 'item-058'];

export const EVENT_SIDE_ITEM_ID = 'item-058';

// `contorni` esiste solo per le patate; `panini` NON è una categoria evento: l'Orto Cattivo
// viene mostrato dentro la sezione dei panini della serata (PESI MASSIMI), non in una tab sua.
export const EVENT_CATEGORIES = [EVENT_CATEGORY, 'contorni'];

export function isEventModeActive(search = '', flag = EVENT_MODE_ON) {
  const override = new URLSearchParams(search || '').get('evento');
  if (override === '1') return true;
  if (override === '0') return false;
  return flag === true;
}

export function isEventMenuItem(item) {
  if (item && EVENT_EXTRA_ITEM_IDS.includes(item.id)) return true;
  return Boolean(item) && item.category === EVENT_CATEGORY && Array.isArray(item.tags) && item.tags.includes('special');
}

export function filterEventMenuItems(items) {
  return (items || []).filter(isEventMenuItem);
}

// Chip "PATATE AL FORNO" (regole 13-16 di docs/design/ricerca-menu-evento.md): compare solo se nel
// sacco c'è almeno un panino della serata, le patate non ci sono ancora, sono ordinabili e il cliente
// non ha già detto no (o le ha già aggiunte) in questa sessione.
export function shouldSuggestEventSide({ cartIds = [], sandwichIds = [], sideId = EVENT_SIDE_ITEM_ID, sideAvailable = false, dismissed = false } = {}) {
  if (!sideAvailable || dismissed) return false;
  if (cartIds.includes(sideId)) return false;
  return cartIds.some((id) => sandwichIds.includes(id));
}

// Gli item col tag `anniversario` esistono solo per la serata: a modalità spenta il menu torna
// quello di prima della festa (non visibili, non ordinabili, e un sacco salvato li perde).
export const EVENT_ONLY_TAG = 'anniversario';

// Orto Cattivo (foto su fondo scuro, decisione Eros 2026-10-15) è servito solo alla festa.
export const EVENT_ONLY_ITEM_IDS = ['item-013'];

export function excludeEventOnlyItems(items) {
  return (items || []).filter((i) => !(Array.isArray(i?.tags) && i.tags.includes(EVENT_ONLY_TAG)) && !EVENT_ONLY_ITEM_IDS.includes(i?.id));
}
