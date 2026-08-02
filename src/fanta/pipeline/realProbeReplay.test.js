// realProbeReplay.test.js — replay dei probe REALI API-Football (fixture 1223969, Lazio-Lecce)
// attraverso i normalizzatori puri + buildOfflineDataset. Nessuna chiamata di rete: legge solo i
// JSON già salvati in fixtures/probe/. Verifica che l'output resti compatibile con lo shape atteso
// da scoreEngine (assertReferences/buildVoteIndex), come già validato con i fixture sintetici.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOfflineDataset } from "./buildOfflineDataset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const probe = (n) => JSON.parse(readFileSync(join(__dirname, "fixtures/probe", n), "utf8"));

// Adattamento minimo di shape richiesto dai probe reali (vedi
// ai-ops/reports/fantawalrus-api-football-real-probe.md): gli endpoint /fixtures/players e
// /fixtures/events sono interrogati per singolo fixture e non riportano fixtureId per riga, e
// /fixtures/players non riporta il team dentro ogni blocco statistiche del giocatore (sta nel blocco
// squadra padre). buildOfflineDataset si aspetta entrambi i campi già presenti sulla riga raw.
function loadRealDataset() {
  const fixtureProbe = probe("real_fixture_probe.json");
  const playerStatsProbe = probe("real_player_statistics_probe.json");
  const eventsProbe = probe("real_events_probe.json");

  const fixtureRaw = fixtureProbe.response.find((f) => f.fixture.id === 1223969);
  const fixtureId = fixtureRaw.fixture.id;

  const flattenedPlayers = playerStatsProbe.response.flatMap((teamBlock) =>
    teamBlock.players.map((p) => ({
      ...p,
      statistics: p.statistics.map((s) => ({ ...s, team: teamBlock.team })),
    }))
  );

  const dataset = buildOfflineDataset({
    rawPlayers: flattenedPlayers,
    rawFixtures: [fixtureRaw],
    rawEvents: eventsProbe.response.map((e) => ({ ...e, fixtureId })),
    rawPlayerStatistics: [{ fixtureId, players: flattenedPlayers }],
  });

  return { dataset, fixtureId, flattenedPlayers, eventsProbe };
}

test("realProbeReplay: fixture reale normalizzata correttamente (Lazio-Lecce, round 38)", () => {
  const { dataset } = loadRealDataset();
  assert.equal(dataset.fixtures.length, 1);
  assert.equal(dataset.skipped.fixtures.length, 0);
  const f = dataset.fixtures[0];
  assert.equal(f.fixtureId, "fix_1223969");
  assert.equal(f.home, "LAZ");
  assert.equal(f.away, "LEC");
  assert.equal(f.round, "r38");
});

test("realProbeReplay: tutti i giocatori reali normalizzati (nessuno scartato dopo fix G/D/M/F + team map)", () => {
  const { dataset, flattenedPlayers } = loadRealDataset();
  assert.equal(dataset.skipped.players.length, 0);
  assert.equal(dataset.players.length, flattenedPlayers.length);
  for (const p of dataset.players) {
    assert.ok(["GK", "DEF", "MID", "FWD"].includes(p.role), `ruolo inatteso per ${p.id}: ${p.role}`);
  }
});

test("realProbeReplay: eventi reali normalizzati (goal/cartellini mappati, subst scartato, minuto negativo preservato)", () => {
  const { dataset, eventsProbe } = loadRealDataset();
  assert.equal(dataset.skipped.events.length, 0);
  // subst non genera eventi fantacalcistici -> conteggio eventi < eventi raw
  const substCount = eventsProbe.response.filter((e) => e.type === "subst").length;
  assert.ok(substCount > 0);
  assert.ok(dataset.events.length < eventsProbe.response.length);
  assert.ok(!dataset.events.some((e) => e.type === "unknown_event"));
  // cartellino rosso con minute:-5 osservato nel probe reale: nessun controllo di range, valore preservato
  const redCard = dataset.events.find((e) => e.type === "red_card" && e.minute === -5);
  assert.ok(redCard, "evento red_card con minuto -5 atteso (caso limite osservato nel probe reale)");
});

test("realProbeReplay: voti reali (baseVote per titolari, NO_VOTE sv per subentrati non entrati)", () => {
  const { dataset } = loadRealDataset();
  assert.equal(dataset.skipped.ratings.length, 0);
  const round = dataset.votes.find((v) => v.round === "r38");
  assert.ok(round);
  assert.ok(round.votes.some((v) => typeof v.baseVote === "number"));
  assert.ok(round.votes.some((v) => v.noVote === true && v.reason === "sv"));
});

test("realProbeReplay: shape compatibile con scoreEngine.assertReferences/buildVoteIndex", () => {
  const { dataset } = loadRealDataset();
  for (const e of dataset.events) {
    assert.ok(e.eventId && e.fixtureId && e.round, `evento incompleto: ${JSON.stringify(e)}`);
    assert.equal(typeof e.playerId, "string");
    assert.equal(typeof e.minute, "number");
  }
  for (const round of dataset.votes) {
    for (const v of round.votes) {
      if (v.noVote) {
        assert.equal(typeof v.reason, "string");
      } else {
        assert.equal(typeof v.baseVote, "number");
      }
    }
  }
});

test("realProbeReplay: doppia esecuzione identica (idempotenza/determinismo)", () => {
  const a = loadRealDataset().dataset;
  const b = loadRealDataset().dataset;
  assert.deepEqual(a.players, b.players);
  assert.deepEqual(a.fixtures, b.fixtures);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.votes, b.votes);
});
