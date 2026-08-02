import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptCustomTeam } from "./customTeamAdapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const players = JSON.parse(readFileSync(join(__dirname, "../data/players.json"), "utf8"));

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
