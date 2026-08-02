import { useState, useMemo } from "react";
import { useMatchday, snapshotReplayState } from "../hooks/useMatchday.js";
import { adaptCustomTeam } from "../adapters/customTeamAdapter.js";
import fixturesData from "../data/fixtures.json";
import eventsData from "../data/events.json";
import playersData from "../data/players.json";
import scoringData from "../data/scoring.json";
import votesData from "../data/votes.json";
import teamsData from "../data/teams_sample.json";

const LOCAL_TEAM_KEY = "fanta_walrus_custom_team";

const STATE_LABELS = {
  idle: "Idle",
  running: "In corso",
  paused: "Pausa",
  completed: "Completata",
};

const ROLE_LABELS = { GK: "POR", DEF: "DIF", MID: "CEN", FWD: "ATT" };

function navigateTo(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function FantaMatchday() {
  const [fixtureId, setFixtureId] = useState(fixturesData[0]?.fixtureId || null);

  const fixtureEvents = useMemo(
    () => eventsData.filter((e) => e.fixtureId === fixtureId),
    [fixtureId]
  );

  const customTeam = useMemo(() => {
    let raw = null;
    try {
      const stored = localStorage.getItem(LOCAL_TEAM_KEY);
      if (stored) raw = JSON.parse(stored);
    } catch (e) {
      raw = null;
    }
    return adaptCustomTeam(raw, playersData);
  }, []);

  const teams = useMemo(() => {
    if (!customTeam) return teamsData;
    const rest = teamsData.filter((t) => t.teamId !== customTeam.teamId);
    return [...rest, customTeam];
  }, [customTeam]);

  const md = useMatchday({
    fixtures: fixturesData,
    events: fixtureEvents,
    players: playersData,
    scoring: scoringData,
    votes: votesData,
    teams,
    speedMs: 800,
  });

  const fixture = fixturesData.find((f) => f.fixtureId === fixtureId);

  const playerIndex = useMemo(() => {
    const idx = {};
    for (const p of playersData) idx[p.id] = p;
    return idx;
  }, []);

  const voteIndex = useMemo(() => {
    const idx = {};
    for (const v of votesData.votes) idx[v.playerId] = v;
    return idx;
  }, []);

  const displayTeamId = customTeam ? customTeam.teamId : teamsData[0]?.teamId || null;
  const breakdownTeam = md.byTeam?.[displayTeamId] || null;
  const benchRoster = (breakdownTeam?.roster || []).filter((r) => !r.isStarter);
  const usedBenchIds = new Set(
    (breakdownTeam?.playerPoints || []).filter((p) => p.substituted).map((p) => p.id)
  );

  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>FantaWalrus — Matchday</h1>
      <nav style={{ marginBottom: 8, display: "flex", gap: 16 }}>
        <button
          type="button"
          onClick={() => navigateTo("/fanta/team")}
          style={{ background: "none", border: "none", color: "#8aff8a", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          ← Modifica formazione
        </button>
        <button
          type="button"
          onClick={() => navigateTo("/fanta/var")}
          style={{ background: "none", border: "none", color: "#8aff8a", cursor: "pointer", padding: 0, font: "inherit" }}
        >
          Sala VAR →
        </button>
      </nav>
      <p style={{ opacity: 0.8 }}>UI tecnica: stato giornata, evento corrente e classifica.</p>
      <p style={{ opacity: 0.8 }}>
        Squadra in campo:{" "}
        {customTeam ? (
          <strong style={{ color: "#8aff8a" }}>CUSTOM ({customTeam.teamId})</strong>
        ) : (
          <strong style={{ color: "#ffd27a" }}>MOCK (teams_sample.json)</strong>
        )}
      </p>

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

      {breakdownTeam ? (
        <div style={{ marginBottom: 24 }}>
          <h2>
            Formazione &amp; punteggi — {displayTeamId} ({breakdownTeam.total} pt)
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Ruolo</th>
                <th style={{ textAlign: "left" }}>Giocatore</th>
                <th style={{ textAlign: "left" }}>Stato</th>
                <th style={{ textAlign: "right" }}>Voto base</th>
                <th style={{ textAlign: "right" }}>Bonus/Malus</th>
                <th style={{ textAlign: "right" }}>Fantavoto</th>
              </tr>
            </thead>
            <tbody>
              {breakdownTeam.playerPoints.map((pp) => {
                const p = playerIndex[pp.id];
                const vote = voteIndex[pp.id];
                const baseVote = vote && !vote.noVote ? vote.baseVote : null;
                const bonusMalus = baseVote != null ? Math.round((pp.points - baseVote) * 100) / 100 : null;
                const fromPlayer = pp.fromId ? playerIndex[pp.fromId] : null;
                let stato = "Titolare";
                if (pp.substituted) stato = `Subentra (per ${fromPlayer ? fromPlayer.name : pp.fromId})`;
                else if (pp.noVote) stato = "SV (nessun sostituto valido)";
                return (
                  <tr key={pp.id}>
                    <td>{p ? ROLE_LABELS[p.role] || p.role : "?"}</td>
                    <td>{p ? p.name : pp.id}</td>
                    <td>{stato}</td>
                    <td style={{ textAlign: "right" }}>{baseVote != null ? baseVote.toFixed(1) : "SV"}</td>
                    <td style={{ textAlign: "right" }}>{bonusMalus != null ? bonusMalus.toFixed(2) : "-"}</td>
                    <td style={{ textAlign: "right" }}>{pp.points.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3>Panchina</h3>
          {benchRoster.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Ruolo</th>
                  <th style={{ textAlign: "left" }}>Giocatore</th>
                  <th style={{ textAlign: "left" }}>Stato</th>
                </tr>
              </thead>
              <tbody>
                {benchRoster.map((r) => {
                  const p = playerIndex[r.id];
                  return (
                    <tr key={r.id}>
                      <td>{p ? ROLE_LABELS[p.role] || p.role : "?"}</td>
                      <td>{p ? p.name : r.id}</td>
                      <td>{usedBenchIds.has(r.id) ? "Subentrato" : "Non entrato"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ opacity: 0.7 }}>Nessun giocatore in panchina.</div>
          )}
        </div>
      ) : null}

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
