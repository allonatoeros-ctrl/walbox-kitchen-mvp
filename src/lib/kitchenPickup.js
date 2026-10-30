// RITIRO AL WALRUS con orario (2026-10-28) — regole pure, niente React/Supabase/storage.
//
// Modello (migration 20261028121000_kitchen_orders_pickup_slot_v1.sql):
//   - al server un ritiro e' `fulfillment_type: 'takeaway'` + `pickup_slot` 'HH:MM' (ora di Roma,
//     giorno di servizio dell'ordine). PORTO VIA = takeaway senza orario, come prima.
//   - nella UI cliente il ritiro e' una terza scelta con valore 'pickup' (PICKUP_FULFILLMENT):
//     serve per distinguere "ritiro, orario ancora da scegliere" da PORTO VIA. Al server non arriva
//     mai: `toServerFulfillment` lo converte.
//
// Fasce: ogni 15 minuti, pranzo 12:00-14:30 e sera 18:00-22:30 (estremi inclusi, come il CHECK SQL).
// "Adesso" e' sempre l'ora di Roma via Intl, non l'ora locale del telefono (un turista con il
// fuso di casa vedrebbe fasce sbagliate). `now` e' iniettabile per test ed e2e.
//
// Anticipo minimo: PICKUP_LEAD_MINUTES = 15. Una fascia e' prenotabile se inizia almeno 15 minuti
// dopo adesso (ore 12:44 -> prima fascia 13:00; ore 12:45 -> 13:00 ancora valida). Il server
// rifiuta solo un orario piu' vecchio di 10 minuti (tolleranza per orologi e checkout lenti),
// quindi una fascia mostrata qui come prenotabile non viene mai rifiutata come passata, anche se
// il cliente ci mette qualche minuto a pagare.

export const PICKUP_FULFILLMENT = 'pickup';
export const PICKUP_LEAD_MINUTES = 15;
export const PICKUP_SLOT_STEP_MINUTES = 15;
export const PICKUP_TIME_ZONE = 'Europe/Rome';

export const PICKUP_WINDOWS = [
  { id: 'lunch', label: 'PRANZO', start: '12:00', end: '14:30' },
  { id: 'dinner', label: 'SERA', start: '18:00', end: '22:30' },
];

const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMinutes(hhmm) {
  const m = SLOT_RE.exec(String(hhmm ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fromMinutes(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Tutte le fasce del giorno, raggruppate per finestra: [{ id, label, slots: ['12:00', …] }]. */
export function pickupSlotGroups() {
  return PICKUP_WINDOWS.map((w) => {
    const slots = [];
    for (let t = toMinutes(w.start); t <= toMinutes(w.end); t += PICKUP_SLOT_STEP_MINUTES) slots.push(fromMinutes(t));
    return { id: w.id, label: w.label, slots };
  });
}

const ALL_SLOTS = new Set(pickupSlotGroups().flatMap((g) => g.slots));

/** true solo per una fascia esistente ('13:15' si, '13:10' o '15:00' no). */
export function isValidPickupSlot(slot) {
  return typeof slot === 'string' && ALL_SLOTS.has(slot);
}

/**
 * Minuti dalla mezzanotte, ora di Roma, per `now` (ms o Date). Se Intl non conosce il fuso
 * (ambiente senza ICU completo) si ripiega sull'ora locale del device: meglio che bloccare.
 */
export function romeMinutesOfDay(now = Date.now()) {
  const date = now instanceof Date ? now : new Date(now);
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: PICKUP_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour % 24) * 60 + minute;
  } catch { /* ripiego sotto */ }
  return date.getHours() * 60 + date.getMinutes();
}

/** Fascia valida e ancora prenotabile adesso (almeno PICKUP_LEAD_MINUTES di anticipo). */
export function isPickupSlotBookable(slot, now = Date.now(), lead = PICKUP_LEAD_MINUTES) {
  if (!isValidPickupSlot(slot)) return false;
  return toMinutes(slot) >= romeMinutesOfDay(now) + lead;
}

/** Fasce ancora prenotabili, per finestra; le finestre finite restano con `slots: []`. */
export function bookablePickupSlotGroups(now = Date.now(), lead = PICKUP_LEAD_MINUTES) {
  return pickupSlotGroups().map((g) => ({ ...g, slots: g.slots.filter((s) => isPickupSlotBookable(s, now, lead)) }));
}

export function hasBookablePickupSlot(now = Date.now(), lead = PICKUP_LEAD_MINUTES) {
  return bookablePickupSlotGroups(now, lead).some((g) => g.slots.length > 0);
}

/** Orario salvato (carrello) ancora utilizzabile, altrimenti null: un orario passato non si invia. */
export function sanitizePickupSlot(slot, now = Date.now()) {
  return isPickupSlotBookable(slot, now) ? slot : null;
}

/** Badge staff/cucina: 'RITIRO 13:15', '' se l'orario non c'e' o non e' valido. */
export function formatPickupBadge(slot) {
  return isValidPickupSlot(slot) ? `RITIRO ${slot}` : '';
}

/** Riga per il cliente: 'Ritiro alle 13:15', '' se l'orario non c'e'. */
export function formatPickupSentence(slot) {
  return isValidPickupSlot(slot) ? `Ritiro alle ${slot}` : '';
}

/**
 * Scelta UI -> payload server. 'pickup' diventa takeaway + orario; ogni altra scelta non porta
 * mai un orario (una fascia rimasta in memoria dopo un ripensamento su PORTO VIA non parte).
 */
export function toServerFulfillment(fulfillmentType, pickupSlot) {
  if (fulfillmentType === PICKUP_FULFILLMENT) {
    return { fulfillmentType: 'takeaway', pickupSlot: isValidPickupSlot(pickupSlot) ? pickupSlot : null };
  }
  return { fulfillmentType: fulfillmentType ?? null, pickupSlot: null };
}
