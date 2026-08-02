// ingestionService.js — Ingestion Service V1 (offline). Adatta le risposte raw API-Football
// (envelope {response:[...]} di /fixtures, /fixtures/events, /fixtures/players per UN singolo
// fixture) allo shape atteso da buildOfflineDataset, poi normalizza e restituisce un dataset
// interno + metadata di osservabilità. Funzione pura: nessuna rete, nessun env, nessun DB,
// nessuna dipendenza nuova. Stesso fixtureId in input -> stesso output in output (deterministico,
// idempotente). Non modifica scoreEngine/replayEngine.

import { buildOfflineDataset } from "./buildOfflineDataset.js";

export const INGESTION_VERSION = "v1";

// Prefissi dei messaggi di errore lanciati dai normalizzatori (src/fanta/pipeline/normalizers/*.js).
// Usati solo per categorizzare gli scarti in metadata.skippedSummary, mai per il testo integrale.
const SKIP_REASON_CODES = Object.freeze([
  "PLAYER_MALFORMATO",
  "RUOLO_AMBIGUO",
  "TEAM_SCONOSCIUTO",
  "FIXTURE_MALFORMATA",
  "ROUND_MALFORMATO",
  "FIXTURE_SCONOSCIUTA",
  "EVENTO_MALFORMATO",
  "RATING_MALFORMATO",
  "DUPLICATO",
]);

function reasonCode(reason) {
  return SKIP_REASON_CODES.find((code) => reason?.startsWith(code)) ?? "ALTRO";
}

function summarizeSkipped(skipped) {
  const summary = {};
  for (const bucket of Object.keys(skipped)) {
    for (const entry of skipped[bucket]) {
      const key = `${bucket}.${reasonCode(entry.reason)}`;
      summary[key] = (summary[key] ?? 0) + 1;
    }
  }
  return summary;
}

function summarizeVotes(votes) {
  const noVoteReasons = {};
  let baseVoteCount = 0;
  for (const round of votes) {
    for (const v of round.votes) {
      if (v.noVote) {
        noVoteReasons[v.reason] = (noVoteReasons[v.reason] ?? 0) + 1;
      } else {
        baseVoteCount += 1;
      }
    }
  }
  return { baseVoteCount, noVoteReasons };
}

// L'endpoint reale /fixtures/players riporta il team sul blocco squadra padre, non dentro
// ogni riga statistiche/giocatore (vedi ai-ops/reports/fantawalrus-api-football-real-probe.md).
// normalizePlayer/normalizeRating si aspettano invece statistics[].team sulla singola riga.
function flattenPlayerTeamBlocks(teamBlocks) {
  return teamBlocks.flatMap((teamBlock) =>
    (teamBlock?.players ?? []).map((p) => ({
      ...p,
      statistics: (p?.statistics ?? []).map((s) => ({ ...s, team: teamBlock?.team })),
    }))
  );
}

/**
 * Ingestion Service V1 — offline, puro. Riceve le 3 risposte raw API-Football per un singolo
 * fixture e produce un dataset interno normalizzato compatibile con scoreEngine/replayEngine.
 *
 * @param {{fixtureResponse?:object, eventsResponse?:object, playerStatisticsResponse?:object}} input
 * @returns {{
 *   players: array, fixtures: array, events: array, votes: array,
 *   skipped: {players:array, fixtures:array, events:array, ratings:array},
 *   metadata: object, ingestionVersion: string
 * }}
 */
export function ingestFixtureData({ fixtureResponse, eventsResponse, playerStatisticsResponse } = {}) {
  const inputErrors = [];

  const fixtureRaw = fixtureResponse?.response?.[0];
  if (!fixtureRaw) {
    inputErrors.push("FIXTURE_RESPONSE_VUOTA_O_MALFORMATA");
  }
  const fixtureId = fixtureRaw?.fixture?.id ?? null;

  if (eventsResponse !== undefined && !Array.isArray(eventsResponse?.response)) {
    inputErrors.push("EVENTS_RESPONSE_MALFORMATA");
  }
  if (playerStatisticsResponse !== undefined && !Array.isArray(playerStatisticsResponse?.response)) {
    inputErrors.push("PLAYER_STATISTICS_RESPONSE_MALFORMATA");
  }

  const eventsRawList = Array.isArray(eventsResponse?.response) ? eventsResponse.response : [];
  const playerTeamBlocks = Array.isArray(playerStatisticsResponse?.response) ? playerStatisticsResponse.response : [];
  const flattenedPlayers = flattenPlayerTeamBlocks(playerTeamBlocks);

  const dataset = buildOfflineDataset({
    rawPlayers: flattenedPlayers,
    rawFixtures: fixtureRaw ? [fixtureRaw] : [],
    rawEvents: fixtureId !== null ? eventsRawList.map((e) => ({ ...e, fixtureId })) : [],
    rawPlayerStatistics: fixtureId !== null ? [{ fixtureId, players: flattenedPlayers }] : [],
  });

  const unknownEventsCount = dataset.events.filter((e) => e.type === "unknown_event").length;

  return {
    players: dataset.players,
    fixtures: dataset.fixtures,
    events: dataset.events,
    votes: dataset.votes,
    skipped: dataset.skipped,
    metadata: {
      fixtureId: fixtureId !== null ? `fix_${fixtureId}` : null,
      inputErrors,
      playersReceived: flattenedPlayers.length,
      playersIngested: dataset.players.length,
      eventsReceived: eventsRawList.length,
      eventsIngested: dataset.events.length,
      unknownEventsCount,
      votesSummary: summarizeVotes(dataset.votes),
      skippedSummary: summarizeSkipped(dataset.skipped),
    },
    ingestionVersion: INGESTION_VERSION,
  };
}
