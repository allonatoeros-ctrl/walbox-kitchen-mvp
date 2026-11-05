// WALRUS FOOD CLUB V1 — tessera timbri (riusabile: pagina Tessera, home Club, menu/carrello/stato ordine).
// Solo dati reali da food_club_my_state: senza tessera aperta i timbri restano vuoti (nessun dato finto).
import { useEffect, useState } from 'react';
import { cardView, DEFAULT_RULES, formatLongDate, formatShortDate, markCelebrated, shouldCelebrate } from '../../lib/foodClubRules';
import { spaNavigate } from '../../lib/spaNavigate';
import { ClubCta } from './ClubCta';
import { stampSummary } from './clubText';
import './FoodClub.css';

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

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
  const cp = cardView(state);
  const minFood = Number(state?.campaign?.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  const stamps = [...cp.stamps].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
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
  const cp = cardView(state);
  const minFood = Number(state?.campaign?.stamp_min_food) || DEFAULT_RULES.stamp_min_food;
  const voucherValue = Number(state?.campaign?.voucher_value) || DEFAULT_RULES.voucher_value;
  const giftOnly = cp.hasWelcome && cp.orderStamps.length === 0;
  const expiredCard = !!state?.card?.expired;
  const n = cp.count;

  // Festa "premio conquistato": una sola volta per buono e per dispositivo (localStorage; se bloccato = nessuna animazione).
  const rewardId = cp.mode === 'reward' ? (cp.reward?.id ?? null) : null;
  const [cel, setCel] = useState(() => ({ id: rewardId, on: rewardId ? shouldCelebrate(safeStorage(), rewardId) : false }));
  if (cel.id !== rewardId) setCel({ id: rewardId, on: rewardId ? shouldCelebrate(safeStorage(), rewardId) : false });
  const celebrate = cel.on && cel.id === rewardId;
  useEffect(() => {
    if (celebrate) markCelebrated(safeStorage(), rewardId);
  }, [celebrate, rewardId]);

  let box;
  if (cp.mode === 'reward') {
    const rw = cp.reward;
    const rv = Number(rw.value) || voucherValue;
    box = (
      <div className="fc-deadline fc-deadline--reward">
        <div className="fc-deadline-title">PREMIO CONQUISTATO — BUONO DA {Number.isInteger(rv) ? rv : rv.toFixed(2).replace('.', ',')} €</div>
        <div className="fc-deadline-sub">
          {rw.status === 'reserved'
            ? <>Applicato a un ordine: resta riservato finché il pagamento non è chiuso del tutto.</>
            : <>Valido fino al <b>{formatLongDate(rw.expires_at)}</b>, su un ordine con almeno <b>{Number(rw.min_food) || DEFAULT_RULES.voucher_min_food} € di food</b>.</>}
        </div>
        {rw.status === 'reserved' ? null : (
          <ClubCta title="USA IL PREMIO" sub="si applica nel sacco, prima di pagare" onClick={() => spaNavigate('/kitchen')} data-testid="fc-reward-cta" />
        )}
      </div>
    );
  } else if (cp.mode === 'restart') {
    box = (
      <div className="fc-deadline fc-deadline--idle">
        <div className="fc-deadline-title">Premio incassato. Si riparte!</div>
        <div className="fc-deadline-sub">Un ordine con almeno <b>{minFood} € di food</b> apre il nuovo giro.</div>
      </div>
    );
  } else if (giftOnly) {
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
    <div className={`fc-prog${cp.mode === 'reward' ? ' fc-prog--reward' : ''}${celebrate ? ' fc-celebrate' : ''}`} data-testid={celebrate ? 'fc-celebrate' : undefined}>
      {celebrate ? (
        <span className="fc-confetti" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} style={{ '--a': `${i * 30}deg`, '--d': `${70 + (i % 3) * 22}px`, animationDelay: `${0.25 + (i % 4) * 0.05}s` }} />
          ))}
        </span>
      ) : null}
      {cp.mode === 'newCycle' || cp.mode === 'restart' ? <div className="fc-label fc-label--new" style={{ marginTop: 10 }}>NUOVO GIRO · {n}/{cp.required}</div> : null}
      {cp.mode === 'reward' ? <div className="fc-label fc-label--done" style={{ marginTop: 10 }}>OBIETTIVO COMPLETATO · {n}/{cp.required}</div> : null}
      <div className="fc-visits" aria-label={`${n} ${n === 1 ? 'visita' : 'visite'} su ${cp.required}`}>
        <div className="fc-visits-n" aria-hidden="true">{n}</div>
        <div className="fc-visits-lbl" aria-hidden="true">{n === 1 ? 'visita' : 'visite'}<br />su {cp.required}</div>
      </div>
      <StampRow state={state} />
      {box}
    </div>
  );
}

// Card tessera autosufficiente (avvolta in .fc-scope). `sm` = versione compatta per menu/carrello/stato ordine.
export default function StampCard({ state, sm = false, onOpen = null, title = null }) {
  if (!state) return null;
  const cp = cardView(state);
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
