/*
 * FantaBadge — micro-etichetta (contratto §A.7).
 *
 * Un solo componente copre indice di sezione, obbligatorietà e stati
 * semantici. Il cremisi resta riservato a `required`: gli errori usano
 * `error`, che è una tinta distinta (§A.9.6).
 *
 * variant: index | required | optional | success | warning | error | info | neutral
 */
export default function FantaBadge({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}) {
  const classes = ['fw-badge', `fw-badge--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
