// ingestionService.test.js — Ingestion Service V1: unit + end-to-end (probe reale -> ingestion ->
// dataset interno -> scoreEngine con roster valido). Nessuna chiamata di rete: usa solo i probe
// reali già salvati e i dataset statici di test già esistenti in src/fanta/data/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestFixtureData, INGESTION_VERSION } from "./ingestionService.js";
import { scoreTeam } from "../engine/scoreEngine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const probe = (n) => JSON.parse(readFileSync(join(__dirname, "fixtures/probe", n), "utf8"));
const dataDir = join(__dirname, "..", "data");
const loadData = (n) => JSON.parse(readFileSync(join(dataDir, n), "utf8"));

function loadRealResponses() {
  return {
    fixtureResponse: probe("real_fixture_probe.json"),
    eventsResponse: probe("real_events_probe.json"),
    playerStatisticsResponse: probe("real_player_statistics_probe.json"),
  };
}

// --- 1-2. raw real probe -> ingestion service -> dataset interno ---

test("ingestionService: probe reale -> dataset interno completo, nessun input error", () => {
  const out = ingestFixtureData(loadRealResponses());
  assert.equal(out.ingestionVersion, INGESTION_VERSION);
  assert.deepEqual(out.metadata.inputErrors, []);
  assert.equal(out.metadata.fixtureId, "fix_1223969");
  assert.equal(out.fixtures.length, 1);
  assert.ok(out.players.length > 0);
  assert.ok(out.events.length > 0);
  assert.ok(out.votes.length > 0);
  assert.equal(out.metadata.playersReceived, out.metadata.playersIngested);
});

test("ingestionService: input malformato (nessuna response) -> nessun crash, inputErrors popolato", () => {
  const out = ingestFixtureData({});
  assert.deepEqual(out.players, []);
  assert.deepEqual(out.fixtures, []);
  assert.deepEqual(out.events, []);
  assert.deepEqual(out.votes, []);
  assert.ok(out.metadata.inputErrors.includes("FIXTURE_RESPONSE_VUOTA_O_MALFORMATA"));
});

test("ingestionService: eventsResponse/playerStatisticsResponse con shape sbagliata -> inputErrors, nessun crash", () => {
  const { fixtureResponse } = loadRealResponses();
  const out = ingestFixtureData({ fixtureResponse, eventsResponse: { response: "non-array" }, playerStatisticsResponse: { response: null } });
  assert.ok(out.metadata.inputErrors.includes("EVENTS_RESPONSE_MALFORMATA"));
  assert.ok(out.metadata.inputErrors.includes("PLAYER_STATISTICS_RESPONSE_MALFORMATA"));
  assert.equal(out.fixtures.length, 1); // fixture da sola resta valida
});

// --- doppia esecuzione identica (idempotenza/determinismo) ---

test("ingestionService: doppia esecuzione identica -> stesso output (determinismo)", () => {
  const a = ingestFixtureData(loadRealResponses());
  const b = ingestFixtureData(loadRealResponses());
  assert.deepEqual(a, b);
});

// --- evento sconosciuto: iniettato manualmente perché il fixture reale non ne contiene ---

test("ingestionService: evento sconosciuto (Var/non mappato) -> unknown_event, nessun crash", () => {
  const responses = loadRealResponses();
  const injected = {
    ...responses,
    eventsResponse: {
      ...responses.eventsResponse,
      response: [
        ...responses.eventsResponse.response,
        {
          time: { elapsed: 60, extra: null },
          team: { id: 487, name: "Lazio" },
          player: { id: 1454, name: "Mattéo Guendouzi" },
          assist: { id: null, name: null },
          type: "Var",
          detail: "Goal Cancelled",
        },
      ],
    },
  };
  const out = ingestFixtureData(injected);
  assert.equal(out.metadata.unknownEventsCount, 1);
  assert.ok(out.events.some((e) => e.type === "unknown_event"));
});

// --- player mancante nell'endpoint statistiche: nessun crash, players ridotto ---

test("ingestionService: playerStatisticsResponse assente -> events/fixture comunque ingeriti, players vuoto", () => {
  const { fixtureResponse, eventsResponse } = loadRealResponses();
  const out = ingestFixtureData({ fixtureResponse, eventsResponse });
  assert.deepEqual(out.players, []);
  assert.equal(out.metadata.playersReceived, 0);
  assert.ok(out.fixtures.length === 1);
  assert.ok(out.events.length > 0); // eventi normalizzati anche senza roster statistiche
});

// --- player sconosciuto: scoreEngine deve rifiutare esplicitamente eventi verso player non noti ---

test("ingestionService -> scoreEngine: player sconosciuto nel roster (assente da players) -> throw esplicito, nessun crash silenzioso", () => {
  const out = ingestFixtureData(loadRealResponses());
  const round = out.votes.find((v) => v.round === "r38");
  const eventsForRound = out.events.filter((e) => e.round === "r38");

  const staticPlayers = loadData("players.json");
  const rosterIds = {
    GK: ["p_56459"],
    DEF: ["p_162952", "p_1632", "p_003", "p_012"],
    MID: ["p_1748", "p_1454", "p_025"], // p_1748 = scorer reale
    FWD: ["p_66817", "p_008", "p_017"],
  };
  const allIds = [...rosterIds.GK, ...rosterIds.DEF, ...rosterIds.MID, ...rosterIds.FWD];
  const players = [...out.players, ...staticPlayers.filter((p) => allIds.includes(p.id) && !out.players.some((rp) => rp.id === p.id))].filter(
    (p) => p.id !== "p_1748" // player sconosciuto: presente in roster/eventi ma assente dai players noti
  );

  const team = { teamId: "t_test", formation: "4-4-3", roster: allIds.map((id) => ({ id, isStarter: true })) };

  assert.throws(() => scoreTeam(team, eventsForRound, players, loadData("scoring.json"), round), /PLAYER_INESISTENTE/);
});

// --- dataset -> scoreEngine con roster valido di test (goal, assist, cartellini reali) ---

test("ingestionService -> scoreEngine: roster valido misto (real+static) -> goal/assist/cartellini applicati", () => {
  const out = ingestFixtureData(loadRealResponses());
  const round = out.votes.find((v) => v.round === "r38");
  assert.ok(round);

  const staticPlayers = loadData("players.json");
  const staticVotesR01 = loadData("votes.json");
  const scoring = loadData("scoring.json");

  // Roster valido: 1 GK + 4 DEF + 3 MID + 3 FWD, max 3 per club (LEC:3, LAZ:3, JUV:2, MIL:2, INT:1).
  const rosterIds = {
    GK: ["p_56459"], // real, LEC, portiere titolare
    DEF: ["p_162952", "p_1632", "p_003", "p_012"], // real LAZ x2 + static JUV/MIL
    MID: ["p_1748", "p_1454", "p_025"], // real LEC (goal) + real LAZ (yellow) + static INT
    FWD: ["p_66817", "p_008", "p_017"], // real LEC (assist) + static JUV/MIL
  };
  const allIds = [...rosterIds.GK, ...rosterIds.DEF, ...rosterIds.MID, ...rosterIds.FWD];
  assert.equal(allIds.length, 11);

  // scoreTeam.assertReferences valida OGNI evento del round contro l'indice players: serve quindi
  // l'intero roster reale ingerito (non solo gli 11 titolari), + i player statici usati come riempitivo.
  const players = [...out.players, ...staticPlayers.filter((p) => allIds.includes(p.id) && !out.players.some((rp) => rp.id === p.id))];
  assert.ok(allIds.every((id) => players.some((p) => p.id === id)), "tutti gli id del roster devono risolvere a un player normalizzato");

  const votes = {
    round: "mixed-test",
    votes: [
      ...round.votes.filter((v) => allIds.includes(v.playerId)),
      ...staticVotesR01.votes.filter((v) => allIds.includes(v.playerId)),
    ],
  };
  assert.equal(votes.votes.length, 11, "ogni titolare deve avere un voto (baseVote o NO_VOTE)");

  const team = {
    teamId: "t_test",
    formation: "4-4-3",
    roster: allIds.map((id) => ({ id, isStarter: true })),
  };

  const eventsForRound = out.events.filter((e) => e.round === "r38");
  const result = scoreTeam(team, eventsForRound, players, scoring, votes);

  assert.equal(result.playerPoints.length, 11);

  // goal (p_1748) e assist (p_66817): baseVote + bonus applicato
  const scorer = result.playerPoints.find((p) => p.id === "p_1748");
  const assister = result.playerPoints.find((p) => p.id === "p_66817");
  assert.equal(scorer.points, Math.round((7.6 + scoring.goal) * 100) / 100);
  assert.equal(assister.points, Math.round((7.3 + scoring.assist) * 100) / 100);

  // cartellino giallo (p_1454): malus applicato
  const booked = result.playerPoints.find((p) => p.id === "p_1454");
  assert.equal(booked.points, Math.round((7.5 + scoring.yellow_card) * 100) / 100);

  // cartellino rosso (p_1632): malus applicato
  const sentOff = result.playerPoints.find((p) => p.id === "p_1632");
  assert.equal(sentOff.points, Math.round((7.2 + scoring.red_card) * 100) / 100);

  // varLog traccia gli eventi reali applicati (fonte "replay", nessuna mutazione dell'engine)
  assert.ok(result.varLog.some((v) => v.playerId === "p_1748" && v.type === "goal"));
  assert.ok(result.varLog.length > 0);
});

// --- rating stringa (formato reale "6.9") + NO_VOTE (sv, minuti null/0) ---

test("ingestionService: rating stringa reale normalizzato a numero, NO_VOTE sv per subentrati non entrati", () => {
  const out = ingestFixtureData(loadRealResponses());
  const round = out.votes.find((v) => v.round === "r38");
  assert.ok(round.votes.some((v) => typeof v.baseVote === "number" && v.baseVote === 9.2)); // p_56459 rating "9.2" -> 9.2 numerico
  const noVotes = round.votes.filter((v) => v.noVote);
  assert.ok(noVotes.length > 0);
  assert.ok(noVotes.every((v) => v.reason === "sv"));
});
