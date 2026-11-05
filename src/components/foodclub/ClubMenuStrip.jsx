// WALRUS FOOD CLUB V1 — striscia sotto la testata del menu.
// Non iscritto: invito chiudibile (la chiusura resta su questo dispositivo). Iscritto: buono pronto oppure progresso
// della tessera. Invisibile se il Club non è disponibile (flag spento, campagna spenta, RPC assenti).
import { useState } from 'react';
import { spaNavigate } from '../../lib/spaNavigate';
import { cardView, formatShortDate, pickVoucherForCart } from '../../lib/foodClubRules';
import './ClubCheckout.css';

const STRIP_CLOSED_KEY = 'walbox_fc_menu_strip_closed';

function readClosed() {
  try { return localStorage.getItem(STRIP_CLOSED_KEY) === '1'; } catch { return false; }
}
function writeClosed() {
  try { localStorage.setItem(STRIP_CLOSED_KEY, '1'); } catch { /* storage non disponibile: si chiude solo per questa pagina */ }
}

// "5 €" per i valori interi, "5,50 €" altrimenti.
function euroShort(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `${v} €` : `${v.toFixed(2).replace('.', ',')} €`;
}

function MiniStamp({ on }) {
  return (
    <span className={`fc-stamp fc-stamp--xs${on ? ' fc-stamp--on' : ''}`} aria-hidden="true">
      {on ? '✓' : <>WALRUS<br />FOOD</>}
    </span>
  );
}

export default function ClubMenuStrip({ club }) {
  const [closed, setClosed] = useState(readClosed);
  if (!club?.available) return null;
  const { state, member } = club;
  const arrow = <span className="fc-strip-arrow" aria-hidden="true">→</span>;

  if (!member) {
    if (closed || !state?.campaign?.active) return null;
    const value = euroShort(state.campaign.voucher_value ?? 5);
    const required = Number(state.campaign.stamps_required) || 2;
    return (
      <div className="fc-scope" data-testid="fc-menu-strip">
        <div className="fc-strip-wrap">
          <button type="button" className="fc-strip" onClick={() => spaNavigate('/kitchen/club')}>
            <span className="fc-strip-text">
              <span className="fc-strip-title">Walrus Food Club · <span className="fc-yellow">{required} visite = {value}</span></span>
              <span className="fc-strip-sub">gratis · {required} serate food = {value} sul prossimo ordine</span>
            </span>
            {arrow}
          </button>
          <button
            type="button"
            className="fc-strip-close"
            aria-label="Nascondi il Food Club"
            onClick={() => { writeClosed(); setClosed(true); }}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  const progress = cardView(state);
  const voucher = pickVoucherForCart(state);
  const goTessera = () => spaNavigate('/kitchen/club/tessera');

  if (voucher) {
    return (
      <div className="fc-scope" data-testid="fc-menu-strip">
        <button type="button" className="fc-strip fc-strip--buono" onClick={goTessera}>
          <span className="fc-strip-text">
            <span className="fc-strip-title">Buono {euroShort(voucher.value)} pronto</span>
            <span className="fc-strip-sub">scade il {formatShortDate(voucher.expires_at)} · tessera {progress.count}/{progress.required}</span>
          </span>
          {arrow}
        </button>
      </div>
    );
  }

  const minFood = euroShort(state?.campaign?.stamp_min_food ?? 10);
  const value = euroShort(state?.campaign?.voucher_value ?? 5);
  let title;
  let sub;
  if (progress.count > 0 && progress.expiresAt) {
    title = `${progress.count}/${progress.required} visite · scade il ${formatShortDate(progress.expiresAt)}`;
    sub = progress.count + 1 >= progress.required ? `la ${progress.count + 1}ª visita sblocca ${value}` : `ancora ${progress.required - progress.count} visite per ${value}`;
  } else {
    title = `Food Club · ${progress.count}/${progress.required} visite`;
    sub = `il primo ordine food da ${minFood} fa timbro`;
  }
  return (
    <div className="fc-scope" data-testid="fc-menu-strip">
      <button type="button" className="fc-strip" onClick={goTessera}>
        <span className="fc-strip-mini" aria-hidden="true">
          {Array.from({ length: progress.required }, (_, i) => <MiniStamp key={i} on={i < progress.count} />)}
        </span>
        <span className="fc-strip-text">
          <span className="fc-strip-title">{title}</span>
          <span className="fc-strip-sub">{sub}</span>
        </span>
        {arrow}
      </button>
    </div>
  );
}
