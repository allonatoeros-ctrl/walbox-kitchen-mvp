import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlayer } from "./normalizePlayer.js";

const base = (overrides = {}) => ({
  player: { id: 1001, name: "D. Vlahović", ...overrides.player },
  statistics: overrides.statistics ?? [{ team: { id: 496, name: "Juventus" }, games: { position: "Attacker" } }],
});

test("normalizePlayer: dati validi -> shape players.json", () => {
  const p = normalizePlayer(base());
  assert.deepEqual(p, { id: "p_1001", name: "D. Vlahović", role: "FWD", club: "JUV" });
});

test("normalizePlayer: tutti i ruoli mappabili", () => {
  const map = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Attacker: "FWD" };
  for (const [position, role] of Object.entries(map)) {
    const p = normalizePlayer(base({ statistics: [{ team: { id: 496, name: "Juventus" }, games: { position } }] }));
    assert.equal(p.role, role);
  }
});

test("normalizePlayer: campo nome mancante -> throw esplicito", () => {
  assert.throws(() => normalizePlayer(base({ player: { id: 1006, name: "" } })), /PLAYER_MALFORMATO/);
});

test("normalizePlayer: id mancante -> throw esplicito", () => {
  assert.throws(() => normalizePlayer(base({ player: { id: null, name: "X" } })), /PLAYER_MALFORMATO/);
});

test("normalizePlayer: ruolo ambiguo -> throw esplicito, nessun fallback silenzioso", () => {
  assert.throws(
    () => normalizePlayer(base({ statistics: [{ team: { id: 489, name: "AC Milan" }, games: { position: "Defender/Midfielder" } }] })),
    /RUOLO_AMBIGUO/
  );
});
