// WALRUS FOOD CLUB V1 — regole pure lato client (solo presentazione).
// Il server è l'unica autorità su timbri, buoni e soglie: queste funzioni servono a mostrare suggerimenti
// ("ti mancano 2 € di food") e stati coerenti, mai a decidere un premio.
import { kitchenMenuItems, kitchenPesiMassimiCombos } from '../data/kitchenMockData.js';

export const DEFAULT_RULES = Object.freeze({
  stamp_min_food: 10,
  stamps_required: 2,
  window_days: 30,
  voucher_value: 5,
  voucher_min_food: 12,
  voucher_valid_days: 30,
});

const FOOD_CATEGORIES = new Set(['panini', 'bbq', 'tartare', 'cicchetti', 'insalatone', 'tagliere', 'contorni']);
// MENU combo: stessa quota prudente del server (prezzo - bevanda inclusa: birra 6, bibita 4).
const COMBO_DRINK_PRICE = {};
for (const combo of Object.values(kitchenPesiMassimiCombos ?? {})) {
  COMBO_DRINK_PRICE[combo.id] = 6;
  if (combo.softDrink?.id) COMBO_DRINK_PRICE[combo.softDrink.id] = 4;
}
const CATEGORY_BY_ID = new Map((kitchenMenuItems ?? []).map((it) => [it.id, it.category]));

export function itemFoodUnitAmount(itemId, unitPrice) {
  const price = Number(unitPrice) || 0;
  if (itemId in COMBO_DRINK_PRICE) return Math.max(price - COMBO_DRINK_PRICE[itemId], 0);
  return FOOD_CATEGORIES.has(CATEGORY_BY_ID.get(itemId)) ? price : 0;
}

export function isFoodItem(itemId) {
  return itemId in COMBO_DRINK_PRICE || FOOD_CATEGORIES.has(CATEGORY_BY_ID.get(itemId));
}

// items: [{ itemId, quantity, price }]
export function cartFoodAmount(items) {
  return round2((items ?? []).reduce((sum, it) => sum + itemFoodUnitAmount(it.itemId, it.price) * (Number(it.quantity) || 0), 0));
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function effectiveVoucherStatus(voucher, now = new Date()) {
  if (!voucher) return null;
  if (voucher.status === 'available' && new Date(voucher.expires_at) <= now) return 'expired';
  return voucher.status;
}

export function daysLeft(isoDate, now = new Date()) {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export function availableVouchers(state, now = new Date()) {
  return (state?.vouchers ?? []).filter((v) => effectiveVoucherStatus(v, now) === 'available');
}

// Il buono migliore da proporre nel carrello: quello che scade prima.
// Campagna spenta (`campaign.active === false`): il server rifiuta la prenotazione (`voucher_campaign_inactive`),
// quindi il carrello non lo propone. Il buono resta maturato e valido nella pagina Club (che non usa questa funzione).
export function pickVoucherForCart(state, now = new Date()) {
  if (state?.campaign?.active === false) return null;
  return availableVouchers(state, now).sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0] ?? null;
}

// Stato del buono nel carrello: { usable, reason, missingFood, discount, newTotal }
export function voucherCartStatus({ voucher, foodAmount, total }) {
  if (!voucher) return { usable: false, reason: 'no_voucher' };
  const minFood = Number(voucher.min_food) || DEFAULT_RULES.voucher_min_food;
  const value = Number(voucher.value) || DEFAULT_RULES.voucher_value;
  const food = Number(foodAmount) || 0;
  if (food < minFood) {
    return { usable: false, reason: 'food_below_minimum', missingFood: round2(minFood - food) };
  }
  const discount = round2(Math.min(value, (Number(total) || 0) - 0.5));
  if (discount <= 0) return { usable: false, reason: 'food_below_minimum', missingFood: 0 };
  return { usable: true, reason: null, discount, newTotal: round2((Number(total) || 0) - discount) };
}

// Previsione timbro per il carrello (solo suggerimento): { willStamp, reason, missingFood }
export function stampForecast({ state, foodAmount, withVoucher = false }) {
  const c = state?.campaign;
  if (!state?.member || !c?.active) return { willStamp: false, reason: 'not_member' };
  if (state.stamped_tonight) return { willStamp: false, reason: 'already_tonight' };
  if (withVoucher && c.stamp_on_voucher_order === false) return { willStamp: false, reason: 'voucher_order' };
  const min = Number(c.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  const food = Number(foodAmount) || 0;
  if (food < min) return { willStamp: false, reason: 'food_below_threshold', missingFood: round2(min - food) };
  const stamps = state.card?.stamps?.length ?? 0;
  const required = Number(c.stamps_required) || DEFAULT_RULES.stamps_required;
  return { willStamp: true, reason: null, completesCard: stamps + 1 >= required, stampNumber: stamps + 1 };
}

export function cardProgress(state, now = new Date()) {
  const c = state?.campaign ?? {};
  const required = Number(c.stamps_required) || DEFAULT_RULES.stamps_required;
  const card = state?.card;
  const stamps = card && !card.expired ? card.stamps ?? [] : [];
  const orderStamps = stamps.filter((s) => s.kind === 'order');
  return {
    count: stamps.length,
    required,
    hasWelcome: stamps.some((s) => s.kind === 'welcome'),
    orderStamps,
    expiresAt: card && !card.expired ? card.expires_at : null,
    daysLeft: card && !card.expired ? daysLeft(card.expires_at, now) : null,
    windowDays: Number(c.window_days) || DEFAULT_RULES.window_days,
  };
}

// Vista della tessera per la UI (solo presentazione). Usa `last_completed_card` quando il server lo manda:
// dopo il 2° timbro la card "open" non c'è più, ma il cliente deve vedere 2/2 e il premio.
// Senza il campo (DB vecchio) il risultato è identico a cardProgress: mode 'plain'.
// mode: 'plain' | 'reward' (giro chiuso, buono spendibile) | 'restart' (giro chiuso, buono usato, nuovo giro da aprire)
//       | 'newCycle' (card open con timbri dopo una completata)
export function cardView(state, now = new Date()) {
  const cp = cardProgress(state, now);
  const lc = state?.last_completed_card ?? null;
  const lcVoucher = lc?.voucher ?? null;
  const lcStatus = lcVoucher ? effectiveVoucherStatus(lcVoucher, now) : null;
  const reward = lcStatus === 'available' || lcStatus === 'reserved' ? lcVoucher : null;
  const openStamps = state?.card && !state.card.expired ? state.card.stamps ?? [] : [];
  let mode = 'plain';
  if (lc && openStamps.length > 0) mode = 'newCycle';
  else if (lc && reward) mode = 'reward';
  else if (lc && lcStatus === 'used') mode = 'restart';
  if (mode === 'reward') {
    const stamps = lc.stamps ?? [];
    return { ...cp, mode, reward, stamps, count: stamps.length, expiresAt: null, daysLeft: null,
      orderStamps: stamps.filter((x) => x.kind === 'order'), hasWelcome: stamps.some((x) => x.kind === 'welcome') };
  }
  return { ...cp, mode, reward: mode === 'newCycle' ? reward : null, stamps: openStamps };
}

// Storico "Premi conquistati": buoni già usati (non spendibili), più recenti prima.
export function rewardHistory(state, now = new Date()) {
  const byId = new Map();
  for (const v of [...(state?.vouchers ?? []), state?.last_completed_card?.voucher].filter(Boolean)) {
    if (effectiveVoucherStatus(v, now) === 'used') byId.set(v.id ?? v.code, v);
  }
  return [...byId.values()].sort((a, b) => new Date(b.used_at || b.issued_at) - new Date(a.used_at || a.issued_at));
}

// Vista staff ISCRITTI: "giro attuale" e "visite totali". Campi nuovi assenti (DB vecchio): si ricade su stamps_open / '—'.
export function staffCycleLabel(m, required = DEFAULT_RULES.stamps_required) {
  if (m?.cycle_completed) return 'completato';
  const n = Number(m?.cycle_stamps ?? m?.stamps_open) || 0;
  return `${n}/${required}`;
}

export function staffTotalVisits(m) {
  return m?.total_visits == null ? '—' : Number(m.total_visits) || 0;
}

export function formatEuro(n) {
  return `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
}

export function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Rome' });
}

export function formatLongDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
}

// Telefono italiano in E.164 per Supabase Auth. Ritorna null se non plausibile.
export function normalizeItalianPhone(input) {
  const digits = String(input ?? '').replace(/[^\d+]/g, '');
  let d = digits.startsWith('+') ? digits.slice(1) : digits;
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('39') && /^3\d{8,9}$/.test(d)) d = `39${d}`;
  if (!/^39\d{9,10}$/.test(d)) return null;
  return `+${d}`;
}

// Messaggi d'errore server -> testo cliente.
export function clubErrorMessage(code) {
  const map = {
    voucher_food_below_minimum: 'Il buono vale su ordini con almeno 12 € di food.',
    voucher_not_available: 'Questo buono non è più disponibile.',
    voucher_expired: 'Il buono è scaduto.',
    voucher_not_found: 'Buono non trovato.',
    voucher_not_combinable: 'Il buono non si somma ad altre promo.',
    voucher_campaign_inactive: 'Il Club è in pausa: per ora il buono non si può usare. Resta tuo.',
    verified_phone_required: 'Serve il numero verificato con il codice SMS.',
    phone_already_member: 'Questo numero è già iscritto. Chiedi al banco.',
    service_consent_required: 'Per iscriverti serve accettare il regolamento.',
    ticket_phone_mismatch: 'Il codice non corrisponde a questo numero.',
    merge_ticket_rate_limited: 'Troppi tentativi: riprova tra un po’.',
    otp_invalid: 'Codice sbagliato o scaduto. Riprova.',
    sms_rate_limited: 'Troppi SMS: riprova tra qualche minuto.',
    invalid_phone: 'Numero non valido. Usa un cellulare italiano.',
  };
  const key = Object.keys(map).find((k) => String(code ?? '').includes(k));
  return key ? map[key] : 'Qualcosa non ha funzionato. Riprova.';
}

// ---- Animazione "premio conquistato": si riproduce una sola volta per buono, per dispositivo. ----
// Lo storage è iniettato (localStorage nel browser). Se è bloccato/assente: nessun errore e nessuna animazione.
export function celebrationKey(voucherId) {
  return voucherId ? `walbox_fc_celebrated_${voucherId}` : null;
}

export function shouldCelebrate(storage, voucherId) {
  const key = celebrationKey(voucherId);
  if (!key) return false;
  try {
    if (!storage) return false;
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

export function markCelebrated(storage, voucherId) {
  const key = celebrationKey(voucherId);
  if (!key) return false;
  try {
    if (!storage) return false;
    storage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}
