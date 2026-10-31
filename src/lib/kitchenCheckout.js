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
  return name.length >= CUSTOMER_NAME_MIN && name !== GUEST_NICKNAME && !isBlockedNickname(name);
}

// Blocklist semplice di parole offensive (il nome compare sulla TV del locale). Il confronto
// ignora maiuscole, accenti, punteggiatura e lettere ripetute ("PUTTTANA", "p u t t a n a" e
// "pùttana" sono bloccati). Lista volutamente corta: non e' un filtro completo, solo il minimo
// per non mostrare insulti pesanti sullo schermo.
//  - SUBSTRING: parole lunghe e non ambigue, bloccate anche dentro altre (sull'intero nome compattato).
//  - WHOLE_WORD: parole corte o che sono dentro cognomi/parole normali ("Cazzola", "Negroni",
//    "Troiani", "Figaro", "Nazionale"): bloccate solo se compaiono come parola intera.
export const NICKNAME_BLOCKLIST_SUBSTRING = [
  'minchia', 'merda', 'stronz', 'puttana', 'vaffanculo', 'fanculo', 'coglione', 'ricchione',
  'frocio', 'sborra', 'segaiolo', 'porcodio', 'fuck', 'shit', 'bitch', 'nigger', 'faggot', 'whore',
  'asshole', 'hitler', 'mussolini',
];
export const NICKNAME_BLOCKLIST_WHOLE_WORD = [
  'cazzo', 'cazzi', 'cazzone', 'culo', 'figa', 'troia', 'negro', 'bocchino', 'cunt', 'nazi', 'duce',
];

export const NICKNAME_BLOCKED_MESSAGE = 'Questo nome non va bene per lo schermo del locale: scegline un altro.';

function foldText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
const squeeze = (t) => t.replace(/(.)\1+/g, '$1');

export function isBlockedNickname(value) {
  const folded = foldText(value);
  const compact = squeeze(folded.replace(/[^a-z0-9]/g, ''));
  if (!compact) return false;
  if (NICKNAME_BLOCKLIST_SUBSTRING.some((w) => compact.includes(squeeze(w)))) return true;
  const words = folded.split(/[^a-z0-9]+/).filter(Boolean).map(squeeze);
  return NICKNAME_BLOCKLIST_WHOLE_WORD.some((w) => words.includes(squeeze(w)));
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
