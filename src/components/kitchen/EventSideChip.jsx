import './EventSideChip.css';

/**
 * Chip "PATATE AL FORNO · 5 € · AGGIUNGI" (ANNIVERSARIO 15 ANNI, 2026-10-15).
 * Suggerimento NON modale (regole 13-16 di docs/design/ricerca-menu-evento.md): sta sopra la
 * barra del sacco, non copre totale né "VAI ALL'ORDINE", non va chiuso per forza.
 * Quando mostrarlo lo decide il menu (`shouldSuggestEventSide`); qui solo la resa.
 */
function formatPrice(value) {
  if (value == null) return '';
  return Number.isInteger(value) ? `${value} €` : `${value.toFixed(2).replace('.', ',')} €`;
}

export default function EventSideChip({ item, onAdd, onDismiss }) {
  if (!item) return null;
  return (
    <div className="esc-root" role="group" aria-label="Contorno consigliato" data-testid="event-side-chip">
      <button
        type="button"
        className="esc-add"
        onClick={onAdd}
        aria-label={`Aggiungi ${item.name}, ${formatPrice(item.price)}, al sacco`}
      >
        {item.image && <img className="esc-photo" src={item.image} alt="" />}
        <span className="esc-name">{item.name.toUpperCase()}</span>
        <span className="esc-price">{formatPrice(item.price)}</span>
        <span className="esc-cta">AGGIUNGI</span>
      </button>
      <button type="button" className="esc-no" onClick={onDismiss} aria-label={`No grazie, niente ${item.name}`}>
        NO
      </button>
    </div>
  );
}
