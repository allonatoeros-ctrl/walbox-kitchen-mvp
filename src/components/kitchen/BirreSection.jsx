import AllergenBadges from './AllergenBadges';
import { isEveningServiceActive } from '../../lib/kitchenServiceRules';
import './BirreSection.css';

/**
 * Blocco BIRRE (categoria `birre`) del menu cliente — BEER SPRINT V1
 * (ai-ops/current/BEER_SPRINT_V1.md §4/§7-B). Nessun frame Figma dedicato per questa
 * categoria: layout closed-only (niente EXPANDED), stesso linguaggio CTA/prezzo del
 * resto del menu cliente ("LO VOGLIO" / "ESAURITO" / "PREZZO IN ARRIVO") invece del
 * mockup concettuale della missione (CTA "+"), per restare coerenti col pattern
 * approvato altrove — non introduce un secondo linguaggio CTA nel menu.
 *
 * Choice architecture: nome + choiceLabel (personalità immediata) + max 2 taste
 * signal, poi formato/prezzo/CTA. `evening_only` (Krombacher) mostra un badge
 * "SOLO LA SERA" ed è disabilitata fuori orario sera — soglia 18:00 locale del
 * device, confermata da Eros come regola di servizio definitiva (BEER SPRINT V1
 * Fase E, 2026-09-14). Prezzo confermato (€6): ora ordinabile la sera. Formato in
 * cl resta non confermato (`format: null`, mai inventato) — `choiceLabel: 'ALLA
 * SPINA'` copre la richiesta di mostrare "alla spina" al posto del formato.
 */

function formatPrice(value) {
  if (value == null) return '';
  return `€${Number.isInteger(value) ? value : value.toFixed(2).replace('.', ',')}`;
}

export default function BirreSection({ items, onAdd }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="br-list">
      {items.map((item) => {
        const soldOut = item.available === false;
        const noPrice = item.price == null;
        const eveningOnly = item.availability === 'evening_only';
        const eveningLocked = eveningOnly && !isEveningServiceActive();
        const disabled = soldOut || noPrice || eveningLocked;

        let ctaLabel = 'LO VOGLIO';
        if (soldOut) ctaLabel = 'ESAURITO';
        else if (eveningLocked) ctaLabel = 'SOLO LA SERA';
        else if (noPrice) ctaLabel = 'PREZZO IN ARRIVO';

        return (
          <article key={item.id} className={`br-card${soldOut ? ' br-card--soldout' : ''}`}>
            <div className="br-card-photo-wrap">
              {item.image ? (
                <img className="br-card-photo" src={item.image} alt={item.name} />
              ) : (
                <span className="br-card-photo-placeholder" aria-hidden="true">🍺</span>
              )}
              {soldOut && <span className="br-card-soldout-badge">ESAURITO</span>}
              {!soldOut && eveningOnly && (
                <span className="br-card-evening-badge">SOLO LA SERA</span>
              )}
            </div>
            <div className="br-card-body">
              <div className="br-card-name">{item.name.toUpperCase()}</div>
              {item.choiceLabel && <div className="br-card-choice">{item.choiceLabel}</div>}
              {item.tasteSignals && item.tasteSignals.length > 0 && (
                <div className="br-card-taste">{item.tasteSignals.slice(0, 2).join(' · ')}</div>
              )}
              <AllergenBadges allergens={item.allergens} />
              <div className="br-card-bottom-row">
                <div className="br-card-meta">
                  {item.format && <span className="br-card-format">{item.format.toUpperCase()}</span>}
                  <span className={`br-card-price${noPrice ? ' br-card-price--soon' : ''}`}>
                    {noPrice ? 'PREZZO IN ARRIVO' : formatPrice(item.price)}
                  </span>
                </div>
                <button
                  type="button"
                  className="br-btn-want"
                  disabled={disabled}
                  onClick={() => onAdd?.({ id: item.id, name: item.name, price: item.price, image: item.image })}
                >
                  {ctaLabel}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
