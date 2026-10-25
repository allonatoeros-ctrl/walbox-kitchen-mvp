import PosterCard from './PosterCard';
import './InsalatoneSection.css';

/**
 * Blocco INSALATONE (categoria `insalatone`) del menu cliente.
 *
 * Fase 3.2b restyling (direzione B "Poster da pub", stesso schema del pilota PaniniSection):
 * ogni insalatona è una locandina `PosterCard` sempre aperta (niente accordion CLOSED/EXPANDED):
 * AGGIUNGI è sempre a un tap e diventa stepper − N + quando l'insalatona è nel sacco.
 *
 * Fallback (gestiti da PosterCard): price null → CTA spenta "PREZZO IN ARRIVO", nessun prezzo
 * inventato; available === false → "ESAURITO"; foto rotta/assente → "FOTO IN ARRIVO".
 */

// Ordine approvato Figma 164:65 (CAESAR → SALMON → VEGGY, dall'alto in basso).
const INSALATONE_LIST_ORDER = [
  'item-024', // CAESAR
  'item-025', // SALMON
  'item-027', // VEGGY
];

// Ritaglio 4:3 delle foto quadrate 1254×1254 (stessa idea di PaniniSection): niente campo dati
// (kitchenMockData.js è protetto). La finestra 4:3 mostra il 75% dell'altezza; le ciotole vanno
// da circa il 3% al 92-96% della foto, quindi non entrano intere: si ancora quasi in alto per
// tenere il bordo superiore della ciotola con un filo di legno sopra, e il fondo della ciotola
// finisce sotto lo scrim del nome. Default: centro.
const OBJECT_POSITION_BY_ID = {
  'item-024': '50% 6%', // Caesar (bordo ciotola a ~3%; la salsa chiara in basso resta sotto lo scrim)
  'item-025': '50% 10%', // Salmon (bordo ciotola a ~3,5%)
  'item-027': '50% 6%', // Veggy (bordo ciotola a ~3%)
};

export default function InsalatoneSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const orderedItems = INSALATONE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !INSALATONE_LIST_ORDER.includes(i.id)));

  return (
    <div className="is-list">
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
