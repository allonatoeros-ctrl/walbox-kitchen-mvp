// useVarLog.js — MT4 (hook React + funzioni pure). Nessun localStorage/JSON/nuova dip.
// NON mantiene classifica o replay separato: legge solo varLog + retractions passati.
import { useMemo, useCallback } from "react";

// Funzioni pure testabili.
export function buildPlayerTeamMap(teams = []) {
  const map = {};
  for (const t of teams) {
    for (const r of t.roster || []) {
      if (r.id && !map[r.id]) map[r.id] = t.teamId; // prima appartenenza vince
    }
  }
  return map;
}
export function buildRetractionSet(retractions = []) {
  const s = new Set();
  for (const r of retractions) if (r && r.eventId) s.add(r.eventId);
  return s;
}
export function sortVarEntries(entries = []) {
  return [...entries].sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    return a.eventId < b.eventId ? -1 : 1;
  });
}
// Arricchisce le entry con teamId derivato (copia, non muta l'originale).
export function enrichVarEntries(varLog = [], playerTeamMap = {}) {
  return varLog.map((e) => (e.teamId ? e : { ...e, teamId: playerTeamMap[e.playerId] || null }));
}
export function filterVarByPlayer(entries = [], playerId) {
  return entries.filter((e) => e.playerId === playerId);
}

export function useVarLog({ varLog = [], retractions = [], onRetract, teams = [] }) {
  const playerTeamMap = useMemo(() => buildPlayerTeamMap(teams), [teams]);
  const retractedSet = useMemo(() => buildRetractionSet(retractions), [retractions]);
  const entries = useMemo(() => sortVarEntries(enrichVarEntries(varLog, playerTeamMap)), [varLog, playerTeamMap]);
  const getEntriesByTeam = useCallback((teamId) => entries.filter((e) => e.teamId === teamId), [entries]);
  const getEntriesByPlayer = useCallback((playerId) => filterVarByPlayer(entries, playerId), [entries]);
  const isRetracted = useCallback((eventId) => retractedSet.has(eventId), [retractedSet]);
  const retract = useCallback((eventId) => {
    if (!retractedSet.has(eventId)) {
      const next = new Set(retractedSet); next.add(eventId);
      if (typeof onRetract === "function") onRetract(eventId);
      return Array.from(next);
    }
    return Array.from(retractedSet);
  }, [retractedSet, onRetract]);
  return { entries, getEntriesByTeam, getEntriesByPlayer, retract, isRetracted };
}
