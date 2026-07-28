// useTeams.test.js — MT4 (node:test, no new deps)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveTeamsState } from "./useTeams.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = (n) => JSON.parse(readFileSync(join(__dirname, "../data", n), "utf8"));
const players = data("players.json"), events = data("events.json"), scoring = data("scoring.json"), votes = data("votes.json");

function validRoster(pls) {
  const byRole = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of pls) byRole[p.role].push(p.id);
  const used = {};
  const take = (role, n) => { const out = []; for (const id of byRole[role]) { if (out.length >= n) break; const c = pls.find((x) => x.id === id).club; if ((used[c] || 0) < 3) { out.push(id); used[c] = (used[c] || 0) + 1; } } return out; };
  const stars = [...take("GK", 1), ...take("DEF", 4), ...take("MID", 3), ...take("FWD", 3)];
  const bench = [];
  for (const p of pls) { if (bench.length >= 4) break; if (stars.includes(p.id) || p.role === "GK") continue; if ((used[p.club] || 0) < 3) { bench.push(p.id); used[p.club] = (used[p.club] || 0) + 1; } }
  return [...stars.map((id) => ({ id, isStarter: true })), ...bench.map((id) => ({ id, isStarter: false }))];
}
const teams = data("teams_sample.json").map((t) => ({ ...t, roster: validRoster(players) }));

test("deriveTeamsState: standings ordinati e totali coerenti", () => {
  const { standings, byTeam } = deriveTeamsState({ teams, players, events, votes, scoring });
  assert.equal(standings.length, teams.length);
  for (let i = 1; i < standings.length; i++) assert.ok(standings[i - 1].total >= standings[i].total, "non ordinato");
  for (const t of teams) assert.equal(byTeam[t.teamId].total, standings.find((s) => s.teamId === t.teamId).total);
});

test("deriveTeamsState: getTeam/getRoster/getTeamScore via hook-like access", () => {
  const { byTeam } = deriveTeamsState({ teams, players, events, votes, scoring });
  const id = teams[0].teamId;
  assert.ok(byTeam[id].roster.length >= 11);
  assert.equal(typeof byTeam[id].total, "number");
});

test("deriveTeamsState: retractions non duplicano (Sala VAR)", () => {
  const base = deriveTeamsState({ teams, players, events, votes, scoring });
  // scegli un evento il cui playerId è in una rosa valida E il cui type è in scoring V1
  const rosterIds = new Set(teams.flatMap((t) => t.roster.map((r) => r.id)));
  const evt = events.find((e) => rosterIds.has(e.playerId) && e.type in scoring);
  assert.ok(evt, "nessun evento valido per retraction nei team di test");
  const withR = deriveTeamsState({ teams, players, events, votes, scoring, retractions: [evt] });
  assert.notDeepEqual(base.standings, withR.standings, `retraction di ${evt.eventId} non cambia i totali`);
});
