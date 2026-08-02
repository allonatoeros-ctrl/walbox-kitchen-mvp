// normalizePlayer.js — raw player API-Football -> shape compatibile players.json ({id,name,role,club}).
// Funzione pura. Prezzo NON derivato da API-Football (fuori contratto raw): resta a carico di pricing.json (DEFERRED).

import { normalizeTeam } from "./normalizeTeam.js";

const POSITION_ROLE_MAP = Object.freeze({
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
});

/**
 * @param {import("../contracts.js").RawApiFootballPlayer} raw
 * @returns {{id:string, name:string, role:string, club:string}}
 */
export function normalizePlayer(raw) {
  const rawId = raw?.player?.id;
  if (rawId === null || rawId === undefined) {
    throw new Error("PLAYER_MALFORMATO: id mancante");
  }
  const name = raw?.player?.name;
  if (!name) {
    throw new Error(`PLAYER_MALFORMATO: nome mancante (id ${rawId})`);
  }
  const position = raw?.statistics?.[0]?.games?.position;
  const role = position ? POSITION_ROLE_MAP[position] : undefined;
  if (!role) {
    throw new Error(`RUOLO_AMBIGUO: id ${rawId} -> posizione "${position}" non mappabile`);
  }
  const club = normalizeTeam(raw?.statistics?.[0]?.team);

  return { id: `p_${rawId}`, name, role, club };
}
