import PosterCard from './PosterCard';
import './BevandeSection.css';

/**
 * Blocco BEVANDE (categoria `bevande`) del menu cliente — MENU POLISH SPRINT
 * (2026-09-16, decisione Eros).
 *
 * Restyling hero: ogni bevanda è una scheda compatta `PosterCard` (foto a sinistra, nome, formato,
 * descrizione, prezzo e "+" giallo) a lista verticale, come le altre categorie.
 *
 * Volutamente **NON accordion**: una bibita non ha storytelling, ingredienti da
 * leggere né allergeni da controllare, quindi far aprire una card per scoprire
 * "Bibita analcolica gassata" sarebbe un click a vuoto. Tutto è visibile nello stato
 * unico della card.
 *
 * Immagini: le 6 foto reali sono in `public/assets/kitchen/menu/bevande/` (512×512
 * .webp, spec nel README della cartella) e `item.image` punta al path definitivo di
 * ciascuna. Sono scatti sui prodotti reali del locale: nessun hotlink a marchi terzi,
 * nessuna immagine generata. Il ramo placeholder "FOTO IN ARRIVO" resta comunque nel
 * render: è il fallback per una voce bevanda futura aggiunta prima della sua foto,
 * così non si torna mai a un `<img>` rotto.
 *
 * Formato: renderizzato solo se `item.format` esiste. Per Pepsi Zero / Seven Up /
 * Schweppes il formato non è confermato da nessuna fonte e non viene inventato
 * (stessa regola di Krombacher in BirreSection).
 *
 * `displayName` (solo Pepsi 33cl) evita di ripetere il formato nel titolo: il nome
 * reale che finisce nel carrello e nell'ordine resta `item.name`.
 */

// Ordine menu approvato (stesso di getCategorySubtitle in CustomerKitchenMenu.jsx):
// ACQUA · PEPSI 33CL · PEPSI ZERO · SEVEN UP · SCHWEPPES LEMON · SCHWEPPES TONICA.
const BEVANDE_LIST_ORDER = [
  'item-038', // ACQUA
  'item-046', // PEPSI
  'item-047', // PEPSI ZERO
  'item-048', // SEVEN UP
  'item-049', // SCHWEPPES LEMON
  'item-050', // SCHWEPPES TONICA
];

export default function BevandeSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const orderedItems = BEVANDE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !BEVANDE_LIST_ORDER.includes(i.id)));

  return (
    <div className="bv-list">
      {orderedItems.map((item, index) => (
        <PosterCard
          key={item.id}
          item={item}
          displayName={item.displayName}
          index={index}
          qty={qtyById?.[item.id] ?? 0}
          onAdd={onAdd}
          onRemove={onRemove}
          compact
          meta={item.format ? item.format.toUpperCase() : null}
        />
      ))}
    </div>
  );
}
