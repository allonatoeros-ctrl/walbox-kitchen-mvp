// customTeamAdapter.js — mappa il team custom salvato dal Team Builder
// nel contratto atteso da useMatchday/replayEngine/scoreEngine.
// Puro: nessun localStorage/DOM/rete qui dentro (il chiamante passa il dato già parsato).
//
// Nota: qui si pulisce solo la FORMA (id noti, campi presenti). La validità del modulo
// (11 titolari, ruoli, max per club) è responsabilità di chi consuma il team (vedi
// FantaMatchday.jsx), perché lì si può distinguere "nessuna squadra salvata" da
// "squadra incompleta" e mostrare uno stato diverso invece di un fallback silenzioso.

/**
 * @param {any} rawCustomTeam  oggetto già JSON.parse-ato (o null/undefined) da fanta_walrus_custom_team
 * @param {Array<{id:string}>} players  players.json, per validare gli id del roster
 * @returns {{teamId:string, formation:string, roster:Array<{id:string,isStarter:boolean}>}|null}
 */
export function adaptCustomTeam(rawCustomTeam, players) {
  if (!rawCustomTeam || typeof rawCustomTeam !== "object") return null;
  const { teamId, formation, roster, updatedAt } = rawCustomTeam;

  if (typeof teamId !== "string" || !teamId) return null;
  if (typeof formation !== "string" || !formation) return null;
  if (typeof updatedAt !== "string" || !updatedAt) return null;
  if (!Array.isArray(roster)) return null;

  const validIds = new Set((players || []).map((p) => p.id));
  const cleanRoster = roster.filter(
    (r) => r && typeof r.id === "string" && validIds.has(r.id) && typeof r.isStarter === "boolean"
  );

  const starters = cleanRoster.filter((r) => r.isStarter);
  if (starters.length === 0) return null;

  return { teamId, formation, roster: cleanRoster };
}
