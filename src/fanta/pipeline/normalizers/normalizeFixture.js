// normalizeFixture.js — raw fixture API-Football -> shape compatibile fixtures.json + round interno.
// Funzione pura.

import { normalizeTeam } from "./normalizeTeam.js";
import { normalizeRound } from "./normalizeRound.js";

/**
 * @param {import("../contracts.js").RawApiFootballFixture} raw
 * @returns {{fixtureId:string, home:string, away:string, date:string, round:string}}
 */
export function normalizeFixture(raw) {
  const rawId = raw?.fixture?.id;
  if (rawId === null || rawId === undefined) {
    throw new Error("FIXTURE_MALFORMATA: id mancante");
  }
  const date = raw?.fixture?.date;
  if (!date) {
    throw new Error(`FIXTURE_MALFORMATA: date mancante (fixture ${rawId})`);
  }
  const home = normalizeTeam(raw?.teams?.home);
  const away = normalizeTeam(raw?.teams?.away);
  const round = normalizeRound(raw?.league?.round);

  return { fixtureId: `fix_${rawId}`, home, away, date, round };
}
