// useVarLog.test.js — MT4 (node:test, no new deps). Funzioni pure + import hook.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as hookMod from "./useVarLog.js";
import {
  buildRetractionSet, sortVarEntries, filterVarByPlayer,
  buildPlayerTeamMap, enrichVarEntries,
} from "./useVarLog.js";

const teams = [
  { teamId: "t1", roster: [{ id: "p_008" }, { id: "p_007" }] },
  { teamId: "t2", roster: [{ id: "p_003" }] },
];

// varLog REALE stile scoreEngine: nessun teamId presente.
const realVarLog = [
  { eventId: "v2", playerId: "p_008", minute: 45, type: "goal", delta: 3 },
  { eventId: "v1", playerId: "p_007", minute: 12, type: "assist", delta: 1 },
  { eventId: "v3", playerId: "p_003", minute: 45, type: "red_card", delta: -1 },
];

test("1. buildPlayerTeamMap: playerId -> teamId", () => {
  const m = buildPlayerTeamMap(teams);
  assert.equal(m["p_008"], "t1");
  assert.equal(m["p_007"], "t1");
  assert.equal(m["p_003"], "t2");
});

test("2. filtro team su varLog REALE (senza teamId nelle entry)", () => {
  const m = buildPlayerTeamMap(teams);
  const enriched = enrichVarEntries(realVarLog, m);
  // le entry originali non sono mutate
  assert.equal(realVarLog[0].teamId, undefined);
  const byTeam = enriched.filter((e) => e.teamId === "t1");
  assert.equal(byTeam.length, 2);
  assert.ok(byTeam.every((e) => e.teamId === "t1"));
  const t2 = enriched.filter((e) => e.teamId === "t2");
  assert.equal(t2.length, 1);
});

test("3. input non mutato (enrichVarEntries copia)", () => {
  const m = buildPlayerTeamMap(teams);
  const before = JSON.stringify(realVarLog);
  enrichVarEntries(realVarLog, m);
  assert.equal(JSON.stringify(realVarLog), before);
});

test("4. nessuna regressione altri filtri", () => {
  const m = buildPlayerTeamMap(teams);
  const enriched = enrichVarEntries(realVarLog, m);
  assert.equal(filterVarByPlayer(enriched, "p_008").length, 1);
  const s = sortVarEntries(enriched);
  assert.deepEqual(s.map((e) => e.eventId), ["v1", "v2", "v3"]);
});

test("5. buildRetractionSet senza duplicati", () => {
  const s = buildRetractionSet([{ eventId: "v1" }, { eventId: "v1" }, { eventId: "v2" }]);
  assert.equal(s.size, 2);
});

test("6. hook useVarLog importabile e con API attesa", () => {
  assert.equal(typeof hookMod.useVarLog, "function");
  assert.equal(typeof hookMod.buildPlayerTeamMap, "function");
  assert.equal(typeof hookMod.enrichVarEntries, "function");
});
