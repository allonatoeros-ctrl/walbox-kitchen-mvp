import PosterCard from './PosterCard';
import './PaniniSection.css';

/**
 * Blocco PANINI (categoria `panini`) del menu cliente.
 *
 * Fase 3.2 restyling (direzione B "Poster da pub", pilota): ogni panino è una locandina
 * `PosterCard` sempre aperta (niente accordion, niente "VEDI IL PANINO"): AGGIUNGI è sempre
 * a un tap e diventa stepper − N + quando il panino è nel sacco. Insalatone usa lo stesso
 * schema (Fase 3.2b); Cicchetti, Tartare, Tagliere, Birre, Pesi Massimi restano col look di oggi.
 *
 * Fallback (gestiti da PosterCard): price null → CTA spenta "PREZZO IN ARRIVO", nessun prezzo
 * inventato; available === false → "ESAURITO"; foto rotta/assente → "FOTO IN ARRIVO".
 */

// Ordine approvato Figma 162:2 (card CRUDO MA EDUCATO → VEGETARIANO, dall'alto in basso).
const PANINI_LIST_ORDER = [
  'item-014', // CRUDO MA EDUCATO
  'item-017', // MORTAZZA CLASSE ALTA
  'item-012', // CRUDO VERO
  'item-015', // SPECKTACOLO
  'item-016', // WRAPTOR
  'item-032', // PORCA FIGURA
  'item-013', // VEGETARIANO
];

// Ritaglio 4:3 delle foto quadrate 1254×1254 (stessa idea di BILLING_BY_ID in GarpezHero.jsx):
// niente campo dati (kitchenMockData.js è protetto). La finestra 4:3 mostra il 75% dell'altezza:
// il panino occupa circa il 14-62% della foto, quindi si ancora in alto per non tagliare il pane
// e lasciare la parte bassa (carta con logo) sotto lo scrim del nome. Default: centro.
const OBJECT_POSITION_BY_ID = {
  'item-014': '50% 40%', // Crudo ma educato (pane in alto a ~16%)
  'item-017': '50% 40%', // Mortazza classe alta
  'item-012': '50% 45%', // Crudo vero (pane in alto a ~21%)
  'item-015': '50% 32%', // Specktacolo (pane in alto a ~14%)
  'item-016': '50% 28%', // Wraptor (cima del wrap a ~11%: serve aria sopra, il piatto resta sotto lo scrim)
  'item-032': '50% 40%', // Porca figura
  'item-013': '50% 35%', // Orto cattivo
};

export default function PaniniSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const orderedItems = PANINI_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !PANINI_LIST_ORDER.includes(i.id)));

  return (
    <div className="pn-list">
      {orderedItems.map((item, index) => (
        <PosterCard
          key={item.id}
          item={item}
          index={index}
          qty={qtyById?.[item.id] ?? 0}
          onAdd={onAdd}
          onRemove={onRemove}
          compact
          objectPosition={OBJECT_POSITION_BY_ID[item.id] ?? '50% 50%'}
        />
      ))}
    </div>
  );
}
