import './BevandeSection.css';

/**
 * Blocco BEVANDE (categoria `bevande`) del menu cliente — MENU POLISH SPRINT
 * (2026-09-16, decisione Eros).
 *
 * Volutamente **NON accordion**: una bibita non ha storytelling, ingredienti da
 * leggere né allergeni da controllare, quindi far aprire una card per scoprire
 * "Bibita analcolica gassata" sarebbe un click a vuoto. Anatomia approvata, tutta
 * visibile nello stato unico della card:
 *
 *   foto → nome → formato → prezzo → LO VOGLIO
 *
 * Layout a 2 colonne (le card sono corte: in lista verticale sprecherebbero mezzo
 * schermo mobile). Stessi token colore/font di Panini/Taglieri/Birre: il blocco è
 * più compatto, non un secondo linguaggio visivo.
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
 * (stessa regola di Krombacher in BirreSection). La riga ha altezza riservata in
 * CSS, così le card restano allineate anche quando il formato manca.
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

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function BevandeSection({ items, onAdd }) {
  if (!items || items.length === 0) return null;

  const orderedItems = BEVANDE_LIST_ORDER
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean)
    .concat(items.filter((i) => !BEVANDE_LIST_ORDER.includes(i.id)));

  return (
    <div className="bv-grid">
      {orderedItems.map((item) => {
        const soldOut = item.available === false;
        const noPrice = item.price == null;

        let ctaLabel = 'LO VOGLIO';
        if (soldOut) ctaLabel = 'ESAURITO';
        else if (noPrice) ctaLabel = 'PREZZO IN ARRIVO';

        return (
          <article
            key={item.id}
            className={`bv-card${soldOut ? ' bv-card--soldout' : ''}`}
          >
            <div className="bv-card-photo-wrap">
              {item.image ? (
                <img className="bv-card-photo" src={item.image} alt={item.name} />
              ) : (
                <span className="bv-card-photo-placeholder">FOTO IN ARRIVO</span>
              )}
              {soldOut && <span className="bv-card-soldout-badge">ESAURITO</span>}
            </div>
            <div className="bv-card-accent-line" />
            <div className="bv-card-body">
              <h3 className="bv-card-name">{(item.displayName ?? item.name).toUpperCase()}</h3>
              <p className="bv-card-format">{item.format ? item.format.toUpperCase() : ''}</p>
              <p className={`bv-card-price${noPrice ? ' bv-card-price--soon' : ''}`}>
                {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
              </p>
              <button
                type="button"
                className="bv-btn-want"
                disabled={soldOut || noPrice}
                onClick={() => onAdd?.({
                  id: item.id,
                  name: item.name,
                  price: item.price,
                  image: item.image,
                })}
              >
                {ctaLabel}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
