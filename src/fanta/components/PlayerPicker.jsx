import { useEffect, useMemo, useState } from 'react';
import FantaBadge from './ui/FantaBadge.jsx';
import { filterPlayers, countByRole, ROLE_ORDER } from './playerFilter.js';

/*
 * PlayerPicker — selezione giocatori (fase F2, overlay bottom-sheet fase F6).
 *
 * Estratto da FantaTeamBuilder, dove le due liste (titolari e panchina) erano
 * duplicate inline. Il picker è puro sulla selezione: non conosce il motore,
 * non tocca localStorage, non naviga. Riceve `selectedIds` e chiama `onToggle`;
 * chi lo consuma resta il proprietario dello stato e della persistenza.
 *
 * La disponibilità è delegata a `getUnavailableReason(player)`, così le regole
 * (1 POR, max 5 per reparto, max 3 per club, rosa piena) restano allineate a
 * scoreEngine.js in un punto solo, dal lato del Team Builder.
 *
 * `open`/`onClose`/`initialRoleFilter` sono opzionali (fase F6): quando
 * `open` è passato, il picker si comporta da bottom-sheet (nascosto se
 * `open` è false, filtro di ruolo preimpostato all'apertura). La firma
 * principale (players/selectedIds/onToggle/getUnavailableReason) resta
 * invariata per non rompere gli usi esistenti.
 */

const ROLE_LABELS = { GK: 'POR', DEF: 'DIF', MID: 'CEN', FWD: 'ATT' };

export default function PlayerPicker({
  players,
  selectedIds,
  onToggle,
  getUnavailableReason = () => null,
  index,
  title,
  badge = null,
  hint = null,
  searchPlaceholder = 'Cerca giocatore o club',
  testId = 'player-picker',
  open = true,
  onClose = null,
  initialRoleFilter = null,
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState(initialRoleFilter);

  useEffect(() => {
    if (!open) return;
    // Reset one-time alla (ri)apertura del bottom-sheet, non un loop di render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery('');
    setRoleFilter(initialRoleFilter);
  }, [open, initialRoleFilter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const roleCounts = useMemo(() => countByRole(players), [players]);

  const visible = useMemo(
    () => filterPlayers(players, { query, role: roleFilter }),
    [players, query, roleFilter]
  );

  const availableRoles = ROLE_ORDER.filter((r) => roleCounts[r] > 0);

  if (!open) return null;

  const content = (
    <section className="fw-section" aria-label={title} data-testid={testId}>
      <div className="fw-section-head">
        {index && <FantaBadge variant="index">{index}</FantaBadge>}
        <span className="fw-section-head__label">{title}</span>
        {badge}
        {onClose && (
          <button
            type="button"
            className="fw-sheet__close"
            onClick={onClose}
            aria-label="Chiudi selezione giocatore"
            data-testid={`${testId}-close`}
          >
            ×
          </button>
        )}
      </div>

      {hint && <span className="fw-section__hint">{hint}</span>}

      <div className="fw-input">
        <span className="fw-input__marker" aria-hidden="true" />
        <input
          type="search"
          className="fw-input__field"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Cerca in ${title}`}
          data-testid={`${testId}-search`}
        />
        {query && (
          <button
            type="button"
            className="fw-input__clear"
            onClick={() => setQuery('')}
            aria-label="Cancella ricerca"
            data-testid={`${testId}-search-clear`}
          >
            ×
          </button>
        )}
      </div>

      <div className="fw-chip-row" role="group" aria-label="Filtro per ruolo">
        <button
          type="button"
          className={`fw-chip${roleFilter === null ? ' is-selected' : ''}`}
          onClick={() => setRoleFilter(null)}
          aria-pressed={roleFilter === null}
          data-testid={`${testId}-role-all`}
        >
          TUTTI
          <span className="fw-chip__count">{players.length}</span>
        </button>
        {availableRoles.map((role) => (
          <button
            key={role}
            type="button"
            className={`fw-chip${roleFilter === role ? ' is-selected' : ''}`}
            onClick={() => setRoleFilter(roleFilter === role ? null : role)}
            aria-pressed={roleFilter === role}
            data-testid={`${testId}-role-${role}`}
          >
            {ROLE_LABELS[role] || role}
            <span className="fw-chip__count">{roleCounts[role]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="fw-empty" data-testid={`${testId}-empty`}>
          Nessun giocatore per questa ricerca.
        </p>
      ) : (
        <div className="fw-tile-list" data-testid={`${testId}-list`}>
          {visible.map((p) => {
            const selected = selectedSet.has(p.id);
            const reason = selected ? null : getUnavailableReason(p);
            const disabled = Boolean(reason);
            return (
              <button
                key={p.id}
                type="button"
                className={`fw-tile${selected ? ' is-selected' : ''}`}
                onClick={() => onToggle(p.id)}
                disabled={disabled}
                aria-pressed={selected}
                data-testid={`${testId}-player-${p.id}`}
              >
                <span className="fw-tile__main">
                  <span className="fw-tile__name">{p.name}</span>
                  <span className="fw-tile__meta">
                    {ROLE_LABELS[p.role] || p.role} · {p.club}
                  </span>
                </span>
                <span className="fw-tile__aside">
                  {reason && <FantaBadge variant="neutral">{reason}</FantaBadge>}
                  {selected && <span className="fw-tile__check" aria-hidden="true">✓</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );

  if (!onClose) return content;

  return (
    <div className="fw-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="fw-sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
