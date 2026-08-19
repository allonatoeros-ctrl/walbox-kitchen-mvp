/*
 * FantaNav — navigazione persistente minima (Sprint 1).
 *
 * Riusa il pattern chip esistente (fw-chip-row/fw-chip, vedi PlayerPicker)
 * invece di introdurre un nuovo stile: stessa interazione, stato attivo
 * marcato con is-selected.
 */
const LINKS = [
  { path: '/fanta/home', label: 'HOME' },
  { path: '/fanta/team', label: 'TEAM' },
  { path: '/fanta/matchday', label: 'MATCHDAY' },
  { path: '/fanta/classifica', label: 'CLASSIFICA' },
  { path: '/fanta/var', label: 'VAR' },
];

function navigateTo(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export default function FantaNav({ current, className = '' }) {
  const classes = ['fw-chip-row', 'fw-nav', className].filter(Boolean).join(' ');
  return (
    <nav className={classes} role="navigation" aria-label="Navigazione FantaWalrus" data-testid="fanta-nav">
      {LINKS.map((link) => (
        <button
          key={link.path}
          type="button"
          className={`fw-chip${current === link.path ? ' is-selected' : ''}`}
          onClick={() => navigateTo(link.path)}
          aria-current={current === link.path ? 'page' : undefined}
          data-testid={`fanta-nav-${link.label.toLowerCase()}`}
        >
          {link.label}
        </button>
      ))}
    </nav>
  );
}
