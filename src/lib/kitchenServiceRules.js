// Regola di servizio condivisa (BEER SPRINT V1 §3/§7-E, confermata da Eros come regola
// definitiva il 2026-09-14): le birre `evening_only` (oggi solo Krombacher Pils) diventano
// ordinabili solo dalle 18:00 locali del device. Unica fonte del gate: BirreSection.jsx e
// il selettore birra di FALLO PESANTE (PesiMassimiSection.jsx) lo importano da qui — mai
// duplicato, per restare testabile in un solo punto.

export const EVENING_SERVICE_START_HOUR = 18;

export function isEveningServiceActive(date = new Date()) {
  return date.getHours() >= EVENING_SERVICE_START_HOUR;
}
