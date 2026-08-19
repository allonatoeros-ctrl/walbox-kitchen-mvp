import { useState, useMemo } from "react";
import { useMatchday, snapshotReplayState } from "../hooks/useMatchday.js";
import { adaptCustomTeam } from "../adapters/customTeamAdapter.js";
import { buildPlayerIndex, isValidLineup } from "../engine/scoreEngine.js";
import fixturesData from "../data/fixtures.json";
import eventsData from "../data/events.json";
import playersData from "../data/players.json";
import scoringData from "../data/scoring.json";
import votesData from "../data/votes.json";
import teamsData from "../data/teams_sample.json";
import { FantaShell, FantaBand, FantaPanel, FantaButton, FantaBadge, FantaNav, CREST_SIZE } from "../components/ui";
import TeamCrest, { CREST_PRESETS } from "../components/TeamCrest";

const LOCAL_TEAM_KEY = "fanta_walrus_custom_team";

const STATE_LABELS = {
  idle: "Idle",
  running: "In corso",
  paused: "Pausa",
  completed: "Completata",
};

const ROLE_LABELS = { GK: "POR", DEF: "DIF", MID: "CEN", FWD: "ATT" };
const ROLE_BADGE_VARIANT = { GK: "info", DEF: "info", MID: "neutral", FWD: "warning" };

const EVENT_TYPE_LABELS = {
  goal: "Gol",
  assist: "Assist",
  yellow_card: "Ammonizione",
  red_card: "Espulsione",
  own_goal: "Autogol",
  penalty_saved: "Rigore parato",
  penalty_missed: "Rigore sbagliato",
  save: "Parata",
  cleansheet_gk: "Porta inviolata (portiere)",
  cleansheet_def: "Porta inviolata (difensore)",
};

export default function FantaMatchday() {
  const [fixtureId, setFixtureId] = useState(fixturesData[0]?.fixtureId || null);

  const fixtureEvents = useMemo(
    () => eventsData.filter((e) => e.fixtureId === fixtureId),
    [fixtureId]
  );

  const rawCustomTeam = useMemo(() => {
    let raw = null;
    try {
      const stored = localStorage.getItem(LOCAL_TEAM_KEY);
      if (stored) raw = JSON.parse(stored);
    } catch (e) {
      raw = null;
    }
    return adaptCustomTeam(raw, playersData);
  }, []);

  // adaptCustomTeam pulisce solo la forma (id noti, campi presenti): un roster con
  // meno di 11 titolari validi passerebbe comunque e farebbe crashare il motore
  // (validateLineup) in fase di render. Qui verifichiamo il modulo prima di usarlo.
  const playerIndexForValidation = useMemo(() => buildPlayerIndex(playersData), []);
  const customTeamValid = useMemo(() => {
    if (!rawCustomTeam) return null;
    const starters = rawCustomTeam.roster.filter((r) => r.isStarter);
    return isValidLineup(starters, playerIndexForValidation).valid;
  }, [rawCustomTeam, playerIndexForValidation]);

  const customTeam = customTeamValid ? rawCustomTeam : null;
  const customTeamIncomplete = !!rawCustomTeam && customTeamValid === false;

  const teams = useMemo(() => {
    if (!customTeam) return teamsData;
    const rest = teamsData.filter((t) => t.teamId !== customTeam.teamId);
    return [...rest, customTeam];
  }, [customTeam]);

  const teamNames = useMemo(() => {
    const map = {};
    for (const t of teams) map[t.teamId] = t.teamName;
    return map;
  }, [teams]);

  const teamCrests = useMemo(() => {
    const map = {};
    for (const t of teams) map[t.teamId] = CREST_PRESETS.find((p) => p.id === t.crestId) || null;
    return map;
  }, [teams]);

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
    <FantaShell width="wide" data-testid="fanta-matchday-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="MATCHDAY"
        status="DEMO"
        context="Replay statico — non e' un live reale"
      />

      <FantaNav current="/fanta/matchday" />

      <p className="fw-empty">
        Squadra in campo:{" "}
        {customTeam ? (
          <strong style={{ color: "var(--fw-success)" }}>CUSTOM ({customTeam.teamId})</strong>
        ) : (
          <strong style={{ color: "var(--fw-gold)" }}>MOCK (teams_sample.json)</strong>
        )}
      </p>
      {customTeamIncomplete && (
        <div className="fw-note fw-note--warning">
          <p className="fw-note__line">
            La tua squadra salvata è incompleta o non valida (modulo non conforme): uso la squadra
            demo finché non la correggi in Team Builder.
          </p>
        </div>
      )}

      <FantaPanel title="GIORNATA" meta="Dati demo statici">
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

        <div className="fw-stat-grid" style={{ marginBottom: 16 }}>
          <div className="fw-stat">
            <span className="fw-stat__label">STATO</span>
            <span className="fw-stat__value">{STATE_LABELS[md.state] || md.state}</span>
          </div>
          <div className="fw-stat">
            <span className="fw-stat__label">PROGRESSO</span>
            <span className="fw-stat__value">{md.cursor} / {md.total}</span>
          </div>
          <div className="fw-stat">
            <span className="fw-stat__label">FIXTURE</span>
            <span className="fw-stat__value">
              {fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <span className="fw-stat__label">EVENTO CORRENTE</span>
          {md.currentEvent ? (
            <div className="fw-note fw-note--info" style={{ marginTop: 6 }}>
              <p className="fw-note__line">
                <strong>{md.currentEvent.minute}&apos;</strong>{" "}
                {EVENT_TYPE_LABELS[md.currentEvent.type] || md.currentEvent.type} —{" "}
                {playerIndex[md.currentEvent.playerId]?.name || md.currentEvent.playerId}
              </p>
            </div>
          ) : (
            <div className="fw-empty">Nessun evento selezionato</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <FantaButton
            variant={md.state === "idle" ? "primary" : "ghost"}
            size="sm"
            onClick={md.start}
            disabled={md.state === "running" || md.state === "completed"}
          >
            Start
          </FantaButton>
          <FantaButton variant="ghost" size="sm" onClick={md.pause} disabled={md.state !== "running"}>
            Pause
          </FantaButton>
          <FantaButton
            variant={md.state === "paused" ? "primary" : "ghost"}
            size="sm"
            onClick={md.resume}
            disabled={md.state !== "paused"}
          >
            Resume
          </FantaButton>
          <FantaButton variant="ghost" size="sm" onClick={md.reset}>
            Reset
          </FantaButton>
          <FantaButton variant="ghost" size="sm" onClick={() => md.step()} disabled={md.state === "running" || md.state === "completed"}>
            Step
          </FantaButton>
        </div>
      </FantaPanel>

      {breakdownTeam ? (
        <FantaPanel title="FORMAZIONE & PUNTEGGI" meta={`${displayTeamId} · ${breakdownTeam.total} pt`}>
          <table className="fw-table" style={{ marginBottom: 16 }}>
            <thead>
              <tr>
                <th>Ruolo</th>
                <th>Giocatore</th>
                <th>Stato</th>
                <th className="fw-table__num">Voto base</th>
                <th className="fw-table__num">Bonus/Malus</th>
                <th className="fw-table__num">Fantavoto</th>
              </tr>
            </thead>
            <tbody>
              {breakdownTeam.playerPoints.map((pp) => {
                const p = playerIndex[pp.id];
                const vote = voteIndex[pp.id];
                const baseVote = vote && !vote.noVote ? vote.baseVote : null;
                const bonusMalus = baseVote != null ? Math.round((pp.points - baseVote) * 100) / 100 : null;
                const fromPlayer = pp.fromId ? playerIndex[pp.fromId] : null;
                const isActive = md.currentEvent?.playerId === pp.id;
                let stato = "Titolare";
                if (pp.substituted) stato = `Subentra (per ${fromPlayer ? fromPlayer.name : pp.fromId})`;
                else if (pp.noVote) stato = "SV (nessun sostituto valido)";
                return (
                  <tr key={pp.id} className={isActive ? "fw-table__row--active" : ""}>
                    <td>
                      {p ? (
                        <FantaBadge variant={ROLE_BADGE_VARIANT[p.role] || "neutral"}>
                          {ROLE_LABELS[p.role] || p.role}
                        </FantaBadge>
                      ) : (
                        "?"
                      )}
                    </td>
                    <td>{p ? p.name : pp.id}</td>
                    <td>{stato}</td>
                    <td className="fw-table__num">{baseVote != null ? baseVote.toFixed(1) : "SV"}</td>
                    <td className="fw-table__num">{bonusMalus != null ? bonusMalus.toFixed(2) : "-"}</td>
                    <td className="fw-table__num">{pp.points.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="fw-stat__label">PANCHINA</h3>
          {benchRoster.length ? (
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Ruolo</th>
                  <th>Giocatore</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {benchRoster.map((r) => {
                  const p = playerIndex[r.id];
                  return (
                    <tr key={r.id}>
                      <td>
                        {p ? (
                          <FantaBadge variant={ROLE_BADGE_VARIANT[p.role] || "neutral"}>
                            {ROLE_LABELS[p.role] || p.role}
                          </FantaBadge>
                        ) : (
                          "?"
                        )}
                      </td>
                      <td>{p ? p.name : r.id}</td>
                      <td>{usedBenchIds.has(r.id) ? "Subentrato" : "Non entrato"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="fw-empty">Nessun giocatore in panchina.</p>
          )}
        </FantaPanel>
      ) : (
        <FantaPanel title="FORMAZIONE & PUNTEGGI" meta={`${displayTeamId} · in attesa`}>
          <p className="fw-empty">Premi Start per calcolare i punteggi della giornata.</p>
        </FantaPanel>
      )}

      <FantaPanel title="CLASSIFICA GIORNATA" meta="Solo questa fixture — vedi Classifica per il totale">
        {(md.standings || []).length ? (
          <table className="fw-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Squadra</th>
                <th className="fw-table__num">Punti</th>
              </tr>
            </thead>
            <tbody>
              {md.standings.map((s, i) => {
                const crest = teamCrests[s.teamId];
                return (
                  <tr key={s.teamId}>
                    <td>{i + 1}</td>
                    <td>
                      <span className="fw-table__team">
                        <TeamCrest
                          shape={crest?.shape}
                          pattern={crest?.pattern}
                          palette={crest?.palette}
                          initial={teamNames[s.teamId] || s.teamId}
                          size={CREST_SIZE.xs}
                          empty={!crest}
                          showLetter={false}
                        />
                        {teamNames[s.teamId] || s.teamId}
                      </span>
                    </td>
                    <td className="fw-table__num">{s.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="fw-empty">Premi Start per calcolare la classifica della giornata.</p>
        )}
      </FantaPanel>
    </FantaShell>
  );
}
