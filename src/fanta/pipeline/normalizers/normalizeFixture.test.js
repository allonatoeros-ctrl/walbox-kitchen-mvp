import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFixture } from "./normalizeFixture.js";

const base = (overrides = {}) => ({
  fixture: { id: 592871, date: "2026-07-28T18:00:00+00:00", status: { short: "FT" }, ...overrides.fixture },
  league: { id: 135, round: "Regular Season - 1", ...overrides.league },
  teams: {
    home: { id: 496, name: "Juventus" },
    away: { id: 489, name: "AC Milan" },
    ...overrides.teams,
  },
});

test("normalizeFixture: dati validi -> shape fixtures.json + round interno", () => {
  const f = normalizeFixture(base());
  assert.deepEqual(f, { fixtureId: "fix_592871", home: "JUV", away: "MIL", date: "2026-07-28T18:00:00+00:00", round: "r01" });
});

test("normalizeFixture: date mancante -> throw esplicito", () => {
  assert.throws(() => normalizeFixture(base({ fixture: { id: 592871, date: undefined } })), /FIXTURE_MALFORMATA/);
});

test("normalizeFixture: id mancante -> throw esplicito", () => {
  assert.throws(() => normalizeFixture(base({ fixture: { id: undefined, date: "2026-07-28T18:00:00+00:00" } })), /FIXTURE_MALFORMATA/);
});

test("normalizeFixture: round malformato propaga l'errore (nessun fixture parziale)", () => {
  assert.throws(() => normalizeFixture(base({ league: { round: "Giornata non valida" } })), /ROUND_MALFORMATO/);
});
