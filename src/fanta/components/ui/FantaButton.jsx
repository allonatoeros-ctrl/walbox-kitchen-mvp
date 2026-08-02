/*
 * FantaButton — azione (pattern P9).
 *
 * variant="primary" → gradiente oro, una sola per schermata (contratto §E.8)
 * variant="ghost"   → bordo oro su fondo trasparente. Colma il buco §A.12.5:
 *                     senza una secondaria, ogni schermata clonava la primaria.
 *
 * Il disabled usa `filter: grayscale()`, non `opacity`: l'oro diventa peltro.
 * La regola vive nei token, non qui.
 */
export default function FantaButton({
  variant = 'primary',
  size = 'md',
  block = false,
  icon = null,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'fw-btn',
    `fw-btn--${variant}`,
    size === 'sm' ? 'fw-btn--sm' : '',
    block ? 'fw-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button type="button" className={classes} {...rest}>
      {icon && (
        <span className="fw-btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="fw-btn__label">{children}</span>
    </button>
  );
}
