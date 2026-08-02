// normalizeRound.js — round interno normalizzato ("r01"), indipendente dal testo grezzo API-Football.
// Funzione pura: estrae l'ultimo numero intero dal testo round e lo formatta a 2 cifre.

/**
 * @param {string} rawRoundText es. "Regular Season - 1"
 * @returns {string} round interno, es. "r01"
 */
export function normalizeRound(rawRoundText) {
  if (typeof rawRoundText !== "string" || rawRoundText.trim() === "") {
    throw new Error(`ROUND_MALFORMATO: valore mancante (${JSON.stringify(rawRoundText)})`);
  }
  const match = rawRoundText.match(/(\d+)\s*$/);
  if (!match) {
    throw new Error(`ROUND_MALFORMATO: nessun numero riconoscibile in "${rawRoundText}"`);
  }
  const n = Number(match[1]);
  return `r${String(n).padStart(2, "0")}`;
}
