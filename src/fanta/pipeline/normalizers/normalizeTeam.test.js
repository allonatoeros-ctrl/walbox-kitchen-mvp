import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTeam } from "./normalizeTeam.js";

test("normalizeTeam: mappa nome noto -> codice club", () => {
  assert.equal(normalizeTeam({ id: 496, name: "Juventus" }), "JUV");
  assert.equal(normalizeTeam({ id: 489, name: "AC Milan" }), "MIL");
});

test("normalizeTeam: club sconosciuto -> throw esplicito", () => {
  assert.throws(() => normalizeTeam({ id: 999, name: "Squadra Fantasma FC" }), /TEAM_SCONOSCIUTO/);
});

test("normalizeTeam: campo mancante -> throw esplicito", () => {
  assert.throws(() => normalizeTeam(undefined), /TEAM_SCONOSCIUTO/);
  assert.throws(() => normalizeTeam({}), /TEAM_SCONOSCIUTO/);
});
