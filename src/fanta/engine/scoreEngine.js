// scoreEngine.js — FantaWalrus V1 (MT2-RESET)
// Motore Classic italiano: fantavoto = voto base + somma bonus/malus.
// Nessun accesso a React/DOM/localStorage/timer/rete. Nessuna mutazione input.
// Deterministico. Sala VAR (varLog) + rettifiche (recalcWithRetraction).

// --- Configurazione regole V1 (non in pricing.json, che resta per quotazioni) ---
const MAX_SUBSTITUTIONS = 3;
const MAX_PER_CLUB = 3;
const ROLE_LIMITS = { GK: 1, DEF: 5, MID: 5, FWD: 5 }; // massimi per ruolo (11 totali)

// --- Ordinamento deterministico degli eventi ---
function sortEvents(events) {
  return [...events].sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    if (a.round !== b.round) return a.round < b.round ? -1 : 1;
    if (a.fixtureId !== b.fixtureId) return a.fixtureId < b.fixtureId ? -1 : 1;
    return a.eventId < b.eventId ? -1 : 1;
  });
}

// --- Indice giocatori id -> {role, club} ---
function buildPlayerIndex(players) {
  const idx = {};
  for (const p of players) {
    if (idx[p.id]) throw new Error(`PLAYER_DUPLICATO: ${p.id}`);
    idx[p.id] = { role: p.role, club: p.club };
  }
  return idx;
}

// --- Verifica riferimenti eventi -> giocatori esistenti ---
function assertReferences(list, playerIndex) {
  for (const e of list) {
    if (!playerIndex[e.playerId]) {
      throw new Error(`PLAYER_INESISTENTE: evento ${e.eventId} -> playerId ${e.playerId}`);
    }
    if (!e.eventId || !e.fixtureId || !e.round) {
      throw new Error(`EVENTO_MALFORMATO: ${JSON.stringify(e)}`);
    }
  }
}

// --- Voto base: mappa playerId -> {baseVote|noVote} ---
function buildVoteIndex(votes) {
  const idx = {};
  for (const v of votes) {
    idx[v.playerId] = v.noVote ? { noVote: true, reason: v.reason } : { baseVote: v.baseVote };
  }
  return idx;
}

// --- Punti di un singolo evento bonus/malus (decimale ammesso) ---
function pointsForEvent(type, scoring) {
  if (!(type in scoring)) return null; // tipo non in scoring V1 -> ignorato (es. cleansheet_def, save, bonus)
  const v = scoring[type];
  if (typeof v !== "number") throw new Error(`REGOLA_NON_VALIDA: "${type}"`);
  return v;
}

// --- Validazione modulo/rosa ---
function validateLineup(starters, playerIndex) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const clubs = {};
  for (const s of starters) {
    const p = playerIndex[s.id];
    if (!p) throw new Error(`PLAYER_INESISTENTE: rosa -> ${s.id}`);
    if (!(p.role in counts)) throw new Error(`RUOLO_SCONOSCIUTO: ${p.role}`);
    counts[p.role] += 1;
    clubs[p.club] = (clubs[p.club] || 0) + 1;
  }
  if (counts.GK !== 1) throw new Error(`MODULO_INVALIDO: serve 1 portiere, trovati ${counts.GK}`);
  for (const role of ["DEF", "MID", "FWD"]) {
    if (counts[role] > ROLE_LIMITS[role]) {
      throw new Error(`MODULO_INVALIDO: troppi ${role} (${counts[role]} > ${ROLE_LIMITS[role]})`);
    }
  }
  const total = counts.GK + counts.DEF + counts.MID + counts.FWD;
  if (total !== 11) throw new Error(`MODULO_INVALIDO: servono 11 titolari, trovati ${total}`);
  for (const [club, n] of Object.entries(clubs)) {
    if (n > MAX_PER_CLUB) throw new Error(`MAX_PER_CLUB: ${n} di ${club} > ${MAX_PER_CLUB}`);
  }
  return counts;
}

// --- Sostituzioni SV: panchina nell'ordine del roster, stesso ruolo, max 3 ---
function resolveLineup(roster, votesIndex, playerIndex) {
  const starters = [];
  const bench = [];
  for (const r of roster) {
    const p = playerIndex[r.id];
    if (!p) throw new Error(`PLAYER_INESISTENTE: rosa -> ${r.id}`);
    if (r.isStarter) starters.push({ id: r.id, role: p.role });
    else bench.push({ id: r.id, role: p.role });
  }

  const subsUsed = { count: 0 };
  const effective = starters.map((s) => {
    const v = votesIndex[s.id];
    if (v && v.noVote) {
      if (subsUsed.count >= MAX_SUBSTITUTIONS) {
        return { id: s.id, role: s.role, substituted: false, noVote: true };
      }
      const repl = bench.find((b) => b.role === s.role && !b.used);
      if (repl) {
        repl.used = true;
        subsUsed.count += 1;
        return { id: repl.id, role: s.role, substituted: true, fromId: s.id };
      }
      return { id: s.id, role: s.role, substituted: false, noVote: true };
    }
    return { id: s.id, role: s.role, substituted: false };
  });

  return effective;
}

// --- API PUBBLICA ---

/**
 * Calcola i punteggi di UNA squadra per una giornata (Classic italiano).
 * @param {object} team { teamId, formation, roster:[{id,isStarter}] }
 * @param {array} events eventi della giornata (già filtrati per round)
 * @param {object} players lista giocatori (da players.json)
 * @param {object} scoring regole bonus/malus (da scoring.json)
 * @param {object} votes mappa voti (da votes.json: {round, votes:[...]})
 * @param {array} [retractions] eventi da sottrarre (Sala VAR)
 */
export function scoreTeam(team, events, players, scoring, votes, retractions = []) {
  const playerIndex = buildPlayerIndex(players);
  const votesIndex = buildVoteIndex(votes.votes);

  const starters = team.roster.filter((r) => r.isStarter);
  validateLineup(starters, playerIndex);

  const effective = resolveLineup(team.roster, votesIndex, playerIndex);
  const effectiveIds = new Set(effective.map((e) => e.id));

  assertReferences(events, playerIndex);
  if (retractions.length) assertReferences(retractions, playerIndex);

  // baseVote per i titolari effettivi
  const playerPoints = {};
  for (const e of effective) {
    const v = votesIndex[e.id];
    if (v && v.noVote) {
      playerPoints[e.id] = 0; // non conteggiato (sv senza sostituto valido)
    } else if (v) {
      playerPoints[e.id] = v.baseVote;
    } else {
      throw new Error(`VOTO_MANCANTE: ${e.id} non in votes.json`);
    }
  }

  const varLog = [];

  function applyEventList(list, sign) {
    const ordered = sortEvents(list);
    for (const e of ordered) {
      if (!effectiveIds.has(e.playerId)) continue; // non in formazione effettiva
      const pts = pointsForEvent(e.type, scoring);
      if (pts === null) continue; // tipo non in scoring V1: ignorato
      const delta = pts * sign;
      playerPoints[e.playerId] = (playerPoints[e.playerId] || 0) + delta;
      varLog.push({
        eventId: e.eventId,
        round: e.round,
        fixtureId: e.fixtureId,
        playerId: e.playerId,
        type: e.type,
        minute: e.minute,
        role: playerIndex[e.playerId].role,
        delta,
        sign,
        source: "replay",
        timestamp: null,
      });
    }
  }

  applyEventList(events, +1);
  if (retractions.length) applyEventList(retractions, -1);

  const total = Object.values(playerPoints).reduce((a, b) => a + b, 0);
  const playerBreakdown = effective.map((e) => ({
    id: e.id,
    points: Math.round(playerPoints[e.id] * 100) / 100,
    substituted: e.substituted,
    noVote: e.noVote || false,
  }));

  return { teamId: team.teamId, playerPoints: playerBreakdown, total: Math.round(total * 100) / 100, varLog };
}

/**
 * Classifica di tutte le squadre (1-vs-tutti, somma punti).
 */
export function scoreLeague(teams, events, players, scoring, votes, retractions = []) {
  const standings = teams.map((t) => {
    const r = scoreTeam(t, events, players, scoring, votes, retractions);
    return { teamId: t.teamId, total: r.total };
  });
  return standings.sort((a, b) => b.total - a.total || (a.teamId < b.teamId ? -1 : 1));
}

/**
 * Ricalcolo con rettifica (Sala VAR): stesso shape, segno -1.
 */
export function recalcWithRetraction(team, events, players, scoring, votes, retractEvent) {
  const retractions = retractEvent ? [retractEvent] : [];
  return scoreTeam(team, events, players, scoring, votes, retractions);
}
