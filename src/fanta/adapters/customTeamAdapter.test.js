import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptCustomTeam } from "./customTeamAdapter.js";
import { scoreTeam } from "../engine/scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function load(name) {
  return JSON.parse(readFileSync(join(__dirname, "../data", name), "utf8"));
}
const players = load("players.json");
const scoring = load("scoring.json");
const votes = load("votes.json");

function validTeam(overrides = {}) {
  return {
    teamId: "team_abc123",
    formation: "4-3-3",
    roster: [
      { id: "p_001", isStarter: true },
      { id: "p_002", isStarter: true },
    ],
    updatedAt: "2026-08-02T10:00:00.000Z",
    ...overrides,
  };
}

test("custom team valido -> contratto pronto per useMatchday", () => {
  const result = adaptCustomTeam(validTeam(), players);
  assert.deepEqual(result, {
    teamId: "team_abc123",
    formation: "4-3-3",
    roster: [
      { id: "p_001", isStarter: true },
      { id: "p_002", isStarter: true },
    ],
  });
});

test("dati assenti -> null", () => {
  assert.equal(adaptCustomTeam(null, players), null);
  assert.equal(adaptCustomTeam(undefined, players), null);
});

test("dati malformati (teamId mancante) -> null", () => {
  assert.equal(adaptCustomTeam(validTeam({ teamId: undefined }), players), null);
});

test("dati malformati (roster non array) -> null", () => {
  assert.equal(adaptCustomTeam(validTeam({ roster: "not-an-array" }), players), null);
});

test("roster vuoto -> null", () => {
  assert.equal(adaptCustomTeam(validTeam({ roster: [] }), players), null);
});

test("roster senza titolari (tutti bench) -> null", () => {
  const team = validTeam({
    roster: [
      { id: "p_001", isStarter: false },
      { id: "p_002", isStarter: false },
    ],
  });
  assert.equal(adaptCustomTeam(team, players), null);
});

test("roster con id inesistenti -> filtrati, resto valido passa", () => {
  const team = validTeam({
    roster: [
      { id: "p_001", isStarter: true },
      { id: "p_999_invalid", isStarter: true },
    ],
  });
  const result = adaptCustomTeam(team, players);
  assert.deepEqual(result.roster, [{ id: "p_001", isStarter: true }]);
});

test("bench vuota ammessa senza crash (solo titolari, nessun elemento isStarter:false)", () => {
  const result = adaptCustomTeam(validTeam(), players);
  assert.ok(result);
  assert.equal(result.roster.every((r) => r.isStarter), true);
});

test("fallback a mock: adapter ritorna null, il chiamante userà teams_sample.json", () => {
  assert.equal(adaptCustomTeam({ garbage: true }, players), null);
});

// end-to-end: roster con panchina salvato dal Team Builder -> adapter -> scoreEngine
// esegue davvero una sostituzione SV per la squadra custom (stesso roster/esito di
// scoreEngine.test.js "SV sostituito dalla panchina (stesso ruolo)": p_002 DEF sv -> p_003 DEF).
test("panchina custom team abilita sostituzione SV end-to-end via scoreTeam", () => {
  const rawCustomTeam = validTeam({
    roster: [
      { id: "p_011", isStarter: true },
      { id: "p_002", isStarter: true },
      { id: "p_022", isStarter: true },
      { id: "p_032", isStarter: true },
      { id: "p_046", isStarter: true },
      { id: "p_035", isStarter: true },
      { id: "p_048", isStarter: true },
      { id: "p_054", isStarter: true },
      { id: "p_055", isStarter: true },
      { id: "p_061", isStarter: true },
      { id: "p_067", isStarter: true },
      { id: "p_003", isStarter: false },
      { id: "p_012", isStarter: false },
      { id: "p_016", isStarter: false },
      { id: "p_019", isStarter: false },
    ],
  });

  const adapted = adaptCustomTeam(rawCustomTeam, players);
  assert.ok(adapted, "adapter deve accettare un roster con 11 titolari + 4 panchina");
  assert.equal(adapted.roster.filter((r) => !r.isStarter).length, 4, "panchina passa intatta attraverso l'adapter");

  const result = scoreTeam(adapted, [], players, scoring, votes);
  const sub = result.playerPoints.find((p) => p.substituted);
  assert.ok(sub, "la squadra custom deve ricevere un subentro SV");
  assert.equal(sub.id, "p_003", "subentra il DEF di panchina p_003, coerente col motore");
  assert.equal(result.playerPoints.find((p) => p.id === "p_002"), undefined, "p_002 sostituito non conteggiato");
});
