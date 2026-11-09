// WALRUS FOOD CLUB V1 — buono Club (biglietto tratteggiato mattone). Riusabile in menu/carrello/stato ordine.
// Stato mostrato = quello del server (effectiveVoucherStatus segna scaduto un "available" oltre la scadenza).
import { daysLeft, DEFAULT_RULES, effectiveVoucherStatus, formatEuro, formatShortDate } from '../../lib/foodClubRules';
import { spaNavigate } from '../../lib/spaNavigate';
import { ClubCta } from './ClubCta';
import './FoodClub.css';

function amountLabel(value) {
  const n = Number(value) || DEFAULT_RULES.voucher_value;
  return Number.isInteger(n) ? `${n} €` : formatEuro(n);
}

const orderNo = (code) => (code ? <b style={{ fontSize: 'inherit', fontFamily: 'inherit' }}>#{code}</b> : null);

// paused: Club in pausa (campagna spenta) -> il buono resta valido ma non si può usare ora: niente CTA "USALO ORA".
export default function VoucherCard({ voucher, withCta = false, onUse = null, ctaTitle = 'USALO ORA', ctaSub = 'si applica nel sacco, prima di pagare', paused = false }) {
  if (!voucher) return null;
  const st = effectiveVoucherStatus(voucher);
  const released = st === 'available' && voucher.last_event === 'released';
  const left = daysLeft(voucher.expires_at);
  const minFood = Number(voucher.min_food) || DEFAULT_RULES.voucher_min_food;
  const amount = amountLabel(voucher.value);
  const dimmed = st === 'used' ? ' fc-voucher--used' : (st === 'expired' || st === 'revoked') ? ' fc-voucher--expired' : st === 'reserved' ? ' fc-voucher--reserved' : st === 'available' ? ' fc-voucher--available' : '';

  const chips = [];
  if (st === 'reserved') chips.push(<span key="s" className="fc-chip">RISERVATO{voucher.reserved_order_code ? ` · #${voucher.reserved_order_code}` : ''}</span>);
  else if (st === 'used') chips.push(<span key="s" className="fc-chip fc-chip--line">UTILIZZATO</span>);
  else if (st === 'expired') chips.push(<span key="s" className="fc-chip fc-chip--line">SCADUTO</span>);
  else if (st === 'revoked') chips.push(<span key="s" className="fc-chip fc-chip--line">REVOCATO</span>);
  else {
    chips.push(<span key="s" className="fc-chip fc-chip--white">DISPONIBILE</span>);
    if (paused) chips.push(<span key="p" className="fc-chip fc-chip--line" data-testid="fc-voucher-paused">CLUB IN PAUSA</span>);
    if (left != null && left <= 7) chips.push(<span key="d" className="fc-chip">{left <= 0 ? 'SCADE OGGI' : `SCADE TRA ${left} GG`}</span>);
    if (voucher.source === 'referral') chips.push(<span key="r" className="fc-chip fc-chip--line">DA INVITO</span>);
  }

  const expires = formatShortDate(voucher.expires_at);
  let foot;
  if (st === 'used') {
    foot = <><span>usato il {formatShortDate(voucher.used_at)}{voucher.used_order_code ? <> · ordine {orderNo(voucher.used_order_code)}</> : null}</span><b>−{formatEuro(Number(voucher.value) || DEFAULT_RULES.voucher_value)}</b></>;
  } else if (st === 'expired') {
    foot = <><span>scaduto il {expires} · non più utilizzabile</span><b>{voucher.code}</b></>;
  } else if (st === 'revoked') {
    foot = <><span>annullato dal Walrus · non più utilizzabile</span><b>{voucher.code}</b></>;
  } else if (st === 'reserved') {
    foot = <span>Buono applicato all’ordine {orderNo(voucher.reserved_order_code)} — si conferma quando paghi · scade il {expires}</span>;
  } else if (released) {
    foot = <><span>Il tuo buono da {amount} è di nuovo disponibile. Puoi utilizzarlo sul prossimo ordine!<br />Valido fino al <b style={{ fontSize: 20 }}>{expires}</b></span><b>{voucher.code}</b></>;
  } else if (paused) {
    foot = <><span>Resta tuo fino al <b style={{ fontSize: 20 }}>{expires}</b>. Lo usi quando il Club riparte.</span><b>{voucher.code}</b></>;
  } else {
    foot = <><span>valido fino al <b style={{ fontSize: 20 }}>{expires}</b></span><b>{voucher.code}</b></>;
  }

  return (
    <div className="fc-scope">
      <div className={`fc-voucher${dimmed}`}>
        <div className="fc-voucher-top">
          <div className="fc-voucher-amount">{amount}</div>
          <div>
            <div className="fc-voucher-kind">Buono Club</div>
            <div className="fc-voucher-rule">su un ordine Walbox con almeno {minFood} € di food · uno per ordine, non cumulabile</div>
            <div className="fc-chips">{chips}</div>
          </div>
        </div>
        <div className="fc-voucher-tear" />
        <div className="fc-voucher-foot">{foot}</div>
        {withCta && st === 'available' && !paused ? (
          <ClubCta title={ctaTitle} sub={ctaSub} onClick={onUse ?? (() => spaNavigate('/kitchen'))} />
        ) : null}
        {st === 'reserved' ? (
          <div className="fc-voucher-foot" style={{ paddingTop: 0 }}>
            <span>Il buono resta riservato finché il pagamento non è chiuso del tutto. Se l’ordine viene annullato senza alcun pagamento, torna disponibile dopo la verifica del pagamento, con la stessa scadenza.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
