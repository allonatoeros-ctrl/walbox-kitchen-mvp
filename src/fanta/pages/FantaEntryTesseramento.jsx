import { useState, useMemo } from 'react';
import TeamCrest, { CREST_PRESETS, TEAM_COLORS } from '../components/TeamCrest';
import './FantaEntryTesseramento.css';

const FANTA_NAME = 'FANTAWALRUS';
const TEAM_NAME_MAX = 24;
const NICKNAME_MAX = 18;
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
  const [managerNickname, setManagerNickname] = useState('');
  const [selectedCrestId, setSelectedCrestId] = useState(null);
  const [selectedColorId, setSelectedColorId] = useState(null);

  const trimmedName = teamName.trim();
  const trimmedNick = managerNickname.trim();
  const isEmpty = trimmedName.length === 0;
  const selectedPreset = useMemo(
    () => CREST_PRESETS.find((p) => p.id === selectedCrestId) || null,
    [selectedCrestId]
  );
  const selectedColor = useMemo(
    () => TEAM_COLORS.find((c) => c.id === selectedColorId) || null,
    [selectedColorId]
  );
  // Contratto di validazione preservato: nome squadra + stemma sono i required.
  // Nickname allenatore e colore sociale sono opzionali (potenziano la tessera).
  const ctaDisabled = isEmpty || selectedCrestId === null;

  function handleNameChange(e) {
    setTeamName(e.target.value.slice(0, TEAM_NAME_MAX));
  }

  function handleNicknameChange(e) {
    setManagerNickname(e.target.value.slice(0, NICKNAME_MAX));
  }

  function handleTessera() {
    if (ctaDisabled) return;
    const createdAt = new Date().toISOString();
    const teamId = 'team_' + simpleHash(trimmedName + selectedCrestId + createdAt);
    // Contratto localStorage preservato: teamId, teamName, crest{id,preset}, createdAt.
    // Campi opzionali additivi non rompono i lettori esistenti (FantaTeamBuilder ecc.).
    const identity = {
      teamId,
      teamName: trimmedName,
      crest: { id: selectedCrestId, preset: selectedPreset },
      createdAt,
    };
    if (trimmedNick.length > 0) identity.managerNickname = trimmedNick;
    if (selectedColor) identity.teamColor = { id: selectedColor.id, value: selectedColor.value, label: selectedColor.label };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // ignore storage errors
    }
    window.history.pushState({}, '', '/fanta/team');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  const accentStyle = selectedColor
    ? { '--fanta-club-accent': selectedColor.value }
    : undefined;

  const cardName = isEmpty ? 'IL TUO CLUB' : trimmedName.toUpperCase();
  const cardManager = trimmedNick ? trimmedNick.toUpperCase() : 'ALLENATORE';
  const cardTerritory = selectedPreset?.territory || 'LEGA WALRUS';
  const cardMotto = selectedPreset?.motto || 'Onore. Curva. Campo.';

  return (
    <div className="fanta-entry" style={accentStyle} data-testid="fanta-entry-page">
      <header className="fanta-entry__band" data-testid="fanta-entry-band">
        <div className="fanta-entry__band-left">
          <svg className="fanta-entry__band-crest" width="34" height="42" viewBox="0 0 35 42" role="img" aria-label="Sigillo Lega del Walrus Pub">
            <defs>
              <linearGradient id="fantaBandCrestGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#161a24" />
                <stop offset="1" stopColor="#0a0d15" />
              </linearGradient>
            </defs>
            <path d="M3 6 Q17.5 -2 32 6 L32 22 Q32 38 17.5 41 Q3 38 3 22 Z" fill="url(#fantaBandCrestGradient)" stroke="#E9C46A" strokeWidth="1.5" />
            <circle cx="17.5" cy="19" r="6.5" fill="none" stroke="#E9C46A" strokeWidth="1.2" />
            <text x="17.5" y="23.6" textAnchor="middle" fontFamily="Anton, var(--font-display, sans-serif)" fontWeight="400" fontSize="12" fill="#E9C46A">W</text>
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

      <section className="fanta-entry__hero" aria-label="Introduzione tesseramento">
        <span className="fanta-entry__hero-eyebrow">STAGIONE 2026 · TESSERAMENTO UFFICIALE</span>
        <h1 className="fanta-entry__hero-title">
          FONDA<br/>
          <span className="fanta-entry__hero-accent">IL TUO CLUB.</span>
        </h1>
        <p className="fanta-entry__hero-sub">
          Nome, stemma, colori sociali. Quattro passi per iscriverti alla lega più aperta del quartiere.
        </p>
      </section>

      <section className="fanta-entry__card-wrap" aria-label="Anteprima tessera">
        <div className="fanta-entry__card" data-testid="fanta-entry-card-preview">
          <div className="fanta-entry__card-head">
            <span className="fanta-entry__card-head-title">TESSERA SOCIO</span>
            <span className="fanta-entry__card-num">N. 001</span>
          </div>
          <span className="fanta-entry__card-seal" aria-hidden="true" />

          <div className="fanta-entry__card-crest" data-testid="fanta-entry-card-crest">
            <TeamCrest
              shape={selectedPreset?.shape}
              pattern={selectedPreset?.pattern}
              palette={selectedPreset?.palette}
              initial={trimmedName}
              size={148}
              empty={isEmpty || selectedPreset === null}
              medallion
              goldBorder
            />
          </div>

          {!isEmpty && selectedPreset && <span className="fanta-entry__card-stamp" data-testid="fanta-entry-card-stamp">TESSERATO</span>}

          <div className="fanta-entry__card-foot">
            <span className="fanta-entry__card-label">CLUB</span>
            <span className="fanta-entry__card-name" data-testid="fanta-entry-card-name">
              {cardName}
            </span>
            <span className="fanta-entry__card-motto">{`\u00AB${cardMotto}\u00BB`}</span>
          </div>

          <div className="fanta-entry__card-meta">
            <div className="fanta-entry__card-meta-cell">
              <span className="fanta-entry__card-meta-label">ALLENATORE</span>
              <span className="fanta-entry__card-meta-val" data-testid="fanta-entry-card-manager">{cardManager}</span>
            </div>
            <div className="fanta-entry__card-meta-cell">
              <span className="fanta-entry__card-meta-label">TERRITORIO</span>
              <span className="fanta-entry__card-meta-val">{cardTerritory.toUpperCase()}</span>
            </div>
          </div>

          <span className="fanta-entry__card-divider" aria-hidden="true" />
          <span className="fanta-entry__card-season">STAGIONE 2026 · SERIE W</span>

          <div className="fanta-entry__card-ribbon" aria-hidden="true">
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--green" />
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--white" />
            <span className="fanta-entry__card-ribbon-stripe fanta-entry__card-ribbon-stripe--red" />
          </div>
        </div>
      </section>

      <section className="fanta-entry__field" aria-label="Nome squadra">
        <div className="fanta-entry__field-head">
          <span className="fanta-entry__field-idx">01</span>
          <span className="fanta-entry__field-label">NOME DEL CLUB</span>
          <span className="fanta-entry__field-required">RICHIESTO</span>
        </div>
        <div className="fanta-entry__input">
          <span className="fanta-entry__input-marker" aria-hidden="true" />
          <input
            type="text"
            className="fanta-entry__input-field"
            placeholder="ES. ARDITI ADRIATICI"
            value={teamName}
            onChange={handleNameChange}
            maxLength={TEAM_NAME_MAX}
            aria-label="Nome squadra"
            data-testid="fanta-entry-team-name-input"
          />
          {!isEmpty && <span className="fanta-entry__input-cursor" aria-hidden="true" />}
          <span className="fanta-entry__input-counter" data-testid="fanta-entry-team-name-counter">
            {teamName.length}/{TEAM_NAME_MAX}
          </span>
        </div>
      </section>

      <section className="fanta-entry__field" aria-label="Nickname allenatore">
        <div className="fanta-entry__field-head">
          <span className="fanta-entry__field-idx">02</span>
          <span className="fanta-entry__field-label">NICKNAME DELL&apos;ALLENATORE</span>
          <span className="fanta-entry__field-optional">FACOLTATIVO</span>
        </div>
        <div className="fanta-entry__input fanta-entry__input--soft">
          <span className="fanta-entry__input-marker" aria-hidden="true" />
          <input
            type="text"
            className="fanta-entry__input-field"
            placeholder="ES. IL MISTER"
            value={managerNickname}
            onChange={handleNicknameChange}
            maxLength={NICKNAME_MAX}
            aria-label="Nickname allenatore"
            data-testid="fanta-entry-manager-nickname-input"
          />
          <span className="fanta-entry__input-counter" data-testid="fanta-entry-manager-nickname-counter">
            {managerNickname.length}/{NICKNAME_MAX}
          </span>
        </div>
      </section>

      <section className="fanta-entry__selector" aria-label="Selezione stemma">
        <div className="fanta-entry__field-head">
          <span className="fanta-entry__field-idx">03</span>
          <span className="fanta-entry__field-label">SCEGLI LO STEMMA</span>
          <span className="fanta-entry__field-required">RICHIESTO</span>
        </div>
        {CREST_PRESETS.length > 0 ? (
          <div className="fanta-entry__selector-grid" data-testid="fanta-entry-crest-grid">
            {CREST_PRESETS.map((preset) => {
              const isSelected = selectedCrestId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`fanta-entry__crest-card${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedCrestId(preset.id)}
                  aria-pressed={isSelected}
                  aria-label={`Seleziona stemma ${preset.name}`}
                  data-testid={`fanta-entry-crest-${preset.id}`}
                >
                  <span className="fanta-entry__crest-card-crest">
                    <TeamCrest
                      shape={preset.shape}
                      pattern={preset.pattern}
                      palette={preset.palette}
                      initial={preset.monogram}
                      size={62}
                      selected={isSelected}
                      medallion={false}
                      showLetter
                    />
                  </span>
                  <span className="fanta-entry__crest-card-name">{preset.name}</span>
                  <span className="fanta-entry__crest-card-territory">{preset.territory}</span>
                  {isSelected && <span className="fanta-entry__crest-card-check" aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="fanta-entry__selector-empty">Stemmi non disponibili al momento.</p>
        )}
      </section>

      <section className="fanta-entry__selector" aria-label="Selezione colori sociali">
        <div className="fanta-entry__field-head">
          <span className="fanta-entry__field-idx">04</span>
          <span className="fanta-entry__field-label">COLORI SOCIALI</span>
          <span className="fanta-entry__field-optional">FACOLTATIVO</span>
        </div>
        <div className="fanta-entry__color-row" data-testid="fanta-entry-color-row">
          {TEAM_COLORS.map((color) => {
            const isSelected = selectedColorId === color.id;
            return (
              <button
                key={color.id}
                type="button"
                className={`fanta-entry__color-chip${isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelectedColorId(isSelected ? null : color.id)}
                aria-pressed={isSelected}
                aria-label={`Colore sociale ${color.label}`}
                data-testid={`fanta-entry-color-${color.id}`}
                style={{ '--chip-color': color.value }}
              >
                <span className="fanta-entry__color-chip-dot" aria-hidden="true" />
                <span className="fanta-entry__color-chip-label">{color.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="fanta-entry__rules" aria-label="Regolamento sintetico">
        <p><strong>15 giocatori.</strong> 1 capitano.</p>
        <p><strong>Formazione</strong> entro il fischio d&apos;inizio.</p>
        <p><strong>Ogni punto</strong> è spiegabile in Sala VAR.</p>
        <p><strong>La squadra</strong> resta su questo telefono.</p>
      </section>

      <div className="fanta-entry__meta">
        <span className="fanta-entry__meta-link">REGOLAMENTO COMPLETO</span>
        <span className="fanta-entry__meta-countdown">CHIUSURA TRA 02:14:38 · GIO 21:45</span>
      </div>

      <footer className="fanta-entry__cta">
        <button
          type="button"
          className="fanta-entry__cta-button"
          disabled={ctaDisabled}
          onClick={handleTessera}
          data-testid="fanta-entry-tessera-cta"
        >
          <span className="fanta-entry__cta-icon" aria-hidden="true">
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
              <path d="M2 3 Q9 -1 16 3 L16 12 Q16 19 9 21 Q2 19 2 12 Z" fill="none" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M6 11 L8 13 L12 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="fanta-entry__cta-label">FONDA IL CLUB</span>
        </button>
        <span className="fanta-entry__cta-sub" data-testid="fanta-entry-cta-sub">
          {ctaDisabled ? 'Inserisci nome e scegli lo stemma per continuare' : 'Nessun account · Nessuna app · Solo campo'}
        </span>
      </footer>
    </div>
  );
}
