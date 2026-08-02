/*
 * FantaBand — header di modulo (pattern P2).
 *
 * Struttura fissa su tutte le schermate FantaWalrus; cambiano solo i testi:
 *   sinistra → sigillo + titolo + sottotitolo
 *   destra   → stato (LED + label) + contesto
 */

/* Sigillo della Lega. Estratto dall'SVG inline del Tesseramento
   (FantaEntryTesseramento.jsx:85-95) per non duplicarlo a ogni schermata. */
export function LeagueSeal({ size = 34 }) {
  const height = Math.round(size * (42 / 35));
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 35 42"
      role="img"
      aria-label="Sigillo Lega del Walrus Pub"
    >
      <defs>
        <linearGradient id="fwLeagueSealGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#161a24" />
          <stop offset="1" stopColor="#0a0d15" />
        </linearGradient>
      </defs>
      <path
        d="M3 6 Q17.5 -2 32 6 L32 22 Q32 38 17.5 41 Q3 38 3 22 Z"
        fill="url(#fwLeagueSealGradient)"
        stroke="#E9C46A"
        strokeWidth="1.5"
      />
      <circle cx="17.5" cy="19" r="6.5" fill="none" stroke="#E9C46A" strokeWidth="1.2" />
      <text
        x="17.5"
        y="23.6"
        textAnchor="middle"
        fontFamily="Anton, var(--fw-font-display, sans-serif)"
        fontWeight="400"
        fontSize="12"
        fill="#E9C46A"
      >
        W
      </text>
    </svg>
  );
}

export default function FantaBand({
  title,
  subtitle,
  status,
  live = false,
  context,
  seal = true,
  className = '',
  ...rest
}) {
  const classes = ['fw-band', className].filter(Boolean).join(' ');
  return (
    <header className={classes} {...rest}>
      <div className="fw-band__left">
        {seal && (
          <span className="fw-band__crest">
            <LeagueSeal />
          </span>
        )}
        <div className="fw-band__titles">
          {title && <span className="fw-band__title">{title}</span>}
          {subtitle && <span className="fw-band__sub">{subtitle}</span>}
        </div>
      </div>
      {(status || context) && (
        <div className="fw-band__right">
          {status && (
            <span className="fw-band__status">
              <span
                className={`fw-band__led${live ? ' fw-band__led--live' : ''}`}
                aria-hidden="true"
              />
              {status}
            </span>
          )}
          {context && <span className="fw-band__context">{context}</span>}
        </div>
      )}
    </header>
  );
}
