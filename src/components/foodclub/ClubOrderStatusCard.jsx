// WALRUS FOOD CLUB V1 — card del Club su /kitchen/status, una per ordine.
// Legge lo stato vero dal server (food_club_order_status): buono riservato / usato / rilasciato, timbro sì / no.
// Regole: invisibile se il Club non è disponibile; nessun invito (iscrizione, notifiche) finché l'ordine
// attende il pagamento: lì restano solo informazioni sul buono/timbro in attesa.
import { useEffect, useRef, useState } from 'react';
import { foodClubApi } from '../../lib/foodClubApi';
import { cardProgress, formatEuro, formatShortDate, availableVouchers } from '../../lib/foodClubRules';
import { spaNavigate } from '../../lib/spaNavigate';
import { detectPlatform, installGuideSteps } from '../../lib/installInvite';
import { isStandalone } from '../../lib/pwaInstall';
import './ClubCheckout.css';

const PENDING = new Set(['pending_counter_payment', 'pending_online_payment']);
const CANCELLED = new Set(['cancelled', 'payment_abandoned']);
const INVITE_DISMISS_KEY = 'walbox_fc_status_invite_dismissed';

function euroShort(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `${v} €` : `${v.toFixed(2).replace('.', ',')} €`;
}

function readInviteDismissed() {
  try { return localStorage.getItem(INVITE_DISMISS_KEY) === '1'; } catch { return false; }
}

function Stamps({ count, required }) {
  return (
    <div className="fc-stamps" aria-label={`Tessera: ${count} visite su ${required}`}>
      {Array.from({ length: required }, (_, i) => (
        <span key={i} className={`fc-stamp${i < count ? ' fc-stamp--on' : ''}`} aria-hidden="true">
          {i < count ? '✓' : <>WALRUS<br />FOOD</>}
        </span>
      ))}
    </div>
  );
}

function Head({ kicker, title, em }) {
  return (
    <>
      <div className="fc-label">{kicker}</div>
      <div className="fc-card-title">{title}{em ? <> <em>{em}</em></> : null}</div>
    </>
  );
}

// "Avvisami…": su iPhone non installato la push non esiste: si mostrano i passi per aggiungere Walbox alla Home.
function AlertRow({ unlocked }) {
  const [steps, setSteps] = useState(null);
  const onClick = () => {
    let platform = null;
    try { platform = detectPlatform({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0 }); } catch { platform = null; }
    if (platform?.os === 'ios' && !isStandalone()) {
      setSteps((prev) => (prev ? null : installGuideSteps(platform.inApp ? 'ios' : `ios-${platform.browser}`)));
      return;
    }
    spaNavigate('/kitchen/club/preferenze');
  };
  return (
    <>
      <button type="button" className="fc-btn-line" onClick={onClick} aria-expanded={steps ? true : undefined} data-testid="fc-alert-row">
        <span>
          🔔 {unlocked ? 'Avvisami prima che scada' : 'Avvisami quando sblocco il premio'}
          <small>{steps ? 'Prima aggiungi Walbox alla schermata Home:' : 'Un tocco e scegli tu cosa ricevere'}</small>
        </span>
        <span className="fc-strip-arrow" aria-hidden="true">→</span>
      </button>
      {steps && steps.length > 0 && (
        <ol className="fc-inv-steps" data-testid="fc-install-steps">
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </>
  );
}

export default function ClubOrderStatusCard({ order, club }) {
  const [info, setInfo] = useState(null);
  const [inviteDismissed, setInviteDismissed] = useState(readInviteDismissed);
  const available = Boolean(club?.available);
  const status = order?.status;
  const refresh = club?.refresh;

  useEffect(() => {
    if (!available || !order?.id) return undefined;
    let cancelled = false;
    foodClubApi.orderStatus(order.id)
      .then((data) => { if (!cancelled) setInfo(data?.found ? data : null); })
      .catch(() => { if (!cancelled) setInfo(null); });
    return () => { cancelled = true; };
  }, [available, order?.id, status]);

  // Pagamento confermato o ordine annullato DOPO l'apertura della pagina: tessera e buoni cambiano lato server,
  // si ricarica lo stato Club (al primo render ci pensa già useFoodClub).
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!available || !refresh || prev === status || !PENDING.has(prev) || PENDING.has(status)) return;
    refresh();
  }, [available, status, refresh]);

  if (!available || !info) return null;

  const state = club.state;
  const campaign = state?.campaign ?? {};
  const member = Boolean(info.member);
  const minStamp = Number(campaign.stamp_min_food) || 10;
  const food = Number(info.food_amount) || 0;
  const code = order.orderCode || '';
  const voucher = info.voucher;
  const value = euroShort(voucher?.value ?? campaign.voucher_value ?? 5);
  const goBuoni = () => spaNavigate('/kitchen/club/buoni');

  // ---- Ordine annullato: il buono riservato torna disponibile (il server toglie il legame con l'ordine).
  if (CANCELLED.has(status)) {
    const discount = Number(info.discount_amount ?? order.discountAmount) || 0;
    const released = (voucher && voucher.status === 'available') || (!voucher && discount > 0 && !order.promoCode);
    if (!released) return null;
    return (
      <div className="fc-scope" data-testid="fc-status-card" data-state="released">
        <div className="fc-status-card fc-status-card--neutral">
          <Head kicker="Food Club" title="Niente di perso." />
          <p className="fc-p">Il buono è tornato nel tuo portafoglio: l’ordine #{code} è annullato e il buono da {euroShort(discount || voucher?.value)} è di nuovo disponibile. Il timbro conta solo su un ordine pagato.</p>
          <button type="button" className="fc-cta" onClick={goBuoni}>VEDI I BUONI <span aria-hidden="true">→</span></button>
        </div>
      </div>
    );
  }

  const resv = voucher && (voucher.status === 'reserved' || voucher.status === 'used') ? (
    <div className="fc-resv" data-testid="fc-status-voucher" data-voucher={voucher.status}>
      <span className="fc-chip">{voucher.status === 'used' ? 'UTILIZZATO' : `RISERVATO · #${code}`}</span>
      <div>
        {voucher.status === 'used'
          ? `Buono da ${value} usato su questo ordine.`
          : `Buono applicato all’ordine #${code} — si conferma quando paghi. Resta riservato finché il pagamento non è chiuso del tutto; se l’ordine viene annullato senza alcun pagamento, torna disponibile.`}
      </div>
    </div>
  ) : null;

  // ---- In attesa di pagamento: solo informazioni, nessun invito.
  if (PENDING.has(status)) {
    if (!member) return null;
    const stampSoon = food >= minStamp && !state?.stamped_tonight && !(voucher && campaign.stamp_on_voucher_order === false);
    if (!resv && !stampSoon) return null;
    return (
      <div className="fc-scope" data-testid="fc-status-card" data-state="pending">
        <div className="fc-status-card">
          <Head kicker="Food Club" title={stampSoon ? 'Timbro in attesa' : 'Buono riservato'} />
          {stampSoon && <p className="fc-p">Il timbro arriva quando il pagamento è confermato.</p>}
          {resv}
        </div>
      </div>
    );
  }

  // ---- Pagato (ricevuto / in preparazione / pronto).
  if (!member) {
    if (!campaign.active || food < minStamp || inviteDismissed) return null;
    const required = Number(campaign.stamps_required) || 2;
    return (
      <div className="fc-scope" data-testid="fc-status-card" data-state="invite">
        <div className="fc-status-card">
          <Head kicker="Walrus Food Club · gratis" title="Il prossimo" em="può fare timbro." />
          <p className="fc-p">{required} visite food in 30 giorni = {euroShort(campaign.voucher_value ?? 5)} sul prossimo ordine. Ti serve solo il numero di telefono.</p>
          <button type="button" className="fc-cta" onClick={() => spaNavigate('/kitchen/club')}>ENTRA NEL CLUB <span aria-hidden="true">→</span></button>
          <button
            type="button"
            className="fc-link"
            onClick={() => { try { localStorage.setItem(INVITE_DISMISS_KEY, '1'); } catch { /* solo per questa pagina */ } setInviteDismissed(true); }}
          >
            Non ora
          </button>
        </div>
      </div>
    );
  }

  const progress = cardProgress(state);
  const stamp = info.stamp;
  if (stamp && !stamp.revoked) {
    const freshVoucher = progress.count === 0 ? availableVouchers(state)[0] : null;
    if (freshVoucher) {
      return (
        <div className="fc-scope" data-testid="fc-status-card" data-state="unlocked">
          <div className="fc-status-card fc-status-card--ok">
            <Head kicker="Food Club · tessera completata" title={`Buono da ${euroShort(freshVoucher.value)}`} em="sbloccato!" />
            <p className="fc-p">Lo usi su un ordine successivo (non su questo) con almeno {euroShort(freshVoucher.min_food ?? 12)} di food, entro il <b>{formatShortDate(freshVoucher.expires_at)}</b>.</p>
            <button type="button" className="fc-cta" onClick={goBuoni}>VEDI IL BUONO <span aria-hidden="true">→</span></button>
            <AlertRow unlocked />
            {resv}
          </div>
        </div>
      );
    }
    return (
      <div className="fc-scope" data-testid="fc-status-card" data-state="stamped">
        <div className="fc-status-card fc-status-card--ok">
          <Head kicker="Food Club" title="+1 timbro" em="sulla tessera." />
          <p className="fc-p">
            Visita contata.{progress.expiresAt ? <> Torna un’altra sera entro il <b>{formatShortDate(progress.expiresAt)}</b>: la tessera completa sblocca il buono da {euroShort(campaign.voucher_value ?? 5)}.</> : null}
          </p>
          <Stamps count={progress.count} required={progress.required} />
          <AlertRow />
          {resv}
        </div>
      </div>
    );
  }

  let reason = null;
  if (stamp?.revoked) reason = ['Timbro', 'annullato.', 'Il timbro di questo ordine è stato tolto (ordine rimborsato o annullato).'];
  else if (food < minStamp) reason = ['Niente timbro', 'stavolta.', `Food di questo ordine: ${formatEuro(food)}. Per il timbro servono almeno ${euroShort(minStamp)} di food: le bevande non contano.`];
  else if (voucher && campaign.stamp_on_voucher_order === false) reason = ['Ordine con buono:', 'niente timbro.', 'Gli ordini pagati con il buono non fanno timbro.'];
  else if (state?.stamped_tonight) reason = ['Timbro di stasera', 'già preso.', 'Conta una visita per serata: il prossimo timbro arriva da un’altra sera.'];

  if (!reason && !resv) return null;
  return (
    <div className="fc-scope" data-testid="fc-status-card" data-state="no-stamp">
      <div className="fc-status-card fc-status-card--neutral">
        <Head kicker="Food Club" title={reason ? reason[0] : 'Buono'} em={reason ? reason[1] : null} />
        {reason && <p className="fc-p">{reason[2]}</p>}
        {resv}
        {voucher?.status === 'used' && <AlertRow />}
      </div>
    </div>
  );
}
