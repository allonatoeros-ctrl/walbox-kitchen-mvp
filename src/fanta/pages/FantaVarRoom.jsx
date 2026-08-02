import { useState, useMemo } from "react";
import { useTeams } from "../hooks/useTeams.js";
import { useVarLog } from "../hooks/useVarLog.js";
import teamsData from "../data/teams_sample.json";
import playersData from "../data/players.json";
import eventsData from "../data/events.json";
import votesData from "../data/votes.json";
import scoringData from "../data/scoring.json";
import varLogData from "../data/varLog_sample.json";

const EVENT_LABELS = {
  goal: "Gol",
  assist: "Assist",
  yellow_card: "Ammonizione",
  red_card: "Espulsione",
  penalty_scored: "Rigore segnato",
  penalty_missed: "Rigore sbagliato",
  penalty_saved: "Rigore parato",
  own_goal: "Autogol",
  goal_conceded: "Gol subito",
  cleansheet_gk: "Porta inviolata",
};

function buildPlayerNameMap(players) {
  const map = {};
  for (const p of players) map[p.id] = p.name;
  return map;
}

function buildTeamNameMap(teams) {
  const map = {};
  for (const t of teams) map[t.teamId] = t.teamName;
  return map;
}

function StandingsTable({ title, standings, teamNames }) {
  return (
    <div style={{ flex: 1, minWidth: 260 }}>
      <h3>{title}</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>#</th>
            <th style={{ textAlign: "left" }}>Squadra</th>
            <th style={{ textAlign: "right" }}>Punti</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.teamId}>
              <td>{i + 1}</td>
              <td>{teamNames[s.teamId] || s.teamId}</td>
              <td style={{ textAlign: "right" }}>{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function FantaVarRoom() {
  const [retractedIds, setRetractedIds] = useState([]);

  const playerNames = useMemo(() => buildPlayerNameMap(playersData), []);
  const teamNames = useMemo(() => buildTeamNameMap(teamsData), []);

  const retractionEvents = useMemo(
    () => varLogData.filter((e) => retractedIds.includes(e.eventId)),
    [retractedIds]
  );

  const before = useTeams({
    teams: teamsData,
    players: playersData,
    events: eventsData,
    votes: votesData,
    scoring: scoringData,
    retractions: [],
  });

  const after = useTeams({
    teams: teamsData,
    players: playersData,
    events: eventsData,
    votes: votesData,
    scoring: scoringData,
    retractions: retractionEvents,
  });

  const varLog = useVarLog({
    varLog: varLogData,
    retractions: retractionEvents,
    teams: teamsData,
  });

  function handleRitira(eventId) {
    if (varLog.isRetracted(eventId)) return;
    const nextIds = varLog.retract(eventId);
    setRetractedIds(nextIds);
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>FantaWalrus — Sala VAR</h1>
      <nav style={{ marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => navigateTo("/fanta/matchday")}
          style={{ background: "none", border: "none", color: "#0d6efd", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}
        >
          ← Torna al Matchday
        </button>
      </nav>
      <p style={{ background: "#fff3cd", padding: "8px 12px", border: "1px solid #ffe08a" }}>
        Demo locale — rettifiche non persistenti
      </p>

      <h2>Log eventi in revisione</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Minuto</th>
            <th style={{ textAlign: "left" }}>Squadra</th>
            <th style={{ textAlign: "left" }}>Giocatore</th>
            <th style={{ textAlign: "left" }}>Evento</th>
            <th style={{ textAlign: "left" }}>Azione</th>
          </tr>
        </thead>
        <tbody>
          {varLog.entries.map((e) => {
            const retracted = varLog.isRetracted(e.eventId);
            return (
              <tr key={e.eventId} style={retracted ? { opacity: 0.5 } : undefined}>
                <td>{e.minute}'</td>
                <td>{teamNames[e.teamId] || e.teamId || "—"}</td>
                <td>{playerNames[e.playerId] || e.playerId}</td>
                <td>{EVENT_LABELS[e.type] || e.type}</td>
                <td>
                  <button onClick={() => handleRitira(e.eventId)} disabled={retracted}>
                    {retracted ? "Ritirato" : "Ritira"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Classifica: prima e dopo la ritrattazione</h2>
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
        <StandingsTable title="Prima" standings={before.standings} teamNames={teamNames} />
        <StandingsTable title="Dopo" standings={after.standings} teamNames={teamNames} />
      </div>
    </div>
  );
}
