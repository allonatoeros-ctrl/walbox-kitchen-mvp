import { useEffect, useMemo, useState } from 'react';
import { buildHomeState } from '../adapters/homeTeamAdapter.js';
import playersData from '../data/players.json';
import TeamCrest from '../components/TeamCrest';
import {
  FantaShell,
  FantaBand,
  FantaButton,
  FantaBadge,
  FantaPanel,
  CREST_SIZE,
} from '../components/ui';

/*
 * FantaHome — F3 Home squadra (brief Hermes).
 *
 * Vista di sola lettura: legge identità+squadra da localStorage, le passa a
 * buildHomeState() (unica fonte di verità sullo stato Home) e mostra crest,
 * conteggi ruolo, titolari e panchina. Nessuna logica propria su cosa sia
 * "valido/incompleto": quel giudizio vive solo nell'adapter.
 */

const LOCAL_IDENTITY_KEY = 'fanta_walrus_team_identity';
const LOCAL_TEAM_KEY = 'fanta_walrus_custom_team';
const ROLE_LABELS = { GK: 'POR', DEF: 'DIF', MID: 'CEN', FWD: 'ATT' };
const ROLE_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function IdentityPanel({ identity }) {
  return (
    <section className="fw-section" aria-label="Identità squadra">
      <FantaPanel title="IDENTITÀ" meta={identity?.teamId} data-testid="fanta-home-identity">
        <div className="fw-identity">
          <TeamCrest
            shape={identity?.crest?.preset?.shape}
            pattern={identity?.crest?.preset?.pattern}
            palette={identity?.crest?.preset?.palette}
            initial={identity?.teamName || 'T'}
            size={CREST_SIZE.lg}
            empty={!identity?.crest}
            medallion
            goldBorder
          />
          <div className="fw-identity__text">
            <span className="fw-stat__label">CLUB</span>
            <span className="fw-identity__name" data-testid="fanta-home-team-name">
              {(identity?.teamName || '').toUpperCase()}
            </span>
            {identity?.nickname && (
              <span className="fw-identity__manager">{identity.nickname.toUpperCase()}</span>
            )}
          </div>
        </div>
      </FantaPanel>
    </section>
  );
}

function RosterTileList({ players, testId, emptyLabel }) {
  if (players.length === 0) {
    return (
      <p className="fw-empty" data-testid={`${testId}-empty`}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <div className="fw-tile-list" data-testid={testId}>
      {players.map((p) => (
        <div className="fw-tile" key={p.id} data-testid={`${testId}-${p.id}`}>
          <span className="fw-tile__main">
            <span className="fw-tile__name">{p.name}</span>
            <span className="fw-tile__meta">
              {ROLE_LABELS[p.role] || p.role} · {p.club}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

import { loadRosterV1 } from '../../lib/fantaRosterPersistence.js';

export default function FantaHome() {
  const [loaded, setLoaded] = useState(false);
  const [identityRaw, setIdentityRaw] = useState(null);
  const [teamRaw, setTeamRaw] = useState(null);
  const [cloudError, setCloudError] = useState(null);

  useEffect(() => {
    setIdentityRaw(readJSON(LOCAL_IDENTITY_KEY));
    setTeamRaw(readJSON(LOCAL_TEAM_KEY));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !identityRaw?.teamId || teamRaw) return;
    let cancelled = false;
    setCloudError(null);
    loadRosterV1(identityRaw.teamId)
      .then(({ ok, roster, error }) => {
        if (cancelled) return;
        if (!ok || !roster.length) {
          setCloudError(error || 'Roster cloud non disponibile');
          return;
        }
        const team = {
          teamId: identityRaw.teamId,
          formation: '4-3-3',
          roster,
          updatedAt: new Date().toISOString(),
        };
        setTeamRaw(team);
      })
      .catch(() => {
        if (!cancelled) setCloudError('Roster cloud non disponibile');
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, identityRaw?.teamId, teamRaw]);

  const state = useMemo(
    () => buildHomeState(identityRaw, teamRaw, playersData),
    [identityRaw, teamRaw]
  );

  useEffect(() => {
    if (loaded && state.status === 'missing_identity') {
      navigateTo('/fanta/entry');
    }
  }, [loaded, state.status]);

  if (!loaded || state.status === 'missing_identity') {
    return null;
  }

  const { identity } = state;
  const accentStyle = identity?.teamColor?.value
    ? { '--fanta-club-accent': identity.teamColor.value }
    : undefined;

  if (state.status === 'incomplete') {
    return (
      <FantaShell width="narrow" style={accentStyle} data-testid="fanta-home-page">
        <FantaBand
          title="FANTAWALRUS"
          subtitle="HOME SQUADRA"
          status="INCOMPLETA"
          context={`${state.starters.length}/11 TITOLARI`}
        />

        <IdentityPanel identity={identity} />

        <div className="fw-note fw-note--warning" data-testid="fanta-home-incomplete-note">
          <p className="fw-note__line">
            <strong>Formazione incompleta.</strong> {cloudError ? cloudError : 'Completa gli 11 titolari nel Team Builder per vedere qui la tua squadra.'}
          </p>
        </div>

        <footer className="fw-footer">
          <FantaButton
            variant="primary"
            block
            onClick={() => navigateTo('/fanta/team')}
            data-testid="fanta-home-team-builder-cta"
          >
            Vai al Team Builder
          </FantaButton>
        </footer>
      </FantaShell>
    );
  }

  return (
    <FantaShell width="narrow" style={accentStyle} data-testid="fanta-home-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="HOME SQUADRA"
        status="FORMAZIONE VALIDA"
        context={state.formation}
        live
      />

      <IdentityPanel identity={identity} />

      <section className="fw-section" aria-label="Conteggio rosa">
        <div className="fw-stat-grid" data-testid="fanta-home-counts">
          {ROLE_ORDER.map((role) => (
            <div className="fw-stat" key={role}>
              <span className="fw-stat__label">{ROLE_LABELS[role]}</span>
              <span className="fw-stat__value fw-stat__value--done">{state.counts[role]}</span>
            </div>
          ))}
          <div className="fw-stat">
            <span className="fw-stat__label">TOTALE</span>
            <span className="fw-stat__value fw-stat__value--done" data-testid="fanta-home-total">
              {state.totalPlayers}
            </span>
          </div>
        </div>
      </section>

      <section className="fw-section" aria-label="Titolari">
        <div className="fw-section-head">
          <FantaBadge variant="index">01</FantaBadge>
          <span className="fw-section-head__label">TITOLARI</span>
        </div>
        <RosterTileList
          players={state.starters}
          testId="fanta-home-starters"
          emptyLabel="Nessun titolare."
        />
      </section>

      <section className="fw-section" aria-label="Panchina">
        <div className="fw-section-head">
          <FantaBadge variant="index">02</FantaBadge>
          <span className="fw-section-head__label">PANCHINA</span>
        </div>
        <RosterTileList
          players={state.bench}
          testId="fanta-home-bench"
          emptyLabel="Nessuna riserva."
        />
      </section>

      <footer className="fw-footer">
        <FantaButton
          variant="primary"
          block
          onClick={() => navigateTo('/fanta/matchday')}
          data-testid="fanta-home-matchday-cta"
        >
          Vai alla giornata →
        </FantaButton>
        <FantaButton
          variant="ghost"
          block
          onClick={() => navigateTo('/fanta/team')}
          data-testid="fanta-home-edit-cta"
        >
          Modifica formazione
        </FantaButton>
      </footer>
    </FantaShell>
  );
}
