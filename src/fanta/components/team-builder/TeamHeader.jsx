/*
 * TeamHeader — testata Team Builder (redesign campo verticale, fase F4).
 *
 * Componente puro: nessuna logica di validazione, nessuna dipendenza dal
 * motore di calcolo, dallo storage o dalla pagina che lo consuma. Riceve
 * solo dati pronti da props.
 *
 * Layout (Figma node 44:2): titolo "LA MIA SQUADRA" + badge modulo
 * ("4-3-3") a sinistra, chip stato (LED + label, es. "IN COSTRUZIONE")
 * a destra. Stemma opzionale se già disponibile.
 */
export default function TeamHeader({
  teamName = 'LA MIA SQUADRA',
  crest = null,
  formation = '',
  status = '',
  className = '',
}) {
  const classes = ['fw-band', className].filter(Boolean).join(' ');

  return (
    <header className={classes}>
      <div className="fw-band__left">
        {crest && <span className="fw-band__crest">{crest}</span>}
        <div className="fw-band__titles">
          <span className="fw-band__title">{teamName}</span>
          {formation && (
            <span className="fw-badge fw-badge--index" aria-label={`Modulo ${formation}`}>
              {formation}
            </span>
          )}
        </div>
      </div>
      {status && (
        <div className="fw-band__right">
          <span className="fw-band__status">
            <span className="fw-band__led" aria-hidden="true" />
            {status}
          </span>
        </div>
      )}
    </header>
  );
}
