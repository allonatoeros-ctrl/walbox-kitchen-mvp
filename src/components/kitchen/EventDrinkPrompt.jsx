import { useEffect, useRef } from 'react';
import './EventDrinkPrompt.css';

/**
 * "CI METTI DA BERE?" (ANNIVERSARIO 15 ANNI, piano conversione approvato da Eros 2026-10-14).
 * Pannello dal basso, solo in modalità evento: compare a ogni panino aggiunto se nel
 * sacco non c'è ancora da bere (la regola sta nel menu).
 * Un tap su una bevanda la aggiunge e chiude; "NO GRAZIE", il tap fuori, Esc o il back del telefono
 * chiudono e basta. Il focus entra nel pannello all'apertura e torna all'elemento d'origine alla chiusura.
 */
function formatPrice(value) {
  if (value == null) return '';
  return Number.isInteger(value) ? `€${value}` : `€${value.toFixed(2).replace('.', ',')}`;
}

export default function EventDrinkPrompt({ drinks = [], addedName = null, onAdd, onClose }) {
  const sheetRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  const list = drinks.filter((d) => d.available !== false && d.price != null);
  const hasList = list.length > 0;

  useEffect(() => {
    if (!hasList) return undefined;
    const origin = document.activeElement;
    sheetRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (origin && origin.isConnected) origin.focus();
    };
  }, [hasList]);

  if (!hasList) return null;
  return (
    <div className="edp-backdrop" onClick={onClose}>
      <div
        className="edp-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edp-title"
        ref={sheetRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {addedName && <p className="edp-added" role="status">{addedName.toUpperCase()} NEL SACCO ✓</p>}
        <p id="edp-title" className="edp-title">CI METTI DA BERE?</p>
        <p className="edp-sub">Un panino così non si manda giù a secco.</p>
        <div className="edp-row">
          {list.map((d) => (
            <button
              key={d.id}
              type="button"
              className="edp-drink"
              onClick={() => { onAdd?.({ id: d.id, name: d.name, price: d.price, image: d.image }); onClose?.(); }}
              aria-label={`Aggiungi ${d.name} al sacco`}
            >
              <img className="edp-photo" src={d.image} alt="" />
              <span className="edp-name">{(d.displayName || d.name).toUpperCase()}</span>
              <span className="edp-price">{formatPrice(d.price)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="edp-skip" onClick={onClose}>NO GRAZIE</button>
      </div>
    </div>
  );
}
