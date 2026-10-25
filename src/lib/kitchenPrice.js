// Unica fonte per il formato prezzo del MENU CLIENTE (Fase 3.1 restyling, 2026-10-25).
//
// Prima di questo file ogni section (`PaniniSection.jsx`, `CicchettiSection.jsx`, …,
// `GarpezHero.jsx`, `EventSideChip.jsx`) aveva la propria copia di `formatPrice()`, con due
// formati diversi ("€8" e "8 €") e nessun arrotondamento al centesimo.
//
// Formato: "8 €" sugli interi, "13,90 €" altrimenti; `forceDecimals` → "19,00 €" (Pesi Massimi).
// Lo spazio è non separabile, così numero ed euro non vanno a capo su righe diverse.
// Prezzo mancante o non numerico → '' : il chiamante mostra "PREZZO IN ARRIVO".
// Totali di carrello, cassa e staff non passano di qui (restano `toFixed(2)` nei loro file).

export function formatPrice(value, forceDecimals = false) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const cents = Math.round(n * 100);
  if (!forceDecimals && cents % 100 === 0) return `${cents / 100}\u00A0€`;
  return `${(cents / 100).toFixed(2).replace('.', ',')}\u00A0€`;
}
