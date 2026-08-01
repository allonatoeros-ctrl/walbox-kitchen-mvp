import { useState, useMemo } from 'react';
import TeamCrest, { CREST_PRESETS } from '../components/TeamCrest';
import './FantaEntryTesseramento.css';

const FANTA_NAME = 'FANTAWALRUS';
const TEAM_NAME_MAX = 24;
const LOCAL_STORAGE_KEY = 'fanta_walrus_team_identity';

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

export default function FantaEntryTesseramento() {
  const [teamName, setTeamName] = useState('');
  const [selectedCrestId, setSelectedCrestId] = useState(null);

  const trimmedName = teamName.trim();
  const isEmpty = trimmedName.length === 0;
  const selectedPreset = useMemo(
    () => CREST_PRESETS.find((p) => p.id === selectedCrestId) || null,
    [selectedCrestId]
  );
  const ctaDisabled = isEmpty || selectedCrestId === null;

  function handleNameChange(e) {
    setTeamName(e.target.value.slice(0, TEAM_NAME_MAX));
  }

  function handleTessera() {
    if (ctaDisabled) return;
    const createdAt = new Date().toISOString();
    const teamId = 'team_' + simpleHash(trimmedName + selectedCrestId + createdAt);
    const identity = {
      teamId,
      teamName: trimmedName,
      crest: { id: selectedCrestId, preset: selectedPreset },
      createdAt,
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(identity));
    } catch (e) {
      // ignore storage errors
    }
    window.history.pushState({}, '', '/fanta/team');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <div className="fanta-entry">
      <header className="fanta-entry__band">
        <div className="fanta-entry__band-left">
          <svg className="fanta-entry__band-crest" width="35" height="42" viewBox="0 0 35 42" role="img" aria-label="Sigillo Lega del Walrus Pub">
            <defs>
              <linearGradient id="fantaBandCrestGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#161a24" />
                <stop offset="1" stopColor="#0a0d15" />
              </linearGradient>
            </defs>
            <path d="M3 6 Q17.5 -2 32 6 L32 22 Q32 38 17.5 41 Q3 38 3 22 Z" fill="url(#fantaBandCrestGradient)" stroke="#F2C14E" strokeWidth="1.5" />
            <circle cx="17.5" cy="19" r="6.5" fill="none" stroke="#F2C14E" strokeWidth="1.2" />
            <text x="17.5" y="24" textAnchor="middle" fontFamily="Anton, var(--font-display, sans-serif)" fontWeight="400" fontSize="12" fill="#F2C14E">W</text>
          </svg>
          <div className="fanta-entry__band-titles">
            <span className="fanta-entry__band-title">{FANTA_NAME}</span>
            <span className="fanta-entry__band-sub">LEGA DEL WALRUS PUB</span>
          </div>
        </div>
        <div className="fanta-entry__band-right">
          <span className="fanta-entry__band-status">
            <span className="fanta-entry__band-led" aria-hidden="true" />
            LEGA APERTA
          </span>
          <span className="fanta-entry__band-matchday">GIORNATA 1</span>
        </div>
      </header>

      <section className="fanta-entry__card-wrap">
        <div className="fanta-entry__card">
          <div className="fanta-entry__card-head">
            <span>TESSERAMENTO</span>
            <span className="fanta-entry__card-num">N. 001</span>
          </div>
          <span className="fanta-entry__card-seal" aria-hidden="true" />

          <div className="fanta-entry__card-crest">
            <TeamCrest
              shape={selectedPreset?.shape}
              pattern={selectedPreset?.pattern}
              palette={selectedPreset?.palette}
              initial={trimmedName}
              size={125}
              empty={isEmpty || selectedPreset === null}
              medallion
              goldBorder
            />
          </div>

          {!isEmpty && <span className="fanta-entry__card-stamp">TESSERATO</span>}

          <div className="fanta-entry__card-foot">
            <span className="fanta-entry__card-label">LA TUA SQUADRA</span>
            <span className="fanta-entry__card-name">
              {isEmpty ? 'LA TUA SQUADRA' : trimmedName.toUpperCase()}
            </span>
          </div>

          <span className="fanta-entry__card-divider" aria-hidden="true" />
          <span className="fanta-entry__card-season">STAGIONE 2026</span>

          <div className="fanta-entry__card-ribbon" aria-hidden="true">
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--green" />
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--white" />
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--red" />
          </div>
        </div>
      </section>

      <section className="fanta-entry__input">
        <span className="fanta-entry__input-marker" aria-hidden="true" />
        <input
          type="text"
          className="fanta-entry__input-field"
          placeholder="NOME SQUADRA"
          value={teamName}
          onChange={handleNameChange}
          maxLength={TEAM_NAME_MAX}
          aria-label="Nome squadra"
        />
        {!isEmpty && <span className="fanta-entry__input-cursor" aria-hidden="true" />}
        <span className="fanta-entry__input-counter">
          {teamName.length}/{TEAM_NAME_MAX}
        </span>
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--input-tr-h" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--input-tr-v" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--input-br-h" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--input-br-v" aria-hidden="true" />
        <span className="fanta-entry__deco-line fanta-entry__deco-line--input" aria-hidden="true" />
      </section>

      <section className="fanta-entry__selector">
        <div className="fanta-entry__selector-header">
          <span className="fanta-entry__selector-label">SCEGLI LO STEMMA</span>
          <span className="fanta-entry__selector-hint">TAP = APPLICA</span>
        </div>
        {CREST_PRESETS.length > 0 ? (
          <div className="fanta-entry__selector-track">
            {CREST_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="fanta-entry__selector-cell"
                onClick={() => setSelectedCrestId(preset.id)}
                aria-pressed={selectedCrestId === preset.id}
                aria-label={`Seleziona stemma ${preset.id}`}
              >
                <TeamCrest
                  shape={preset.shape}
                  pattern={preset.pattern}
                  palette={preset.palette}
                  size={50}
                  selected={selectedCrestId === preset.id}
                  showLetter={false}
                />
              </button>
            ))}
          </div>
        ) : (
          <p className="fanta-entry__selector-empty">Stemmi non disponibili al momento.</p>
        )}
      </section>

      <section className="fanta-entry__rules">
        <p>15 giocatori. 1 capitano.</p>
        <p>Formazione entro il fischio d&apos;inizio.</p>
        <p>Ogni punto è spiegabile in Sala VAR.</p>
        <p>La squadra resta su questo telefono.</p>
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--rules-tr-h" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--rules-tr-v" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--rules-br-h" aria-hidden="true" />
        <span className="fanta-entry__deco-tick fanta-entry__deco-tick--rules-br-v" aria-hidden="true" />
        <span className="fanta-entry__deco-line fanta-entry__deco-line--rules" aria-hidden="true" />
      </section>

      <div className="fanta-entry__meta">
        <span className="fanta-entry__meta-link">REGOLAMENTO COMPLETO</span>
        <span className="fanta-entry__meta-countdown">CHIUSURA TRA 02:14:38 · GIO 21:45</span>
      </div>

      <footer className="fanta-entry__cta">
        <button type="button" className="fanta-entry__cta-button" disabled={ctaDisabled} onClick={handleTessera}>
          TESSERA LA SQUADRA
        </button>
        <span className="fanta-entry__cta-sub">Nessun account richiesto · nessuna app</span>
      </footer>
    </div>
  );
}
