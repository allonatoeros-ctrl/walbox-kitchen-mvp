// WALRUS FOOD CLUB V1 — testi brevi calcolati dallo stato (funzioni pure, niente JSX).
import { cardView, DEFAULT_RULES, formatLongDate } from '../../lib/foodClubRules';

// Riga di testo breve sullo stato della tessera (home Club, menu).
export function stampSummary(state) {
  const cp = cardView(state);
  const minFood = Number(state?.campaign?.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  if (cp.mode === 'reward') return `Obiettivo completato · buono da ${Number(cp.reward.value) || DEFAULT_RULES.voucher_value} € pronto.`;
  if (cp.mode === 'restart') return `Nuovo giro: il prossimo ordine food da ${minFood} € fa timbro.`;
  if (cp.mode === 'newCycle') return `NUOVO GIRO · ${cp.count}/${cp.required}${cp.expiresAt ? ` · tempo fino al ${formatLongDate(cp.expiresAt)}` : ''}.`;
  if (cp.hasWelcome && cp.orderStamps.length === 0) return `Il primo ordine food da ${minFood} € completa la tessera.`;
  if (cp.count === 0) return `Il prossimo ordine food da ${minFood} € fa timbro.`;
  if (cp.expiresAt) return `${cp.count} ${cp.count === 1 ? 'visita' : 'visite'} su ${cp.required} · hai tempo fino al ${formatLongDate(cp.expiresAt)}.`;
  return `${cp.count} ${cp.count === 1 ? 'visita' : 'visite'} su ${cp.required}.`;
}

