import { useState, useMemo } from "react";
import { useMatchday, snapshotReplayState } from "../hooks/useMatchday.js";
import fixturesData from "../data/fixtures.json";
import eventsData from "../data/events.json";
import playersData from "../data/players.json";
import scoringData from "../data/scoring.json";
import votesData from "../data/votes.json";
import teamsData from "../data/teams_sample.json";

const STATE_LABELS = {
  idle: "Idle",
  running: "In corso",
  paused: "Pausa",
  completed: "Completata",
};

export default function FantaMatchday() {
  const [fixtureId, setFixtureId] = useState(fixturesData[0]?.fixtureId || null);

  const fixtureEvents = useMemo(
    () => eventsData.filter((e) => e.fixtureId === fixtureId),
    [fixtureId]
  );

  const md = useMatchday({
    fixtures: fixturesData,
    events: fixtureEvents,
    players: playersData,
    scoring: scoringData,
    votes: votesData,
    teams: teamsData,
    speedMs: 800,
  });

  const fixture = fixturesData.find((f) => f.fixtureId === fixtureId);

  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>FantaWalrus — Matchday</h1>
      <p style={{ opacity: 0.8 }}>UI tecnica: stato giornata, evento corrente e classifica.</p>

      <div style={{ marginBottom: 16 }}>
        <label>
          Fixture{" "}
          <select
            value={fixtureId || ""}
            onChange={(e) => setFixtureId(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            {fixturesData.map((f) => (
              <option key={f.fixtureId} value={f.fixtureId}>
                {f.fixtureId}: {f.home} vs {f.away} ({f.date})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
        <div style={{ border: "1px solid #333", padding: 12 }}>
          <div>Stato</div>
          <div style={{ fontSize: 18 }}>{STATE_LABELS[md.state] || md.state}</div>
        </div>
        <div style={{ border: "1px solid #333", padding: 12 }}>
          <div>Progresso</div>
          <div style={{ fontSize: 18 }}>
            {md.cursor} / {md.total}
          </div>
        </div>
        <div style={{ border: "1px solid #333", padding: 12 }}>
          <div>Fixture</div>
          <div style={{ fontSize: 18 }}>
            {fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div>Evento corrente</div>
        {md.currentEvent ? (
          <pre style={{ background: "#111", padding: 12, overflow: "auto" }}>
{JSON.stringify(md.currentEvent, null, 2)}
          </pre>
        ) : (
          <div>Nessun evento selezionato</div>
        )}
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={md.start} disabled={md.state === "running" || md.state === "completed"}>
          Start
        </button>
        <button onClick={md.pause} disabled={md.state !== "running"}>
          Pause
        </button>
        <button onClick={md.resume} disabled={md.state !== "paused"}>
          Resume
        </button>
        <button onClick={md.reset}>Reset</button>
        <button onClick={() => md.step()} disabled={md.state === "running" || md.state === "completed"}>
          Step
        </button>
      </div>

      <div>
        <h2>Classifica</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>#</th>
              <th style={{ textAlign: "left" }}>Squadra</th>
              <th style={{ textAlign: "right" }}>Punti</th>
            </tr>
          </thead>
          <tbody>
            {(md.standings || []).map((s, i) => (
              <tr key={s.teamId}>
                <td>{i + 1}</td>
                <td>{s.teamId}</td>
                <td style={{ textAlign: "right" }}>{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
