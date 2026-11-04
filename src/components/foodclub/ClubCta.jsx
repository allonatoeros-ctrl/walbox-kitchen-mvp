// WALRUS FOOD CLUB V1 — CTA gialla (grammatica .cx-pay del checkout) e piccoli pezzi condivisi delle pagine Club.
import './FoodClub.css';

export function ClubCta({ title, sub = null, onClick, disabled = false, type = 'button', busy = false, ...rest }) {
  return (
    <button type={type} className="cx-pay" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      <span className="cx-pay-text">
        <span className="cx-pay-title">{busy ? 'UN ATTIMO…' : title}</span>
        {sub ? <span className="cx-pay-sub">{sub}</span> : null}
      </span>
      <span className="cx-pay-arrow" aria-hidden="true">→</span>
    </button>
  );
}

// Telefono con l'icona Walbox sulla Home (illustrazione del prototipo, solo token --poster-*).
export function PhoneIllustration({ width = 64 }) {
  const sq = (x, y, hot) => (hot ? (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="17" height="17" rx="4" style={{ fill: 'var(--poster-yellow)' }} />
      <text x={x + 8.5} y={y + 13.5} textAnchor="middle" style={{ font: "400 15px 'League Gothic', sans-serif", fill: 'var(--poster-on-yellow)' }}>W</text>
    </g>
  ) : (
    <rect key={`${x}-${y}`} x={x} y={y} width="17" height="17" rx="4" style={{ fill: 'var(--poster-line)' }} />
  ));
  return (
    <svg viewBox="0 0 84 120" width={width} height={Math.round((width * 120) / 84)} role="img" aria-label="Telefono con l’icona Walbox sulla schermata Home">
      <rect x="3" y="2" width="78" height="116" rx="13" strokeWidth="3" style={{ fill: 'var(--poster-bg)', stroke: 'var(--poster-ink)' }} />
      <rect x="31" y="8" width="22" height="5" rx="2.5" style={{ fill: 'var(--poster-line)' }} />
      {[[12, 26], [34, 26], [56, 26, true], [12, 50], [34, 50], [56, 50], [12, 74], [34, 74], [56, 74]].map(([x, y, h]) => sq(x, y, h))}
      <rect x="12" y="98" width="60" height="14" rx="7" style={{ fill: 'var(--poster-line)' }} />
    </svg>
  );
}

// Toast verde (grammatica .kitch-add-toast). `toast` = { id, text } | null.
export function ClubToast({ toast }) {
  if (!toast) return null;
  return <div key={toast.id} className="fc-toast" role="status" aria-live="polite">{toast.text}</div>;
}
