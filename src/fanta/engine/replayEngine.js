// replayEngine.js — FantaWalrus V1 (MT3)
// Replay engine puro e controllabile: riproduce gli eventi di una giornata
// in ordine deterministico e alimenta scoreEngine senza dipendere dalla UI.
// Nessun React/DOM/localStorage/timer/rete. Nessuna mutazione input.
// Avanzamento evento-per-evento; il "tempo" è emulato dal chiamante (step()),
// quindi i test possono fare replay istantaneo senza timer reale.

import { scoreLeague, scoreTeam } from "./scoreEngine.js";

// Ordinamento deterministico richiesto da MT3: round, fixture, minuto, eventId.
// (scoreEngine ordina per minuto/round/fixture internamente; il replay espone
//  l'ordine per round/fixture/minuto come da contratto MT3, tie-break = eventId.)
function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.round !== b.round) return a.round < b.round ? -1 : 1;
    if (a.fixtureId !== b.fixtureId) return a.fixtureId < b.fixtureId ? -1 : 1;
    if (a.minute !== b.minute) return a.minute - b.minute;
    return a.eventId < b.eventId ? -1 : 1;
  });
}

// Verifica coerenza fixture/eventi (errori espliciti, no silent fallback).
function validateInputs({ fixtures, events, players }) {
  const fixtureIds = new Set();
  for (const f of fixtures) {
    const fid = f.fixtureId || f.id;
    if (!fid || !f.home || !f.away) throw new Error(`FIXTURE_INCOERENTE: ${JSON.stringify(f)}`);
    if (fixtureIds.has(fid)) throw new Error(`FIXTURE_DUPLICATA: ${fid}`);
    fixtureIds.add(fid);
  }
  const playerIds = new Set(players.map((p) => p.id));
  for (const e of events) {
    if (!e.eventId || !e.round || !e.fixtureId || !e.playerId || e.minute == null) {
      throw new Error(`EVENTO_MALFORMATO: ${JSON.stringify(e)}`);
    }
    if (!fixtureIds.has(e.fixtureId)) {
      throw new Error(`EVENTO_SENZA_FIXTURE: ${e.eventId} -> ${e.fixtureId}`);
    }
    if (!playerIds.has(e.playerId)) {
      throw new Error(`PLAYER_INESISTENTE: ${e.eventId} -> ${e.playerId}`);
    }
  }
}

/**
 * Crea un replay engine controllabile.
 * @param {object} cfg
 *   fixtures, events, players, scoring, votes, teams  (tutti i dati necessari a scoreEngine)
 *   onEvent(event, ctx)  callback per evento applicato
 *   onStateChange(state) callback su cambio stato
 * @returns API replay engine
 */
export function createReplay(cfg) {
  if (!cfg || !cfg.fixtures || !cfg.events || !cfg.players || !cfg.teams) {
    throw new Error("CONFIG_MANCANTE: serve fixtures, events, players, teams");
  }
  // Nessuna mutazione input: copie difensive.
  const fixtures = [...cfg.fixtures];
  const events = sortEvents(cfg.events);
  const players = [...cfg.players];
  const scoring = { ...cfg.scoring };
  const votes = { round: cfg.votes?.round, votes: [...(cfg.votes?.votes || [])] };
  const teams = cfg.teams.map((t) => ({ ...t, roster: t.roster.map((r) => ({ ...r })) }));

  validateInputs({ fixtures, events, players });

  let cursor = 0;            // eventi già applicati
  let state = "idle";        // idle | running | paused | completed
  const applied = [];         // eventi applicati (copia, per seek/reset)
  const emitted = new Set();  // eventId già emessi (anti-doppio dopo pause/resume/reset)

  const onEvent = typeof cfg.onEvent === "function" ? cfg.onEvent : () => {};
  const onStateChange = typeof cfg.onStateChange === "function" ? cfg.onStateChange : () => {};

  function setState(next) {
    state = next;
    onStateChange(state);
  }

  // Ricalcola la classifica da zero usando SOLO gli eventi applicati.
  // Questo "alimenta scoreEngine" ad ogni step mantenendo coerenza (no drift).
  function recomputeStandings() {
    return scoreLeague(teams, applied, players, scoring, votes);
  }

  // Breakdown per-squadra (titolari effettivi, sostituzioni, punti) — riusa scoreTeam,
  // nessuna logica di scoring nuova. Calcolato sugli stessi eventi applicati finora.
  function recomputeByTeam() {
    const byTeam = {};
    for (const t of teams) {
      const r = scoreTeam(t, applied, players, scoring, votes);
      byTeam[t.teamId] = {
        teamId: t.teamId,
        total: r.total,
        playerPoints: r.playerPoints,
        roster: t.roster,
      };
    }
    return byTeam;
  }

  function step() {
    if (state === "completed") return null;
    if (cursor >= events.length) {
      setState("completed");
      return null;
    }
    const event = events[cursor];
    cursor += 1;
    if (emitted.has(event.eventId)) {
      // Guardia anti-doppio (non dovrebbe accadere con seek/reset corretti).
      return step();
    }
    emitted.add(event.eventId);
    applied.push({ ...event });
    const standings = recomputeStandings();
    const ctx = {
      cursor,
      total: events.length,
      state,
      standings,
      appliedCount: applied.length,
    };
    onEvent({ ...event }, ctx);
    if (cursor >= events.length) setState("completed");
    return { event, ctx };
  }

  function start() {
    if (state === "running" || state === "completed") return;
    setState("running");
    onEvent({ __replayStart: true }, { cursor, total: events.length, state });
  }

  function pause() {
    if (state !== "running") return;
    setState("paused");
  }

  function resume() {
    if (state !== "paused") return;
    setState("running");
  }

  function reset() {
    cursor = 0;
    applied.length = 0;
    emitted.clear();
    setState("idle");
  }

  // Riposiziona il replay all'evento n (0 = inizio). Ricalcola da zero: no duplicati.
  function seek(n) {
    const target = Math.max(0, Math.min(events.length, Math.floor(n)));
    cursor = target;
    applied.length = 0;
    emitted.clear();
    for (let i = 0; i < target; i++) {
      const e = events[i];
      applied.push({ ...e });
      emitted.add(e.eventId);
    }
    setState(target >= events.length ? "completed" : (target === 0 ? "idle" : "paused"));
    return getState();
  }

  function getState() {
    return {
      state,
      cursor,
      total: events.length,
      appliedCount: applied.length,
      standings: recomputeStandings(),
      byTeam: recomputeByTeam(),
      completed: state === "completed",
    };
  }

  return {
    start,
    pause,
    resume,
    reset,
    seek,
    step,
    getState,
    // esposto per test/debug
    _events: events,
  };
}

export { sortEvents };
