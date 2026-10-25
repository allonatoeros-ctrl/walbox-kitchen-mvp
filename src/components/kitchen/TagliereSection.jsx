import PosterCard from './PosterCard';
import './TagliereSection.css';

/**
 * Blocco TAGLIERI (categoria `tagliere`) del menu cliente.
 *
 * Restyling poster (mockup B, stesso schema di Panini/Insalatone/Tartare): ogni voce è una locandina
 * `PosterCard` sempre aperta (niente accordion), AGGIUNGI → stepper − N + (decisione Eros: menu
 * identico al mockup). Fallback gestiti da PosterCard: price null → "PREZZO IN ARRIVO",
 * available === false → "ESAURITO", foto rotta/assente → "FOTO IN ARRIVO".
 */

const LIST_ORDER = [
  'item-043', // SALUMI SERISSIMI
  'item-044', // FORMAGGI DISCUTIBILI
  'item-045', // PACE FATTA
];

export default function TagliereSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const orderedItems = LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !LIST_ORDER.includes(i.id)));

  return (
    <div className="tg-list">
      {orderedItems.map((item, index) => (
        <PosterCard
          key={item.id}
          item={item}
          index={index}
          qty={qtyById?.[item.id] ?? 0}
          onAdd={onAdd}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
