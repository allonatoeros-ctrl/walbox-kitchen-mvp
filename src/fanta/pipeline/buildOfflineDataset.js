// buildOfflineDataset.js — orchestratore puro: raw API-Football (statico, offline) -> dataset compatibile
// con players.json / events.json / votes.json / fixtures(+round interno).
// Nessuna rete, nessuna mutazione degli input, nessuna dipendenza da scoreEngine/replayEngine/useMatchday.
// Righe raw malformate/duplicate NON bloccano l'intero batch: vengono escluse e riportate in `skipped`
// (stesso principio di tolleranza di scoreEngine.js con skippedEvents).

import { normalizePlayer } from "./normalizers/normalizePlayer.js";
import { normalizeFixture } from "./normalizers/normalizeFixture.js";
import { normalizeEvent } from "./normalizers/normalizeEvent.js";
import { normalizeRating } from "./normalizers/normalizeRating.js";

/**
 * @param {{rawPlayers?:array, rawFixtures?:array, rawEvents?:array, rawPlayerStatistics?:array}} raw
 */
export function buildOfflineDataset({
  rawPlayers = [],
  rawFixtures = [],
  rawEvents = [],
  rawPlayerStatistics = [],
} = {}) {
  const skipped = { players: [], fixtures: [], events: [], ratings: [] };

  const playersById = new Map();
  for (const raw of rawPlayers) {
    try {
      const normalized = normalizePlayer(raw);
      if (playersById.has(normalized.id)) {
        skipped.players.push({ raw, reason: `DUPLICATO: ${normalized.id}` });
        continue;
      }
      playersById.set(normalized.id, normalized);
    } catch (err) {
      skipped.players.push({ raw, reason: err.message });
    }
  }

  const fixturesById = new Map();
  for (const raw of rawFixtures) {
    try {
      const normalized = normalizeFixture(raw);
      if (fixturesById.has(normalized.fixtureId)) {
        skipped.fixtures.push({ raw, reason: `DUPLICATO: ${normalized.fixtureId}` });
        continue;
      }
      fixturesById.set(normalized.fixtureId, normalized);
    } catch (err) {
      skipped.fixtures.push({ raw, reason: err.message });
    }
  }

  const eventsById = new Map();
  for (const raw of rawEvents) {
    const fixture = fixturesById.get(`fix_${raw?.fixtureId}`);
    if (!fixture) {
      skipped.events.push({ raw, reason: `FIXTURE_SCONOSCIUTA: ${raw?.fixtureId}` });
      continue;
    }
    try {
      const normalizedList = normalizeEvent(raw, { fixtureId: fixture.fixtureId, round: fixture.round });
      for (const ev of normalizedList) {
        if (eventsById.has(ev.eventId)) {
          skipped.events.push({ raw, reason: `DUPLICATO: ${ev.eventId}` });
          continue;
        }
        eventsById.set(ev.eventId, ev);
      }
    } catch (err) {
      skipped.events.push({ raw, reason: err.message });
    }
  }

  const votesByRound = new Map();
  for (const block of rawPlayerStatistics) {
    const fixture = fixturesById.get(`fix_${block?.fixtureId}`);
    if (!fixture) {
      skipped.ratings.push({ raw: block, reason: `FIXTURE_SCONOSCIUTA: ${block?.fixtureId}` });
      continue;
    }
    if (!votesByRound.has(fixture.round)) {
      votesByRound.set(fixture.round, { round: fixture.round, votes: [], seenPlayerIds: new Set() });
    }
    const bucket = votesByRound.get(fixture.round);
    for (const p of block?.players ?? []) {
      try {
        const normalized = normalizeRating(p);
        if (bucket.seenPlayerIds.has(normalized.playerId)) {
          skipped.ratings.push({ raw: p, reason: `DUPLICATO: ${normalized.playerId}` });
          continue;
        }
        bucket.seenPlayerIds.add(normalized.playerId);
        bucket.votes.push(normalized);
      } catch (err) {
        skipped.ratings.push({ raw: p, reason: err.message });
      }
    }
  }

  return {
    players: [...playersById.values()],
    fixtures: [...fixturesById.values()],
    events: [...eventsById.values()],
    votes: [...votesByRound.values()].map(({ round, votes }) => ({ round, votes })),
    skipped,
  };
}
