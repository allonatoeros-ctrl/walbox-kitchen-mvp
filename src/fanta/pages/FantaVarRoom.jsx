import { useState, useMemo } from "react";
import { useTeams } from "../hooks/useTeams.js";
import { useVarLog } from "../hooks/useVarLog.js";
import teamsData from "../data/teams_sample.json";
import playersData from "../data/players.json";
import eventsData from "../data/events.json";
import votesData from "../data/votes.json";
import scoringData from "../data/scoring.json";
import varLogData from "../data/varLog_sample.json";
import { FantaShell, FantaBand, FantaPanel, FantaNav } from "../components/ui";

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
      <h3 className="fw-stat__label">{title}</h3>
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
    <FantaShell width="wide" data-testid="fanta-var-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="SALA VAR"
        status="DEMO"
        context="Rettifiche non persistenti"
      />

      <FantaNav current="/fanta/var" />

      <div className="fw-note fw-note--warning">
        <p className="fw-note__line">Demo locale — le rettifiche si perdono al refresh.</p>
      </div>

      <FantaPanel title="LOG EVENTI IN REVISIONE" meta={`${varLog.entries.length} eventi`}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
      </FantaPanel>

      <FantaPanel title="CLASSIFICA: PRIMA E DOPO LA RITRATTAZIONE">
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <StandingsTable title="Prima" standings={before.standings} teamNames={teamNames} />
          <StandingsTable title="Dopo" standings={after.standings} teamNames={teamNames} />
        </div>
      </FantaPanel>
    </FantaShell>
  );
}
