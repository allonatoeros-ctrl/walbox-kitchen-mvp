// WALRUS FOOD CLUB V1 — tessera timbri (riusabile: pagina Tessera, home Club, menu/carrello/stato ordine).
// Solo dati reali da food_club_my_state: senza tessera aperta i timbri restano vuoti (nessun dato finto).
import { cardProgress, DEFAULT_RULES, formatLongDate, formatShortDate } from '../../lib/foodClubRules';
import { stampSummary } from './clubText';
import './FoodClub.css';

function stampDate(s) {
  return formatShortDate(s?.service_night || s?.created_at);
}

// Un timbro tondo. kind: 'ok' | 'gift' | 'void' | '' (vuoto)
export function Stamp({ kind = '', caption = null, sm = false, isNew = false }) {
  const cls = kind === 'gift' ? ' fc-stamp--on fc-stamp--gift'
    : kind === 'ok' ? ' fc-stamp--on'
      : kind === 'void' ? ' fc-stamp--void' : '';
  const text = kind === 'gift' ? <>BENVE<br />NUTO</>
    : kind === 'ok' ? '✓'
      : kind === 'void' ? <>SCA<br />DUTO</> : <>WALRUS<br />FOOD</>;
  return (
    <div className="fc-stamp-col">
      <div className={`fc-stamp${cls}${sm ? ' fc-stamp--sm' : ''}${isNew && kind === 'ok' ? ' fc-stamp--new' : ''}`} aria-hidden="true">{text}</div>
      {caption ? <div className="fc-stamp-cap">{caption}</div> : null}
    </div>
  );
}

// Fila dei timbri della tessera corrente (N caselle = stamps_required della campagna).
export function StampRow({ state, sm = false }) {
  const cp = cardProgress(state);
  const minFood = Number(state?.campaign?.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  const stamps = [...(state?.card && !state.card.expired ? state.card.stamps ?? [] : [])]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const hasGift = stamps.some((s) => s.kind === 'welcome');
  const slots = Array.from({ length: cp.required }, (_, i) => stamps[i] ?? null);
  const label = `${cp.count} timbri su ${cp.required}`;
  return (
    <div className="fc-stamps" role="img" aria-label={label}>
      {slots.map((s, i) => {
        if (s) {
          const caption = s.kind === 'welcome'
            ? <><b>benvenuto</b><br />regalo d’invito</>
            : <b>{stampDate(s)}</b>;
          return <Stamp key={i} kind={s.kind === 'welcome' ? 'gift' : 'ok'} caption={caption} sm={sm} />;
        }
        const first = i === stamps.length;
        let caption = `VISITA ${i + 1}`;
        if (first && hasGift) caption = <>{i === 1 ? '1° ORDINE' : 'ORDINE'}<br />DA <b>{minFood} €</b></>;
        else if (first && cp.expiresAt && stamps.length > 0) caption = <>ENTRO IL <b>{formatShortDate(cp.expiresAt)}</b></>;
        return <Stamp key={i} kind="" caption={caption} sm={sm} />;
      })}
    </div>
  );
}

// Blocco progresso della pagina Tessera: "N visite su 2" + finestra dei giorni con barra.
export function ProgressBlock({ state }) {
  const cp = cardProgress(state);
  const minFood = Number(state?.campaign?.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  const voucherValue = Number(state?.campaign?.voucher_value) || DEFAULT_RULES.voucher_value;
  const giftOnly = cp.hasWelcome && cp.orderStamps.length === 0;
  const expiredCard = !!state?.card?.expired;
  const n = cp.count;

  let box;
  if (giftOnly) {
    box = (
      <div className="fc-deadline">
        <div className="fc-deadline-title">Un timbro è già tuo</div>
        <div className="fc-deadline-sub">Il primo ordine food da <b>{minFood} €</b> completa la tessera e sblocca il buono da {voucherValue} €.</div>
      </div>
    );
  } else if (cp.expiresAt && n > 0) {
    const left = cp.daysLeft ?? 0;
    const warn = left <= 5;
    const pct = Math.max(4, Math.min(100, (left / cp.windowDays) * 100));
    box = (
      <div className={`fc-deadline${warn ? ' fc-deadline--warn' : ''}`}>
        <div className="fc-deadline-title">Hai tempo fino al {formatLongDate(cp.expiresAt)}</div>
        <div className="fc-deadline-sub">per la <b>{n + 1}ª visita</b>, in un’altra serata.</div>
        <div className={`fc-bar${warn ? ' fc-bar--warn' : ''}`} role="img" aria-label={`Restano ${left} giorni`}><i style={{ width: `${pct}%` }} /></div>
        <div className="fc-bar-row">
          <span>{left === 1 ? <>Resta <b>1 giorno</b></> : <>Restano <b>{left} giorni</b></>}</span>
          <span>{cp.windowDays} giorni dalla 1ª visita</span>
        </div>
      </div>
    );
  } else {
    box = (
      <div className="fc-deadline fc-deadline--idle">
        <div className="fc-deadline-title">{expiredCard ? 'Si riparte da capo' : 'Si parte col primo ordine'}</div>
        <div className="fc-deadline-sub">
          {expiredCard ? 'La tessera precedente è scaduta. ' : ''}
          Un ordine con almeno <b>{minFood} € di food</b> fa il 1° timbro. Da lì hai <b>{cp.windowDays} giorni</b> per la 2ª visita.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fc-visits" aria-label={`${n} ${n === 1 ? 'visita' : 'visite'} su ${cp.required}`}>
        <div className="fc-visits-n" aria-hidden="true">{n}</div>
        <div className="fc-visits-lbl" aria-hidden="true">{n === 1 ? 'visita' : 'visite'}<br />su {cp.required}</div>
      </div>
      <StampRow state={state} />
      {box}
    </>
  );
}

// Card tessera autosufficiente (avvolta in .fc-scope). `sm` = versione compatta per menu/carrello/stato ordine.
export default function StampCard({ state, sm = false, onOpen = null, title = null }) {
  if (!state) return null;
  const cp = cardProgress(state);
  const voucherValue = Number(state?.campaign?.voucher_value) || DEFAULT_RULES.voucher_value;
  const inner = (
    <>
      <div className="fc-card-head">
        <span className="fc-card-title">{title ?? <>{cp.required} visite = <em>{voucherValue} €</em></>}</span>
        {onOpen ? <span className="fc-strip-arrow" aria-hidden="true">→</span> : null}
      </div>
      <StampRow state={state} sm={sm} />
      <div className="fc-small" style={{ textAlign: 'center' }}>{stampSummary(state)}</div>
    </>
  );
  return (
    <div className="fc-scope">
      {onOpen ? (
        <button type="button" className="fc-card fc-card-link" style={{ width: 'calc(100% - 32px)' }} onClick={onOpen}>{inner}</button>
      ) : (
        <div className="fc-card">{inner}</div>
      )}
    </div>
  );
}
