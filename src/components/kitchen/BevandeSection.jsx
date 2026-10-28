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
 * Immagini: le foto reali sono in `public/assets/kitchen/menu/bevande/` (512×512
 * .webp, spec nel README della cartella) e `item.image` punta al path definitivo di
 * ciascuna. Sono scatti sui prodotti reali del locale: nessun hotlink a marchi terzi,
 * nessuna immagine generata. Il ramo placeholder "FOTO IN ARRIVO" della PosterCard è
 * il fallback per le voci senza foto (oggi Fanta, Sprite, Estathé Pesca e Limone),
 * così non si torna mai a un `<img>` rotto.
 *
 * Formato: renderizzato solo se `item.format` esiste. Per Pepsi Zero / Seven Up / Fanta /
 * Sprite / Estathé il formato non è confermato da nessuna fonte e non viene inventato
 * (stessa regola di Krombacher in BirreSection).
 *
 * `displayName` (solo Pepsi 33cl) evita di ripetere il formato nel titolo: il nome
 * reale che finisce nel carrello e nell'ordine resta `item.name`.
 */

// Ordine menu approvato (stesso di getCategorySubtitle in CustomerKitchenMenu.jsx):
// ACQUA · PEPSI · PEPSI ZERO · SEVEN UP · FANTA · SPRITE · ESTATHÉ PESCA · ESTATHÉ LIMONE.
// MENU OTTOBRE (2026-10-28): via Schweppes Lemon/Tonica (item-049/050), dentro Fanta, Sprite ed
// Estathé. Le 4 nuove non hanno ancora la foto (`image: null`): la PosterCard mostra
// "FOTO IN ARRIVO" nella stessa cornice.
const BEVANDE_LIST_ORDER = [
  'item-038', // ACQUA
  'item-046', // PEPSI
  'item-047', // PEPSI ZERO
  'item-048', // SEVEN UP
  'item-063', // FANTA
  'item-064', // SPRITE
  'item-065', // ESTATHÉ PESCA
  'item-066', // ESTATHÉ LIMONE
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
