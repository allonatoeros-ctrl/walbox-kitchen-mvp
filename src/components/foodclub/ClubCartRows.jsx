// WALRUS FOOD CLUB V1 — righe del Club nel sacco (dentro .cx, sopra "COME TI CHIAMI?") e chip nel footer di pagamento.
// Solo presentazione: le soglie mostrate sono suggerimenti, il server decide buono e timbro alla creazione/pagamento.
// Il genitore (CustomerKitchenMenu) monta questi componenti SOLO se useFoodClub().available è vero.
import { spaNavigate } from '../../lib/spaNavigate';
import { formatEuro, formatShortDate } from '../../lib/foodClubRules';
import './ClubCheckout.css';

function euroShort(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `${v} €` : `${v.toFixed(2).replace('.', ',')} €`;
}

function Stamp({ pending }) {
  return (
    <span className={`fc-stamp${pending ? ' fc-stamp--pending' : ''}`} aria-hidden="true">
      {pending ? <>IN<br />ATTESA</> : <>WALRUS<br />FOOD</>}
    </span>
  );
}

function stampCopy({ forecast, foodAmount, campaign }) {
  const required = Number(campaign?.stamps_required) || 2;
  const value = euroShort(campaign?.voucher_value ?? 5);
  switch (forecast?.reason ?? (forecast?.willStamp ? 'ok' : null)) {
    case 'ok':
      return forecast.completesCard
        ? ['Questo ordine fa timbro', `È il ${forecast.stampNumber}° di ${required}: sblocchi il buono da ${value} appena il pagamento è confermato.`, true]
        : ['Questo ordine fa timbro', `Timbro ${forecast.stampNumber} di ${required} appena il pagamento è confermato.`, true];
    case 'food_below_threshold':
      return (Number(foodAmount) || 0) > 0
        ? [`Ti mancano ${formatEuro(forecast.missingFood)} di food per il timbro`, 'Le bevande non contano.', false]
        : ['Solo bevande', 'Il Club conta solo il food.', false];
    case 'already_tonight':
      return ['Stasera hai già il timbro', 'Conta una visita per serata: il prossimo da un’altra sera.', false];
    case 'voucher_order':
      return ['Con il buono niente timbro', 'Gli ordini con il buono non fanno timbro.', false];
    default:
      return null;
  }
}

export default function ClubCartRows({ club, foodAmount, voucher, voucherStatus, applied, forecast, onToggleVoucher }) {
  const campaign = club?.state?.campaign;

  if (!club?.member) {
    // Non iscritto: una sola riga discreta, solo se questo sacco farebbe davvero timbro.
    const min = Number(campaign?.stamp_min_food) || 10;
    if (!campaign?.active || (Number(foodAmount) || 0) < min) return null;
    return (
      <div className="fc-cx-club" data-testid="fc-cart-club">
        <div className="fc-cart-stamp fc-cart-stamp--join" data-testid="fc-cart-join">
          <span>Con il <b style={{ display: 'inline', fontSize: 18 }}>Food Club</b> questo ordine farebbe timbro</span>
          <button type="button" className="fc-link" onClick={() => spaNavigate('/kitchen/club/iscriviti')}>Iscriviti →</button>
        </div>
      </div>
    );
  }

  let voucherRow = null;
  if (voucher) {
    const value = euroShort(voucher.value);
    const minFood = euroShort(voucher.min_food ?? 12);
    if (voucherStatus?.usable) {
      voucherRow = (
        <div className={`fc-cart-voucher${applied ? ' fc-cart-voucher--on' : ''}`} data-testid="fc-cart-voucher">
          <div>
            <div className="fc-cart-voucher-title">{applied ? 'Buono applicato' : `Hai un buono da ${value}`}</div>
            <div className="fc-cart-voucher-sub">
              food <b>{formatEuro(foodAmount)}</b> · minimo {minFood} ✓ · {applied ? 'si consuma quando l’ordine è pagato' : `scade il ${formatShortDate(voucher.expires_at)}`}
            </div>
          </div>
          <button
            type="button"
            className={`fc-apply${applied ? ' fc-apply--off' : ''}`}
            aria-pressed={applied}
            onClick={onToggleVoucher}
            data-testid="fc-voucher-toggle"
          >
            {applied ? 'TOGLI' : <>USA IL BUONO<br />−{value}</>}
          </button>
        </div>
      );
    } else if (voucherStatus?.reason === 'food_below_minimum') {
      const pct = Math.max(0, Math.min(100, Math.round(((Number(foodAmount) || 0) / (Number(voucher.min_food) || 12)) * 100)));
      voucherRow = (
        <div className="fc-cart-voucher fc-cart-voucher--low" data-testid="fc-cart-voucher">
          <div>
            <div className="fc-cart-voucher-title">Buono da {value}: quasi</div>
            <div className="fc-cart-voucher-sub">
              Ti mancano <b className="fc-yellow">{formatEuro(voucherStatus.missingFood)}</b> di food per usare il buono (minimo {minFood}). Le bevande non contano.
            </div>
          </div>
          <button type="button" className="fc-apply" disabled aria-disabled="true">USALO</button>
          <div className="fc-bar" role="img" aria-label={`Food al ${pct}% della soglia`}><i style={{ width: `${pct}%` }} /></div>
        </div>
      );
    }
  }

  const copy = stampCopy({ forecast, foodAmount, campaign });
  const stampRow = copy ? (
    <div className="fc-cart-stamp" data-testid="fc-cart-stamp">
      <Stamp pending={copy[2]} />
      <div><b>{copy[0]}</b>{copy[1]}</div>
    </div>
  ) : null;

  if (!voucherRow && !stampRow) return null;
  return <div className="fc-cx-club" data-testid="fc-cart-club">{voucherRow}{stampRow}</div>;
}

// Footer di pagamento: chip compatte + totale lordo barrato quando il buono è applicato.
export function ClubCartFooter({ club, applied, voucherStatus, forecast, total }) {
  const required = Number(club?.state?.campaign?.stamps_required) || 2;
  const chips = [];
  if (applied) chips.push(<span key="v" className="fc-chip" data-testid="fc-chip-voucher">BUONO −{euroShort(voucherStatus.discount)}</span>);
  if (forecast?.willStamp) {
    chips.push(
      <span key="s" className="fc-chip fc-chip--line" data-testid="fc-chip-stamp">
        {forecast.completesCard ? `TIMBRO ${forecast.stampNumber}/${required} · BUONO IN ARRIVO` : 'TIMBRO IN ARRIVO'}
      </span>,
    );
  }
  if (!applied && chips.length === 0) return null;
  return (
    <>
      {applied && (
        <span className="fc-total-strike" data-testid="fc-total-strike">
          <s>{formatEuro(total)}</s><b>buono Club −{formatEuro(voucherStatus.discount)}</b>
        </span>
      )}
      <div className="fc-foot-club">
        {chips}
        {applied && <span className="fc-total-note">importo confermato dal Walrus al momento dell’ordine</span>}
      </div>
    </>
  );
}
