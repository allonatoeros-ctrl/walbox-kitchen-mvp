import { useState, useEffect, useMemo } from 'react';
import TeamCrest from '../components/TeamCrest';
import { isValidLineup, buildPlayerIndex } from '../engine/scoreEngine.js';
import playersData from '../data/players.json';
import PlayerPicker from '../components/PlayerPicker.jsx';
import {
  FantaShell,
  FantaBand,
  FantaButton,
  FantaBadge,
  FantaPanel,
  CREST_SIZE,
} from '../components/ui';

const LOCAL_IDENTITY_KEY = 'fanta_walrus_team_identity';
const LOCAL_TEAM_KEY = 'fanta_walrus_custom_team';
const MAX_BENCH = 4;
const MAX_BENCH_GK = 1;
const MAX_STARTERS = 11;

// Limiti allineati a scoreEngine.js (ROLE_LIMITS / MAX_PER_CLUB). Servono solo
// a disabilitare i tile in anticipo: la verità resta isValidLineup().
const ROLE_LIMITS = { GK: 1, DEF: 5, MID: 5, FWD: 5 };
const MAX_PER_CLUB = 3;
const ROLE_LABELS = { GK: 'POR', DEF: 'DIF', MID: 'CEN', FWD: 'ATT' };

export default function FantaTeamBuilder() {
  const [identity, setIdentity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [benchIds, setBenchIds] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_IDENTITY_KEY);
      // Sync one-time da localStorage al mount, non un loop di render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setIdentity(JSON.parse(raw));
    } catch {
      setIdentity(null);
    } finally {
      setIdentityLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!identityLoaded || identity) return;
    window.history.pushState({}, '', '/fanta/entry');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [identityLoaded, identity]);

  useEffect(() => {
    if (!identity) return;
    try {
      const raw = localStorage.getItem(LOCAL_TEAM_KEY);
      if (!raw) return;
      const team = JSON.parse(raw);
      if (team.teamId !== identity.teamId) return;
      const roster = Array.isArray(team.roster) ? team.roster : [];
      const validIds = new Set(playersData.map((p) => p.id));
      const starters = roster.filter((r) => r && typeof r.id === 'string' && validIds.has(r.id) && r.isStarter);
      if (starters.length === 0) return;
      const playerIndex = buildPlayerIndex(playersData);
      const validation = isValidLineup(starters, playerIndex);
      if (!validation.valid) return;
      const starterIdSet = new Set(starters.map((r) => r.id));
      const bench = roster
        .filter((r) => r && typeof r.id === 'string' && validIds.has(r.id) && r.isStarter === false && !starterIdSet.has(r.id))
        .slice(0, MAX_BENCH)
        .map((r) => r.id);
      // Sync one-time da localStorage quando l'identità è pronta, non un loop di render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(starters.map((r) => r.id));
      setBenchIds(bench);
    } catch {
      // ignore malformed storage
    }
  }, [identity, playersData]);

  const playerIndex = useMemo(() => buildPlayerIndex(playersData), [playersData]);
  const playersById = useMemo(() => {
    const map = {};
    for (const p of playersData) map[p.id] = p;
    return map;
  }, [playersData]);

  const validation = useMemo(() => {
    if (!identity) return { valid: false, errors: ['Identità mancante'] };
    const starters = selectedIds.map((id) => ({ id }));
    return isValidLineup(starters, playerIndex);
  }, [selectedIds, playerIndex, identity]);

  const benchValidation = useMemo(() => {
    const gkCount = benchIds.filter((id) => playersById[id]?.role === 'GK').length;
    const errors = [];
    if (benchIds.length > MAX_BENCH) errors.push(`Troppe riserve: ${benchIds.length} > ${MAX_BENCH}`);
    if (gkCount > MAX_BENCH_GK) errors.push(`Troppi portieri in panchina: ${gkCount} > ${MAX_BENCH_GK}`);
    return { valid: errors.length === 0, complete: errors.length === 0 && gkCount >= 1, gkCount, errors };
  }, [benchIds, playersById]);

  const counts = useMemo(() => {
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const clubs = {};
    for (const id of selectedIds) {
      const p = playersById[id];
      if (!p) continue;
      c[p.role] = (c[p.role] || 0) + 1;
      clubs[p.club] = (clubs[p.club] || 0) + 1;
    }
    return { role: c, clubs };
  }, [selectedIds, playersById]);

  function togglePlayer(id) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_STARTERS) return prev;
      return [...prev, id];
    });
    setBenchIds((prev) => prev.filter((x) => x !== id));
    setSaved(false);
  }

  function toggleBench(id) {
    setBenchIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_BENCH) return prev;
      const isGk = playersById[id]?.role === 'GK';
      if (isGk && prev.some((x) => playersById[x]?.role === 'GK')) return prev;
      return [...prev, id];
    });
    setSaved(false);
  }

  function handleSave() {
    if (!identity || !validation.valid) return;
    const team = {
      teamId: identity.teamId,
      formation: '4-3-3',
      roster: [
        ...selectedIds.map((id) => ({ id, isStarter: true })),
        ...benchIds.map((id) => ({ id, isStarter: false })),
      ],
      updatedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(team));
    } catch {
      // ignore storage errors
    }
    setSaved(true);
    window.history.pushState({}, '', '/fanta/home');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  // La panchina si sceglie fra i non titolari (invariato rispetto a prima
  // dell'estrazione: era il .filter() inline della seconda lista).
  const benchCandidates = useMemo(
    () => playersData.filter((p) => !selectedIds.includes(p.id)),
    [selectedIds]
  );

  // Regole di indisponibilità allineate a scoreEngine.js. Vivono qui, non nel
  // picker: il picker resta ignaro del regolamento.
  function starterUnavailableReason(p) {
    if ((counts.clubs[p.club] || 0) >= MAX_PER_CLUB) return `MAX ${MAX_PER_CLUB} ${p.club}`;
    if (counts.role[p.role] >= ROLE_LIMITS[p.role]) return `${ROLE_LABELS[p.role]} AL LIMITE`;
    if (selectedIds.length >= MAX_STARTERS) return 'ROSA PIENA';
    return null;
  }

  function benchUnavailableReason(p) {
    if (benchIds.length >= MAX_BENCH) return 'PANCHINA PIENA';
    if (p.role === 'GK' && benchValidation.gkCount >= MAX_BENCH_GK) return 'GIÀ 1 POR';
    return null;
  }

  function goToMatchday() {
    window.history.pushState({}, '', '/fanta/matchday');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  if (!identityLoaded || !identity) {
    return null;
  }

  const accentStyle = identity.teamColor?.value
    ? { '--fanta-club-accent': identity.teamColor.value }
    : undefined;

  return (
    <FantaShell width="narrow" style={accentStyle} data-testid="fanta-team-page">
      <FantaBand
        title="FANTAWALRUS"
        subtitle="LA TUA SQUADRA"
        status="TEAM BUILDER"
        context={validation.valid ? 'FORMAZIONE VALIDA' : `${selectedIds.length}/${MAX_STARTERS} TITOLARI`}
        live={validation.valid}
      />

      <section className="fw-section" aria-label="Identità squadra">
        <FantaPanel
          title="IDENTITÀ"
          meta={identity.teamId}
          data-testid="fanta-team-identity"
        >
          <div className="fw-identity">
            <TeamCrest
              shape={identity.crest?.preset?.shape}
              pattern={identity.crest?.preset?.pattern}
              palette={identity.crest?.preset?.palette}
              initial={identity.teamName || 'T'}
              size={CREST_SIZE.lg}
              empty={!identity.crest}
              medallion
              goldBorder
            />
            <div className="fw-identity__text">
              <span className="fw-stat__label">CLUB</span>
              <span className="fw-identity__name" data-testid="fanta-team-name">
                {(identity.teamName || '').toUpperCase()}
              </span>
              {identity.managerNickname && (
                <span className="fw-identity__manager">{identity.managerNickname.toUpperCase()}</span>
              )}
            </div>
          </div>
        </FantaPanel>
      </section>

      <section className="fw-section" aria-label="Conteggio rosa">
        <div className="fw-stat-grid" data-testid="fanta-team-counts">
          {['GK', 'DEF', 'MID', 'FWD'].map((role) => {
            const n = counts.role[role];
            const limit = ROLE_LIMITS[role];
            const full = n >= limit;
            return (
              <div className="fw-stat" key={role}>
                <span className="fw-stat__label">{ROLE_LABELS[role]}</span>
                <span className={`fw-stat__value${full ? ' fw-stat__value--done' : ''}`}>
                  {n}/{limit}
                </span>
              </div>
            );
          })}
          <div className="fw-stat">
            <span className="fw-stat__label">TOTALE</span>
            <span
              className={`fw-stat__value${validation.valid ? ' fw-stat__value--done' : ''}`}
              data-testid="fanta-team-total"
            >
              {selectedIds.length}/{MAX_STARTERS}
            </span>
          </div>
        </div>
      </section>

      <PlayerPicker
        index="01"
        title="TITOLARI"
        badge={<FantaBadge variant="required">RICHIESTO</FantaBadge>}
        hint={`1 POR · max 5 DIF/CEN/ATT · max ${MAX_PER_CLUB} per club`}
        players={playersData}
        selectedIds={selectedIds}
        onToggle={togglePlayer}
        getUnavailableReason={starterUnavailableReason}
        testId="fanta-team-starters"
      />

      <PlayerPicker
        index="02"
        title="PANCHINA"
        badge={<FantaBadge variant="optional">MAX {MAX_BENCH}</FantaBadge>}
        hint={`non titolari · max ${MAX_BENCH_GK} POR · ${benchIds.length}/${MAX_BENCH} scelti`}
        players={benchCandidates}
        selectedIds={benchIds}
        onToggle={toggleBench}
        getUnavailableReason={benchUnavailableReason}
        testId="fanta-team-bench"
      />

      <div
        className={`fw-note${validation.valid ? ' fw-note--success' : ' fw-note--error'}`}
        data-testid="fanta-team-validation"
      >
        <p className="fw-note__line">
          <strong>Panchina</strong>
          {benchValidation.complete ? 'completa.' : 'incompleta: manca il portiere di riserva.'}
        </p>
        {benchValidation.errors.map((e, i) => (
          <p className="fw-note__line fw-note__line--error" key={`bench-err-${i}`}>{e}</p>
        ))}
        {!validation.valid &&
          validation.errors.map((e, i) => (
            <p className="fw-note__line fw-note__line--error" key={`lineup-err-${i}`}>{e}</p>
          ))}
        {validation.valid && (
          <p className="fw-note__line fw-note__line--success">Formazione valida.</p>
        )}
      </div>

      <footer className="fw-footer">
        <FantaButton
          variant="primary"
          block
          disabled={!validation.valid}
          onClick={handleSave}
          data-testid="fanta-team-save-cta"
        >
          Salva formazione
        </FantaButton>
        {saved && (
          <FantaButton
            variant="ghost"
            block
            onClick={goToMatchday}
            data-testid="fanta-team-matchday-cta"
          >
            Vai alla giornata →
          </FantaButton>
        )}
        <span className="fw-footer__sub" data-testid="fanta-team-cta-sub">
          {saved
            ? 'Formazione salvata su questo telefono'
            : validation.valid
              ? 'Pronta da salvare'
              : 'Completa gli 11 titolari per salvare'}
        </span>
      </footer>
    </FantaShell>
  );
}
