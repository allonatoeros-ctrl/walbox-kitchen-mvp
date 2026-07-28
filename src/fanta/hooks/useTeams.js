// useTeams.js — MT4 (hook React + funzione pura). Nessun localStorage/JSON/nuova dip.
import { useMemo } from "react";
import { scoreTeam, scoreLeague } from "../engine/scoreEngine.js";

// Funzione pura: deriva standings + mappa team da scoreLeague/scoreTeam.
export function deriveTeamsState({ teams, players, events, votes, scoring, retractions = [] }) {
  const standings = scoreLeague(teams, events, players, scoring, votes, retractions);
  const byTeam = {};
  for (const t of teams) {
    const r = scoreTeam(t, events, players, scoring, votes, retractions);
    byTeam[t.teamId] = { teamId: t.teamId, total: r.total, playerPoints: r.playerPoints, roster: t.roster };
  }
  return { standings, byTeam };
}

export function useTeams({ teams, players, events, votes, scoring, retractions = [] }) {
  const { standings, byTeam } = useMemo(
    () => deriveTeamsState({ teams, players, events, votes, scoring, retractions }),
    [teams, players, events, votes, scoring, retractions]
  );
  const getTeam = (id) => byTeam[id] || null;
  const getRoster = (id) => byTeam[id]?.roster || null;
  const getTeamScore = (id) => (byTeam[id] ? byTeam[id].total : null);
  return { standings, getTeam, getRoster, getTeamScore };
}
