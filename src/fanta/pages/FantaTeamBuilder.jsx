import { useState, useEffect, useMemo } from 'react';
import TeamCrest, { CREST_PRESETS } from '../components/TeamCrest';
import { isValidLineup, buildPlayerIndex } from '../engine/scoreEngine.js';
import playersData from '../data/players.json';
import './FantaEntryTesseramento.css';

const LOCAL_IDENTITY_KEY = 'fanta_walrus_team_identity';
const LOCAL_TEAM_KEY = 'fanta_walrus_custom_team';
const MAX_BENCH = 4;

export default function FantaTeamBuilder() {
  const [identity, setIdentity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [benchIds, setBenchIds] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_IDENTITY_KEY);
      if (raw) setIdentity(JSON.parse(raw));
    } catch (e) {
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
      setSelectedIds(starters.map((r) => r.id));
      setBenchIds(bench);
    } catch (e) {
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
      if (prev.length >= 11) return prev;
      return [...prev, id];
    });
    setBenchIds((prev) => prev.filter((x) => x !== id));
    setSaved(false);
  }

  function toggleBench(id) {
    setBenchIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_BENCH) return prev;
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
    } catch (e) {
      // ignore storage errors
    }
    setSaved(true);
  }

  if (!identityLoaded || !identity) {
    return null;
  }

  return (
    <div className="fanta-entry">
      <header className="fanta-entry__band">
        <div className="fanta-entry__band-left">
          <div className="fanta-entry__band-titles">
            <span className="fanta-entry__band-title">FANTAWALRUS</span>
            <span className="fanta-entry__band-sub">LA TUA SQUADRA</span>
          </div>
        </div>
        <div className="fanta-entry__band-right">
          <span className="fanta-entry__band-matchday">TEAM BUILDER</span>
        </div>
      </header>

      <section className="fanta-entry__card-wrap">
        <div className="fanta-entry__card">
          <div className="fanta-entry__card-head">
            <span>IDENTITÀ</span>
            <span className="fanta-entry__card-num">{identity.teamId}</span>
          </div>
          <div className="fanta-entry__card-crest">
            <TeamCrest
              shape={identity.crest?.preset?.shape}
              pattern={identity.crest?.preset?.pattern}
              palette={identity.crest?.preset?.palette}
              initial={identity.teamName || 'T'}
              size={125}
              empty={!identity.crest}
              medallion
              goldBorder
            />
          </div>
          <div className="fanta-entry__card-foot">
            <span className="fanta-entry__card-label">NOME</span>
            <span className="fanta-entry__card-name">{(identity.teamName || '').toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section className="fanta-entry__selector">
        <div className="fanta-entry__selector-header">
          <span className="fanta-entry__selector-label">SELEZIONA 11 TITOLARI</span>
          <span className="fanta-entry__selector-hint">
            1 GK · max 5 DEF/MID/FWD · max 3 per club
          </span>
        </div>
        <div className="fanta-entry__selector-track">
          {playersData.map((p) => {
            const selected = selectedIds.includes(p.id);
            const disabled = !selected && selectedIds.length >= 11;
            return (
              <button
                key={p.id}
                type="button"
                className={`fanta-entry__selector-cell${selected ? ' fanta-entry__selector-cell--selected' : ''}`}
                onClick={() => togglePlayer(p.id)}
                disabled={disabled}
                aria-pressed={selected}
              >
                <div>{p.name}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {p.role} · {p.club}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="fanta-entry__selector">
        <div className="fanta-entry__selector-header">
          <span className="fanta-entry__selector-label">SELEZIONA PANCHINA (max {MAX_BENCH})</span>
          <span className="fanta-entry__selector-hint">
            solo giocatori di movimento, non titolari
          </span>
        </div>
        <div className="fanta-entry__selector-track">
          {playersData
            .filter((p) => p.role !== 'GK' && !selectedIds.includes(p.id))
            .map((p) => {
              const selected = benchIds.includes(p.id);
              const disabled = !selected && benchIds.length >= MAX_BENCH;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`fanta-entry__selector-cell${selected ? ' fanta-entry__selector-cell--selected' : ''}`}
                  onClick={() => toggleBench(p.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                >
                  <div>{p.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {p.role} · {p.club}
                  </div>
                </button>
              );
            })}
        </div>
      </section>

      <section className="fanta-entry__rules">
        <div>
          Conteggio: GK {counts.role.GK}/1 · DEF {counts.role.DEF}/5 · MID {counts.role.MID}/5 · FWD {counts.role.FWD}/5 · Totale {selectedIds.length}/11
        </div>
        <div>
          Panchina: {benchIds.length}/{MAX_BENCH}
        </div>
        {!validation.valid && (
          <div style={{ color: '#ff6b6b' }}>
            {validation.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {validation.valid && (
          <div style={{ color: '#8aff8a' }}>Formazione valida</div>
        )}
      </section>

      <footer className="fanta-entry__cta">
        <button
          type="button"
          className="fanta-entry__cta-button"
          disabled={!validation.valid}
          onClick={handleSave}
        >
          SALVA FORMAZIONE
        </button>
        {saved && <span className="fanta-entry__cta-sub">Formazione salvata localmente</span>}
      </footer>
    </div>
  );
}
