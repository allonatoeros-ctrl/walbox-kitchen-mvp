/*
 * Scala canonica degli stemmi (contratto §A.8, fase F0.c).
 *
 * TeamCrest prende `size` come numero e calcola l'altezza a ratio fisso 1:1.2,
 * quindi la scala deve esistere anche lato JS: i token `--fw-crest-*` di
 * fanta-tokens.css portano gli stessi valori per gli usi in CSS.
 *
 * Prima di F0.c le taglie erano scelte caso per caso (148 nel Tesseramento,
 * 125 nel Team Builder, 62 nella griglia): 125 non apparteneva a nessuna scala.
 */
export const CREST_SIZE = {
  xs: 28,   // riga di tabella / classifica
  sm: 48,   // lista
  md: 62,   // griglia di scelta
  lg: 96,   // header squadra
  xl: 148,  // vetrina tessera
};

export const CREST_RATIO = 1.2;

/** Altezza resa da TeamCrest per una data taglia. */
export function crestHeight(size) {
  return size * CREST_RATIO;
}
