/*
 * PlayerSlot — pedina del campo verticale (redesign Team Builder, fase F2).
 *
 * Componente puro: nessuna logica di validazione, nessuna dipendenza dal
 * motore di calcolo o dallo storage. Riceve solo dati pronti e un handler onClick.
 *
 * state:
 *   empty  → cerchio dashed oro, "+" centrato
 *   filled → pedina navy, iniziali oro, badge ruolo in overlay
 *   gk     → variante oro pieno + glow, iniziali su fondo chiaro
 */
const ROLE_LABEL = {
  GK: 'POR',
  DEF: 'DIF',
  MID: 'CEN',
  FWD: 'ATT',
};

export default function PlayerSlot({
  role,
  state = 'empty',
  initials = '',
  name = '',
  clubTag = '',
  onClick,
  size = 'normal',
  className = '',
  testId = null,
}) {
  const classes = [
    'fw-slot',
    `fw-slot--${state}`,
    size === 'bench' ? 'fw-slot--bench' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const roleLabel = ROLE_LABEL[role] || role || '';
  const showLabel = size !== 'bench' && state !== 'empty' && (name || clubTag);

  return (
    <div className={classes}>
      <button
        type="button"
        className="fw-slot__circle"
        onClick={onClick}
        aria-label={state === 'empty' ? `Aggiungi ${roleLabel || 'giocatore'}` : name || initials}
        data-testid={testId || undefined}
        data-state={state}
      >
        {state === 'empty' ? (
          <span className="fw-slot__plus" aria-hidden="true">+</span>
        ) : (
          <>
            <span className="fw-slot__initials">{initials}</span>
            {roleLabel && <span className="fw-slot__badge">{roleLabel}</span>}
          </>
        )}
      </button>
      {showLabel && (
        <span className="fw-slot__label">
          {name && <span className="fw-slot__name">{name}</span>}
          {clubTag && <span className="fw-slot__club">{clubTag}</span>}
        </span>
      )}
    </div>
  );
}
