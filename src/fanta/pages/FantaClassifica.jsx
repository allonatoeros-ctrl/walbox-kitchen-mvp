import { useMemo } from "react";
import { useTeams } from "../hooks/useTeams.js";
import { adaptCustomTeam } from "../adapters/customTeamAdapter.js";
import { buildPlayerIndex, isValidLineup } from "../engine/scoreEngine.js";
import teamsData from "../data/teams_sample.json";
import playersData from "../data/players.json";
import eventsData from "../data/events.json";
import votesData from "../data/votes.json";
import scoringData from "../data/scoring.json";
import { FantaShell, FantaBand, FantaPanel, FantaNav } from "../components/ui";

const LOCAL_TEAM_KEY = "fanta_walrus_custom_team";

/*
 * FantaClassifica — Sprint 1: pagina standalone /fanta/classifica.
 *
 * Nessuna nuova fonte dati: riusa useTeams (stesso motore/standings usati
 * come "Prima" in FantaVarRoom) sui dataset statici demo, con la stessa
 * sostituzione della squadra custom dell'utente già fatta in FantaMatchday.
 */
function buildTeamNameMap(teams) {
  const map = {};
  for (const t of teams) map[t.teamId] = t.teamName;
  return map;
}

export default function FantaClassifica() {
  const rawCustomTeam = useMemo(() => {
    let raw = null;
    try {
      const stored = localStorage.getItem(LOCAL_TEAM_KEY);
      if (stored) raw = JSON.parse(stored);
    } catch {
      raw = null;
    }
    return adaptCustomTeam(raw, playersData);
  }, []);

  const playerIndexForValidation = useMemo(() => buildPlayerIndex(playersData), []);
  const customTeamValid = useMemo(() => {
    if (!rawCustomTeam) return null;
    const starters = rawCustomTeam.roster.filter((r) => r.isStarter);
    return isValidLineup(starters, playerIndexForValidation).valid;
  }, [rawCustomTeam, playerIndexForValidation]);

  const customTeam = customTeamValid ? rawCustomTeam : null;

  const teams = useMemo(() => {
    if (!customTeam) return teamsData;
    const rest = teamsData.filter((t) => t.teamId !== customTeam.teamId);
    return [...rest, customTeam];
  }, [customTeam]);

  const teamNames = useMemo(() => buildTeamNameMap(teams), [teams]);

  const { standings } = useTeams({
    teams,
    players: playersData,
    events: eventsData,
    votes: votesData,
    scoring: scoringData,
  });

  return (
    <FantaShell width="wide" data-testid="fanta-classifica-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="CLASSIFICA"
        status="DEMO"
        context="Dati statici — stagione demo"
      />

      <FantaNav current="/fanta/classifica" />

      <FantaPanel title="CLASSIFICA GENERALE" meta={`${standings.length} squadre`}>
        <table className="fw-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                <td>
                  {teamNames[s.teamId] || s.teamId}
                  {customTeam && s.teamId === customTeam.teamId && " (tu)"}
                </td>
                <td style={{ textAlign: "right" }}>{s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FantaPanel>
    </FantaShell>
  );
}
