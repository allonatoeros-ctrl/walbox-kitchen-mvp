// normalizeTeam.js — mappa nome club raw API-Football -> codice club interno FantaWalrus.
// Funzione pura, nessuna rete/side-effect. Mappa statica minimale (estendibile senza toccare il motore).

const TEAM_CODE_MAP = Object.freeze({
  Juventus: "JUV",
  "AC Milan": "MIL",
  Inter: "INT",
  Lazio: "LAZ",
});

/**
 * @param {{id?:number, name?:string}} rawTeam
 * @returns {string} codice club interno (es. "JUV")
 */
export function normalizeTeam(rawTeam) {
  const name = rawTeam?.name;
  const code = name ? TEAM_CODE_MAP[name] : undefined;
  if (!code) {
    throw new Error(`TEAM_SCONOSCIUTO: ${JSON.stringify(name ?? rawTeam)}`);
  }
  return code;
}
