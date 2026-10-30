import PosterCard from './PosterCard';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import './BirreSection.css';

/**
 * Blocco BIRRE (categoria `birre`) del menu cliente.
 *
 * Restyling hero: ogni birra è una scheda compatta `PosterCard` (foto a sinistra, nome, scelta · formato,
 * `story` approvata da Eros, prezzo e "+" giallo), sempre aperta: niente più accordion CLOSED/EXPANDED.
 * Dati e regole di servizio invariati: `evening_only` (Krombacher) resta bloccata fuori orario sera
 * (soglia 18:00 locale del device, `kitchenServiceRules.js`) con etichetta "SOLO LA SERA" sulla foto.
 * Nessun dato tecnico inventato (ABV, IBU, birrificio): `format` si mostra solo se esiste.
 * Le foto sono bottiglie verticali 1:2: `photoFit="contain"` le mostra intere, senza tagli.
 *
 * Fallback (gestiti da PosterCard): price null → CTA spenta "PREZZO IN ARRIVO"; available === false →
 * "ESAURITO"; foto assente o rotta → "FOTO IN ARRIVO".
 */

export default function BirreSection({ items, onAdd, onRemove, qtyById }) {
  if (!items || items.length === 0) return null;

  const eveningActive = isEveningServiceActive();

  return (
    <div className="br-list">
      <p
        data-testid="alcohol-notice-beers"
        style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--poster-muted)' }}
      >
        Bevande alcoliche vietate ai minori di 18 anni. Al ritiro/servizio potrebbe essere richiesto un documento.
      </p>
      {items.map((item, index) => {
        const eveningLocked = item.availability === 'evening_only' && !eveningActive;
        const meta = [item.choiceLabel, item.format].filter(Boolean).join(' · ');
        return (
          <PosterCard
            key={item.id}
            item={{ ...item, ingredients: item.story || item.ingredients || item.description }}
            index={index}
            qty={qtyById?.[item.id] ?? 0}
            onAdd={onAdd}
            onRemove={onRemove}
            compact
            photoFit="contain"
            meta={meta}
            lockedLabel={eveningLocked ? 'SOLO LA SERA' : null}
          />
        );
      })}
    </div>
  );
}
