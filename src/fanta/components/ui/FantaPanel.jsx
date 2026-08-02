/*
 * FantaPanel — superficie scura generica (contratto §A.7).
 *
 * È il contenitore riusabile del sistema. La pergamena NON è un'opzione qui:
 * resta esclusiva della tessera del Tesseramento (§A.9.3 / §A.11).
 */
export default function FantaPanel({
  title,
  meta,
  flush = false,
  bodyFlush = false,
  className = '',
  children,
  ...rest
}) {
  const classes = ['fw-panel', flush ? 'fw-panel--flush' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes} {...rest}>
      {(title || meta) && (
        <div className="fw-panel__head">
          {title && <span className="fw-panel__title">{title}</span>}
          {meta && <span className="fw-panel__meta">{meta}</span>}
        </div>
      )}
      <div className={`fw-panel__body${bodyFlush ? ' fw-panel__body--flush' : ''}`}>
        {children}
      </div>
    </section>
  );
}
