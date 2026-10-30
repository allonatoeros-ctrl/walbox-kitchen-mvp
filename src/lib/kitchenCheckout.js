// Regole pure del checkout cliente (Customer Experience V2): nome, nickname a sorpresa, note cucina.
// Nessun accesso a rete/storage: tutto testabile in `kitchenCheckout.test.js`.
import { PICKUP_FULFILLMENT, isPickupSlotBookable, isValidPickupSlot } from './kitchenPickup.js';

export const GUEST_NICKNAME = 'Ospite Walrus';
export const CUSTOMER_NAME_MAX = 24;
export const CUSTOMER_NAME_MIN = 2;
export const KITCHEN_NOTE_MAX = 200;

export function normalizeCustomerName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, CUSTOMER_NAME_MAX);
}

export function isValidCustomerName(value) {
  const name = normalizeCustomerName(value);
  return name.length >= CUSTOMER_NAME_MIN && name !== GUEST_NICKNAME;
}

// Nomi da pub per chi non ha voglia di pensare. Solo testo fisso (niente input libero offensivo da
// generare), tutti entro CUSTOMER_NAME_MAX. I primi tre sono anche i chip sempre visibili.
export const NICKNAME_SUGGESTIONS = [
  'Baffo',
  'Zanna',
  'Tricheco Affamato',
  'Capitan Zanna',
  'Baffo Unto',
  'Zanna Lunga',
  'Mister Brisket',
  'Lord Birra',
  'Foca Affamata',
  "Baffi d'Oro",
];

export const NICKNAME_QUICK_PICKS = NICKNAME_SUGGESTIONS.slice(0, 3);

// Estrae un nome diverso da quello corrente (se ce n'è più d'uno). `random` iniettabile per i test.
export function pickNickname(current, random = Math.random) {
  const cur = normalizeCustomerName(current).toLowerCase();
  const pool = NICKNAME_SUGGESTIONS.filter((n) => n.toLowerCase() !== cur);
  const list = pool.length > 0 ? pool : NICKNAME_SUGGESTIONS;
  const idx = Math.min(list.length - 1, Math.floor(random() * list.length));
  return list[idx];
}

// Cosa manca per poter inviare l'ordine, nell'ordine in cui lo mostriamo al cliente.
// RITIRO AL WALRUS (2026-10-28): con la scelta 'pickup' serve anche un orario ancora prenotabile
// (`now` iniettabile; senza `now` basta che la fascia esista). Un orario scaduto mentre il cliente
// era sul checkout conta come mancante: si torna a sceglierlo invece di farlo rifiutare dal server.
export function checkoutMissing({ name, fulfillmentType, pickupSlot, now }) {
  const missing = [];
  if (!isValidCustomerName(name)) missing.push('name');
  if (!fulfillmentType) missing.push('fulfillment');
  if (fulfillmentType === PICKUP_FULFILLMENT) {
    const ok = now == null ? isValidPickupSlot(pickupSlot) : isPickupSlotBookable(pickupSlot, now);
    if (!ok) missing.push('pickup_slot');
  }
  return missing;
}

// Stesso controllo all'istante dell'invio (orologio reale): usato da handleSubmit.
export function checkoutMissingAtSubmit(fields) {
  return checkoutMissing({ ...fields, now: Date.now() });
}

// Prefissi rapidi per le note cucina ("ALLERGIA: ", "SENZA "). Si accodano al testo già scritto,
// non lo sostituiscono, non duplicano un prefisso già presente e rispettano il limite di caratteri.
export function appendNotePrefix(note, prefix, max = KITCHEN_NOTE_MAX) {
  const current = String(note ?? '');
  if (current.toUpperCase().includes(prefix.trim().toUpperCase())) return current;
  const joined = current.trim() ? `${current.trimEnd()} · ${prefix}` : prefix;
  return joined.slice(0, max);
}
