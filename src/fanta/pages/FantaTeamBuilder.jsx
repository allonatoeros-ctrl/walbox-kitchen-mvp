import { useState, useEffect, useMemo } from 'react';
import TeamCrest from '../components/TeamCrest';
import { isValidLineup, buildPlayerIndex } from '../engine/scoreEngine.js';
import playersData from '../data/players.json';
import PlayerPicker from '../components/PlayerPicker.jsx';
import TeamHeader from '../components/team-builder/TeamHeader.jsx';
import FantasyPitch from '../components/team-builder/FantasyPitch.jsx';
import BenchRow from '../components/team-builder/BenchRow.jsx';
import {
  FantaShell,
  FantaBand,
  FantaButton,
  FantaBadge,
  FantaPanel,
  FantaNav,
  CREST_SIZE,
} from '../components/ui';
import { saveRosterV1 } from '../../lib/fantaRosterPersistence.js';
import { loadRosterV1 } from '../../lib/fantaRosterPersistence.js';

const LOCAL_IDENTITY_KEY = 'fanta_walrus_team_identity';
const LOCAL_TEAM_KEY = 'fanta_walrus_custom_team';
const LOCAL_ROSTER_SYNC_KEY = 'fanta_walrus_roster_sync';
const MAX_BENCH = 4;
const MAX_BENCH_GK = 1;
const MAX_STARTERS = 11;

// MAX_PER_CLUB allineato a scoreEngine.js. Serve solo a disabilitare i tile
// in anticipo: la verità resta isValidLineup().
const MAX_PER_CLUB = 3;
const ROLE_LABELS = { GK: 'POR', DEF: 'DIF', MID: 'CEN', FWD: 'ATT' };

// Modulo di default V1: fisso, nessuna UI di cambio modulo (fuori scope).
const PITCH_FORMATION = { GK: 1, DEF: 4, MID: 3, FWD: 3 };

export default function FantaTeamBuilder() {
  const [identity, setIdentity] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [benchIds, setBenchIds] = useState([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [rosterSynced, setRosterSynced] = useState(false);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [cloudError, setCloudError] = useState(null);

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

  useEffect(() => {
    if (!identityLoaded || !identity) return;
    let cancelled = false;
    setCloudHydrated(false);
    setCloudError(null);
    loadRosterV1(identity.teamId)
      .then(({ ok, roster, error }) => {
        if (cancelled || !Array.isArray(roster)) return;
        if (!ok) {
          setCloudError(error || 'Roster cloud non disponibile');
          return;
        }
        // ok:true con roster:[] e' uno stato valido (squadra nuova, nessun
        // salvataggio cloud ancora fatto): non e' un errore, non deve
        // mostrare cloudError.
        if (roster.length > 0) {
          const validIds = new Set(playersData.map((p) => p.id));
          const starters = roster.filter((r) => validIds.has(r.id) && r.isStarter).map((r) => r.id);
          const bench = roster.filter((r) => validIds.has(r.id) && !r.isStarter).slice(0, MAX_BENCH).map((r) => r.id);
          setSelectedIds(starters);
          setBenchIds(bench);
        }
        setCloudHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setCloudError('Roster cloud non disponibile');
      });
    return () => {
      cancelled = true;
    };
  }, [identityLoaded, identity, playersData]);

  const playerIndex = useMemo(() => buildPlayerIndex(playersData), [playersData]);
  const playersById = useMemo(() => {
    const map = {};
    for (const p of playersData) map[p.id] = p;
    return map;
  }, [playersData]);

  // Dati arricchiti (initials/clubTag) solo per la resa visiva del campo/panchina
  // (PlayerSlot). Puramente derivati, non toccano players.json né la logica di selezione.
  const pitchPlayersById = useMemo(() => {
    const map = {};
    for (const p of playersData) {
      const surname = (p.name || '').trim().split(/\s+/).pop() || '';
      map[p.id] = { ...p, initials: surname.slice(0, 3).toUpperCase(), clubTag: p.club };
    }
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

  // Titolari raggruppati per ruolo, per FantasyPitch (righe GK/DEF/MID/FWD).
  const pitchSelectedIds = useMemo(() => {
    const grouped = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const id of selectedIds) {
      const p = playersById[id];
      if (p) grouped[p.role].push(id);
    }
    return grouped;
  }, [selectedIds, playersById]);

  // V1: modulo fisso 4-3-3, nessuno slot extra oltre il modulo. Il motore
  // (scoreEngine.js / ROLE_LIMITS) resta più permissivo e invariato: qui si
  // limita solo cosa il Team Builder mostra/permette di riempire di default.
  const pitchFormation = PITCH_FORMATION;

  // Modulo fisso V1: il badge mostra sempre il target (es. "4-3-3"), non il
  // riempimento corrente — coerente con lo slot fisso del campo (PITCH_FORMATION).
  const formationLabel = `${PITCH_FORMATION.DEF}-${PITCH_FORMATION.MID}-${PITCH_FORMATION.FWD}`;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('starter');
  const [pickerRole, setPickerRole] = useState(null);

  function openStarterPicker(role) {
    setPickerMode('starter');
    setPickerRole(role);
    setPickerOpen(true);
  }

  function openBenchPicker() {
    setPickerMode('bench');
    setPickerRole(null);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
  }

  // Il picker si apre solo da uno slot vuoto (campo o panchina): ogni tap al
  // suo interno è quindi sempre una selezione che riempie quello slot, mai
  // una rimozione da uno slot già pieno (quella avviene con tap diretto sulla
  // pedina). Si può chiudere subito dopo, per rendere esplicito il ritorno
  // al campo ("selezione valida → picker chiuso → slot aggiornato").
  function pickStarter(id) {
    togglePlayer(id);
    closePicker();
  }

  function pickBench(id) {
    toggleBench(id);
    closePicker();
  }

  function handlePitchSlotClick(role, _index, playerId) {
    if (playerId) {
      togglePlayer(playerId);
      return;
    }
    openStarterPicker(role);
  }

  function handleBenchSlotClick(_index, playerId) {
    if (playerId) {
      toggleBench(playerId);
      return;
    }
    openBenchPicker();
  }

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

  async function handleSave() {
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

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    setRosterSynced(false);

    try {
      localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(team));
    } catch {
      // ignore storage errors
    }

    const roster = [
      ...selectedIds.map((id) => ({ id, isStarter: true })),
      ...benchIds.map((id) => ({ id, isStarter: false })),
    ];

    try {
      const { ok, error } = await saveRosterV1(identity.teamId, roster);

      if (ok) {
        setSaved(true);
        setRosterSynced(true);
        try {
          localStorage.setItem(LOCAL_ROSTER_SYNC_KEY, JSON.stringify({ teamId: identity.teamId, syncedAt: new Date().toISOString() }));
        } catch {
          // ignore
        }
        window.history.pushState({}, '', '/fanta/home');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else {
        setSaveError(error || 'Non è stato possibile salvare la formazione sul cloud. Puoi comunque continuare.');
        setSaved(true);
      }
    } catch {
      // Salvataggio cloud fallito in modo imprevisto (es. rete offline):
      // la formazione resta comunque salvata in locale, l'utente può riprovare.
      setSaveError('Salvataggio cloud non riuscito. La formazione è salvata in locale: riprova quando la connessione torna disponibile.');
      setSaved(true);
    } finally {
      setSaving(false);
    }
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
    if (counts.role[p.role] >= PITCH_FORMATION[p.role]) return `${ROLE_LABELS[p.role]} AL LIMITE`;
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

      <FantaNav current="/fanta/team" />

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
            const limit = PITCH_FORMATION[role];
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

      <section className="fw-section" aria-label="Titolari" data-testid="fanta-team-starters">
        <TeamHeader
          teamName={identity.teamName ? identity.teamName.toUpperCase() : 'LA MIA SQUADRA'}
          formation={formationLabel}
          status={validation.valid ? 'FORMAZIONE VALIDA' : 'IN COSTRUZIONE'}
        />
        <FantasyPitch
          playersById={pitchPlayersById}
          selectedIds={pitchSelectedIds}
          formation={pitchFormation}
          onSlotClick={handlePitchSlotClick}
        />
      </section>

      <section className="fw-section" aria-label="Panchina" data-testid="fanta-team-bench">
        <div className="fw-section-head">
          <FantaBadge variant="index">02</FantaBadge>
          <span className="fw-section-head__label">PANCHINA</span>
          <FantaBadge variant="optional">MAX {MAX_BENCH}</FantaBadge>
        </div>
        <span className="fw-section__hint">
          non titolari · max {MAX_BENCH_GK} POR · {benchIds.length}/{MAX_BENCH} scelti
        </span>
        <BenchRow
          playersById={pitchPlayersById}
          benchIds={benchIds}
          maxBench={MAX_BENCH}
          onSlotClick={handleBenchSlotClick}
        />
      </section>

      {pickerMode === 'starter' ? (
        <PlayerPicker
          index="01"
          title="TITOLARI"
          badge={<FantaBadge variant="required">RICHIESTO</FantaBadge>}
          hint={`1 POR · ${PITCH_FORMATION.DEF} DIF · ${PITCH_FORMATION.MID} CEN · ${PITCH_FORMATION.FWD} ATT · max ${MAX_PER_CLUB} per club`}
          players={playersData}
          selectedIds={selectedIds}
          onToggle={pickStarter}
          getUnavailableReason={starterUnavailableReason}
          testId="fanta-team-starters-picker"
          open={pickerOpen}
          onClose={closePicker}
          initialRoleFilter={pickerRole}
        />
      ) : (
        <PlayerPicker
          index="02"
          title="PANCHINA"
          badge={<FantaBadge variant="optional">MAX {MAX_BENCH}</FantaBadge>}
          hint={`non titolari · max ${MAX_BENCH_GK} POR · ${benchIds.length}/${MAX_BENCH} scelti`}
          players={benchCandidates}
          selectedIds={benchIds}
          onToggle={pickBench}
          getUnavailableReason={benchUnavailableReason}
          testId="fanta-team-bench-picker"
          open={pickerOpen}
          onClose={closePicker}
          initialRoleFilter={pickerRole}
        />
      )}

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
          disabled={!validation.valid || saving}
          onClick={handleSave}
          data-testid="fanta-team-save-cta"
        >
          {saving ? 'SALVATAGGIO IN CORSO…' : 'SALVA LA FORMAZIONE'}
        </FantaButton>
        {saved && !saveError && (
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
          {saveError
            ? saveError
            : cloudHydrated
              ? 'Formazione caricata dal cloud'
              : cloudError
                ? cloudError
                : rosterSynced
                  ? 'Formazione salvata su cloud e telefono'
                  : saved
                    ? 'Formazione salvata su questo telefono'
                    : validation.valid
                      ? 'Pronta da salvare'
                      : 'Completa gli 11 titolari per salvare'}
        </span>
      </footer>
    </FantaShell>
  );
}
