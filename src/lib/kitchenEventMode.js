/**
 * Modalità evento — serata dei 15 anni (ANNIVERSARIO 15 ANNI, decisioni Eros 2026-10-13/14).
 *
 * A modalità accesa il menu cliente mostra i panini PESI MASSIMI "special"
 * (Pastrami, Pulled Pork, Brisket, GARPEZ) più TUTTE le birre e le bevande già in menu
 * (decisione Eros 2026-10-14). Il resto è nascosto e i Box (categoria `bbq` ma senza tag
 * `special`) sono esclusi. Carrello, checkout e pagamenti non cambiano.
 *
 * Interruttore, niente finestre di date e niente DB:
 *  - `EVENT_MODE_ON`: Eros lo mette a `true` la sera della festa e lo rimette a `false` dopo.
 *    La modalità NON si spegne da sola.
 *  - override URL `?evento=1` (accende) / `?evento=0` (spegne) per provare e per spegnere al volo.
 */
export const EVENT_MODE_ON = false;

export const EVENT_CATEGORY = 'bbq';

export const EVENT_DRINK_CATEGORIES = ['birre', 'bevande'];

export const EVENT_CATEGORIES = [EVENT_CATEGORY, ...EVENT_DRINK_CATEGORIES];

export function isEventModeActive(search = '', flag = EVENT_MODE_ON) {
  const override = new URLSearchParams(search || '').get('evento');
  if (override === '1') return true;
  if (override === '0') return false;
  return flag === true;
}

export function isEventDrink(item) {
  return Boolean(item) && EVENT_DRINK_CATEGORIES.includes(item.category);
}

export function isEventMenuItem(item) {
  if (isEventDrink(item)) return true;
  return Boolean(item) && item.category === EVENT_CATEGORY && Array.isArray(item.tags) && item.tags.includes('special');
}

export function filterEventMenuItems(items) {
  return (items || []).filter(isEventMenuItem);
}

// Gli item col tag `anniversario` esistono solo per la serata: a modalità spenta il menu torna
// quello di prima della festa (non visibili, non ordinabili, e un sacco salvato li perde).
export const EVENT_ONLY_TAG = 'anniversario';

export function excludeEventOnlyItems(items) {
  return (items || []).filter((i) => !(Array.isArray(i?.tags) && i.tags.includes(EVENT_ONLY_TAG)));
}
