import PosterCard from './PosterCard';
import './TartareSection.css';

/**
 * Blocco TARTARE (categoria `tartare`) del menu cliente.
 *
 * Fase 3.2c restyling (direzione B "Poster da pub", stesso schema di PaniniSection/InsalatoneSection):
 * ogni tartare è una locandina `PosterCard` sempre aperta (niente accordion CLOSED/EXPANDED):
 * AGGIUNGI è sempre a un tap e diventa stepper − N + quando la tartare è nel sacco.
 *
 * Fallback (gestiti da PosterCard): price null → CTA spenta "PREZZO IN ARRIVO", nessun prezzo
 * inventato; available === false → "ESAURITO"; foto rotta/assente → "FOTO IN ARRIVO".
 */

const TARTARE_LIST_ORDER = [
  'item-020', // CRUDA E CONTENTA
  'item-021', // DOLCE MA CRUDA
];

// Ritaglio 4:3 delle foto quadrate 1254×1254: niente campo dati (kitchenMockData.js è protetto).
// La finestra 4:3 mostra il 75% dell'altezza. In entrambe le foto il piatto occupa circa dal 24-27%
// al 92-93% dell'altezza (sopra solo parete scura): si ancora in basso (80%) così la finestra copre
// ~20%-95%, quindi piatto e tartare restano interi e solo il fondo del piatto va sotto lo scrim.
const OBJECT_POSITION_BY_ID = {
  'item-020': '50% 80%', // Cruda e Contenta
  'item-021': '50% 80%', // Dolce ma Cruda (rucola/chips partono a ~24%)
};

export default function TartareSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const orderedItems = TARTARE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !TARTARE_LIST_ORDER.includes(i.id)));

  return (
    <div className="tr-list">
      {orderedItems.map((item, index) => (
        <PosterCard
          key={item.id}
          item={item}
          index={index}
          qty={qtyById?.[item.id] ?? 0}
          onAdd={onAdd}
          onRemove={onRemove}
          objectPosition={OBJECT_POSITION_BY_ID[item.id] ?? '50% 50%'}
        />
      ))}
    </div>
  );
}
