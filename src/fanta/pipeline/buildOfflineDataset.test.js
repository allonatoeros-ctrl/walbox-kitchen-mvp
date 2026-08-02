// buildOfflineDataset.test.js — verifica integrazione pipeline offline + compatibilità di shape con
// scoreEngine.js (assertReferences/buildVoteIndex), senza importare/mutare il motore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOfflineDataset } from "./buildOfflineDataset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = (n) => JSON.parse(readFileSync(join(__dirname, "fixtures/raw", n), "utf8"));

function load() {
  return buildOfflineDataset({
    rawPlayers: raw("raw_players.json"),
    rawFixtures: raw("raw_fixtures.json"),
    rawEvents: raw("raw_events.json"),
    rawPlayerStatistics: raw("raw_player_statistics.json"),
  });
}

test("buildOfflineDataset: dati validi -> players/fixtures/events/votes popolati", () => {
  const out = load();
  assert.ok(out.players.length > 0);
  assert.ok(out.fixtures.length > 0);
  assert.ok(out.events.length > 0);
  assert.ok(out.votes.length > 0);
});

test("buildOfflineDataset: campi mancanti -> riga esclusa e riportata in skipped, batch non bloccato", () => {
  const out = load();
  // p_1006 (nome vuoto) escluso dai player validi
  assert.ok(!out.players.some((p) => p.id === "p_1006"));
  assert.ok(out.skipped.players.some((s) => /PLAYER_MALFORMATO/.test(s.reason)));
  // evento con playerId null escluso dagli eventi validi
  assert.ok(out.skipped.events.some((s) => /EVENTO_MALFORMATO/.test(s.reason)));
});

test("buildOfflineDataset: ruolo ambiguo -> player escluso, non genera crash", () => {
  const out = load();
  assert.ok(!out.players.some((p) => p.id === "p_1005"));
  assert.ok(out.skipped.players.some((s) => /RUOLO_AMBIGUO/.test(s.reason)));
});

test("buildOfflineDataset: rating nullo -> voto NO_VOTE nel round corretto", () => {
  const out = load();
  const round = out.votes.find((v) => v.round === "r01");
  const v = round.votes.find((x) => x.playerId === "p_1003");
  assert.deepEqual(v, { playerId: "p_1003", noVote: true, reason: "rating_mancante" });
});

test("buildOfflineDataset: eventi sconosciuti passano come unknown_event (nessun evento perso silenziosamente)", () => {
  const out = load();
  assert.ok(out.events.some((e) => e.type === "unknown_event"));
});

test("buildOfflineDataset: round malformato -> fixture esclusa, resto del batch intatto", () => {
  const out = load();
  assert.ok(!out.fixtures.some((f) => f.home === "JUV" && f.away === "LAZ"));
  assert.ok(out.skipped.fixtures.some((s) => /ROUND_MALFORMATO/.test(s.reason)));
});

test("buildOfflineDataset: input duplicati (player/rating) -> deduplicati, non doppiati nell'output", () => {
  const out = load();
  assert.equal(out.players.filter((p) => p.id === "p_1002").length, 1);
  assert.ok(out.skipped.players.some((s) => /DUPLICATO: p_1002/.test(s.reason)));
  const round = out.votes.find((v) => v.round === "r01");
  assert.equal(round.votes.filter((v) => v.playerId === "p_1002").length, 1);
  assert.ok(out.skipped.ratings.some((s) => /DUPLICATO: p_1002/.test(s.reason)));
});

test("buildOfflineDataset: shape eventi compatibile con scoreEngine.assertReferences (eventId/fixtureId/round truthy)", () => {
  const out = load();
  for (const e of out.events) {
    assert.ok(e.eventId && e.fixtureId && e.round, `evento incompleto: ${JSON.stringify(e)}`);
    assert.equal(typeof e.playerId, "string");
    assert.equal(typeof e.minute, "number");
  }
});

test("buildOfflineDataset: shape voti compatibile con scoreEngine.buildVoteIndex (baseVote xor noVote+reason)", () => {
  const out = load();
  for (const round of out.votes) {
    for (const v of round.votes) {
      if (v.noVote) {
        assert.equal(typeof v.reason, "string");
      } else {
        assert.equal(typeof v.baseVote, "number");
      }
    }
  }
});
