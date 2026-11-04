// WALRUS FOOD CLUB V1 — pagine cliente (/kitchen/club/*). Router interno sui sottopercorsi.
// Dati solo da useFoodClub (RPC food_club_my_state): niente stato finto, se manca si mostra lo stato vuoto.
// Inviti installazione/notifiche: solo via ClubInviteCard, uno per schermata, mai sui passi numero/OTP.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFoodClub } from '../hooks/useFoodClub';
import { useFoodClubIdentity } from '../hooks/useFoodClubIdentity';
import { useWebPushSubscription } from '../hooks/useWebPushSubscription';
import { foodClubApi } from '../lib/foodClubApi';
import { FOOD_CLUB_BASE_PATH } from '../lib/foodClubConfig';
import {
  availableVouchers, cardProgress, clubErrorMessage, DEFAULT_RULES, effectiveVoucherStatus, formatShortDate,
} from '../lib/foodClubRules';
import { detectPlatform } from '../lib/installInvite';
import { consumeFirstStandaloneOpen, isStandalone } from '../lib/pwaInstall';
import { spaNavigate } from '../lib/spaNavigate';
import ClubTopbar from '../components/foodclub/ClubTopbar';
import { ClubCta, ClubToast, PhoneIllustration } from '../components/foodclub/ClubCta';
import StampCard, { ProgressBlock, Stamp, StampRow } from '../components/foodclub/StampCard';
import VoucherCard from '../components/foodclub/VoucherCard';
import ClubInviteCard from '../components/foodclub/ClubInviteCard';
import InstallGuideSheet from '../components/foodclub/InstallGuideSheet';
import PhoneOtpForm from '../components/foodclub/PhoneOtpForm';
import { stampSummary } from '../components/foodclub/clubText';
import './CustomerKitchenMenu.css';
import '../components/kitchen/CustomerCheckout.css';
import '../components/foodclub/FoodClub.css';

const BASE = FOOD_CLUB_BASE_PATH;
const MENU = '/kitchen';
const PRIVACY = '/kitchen/privacy';

// Prima apertura standalone: letta una sola volta per caricamento (StrictMode chiama due volte gli inizializzatori).
let firstStandaloneCache = null;
function firstStandaloneOnce() {
  if (firstStandaloneCache === null) {
    firstStandaloneCache = consumeFirstStandaloneOpen();
    if (firstStandaloneCache) foodClubApi.track('first_standalone_open', 'club', null);
  }
  return firstStandaloneCache;
}

function rules(state) {
  const c = state?.campaign ?? {};
  return {
    stampMin: Number(c.stamp_min_food) || DEFAULT_RULES.stamp_min_food,
    required: Number(c.stamps_required) || DEFAULT_RULES.stamps_required,
    windowDays: Number(c.window_days) || DEFAULT_RULES.window_days,
    value: Number(c.voucher_value) || DEFAULT_RULES.voucher_value,
    voucherMin: Number(c.voucher_min_food) || DEFAULT_RULES.voucher_min_food,
    validDays: Number(c.voucher_valid_days) || DEFAULT_RULES.voucher_valid_days,
  };
}

function errText(err) {
  return clubErrorMessage(err?.message || err?.code || err);
}

function Page({ title, back = BASE, onBack = null, children }) {
  return (
    <div className="fc-scope kitch-page kitch-page--poster fc-page">
      <ClubTopbar title={title} back={back} onBack={onBack} />
      {children}
    </div>
  );
}

function Head({ kicker, title, sub = null, sm = false, children = null }) {
  return (
    <header className={`kp-head fc-head${sm ? ' fc-head--sm' : ''}`}>
      {kicker ? <div className="kp-kicker">{kicker}</div> : null}
      <h1 className="kp-title">{title}</h1>
      {sub ? <p className="kp-sub">{sub}</p> : null}
      {children}
    </header>
  );
}

function StateMessage({ title, text, ctaTitle, onCta, linkText = null, onLink = null }) {
  return (
    <div className="fc-state" aria-live="polite">
      <b>{title}</b>
      {text ? <p className="fc-small">{text}</p> : null}
      {ctaTitle ? <ClubCta title={ctaTitle} onClick={onCta} /> : null}
      {linkText ? <button type="button" className="fc-link fc-link--muted" onClick={onLink}>{linkText}</button> : null}
    </div>
  );
}

function Progress({ n }) {
  return <div className="fc-progress" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</div>;
}

// ---------------------------------------------------------------------------------------------------------------
// Introduzione (non iscritto)
function ClubIntro({ state }) {
  const r = rules(state);
  useEffect(() => { foodClubApi.track('club_intro_view', 'club', null); }, []);
  return (
    <Page title="Food Club" back={MENU}>
      <Head kicker="Walrus Melegnano · gratis" title={<>FOOD <em>CLUB.</em></>}
        sub={`Entra nella famiglia dei trichechi: ${r.required} visite food, un buono da ${r.value} € sul prossimo panino.`} />
      <div className="fc-card">
        <div className="fc-card-head"><span className="fc-card-title">{r.required} visite = <em>{r.value} €</em></span></div>
        <StampRow state={null} />
        <div className="fc-small" style={{ textAlign: 'center' }}>La tessera parte col tuo primo ordine food.</div>
      </div>
      <ol className="fc-steps">
        <li><span className="fc-step-n" aria-hidden="true">1</span><div><b>Ordina dal QR</b><span>Almeno {r.stampMin} € di food, pagato online o al banco.</span></div></li>
        <li><span className="fc-step-n" aria-hidden="true">2</span><div><b>Torna un’altra sera</b><span>Entro {r.windowDays} giorni dalla prima visita. Conta una visita per serata.</span></div></li>
        <li><span className="fc-step-n" aria-hidden="true">3</span><div><b>{r.value} € sul prossimo ordine</b><span>Lo usi su un ordine Walbox successivo con almeno {r.voucherMin} € di food. Vale {r.validDays} giorni.</span></div></li>
      </ol>
      <div className="fc-cta-row"><ClubCta title="ISCRIVITI AL CLUB" sub="gratis · solo il numero di telefono" onClick={() => spaNavigate(`${BASE}/iscriviti`)} /></div>
      <div className="fc-wrap">
        <button type="button" className="fc-link" onClick={() => spaNavigate(`${BASE}/accedi`)}>Hai già la tessera? Entra col tuo numero</button><br />
        <button type="button" className="fc-link fc-link--muted" onClick={() => spaNavigate(MENU)}>Ordina senza iscriverti</button>
        <p className="fc-small">Valido solo al Walrus di Melegnano e solo sul food ordinato con Walbox. Il timbro vale per gli ordini che fai tu (online o al banco): quelli creati dallo staff in cassa non contano. L’iscrizione è gratuita; l’SMS serve solo per il codice di verifica.</p>
      </div>
    </Page>
  );
}

// Prima apertura dalla Home (PWA) senza tessera su questo dispositivo.
function Bentornato() {
  return (
    <Page title="Walbox" back={MENU}>
      <Head kicker="Prima apertura dalla Home" title={<>BENTORNATO AL <em>WALRUS.</em></>}
        sub="Su questa app la tessera va ritrovata una volta: entra col tuo numero." />
      <div className="fc-card">
        <div className="fc-inv-row">
          <PhoneIllustration width={56} />
          <div>
            <div className="fc-card-title" style={{ fontSize: 30 }}>UNA VOLTA <em>SOLA.</em></div>
            <p className="fc-small" style={{ margin: '6px 0 0' }}>Ordini, timbri e buoni restano salvati: cambia solo l’accesso.</p>
          </div>
        </div>
      </div>
      <div className="fc-cta-row"><ClubCta title="ENTRA COL MIO NUMERO" sub="Hai già la tessera? ti mandiamo un codice via SMS" onClick={() => spaNavigate(`${BASE}/accedi`)} /></div>
      <div className="fc-wrap"><button type="button" className="fc-link fc-link--muted" onClick={() => spaNavigate(MENU)}>Non ho la tessera → menu</button></div>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Iscrizione (join1-3) e accesso (acc1-2): stesso hook identità.
function Consents({ consent, setConsent, marketing, setMarketing, name, setName, withName = true }) {
  return (
    <>
      <label className="fc-check" style={{ marginTop: 10 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-describedby="fc-consent-help" />
        <span className="fc-check-text">
          Accetto il regolamento del Food Club e ho letto l’<a href={PRIVACY} onClick={(e) => { e.preventDefault(); spaNavigate(PRIVACY); }} style={{ color: 'inherit' }}>informativa privacy</a>
          <small id="fc-consent-help">Obbligatorio. Usiamo il numero per la tessera e i buoni.</small>
        </span>
      </label>
      <label className="fc-check">
        <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
        <span className="fc-check-text">
          Voglio ricevere promo e novità del Walrus
          <small>Facoltativo. Solo notifiche nell’app e messaggi qui dentro. Puoi toglierlo quando vuoi.</small>
        </span>
      </label>
      {withName ? (
        <div style={{ marginTop: 8 }}>
          <label className="cx-title" htmlFor="fc-name">COME TI CHIAMIAMO? <span className="fc-muted" style={{ textTransform: 'none' }}>(facoltativo)</span></label>
          <input id="fc-name" className="cx-name-input" style={{ marginTop: 8 }} autoComplete="given-name" maxLength={30}
            placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      ) : null}
    </>
  );
}

function JoinFlow({ club, mode, showToast }) {
  const identity = useFoodClubIdentity();
  const state = club.state;
  const referralEnabled = !!state?.campaign?.referral_enabled;
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [name, setName] = useState('');
  const [referral, setReferral] = useState(() => {
    if (typeof window === 'undefined') return '';
    return (new URLSearchParams(window.location.search).get('invito') || '').trim().toUpperCase().slice(0, 24);
  });
  const [phase, setPhase] = useState('form'); // form | consents (accesso, numero non iscritto) | done
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState(null);

  useEffect(() => { if (mode === 'join') foodClubApi.track('join_start', 'join', null); }, [mode]);

  const doJoin = async () => {
    setJoinBusy(true);
    setJoinError(null);
    try {
      await foodClubApi.join({ marketing, displayName: name.trim() || null, referralCode: referralEnabled ? referral.trim() || null : null });
      await club.refresh();
      setPhase('done');
      window.scrollTo?.(0, 0);
    } catch (err) {
      setJoinError(errText(err));
    } finally {
      setJoinBusy(false);
    }
  };

  const onVerified = async () => {
    const fresh = await club.refresh();
    if (fresh?.member) {
      showToast('Tessera ritrovata ✓');
      spaNavigate(`${BASE}/tessera`, { replace: true });
      return;
    }
    if (mode === 'access') { setPhase('consents'); return; }
    await doJoin();
  };

  const consentCheck = () => (consent ? null : 'Per entrare nel Club serve l’ok al regolamento e all’informativa.');

  // ----- 3 di 3: benvenuto -----
  if (phase === 'done') {
    const displayName = (state?.display_name || name || '').trim();
    const cp = cardProgress(state);
    const r = rules(state);
    const gift = cp.hasWelcome;
    return (
      <Page title="Iscrizione" back={MENU}>
        <Progress n={3} />
        <Head kicker="3 di 3 · fatto" title={displayName ? <>CI SEI, <em>{displayName.toUpperCase()}.</em></> : <>CI <em>SEI.</em></>} sub="Sei nel Walrus Food Club. 🦭" />
        {gift ? (
          <div className="fc-card fc-card--ok">
            <div className="fc-label">Il regalo dell’invito</div>
            <div className="fc-card-head" style={{ marginTop: 6 }}><span className="fc-card-title">1 timbro <em>già tuo</em></span></div>
            <StampRow state={state} />
            <p className="fc-small" style={{ textAlign: 'center' }}>Il tuo primo ordine food da {r.stampMin} € completa la tessera e sblocca un buono da {r.value} € da usare la volta dopo.</p>
          </div>
        ) : (
          <div className="fc-card">
            <div className="fc-card-head"><span className="fc-card-title">La tua <em>tessera</em></span></div>
            <StampRow state={state} />
            <p className="fc-small" style={{ textAlign: 'center' }}>{stampSummary(state)}</p>
          </div>
        )}
        <div className="fc-cta-row">
          {gift
            ? <ClubCta title="ORDINA ORA" sub="il tuo primo ordine completa la tessera" onClick={() => spaNavigate(MENU)} />
            : <ClubCta title="VAI ALLA TESSERA" onClick={() => spaNavigate(`${BASE}/tessera`)} />}
        </div>
        <div className="fc-wrap">
          <button type="button" className="fc-link" onClick={() => spaNavigate(gift ? `${BASE}/tessera` : MENU)}>{gift ? 'Vedi la tessera' : 'Torna al menu'}</button>
        </div>
        <ClubInviteCard context="join" member hasVoucher={false} onPushChange={club.refresh} />
      </Page>
    );
  }

  // ----- accesso: numero verificato ma non iscritto -> proposta d'iscrizione con i consensi -----
  if (phase === 'consents') {
    return (
      <Page title="Iscrizione" back={BASE}>
        <Head sm kicker="Numero verificato ✓" title={<>NON SEI ANCORA <em>NEL CLUB</em></>}
          sub="Questo numero non ha una tessera. Vuoi iscriverti adesso? È gratis." />
        <div className="cx-block" style={{ paddingTop: 10 }}>
          <Consents consent={consent} setConsent={setConsent} marketing={marketing} setMarketing={setMarketing} name={name} setName={setName} />
          <div aria-live="polite">{joinError ? <div className="fc-error" role="alert">{joinError}</div> : null}</div>
        </div>
        <div className="fc-cta-row">
          <ClubCta title="ENTRA NEL CLUB" sub="gratis" busy={joinBusy}
            onClick={() => { const e = consentCheck(); if (e) setJoinError(e); else doJoin(); }} />
        </div>
        <div className="fc-wrap"><button type="button" className="fc-link fc-link--muted" onClick={() => spaNavigate(MENU)}>No grazie, torna al menu</button></div>
      </Page>
    );
  }

  // Già iscritto su questo telefono: niente nuova iscrizione.
  if (club.member && phase === 'form' && identity.step === 'phone') {
    return (
      <Page title="Food Club" back={BASE}>
        <StateMessage title="Sei già nel Club" text="La tua tessera è su questo telefono."
          ctaTitle="VAI ALLA TESSERA" onCta={() => spaNavigate(`${BASE}/tessera`)} />
      </Page>
    );
  }
  // Accesso: codice verificato, sto controllando la tessera.
  if (identity.step === 'done' && mode === 'access') {
    return <Page title="Accesso" back={BASE}><div className="fc-loading" aria-live="polite">Cerco la tua tessera…</div></Page>;
  }

  const isCode = identity.step === 'code';
  const isJoin = mode === 'join';
  const back = isCode ? null : BASE;
  const onBack = isCode ? identity.reset : null;

  // Verifica riuscita ma iscrizione fallita: si riprova senza rifare l'SMS.
  if (identity.step === 'done' && isJoin) {
    return (
      <Page title="Iscrizione" back={BASE}>
        <Progress n={2} />
        <Head sm kicker="Numero verificato ✓" title={<>QUASI <em>FATTO</em></>} sub="Manca solo l’ultimo passo." />
        <div className="fc-section" aria-live="polite">
          {joinError ? <div className="fc-error" role="alert">{joinError}</div> : <p className="fc-small">Sto creando la tua tessera…</p>}
        </div>
        <div className="fc-cta-row"><ClubCta title="RIPROVA" busy={joinBusy} onClick={doJoin} /></div>
      </Page>
    );
  }

  return (
    <Page title={isJoin ? 'Iscrizione' : 'Accesso'} back={back} onBack={onBack}>
      {isJoin ? <Progress n={isCode ? 2 : 1} /> : null}
      {isCode ? (
        <Head sm kicker={isJoin ? '2 di 3' : 'Accesso · codice'} title={<>IL <em>CODICE</em></>} sub="Sono 6 cifre, arrivano in pochi secondi." />
      ) : isJoin ? (
        <Head sm kicker="1 di 3" title={<>IL TUO <em>NUMERO</em></>} sub="Ti mandiamo un codice via SMS. Niente password, niente app da scaricare." />
      ) : (
        <Head sm kicker="Accesso · non è una nuova iscrizione" title={<>IL TUO <em>NUMERO</em></>} sub="Lo stesso con cui hai fatto la tessera. Ti mandiamo un codice via SMS." />
      )}
      {isJoin && !isCode && referralEnabled && referral ? (
        <div className="fc-card fc-card--ok fc-ref">
          <div className="fc-ref-row">
            <Stamp kind="gift" sm />
            <div>
              <div className="fc-card-title" style={{ fontSize: 26 }}>Hai un <em>invito</em></div>
              <div className="fc-small">{state?.campaign?.welcome_stamp_enabled
                ? 'Se l’invito è valido, trovi un timbro di benvenuto sulla tessera appena finisci l’iscrizione.'
                : 'Lo applichiamo appena finisci l’iscrizione.'}</div>
            </div>
          </div>
        </div>
      ) : null}
      <PhoneOtpForm
        identity={identity}
        onVerified={onVerified}
        beforeSend={isJoin ? consentCheck : null}
        verifyLabel={isJoin ? 'VERIFICA' : 'ENTRA'}
      >
        {isJoin ? (
          <>
            <Consents consent={consent} setConsent={setConsent} marketing={marketing} setMarketing={setMarketing} name={name} setName={setName} />
            {referralEnabled ? (
              <div style={{ marginTop: 12 }}>
                <label className="cx-title" htmlFor="fc-ref">CODICE INVITO <span className="fc-muted" style={{ textTransform: 'none' }}>(se ce l’hai)</span></label>
                <input id="fc-ref" className="cx-name-input fc-ref-input" autoCapitalize="characters" autoComplete="off" maxLength={24}
                  value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} />
              </div>
            ) : null}
          </>
        ) : null}
      </PhoneOtpForm>
      {!isCode ? (
        <div className="fc-wrap">
          {isJoin
            ? <button type="button" className="fc-link" onClick={() => spaNavigate(`${BASE}/accedi`)}>Hai già la tessera? Entra col tuo numero</button>
            : null}
          <br />
          <button type="button" className="fc-link fc-link--muted" onClick={() => spaNavigate(MENU)}>{isJoin ? 'Puoi ordinare anche senza' : 'Non ho la tessera → vai al menu'}</button>
        </div>
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Home iscritto
function ClubHome({ club }) {
  const state = club.state;
  const v = [...availableVouchers(state)].sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0] ?? null;
  const name = (state?.display_name || '').trim();
  const r = rules(state);
  const unread = Number(state?.unread_messages) || 0;
  const pushOn = useWebPushSubscription().status === 'subscribed';
  const prefs = state?.prefs ?? {};
  return (
    <Page title="Food Club" back={MENU}>
      <Head kicker="Walrus Food Club" title={name ? <>CIAO, <em>{name.toUpperCase()}.</em></> : <>IL TUO <em>CLUB.</em></>} />
      {v ? <VoucherCard voucher={v} withCta /> : null}
      <StampCard state={state} sm title={<>La tua <em>tessera</em></>} onOpen={() => spaNavigate(`${BASE}/tessera`)} />
      <div className="fc-list">
        <button type="button" className="fc-btn-line" onClick={() => spaNavigate(`${BASE}/buoni`)}>
          <span>I miei buoni<small>{(state?.vouchers ?? []).length} in tutto</small></span><span className="fc-strip-arrow" aria-hidden="true">→</span>
        </button>
        {state?.campaign?.referral_enabled ? (
          <button type="button" className="fc-btn-line" onClick={() => spaNavigate(`${BASE}/amici`)}>
            <span>Porta un amico<small>{r.value} € a te quando ordina{state?.campaign?.welcome_stamp_enabled ? ', un timbro in regalo a lui' : ''}</small></span><span className="fc-strip-arrow" aria-hidden="true">→</span>
          </button>
        ) : null}
        <button type="button" className="fc-btn-line" onClick={() => spaNavigate(`${BASE}/messaggi`)}>
          <span>Messaggi<small>{unread > 0 ? `${unread} da leggere` : 'tutto letto'}</small></span><span className="fc-strip-arrow" aria-hidden="true">→</span>
        </button>
        <button type="button" className="fc-btn-line" onClick={() => spaNavigate(`${BASE}/preferenze`)}>
          <span>Notifiche e privacy<small>{pushOn ? 'notifiche attive' : 'notifiche spente'} · promo {prefs.marketing ? 'sì' : 'no'}</small></span><span className="fc-strip-arrow" aria-hidden="true">→</span>
        </button>
      </div>
      <div className="fc-cta-row"><ClubCta title="ORDINA ORA" onClick={() => spaNavigate(MENU)} /></div>
      <ClubInviteCard context="home" member hasVoucher={!!v} onPushChange={club.refresh} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Tessera
function HowItWorks({ state }) {
  const r = rules(state);
  return (
    <details className="fc-how">
      <summary className="fc-label">Come funziona</summary>
      <p className="fc-p">
        · ogni ordine pagato con almeno <b>{r.stampMin} € di food</b> = 1 timbro (le bevande non contano)<br />
        · servono <b>{r.required} serate diverse</b>, entro <b>{r.windowDays} giorni</b> dalla prima visita; la serata finisce alle 06:00<br />
        · {r.required} timbri = <b>buono da {r.value} €</b>, valido {r.validDays} giorni<br />
        · il buono si usa su un ordine Walbox successivo con almeno {r.voucherMin} € di food; uno per ordine, non cumulabile<br />
        · il timbro vale per gli ordini che fai tu su Walbox (online o al banco): quelli creati dallo staff in cassa non contano
      </p>
    </details>
  );
}

function Tessera({ club }) {
  const state = club.state;
  const r = rules(state);
  const v = [...availableVouchers(state)].sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at))[0] ?? null;
  const stamps = [...(state?.card && !state.card.expired ? state.card.stamps ?? [] : [])]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return (
    <Page title="Tessera" back={BASE}>
      <div className="fc-card" style={{ marginTop: 18 }}>
        <div className="fc-label">Walrus Food Club · Melegnano</div>
        <div className="fc-card-head" style={{ marginTop: 6 }}>
          <span className="fc-card-title">{r.required} visite = <em>{r.value} €</em></span>
          {state?.stamped_tonight ? <span className="fc-chip fc-chip--line">STASERA ✓</span> : null}
        </div>
        <ProgressBlock state={state} />
      </div>
      <ClubInviteCard context="tessera" member hasVoucher={!!v} onPushChange={club.refresh} />
      {v ? (
        <div className="fc-list">
          <button type="button" className="fc-btn-line" onClick={() => spaNavigate(`${BASE}/buoni`)}>
            <span>Hai un buono da {r.value} €<small>scade il {formatShortDate(v.expires_at)}</small></span><span className="fc-strip-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
      <div className="fc-section"><div className="fc-label">Le tue visite</div></div>
      {stamps.length ? (
        <div className="fc-rows">
          {stamps.map((s, i) => (s.kind === 'welcome' ? (
            <div className="fc-row" key={i}><span className="fc-row-date" aria-hidden="true">★</span><span className="fc-row-main"><b>Timbro di benvenuto</b><small>regalo d’invito</small></span><span className="fc-row-end fc-ok">✓ timbro</span></div>
          ) : (
            <div className="fc-row" key={i}><span className="fc-row-date">{formatShortDate(s.service_night || s.created_at)}</span><span className="fc-row-main"><b>Visita contata</b><small>ordine food da almeno {r.stampMin} €</small></span><span className="fc-row-end fc-ok">✓ timbro</span></div>
          )))}
        </div>
      ) : (
        <div className="fc-empty">
          <img src="/assets/kitchen/walrus-chef.png" alt="" width="120" height="120" />
          <b>Ancora nessuna visita</b>
          <p className="fc-small">Il primo ordine food da {r.stampMin} € fa timbro.</p>
        </div>
      )}
      <div className="fc-cta-row"><ClubCta title="ORDINA ORA" onClick={() => spaNavigate(MENU)} /></div>
      <HowItWorks state={state} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Buoni
function Buoni({ club }) {
  const state = club.state;
  const r = rules(state);
  const [seg, setSeg] = useState('disp');
  const all = state?.vouchers ?? [];
  const groups = { disp: [], usati: [], scad: [] };
  for (const v of all) {
    const st = effectiveVoucherStatus(v);
    if (st === 'available' || st === 'reserved') groups.disp.push(v);
    else if (st === 'used') groups.usati.push(v);
    else groups.scad.push(v);
  }
  groups.disp.sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
  groups.usati.sort((a, b) => new Date(b.used_at || b.issued_at) - new Date(a.used_at || a.issued_at));
  groups.scad.sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));
  const cp = cardProgress(state);
  const toNext = Math.max(1, cp.required - cp.count);
  const list = groups[seg];
  const segBtn = (k, label) => (
    <button key={k} type="button" className={`cx-where-btn${seg === k ? ' cx-where-btn--on' : ''}`} aria-pressed={seg === k} onClick={() => setSeg(k)}>
      <span className="cx-where-text"><span className="cx-where-title">{label} {groups[k].length}</span></span>
    </button>
  );
  const empty = {
    disp: (
      <div className="fc-empty">
        <img src="/assets/kitchen/walrus-chef.png" alt="" width="120" height="120" />
        <b>Nessun buono, per ora</b>
        <p className="fc-small">Ti {toNext === 1 ? 'manca 1 visita' : `mancano ${toNext} visite`} per il prossimo.</p>
        <button type="button" className="fc-link" onClick={() => spaNavigate(`${BASE}/tessera`)}>Vedi la tessera</button>
      </div>
    ),
    usati: <div className="fc-empty"><b>Ancora niente</b><p className="fc-small">Qui finiscono i buoni che hai già mangiato.</p></div>,
    scad: <div className="fc-empty"><b>Nessun buono scaduto</b><p className="fc-small">Ottimo lavoro.</p></div>,
  }[seg];
  return (
    <Page title="I miei buoni" back={BASE}>
      <div className="fc-seg" role="group" aria-label="Filtra buoni">{segBtn('disp', 'Validi')}{segBtn('usati', 'Usati')}{segBtn('scad', 'Scaduti')}</div>
      {list.length ? list.map((v) => <VoucherCard key={v.id} voucher={v} withCta />) : empty}
      <div className="fc-section">
        <div className="fc-label">Regole d’uso</div>
        <p className="fc-small">Un buono per ordine, non cumulabile, solo su un ordine Walbox con almeno {r.voucherMin} € di food al Walrus di Melegnano. Non è convertibile in denaro e non dà resto. Si usa nel sacco, prima di scegliere come pagare: se l’ordine non viene pagato o viene annullato, il buono torna disponibile.</p>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Porta un amico
function Amici({ club, showToast }) {
  const state = club.state;
  const r = rules(state);
  const code = state?.referral_code || '';
  const enabled = !!state?.campaign?.referral_enabled;
  const link = code && typeof window !== 'undefined' ? `${window.location.origin}${BASE}/iscriviti?invito=${encodeURIComponent(code)}` : '';
  const pending = Number(state?.referrals?.pending) || 0;
  const rewarded = Number(state?.referrals?.rewarded) || 0;

  if (!enabled) {
    return (
      <Page title="Porta un amico" back={BASE}>
        <Head kicker="Food Club · inviti" title={<>PORTA UN AMICO <em>ARRIVA PRESTO.</em></>}
          sub="Stiamo preparando gli inviti per gli amici. Per ora la tessera funziona solo con le tue visite." />
        <div className="fc-cta-row"><ClubCta title="TORNA AL CLUB" onClick={() => spaNavigate(BASE)} /></div>
      </Page>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link copiato ✓');
    } catch {
      showToast('Copia non riuscita: tieni premuto sul link');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Walrus Food Club', text: `Vieni al Walrus: entra nel Food Club col mio invito (${code}).`, url: link });
      } catch { /* annullato dall'utente */ }
    } else {
      copy();
    }
  };

  return (
    <Page title="Porta un amico" back={BASE}>
      <Head kicker="Food Club · inviti" title={<>PORTALO A <em>MANGIARE.</em></>} sub="Invita un amico: ci guadagnate tutti e due." />
      <div className="fc-benefits">
        <div className="fc-benefit"><div className="fc-benefit-n">{r.value} €</div><div><b>A te</b><span>un buono quando l’amico completa il primo ordine food valido da almeno {r.stampMin} €.</span></div></div>
        {state?.campaign?.welcome_stamp_enabled ? (
          <div className="fc-benefit"><div className="fc-benefit-n fc-benefit-n--sm">1 TIMBRO</div><div><b>Al tuo amico</b><span>un timbro di benvenuto già sulla tessera: col primo ordine valido la completa e sblocca un buono da usare la volta dopo.</span></div></div>
        ) : null}
      </div>
      <div className="fc-card">
        <div className="fc-label">Il tuo codice</div>
        {code ? (
          <>
            <div className="fc-code"><div><b>{code}</b><small>{link}</small></div></div>
            <div className="fc-two">
              <ClubCta title="CONDIVIDI" onClick={share} />
              <button type="button" className="fc-btn-ghost" onClick={copy}>COPIA</button>
            </div>
          </>
        ) : (
          <p className="fc-small">Il tuo codice non è ancora pronto. Riprova tra poco.</p>
        )}
      </div>
      <div className="fc-kpis">
        <div className="fc-kpi"><b>{pending}</b><span>in attesa</span></div>
        <div className="fc-kpi"><b>{rewarded}</b><span>hanno ordinato</span></div>
        <div className="fc-kpi"><b>{rewarded * r.value} €</b><span>guadagnati</span></div>
      </div>
      <div className="fc-section">
        <div className="fc-label">Regole</div>
        <p className="fc-small">Vale solo per nuovi iscritti, con telefono verificato: niente auto-inviti e niente numeri già iscritti. Il primo ordine dell’amico deve avere almeno {r.stampMin} € di food, essere pagato e creato da lui su Walbox. Massimo 5 premi da invito ogni 30 giorni. Il buono si usa su un ordine successivo, da almeno {r.voucherMin} € di food.</p>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Preferenze
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  return `${date} alle ${time}`;
}

function Switch({ on, disabled, label, onToggle }) {
  return <button type="button" className="fc-switch" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={onToggle} />;
}

function Preferenze({ club, showToast }) {
  const state = club.state;
  const prefs = state?.prefs ?? {};
  const push = useWebPushSubscription();
  const identity = useFoodClubIdentity();
  const [platform] = useState(() => detectPlatform({
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0,
  }));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [mkCheck, setMkCheck] = useState(false);

  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const denied = perm === 'denied' || push.status === 'denied';
  const subscribed = push.status === 'subscribed';
  const android = platform.os === 'android';
  const iosNotInstalled = platform.os === 'ios' && !isStandalone();
  const pushUnavailable = push.status === 'unsupported' || push.status === 'not-configured';
  const platformLabelStr = `${platform.os}-${platform.inApp ? 'inapp' : platform.browser}`;

  const run = async (key, fn, okMsg = null) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await club.refresh();
      if (okMsg) showToast(okMsg);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(null);
    }
  };

  const activateClub = async () => {
    await push.activate({ scope: 'club' });
    const p = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    if (p === 'granted') {
      foodClubApi.track('push_granted', 'prefs', platformLabelStr);
      return true;
    }
    if (p === 'denied') foodClubApi.track('push_denied', 'prefs', platformLabelStr);
    return false;
  };

  const toggleClub = () => run('club', async () => {
    if (prefs.notif_club && subscribed) {
      await foodClubApi.setPreferences({ notifClub: false });
      return;
    }
    // Accensione: passa sempre da activate({scope:'club'}) (registra la subscription Club su questo telefono).
    const ok = await activateClub();
    if (ok) await foodClubApi.setPreferences({ notifClub: true });
  });

  const togglePromo = () => run('promo', () => foodClubApi.setPreferences({ notifPromo: !prefs.notif_promo }));

  let dev;
  if (platform.os === 'ios' && platform.pushCapableIos === false) {
    dev = { title: 'Non disponibili', text: 'Per gli avvisi serve iOS 16.4 o successivo: aggiorna l’iPhone da Impostazioni → Generali.' };
  } else if (platform.inApp) {
    dev = { title: 'Non disponibili in questo browser', text: 'Apri Walbox nel browser del telefono e aggiungila alla Home.', btn: ['COME SI FA', () => setGuideOpen(true)] };
  } else if (denied) {
    dev = { title: 'Bloccate dal telefono', text: android ? 'Tocca il lucchetto (ⓘ) accanto all’indirizzo → Notifiche → Consenti.' : 'Apri Impostazioni → Notifiche → Walbox e attiva Consenti notifiche.' };
  } else if (iosNotInstalled && pushUnavailable) {
    dev = { title: 'Non ancora attive', text: 'Su iPhone servono Walbox sulla schermata Home.', btn: ['COME SI INSTALLA', () => setGuideOpen(true)] };
  } else if (pushUnavailable) {
    dev = { title: 'Non disponibili', text: 'Questo browser non supporta le notifiche di Walbox.' };
  } else if (subscribed) {
    dev = { title: '🔔 Attive su questo telefono', text: 'Ricevi gli avvisi che hai scelto qui sotto.', btn: ['DISATTIVA SU QUESTO TELEFONO', () => run('dev', push.deactivate, 'Notifiche spente su questo telefono')] };
  } else {
    dev = { title: 'Non ancora attivate', text: 'Si attivano con un tocco: ti chiederemo il permesso.', btn: ['ATTIVA NOTIFICHE', () => run('dev', async () => { if (await activateClub()) await foodClubApi.setPreferences({ notifClub: true }); })] };
  }
  const guide = platform.inApp ? platform.os : `${platform.os}-${platform.browser}`;
  const switchesOff = denied || pushUnavailable || platform.inApp;

  return (
    <Page title="Preferenze" back={BASE}>
      <div className="fc-section">
        <div className="fc-label">Questo telefono</div>
        <div className="fc-dev" data-testid="fc-pref-device">
          <b>{dev.title}</b><small>{dev.text}</small>
          {dev.btn ? <div className="fc-dev-btns"><button type="button" className="fc-btn-ghost" onClick={dev.btn[1]} disabled={!!busy}>{dev.btn[0]}</button></div> : null}
        </div>
        {denied ? <div className="fc-pref-why fc-small">Il telefono blocca le notifiche: finché non le riattivi dalle impostazioni, questi interruttori restano fermi.</div> : null}
      </div>
      <div className="fc-section">
        <div className="fc-label">Cosa vuoi ricevere</div>
        <div className="fc-toggle-row">
          <div><b>Ordini</b><small>“È pronto!”: arriva se hai attivato le notifiche su questo telefono. È un servizio dell’ordine.</small></div>
          <span className="fc-chip fc-chip--line">SERVIZIO</span>
        </div>
        <div className="fc-toggle-row">
          <div><b>Tessera e premi</b><small>Timbro, buono sbloccato, buono in scadenza.</small></div>
          <Switch on={prefs.notif_club && subscribed} label="Avvisi tessera e premi" disabled={switchesOff || !!busy} onToggle={toggleClub} />
        </div>
        <div className="fc-toggle-row">
          <div>
            <b>Promo e novità</b>
            <small>{prefs.marketing
              ? `Consenso dato il ${formatDateTime(prefs.marketing_consent_at)}. Solo notifiche e messaggi dentro Walbox. Niente SMS promozionali.`
              : 'Facoltativo, spento finché non lo scegli tu. Serve il consenso qui sotto.'}</small>
          </div>
          <Switch on={prefs.marketing && prefs.notif_promo} label="Promo e novità" disabled={!prefs.marketing || denied || !!busy} onToggle={togglePromo} />
        </div>
        {!prefs.marketing ? (
          <div style={{ padding: '4px 0 8px', borderBottom: '1px solid var(--poster-line)' }}>
            <label className="fc-check">
              <input type="checkbox" checked={mkCheck} onChange={(e) => setMkCheck(e.target.checked)} />
              <span className="fc-check-text">Voglio ricevere promo e novità del Walrus<small>Solo notifiche nell’app e messaggi qui dentro, mai SMS. Salviamo data e ora del consenso; lo togli quando vuoi.</small></span>
            </label>
            {mkCheck ? (
              <button type="button" className="fc-btn-ghost" style={{ padding: '0 14px', minHeight: 44 }} disabled={!!busy}
                onClick={() => run('mk', () => foodClubApi.setPreferences({ marketing: true }), 'Consenso salvato ✓')}>SALVA CONSENSO</button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="fc-link fc-link--muted" disabled={!!busy}
            onClick={() => run('mk', () => foodClubApi.setPreferences({ marketing: false, notifPromo: false }), 'Consenso promo revocato')}>Revoca il consenso promo</button>
        )}
        <div className="fc-toggle-row">
          <div><b>SMS</b><small>Solo per il codice di accesso. Mai promozioni.</small></div>
          <span className="fc-chip fc-chip--line">SOLO CODICE</span>
        </div>
        <div aria-live="polite">{error ? <div className="fc-error" role="alert">{error}</div> : null}</div>
      </div>
      <div className="fc-section">
        <button type="button" className="fc-link" onClick={() => spaNavigate(`${BASE}/messaggi`)}>I miei messaggi</button><br />
        <button type="button" className="fc-link" onClick={() => spaNavigate(PRIVACY)}>Informativa privacy del Food Club</button><br />
        <button type="button" className="fc-link fc-link--muted" disabled={!!busy}
          onClick={async () => { setBusy('out'); await identity.signOutDevice(push.deactivate); setBusy(null); spaNavigate(MENU); }}>Esci da questo telefono</button><br />
        {!confirmLeave ? (
          <button type="button" className="fc-link fc-link--danger" onClick={() => setConfirmLeave(true)}>Lascia il Club</button>
        ) : (
          <div className="fc-confirm" role="alertdialog" aria-labelledby="fc-leave-t">
            <b id="fc-leave-t" className="fc-deadline-title">Sicuro di lasciare il Club?</b>
            <p className="fc-small" style={{ margin: '6px 0 0' }}>Perdi la tessera e i buoni non usati. Gli ordini restano nei registri contabili come previsto dalla legge.</p>
            <div className="fc-two">
              <button type="button" className="fc-btn-ghost" onClick={() => setConfirmLeave(false)}>ANNULLA</button>
              <button type="button" className="fc-btn-ghost" style={{ color: '#ff8a6b' }} disabled={!!busy}
                onClick={() => run('leave', async () => { await foodClubApi.leave(); setConfirmLeave(false); spaNavigate(BASE); }, 'Sei uscito dal Club')}>LASCIA</button>
            </div>
          </div>
        )}
        <p className="fc-small">“Esci” spegne gli avvisi su questo telefono e chiude l’accesso: la tessera resta tua.</p>
      </div>
      <InstallGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} guide={guide} />
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Messaggi
function Messaggi({ club }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const refreshRef = useRef(club.refresh);
  useEffect(() => { refreshRef.current = club.refresh; }, [club.refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await foodClubApi.messages();
        if (cancelled) return;
        setList(Array.isArray(rows) ? rows : []);
        setError(null);
        const n = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('n') : null;
        if (n) {
          foodClubApi.markMessage(n, 'opened').catch(() => {});
          const msg = (rows || []).find((m) => m.id === n);
          foodClubApi.track('notification_opened', msg?.kind ?? 'club', null);
        }
        if ((rows || []).some((m) => !m.read_at)) {
          await foodClubApi.markMessage(null, 'read').catch(() => {});
          refreshRef.current?.();
        }
      } catch (err) {
        if (!cancelled) setError(errText(err));
      }
    })();
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <Page title="Messaggi" back={BASE}>
      <Head sm kicker="Food Club" title={<>I TUOI <em>MESSAGGI</em></>} />
      {error ? (
        <StateMessage title="Non riesco a caricarli" text={error} ctaTitle="RIPROVA" onCta={() => { setError(null); setAttempt((a) => a + 1); }} />
      ) : list === null ? (
        <div className="fc-loading" aria-live="polite">Un attimo…</div>
      ) : list.length === 0 ? (
        <div className="fc-empty"><b>Nessun messaggio</b><p className="fc-small">Qui trovi timbri, buoni e novità del Club.</p></div>
      ) : (
        <div className="fc-rows">
          {list.map((m) => {
            const internal = typeof m.url === 'string' && m.url.startsWith('/') && m.url !== BASE && m.url !== `${BASE}/messaggi`;
            return (
              <div key={m.id} className={`fc-row${!m.read_at ? ' fc-msg-unread' : ''}`}>
                <span className="fc-row-date">{formatShortDate(m.created_at)}</span>
                <span className="fc-row-main">
                  <b>{m.title}</b>
                  <span className="fc-msg-body">{m.body}</span>
                </span>
                {internal ? <button type="button" className="fc-link" aria-label={`Apri: ${m.title}`} onClick={() => spaNavigate(m.url)}>→</button> : <span />}
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function NeedsMembership() {
  return (
    <Page title="Food Club" back={MENU}>
      <StateMessage title="Serve la tessera" text="Questa pagina è per gli iscritti al Food Club."
        ctaTitle="ISCRIVITI AL CLUB" onCta={() => spaNavigate(`${BASE}/iscriviti`)}
        linkText="Hai già la tessera? Entra col tuo numero" onLink={() => spaNavigate(`${BASE}/accedi`)} />
    </Page>
  );
}

export default function FoodClubPage({ path }) {
  const club = useFoodClub();
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [firstStandalone] = useState(firstStandaloneOnce);

  const showToast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 2700);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const current = path ?? (typeof window !== 'undefined' ? window.location.pathname : BASE);
  const sub = current.startsWith(BASE) ? current.slice(BASE.length).replace(/^\/+|\/+$/g, '') : '';

  let content;
  if (club.loading && !club.state) {
    content = <Page title="Food Club" back={MENU}><div className="fc-loading" aria-live="polite">Un attimo…</div></Page>;
  } else if (club.error) {
    content = (
      <Page title="Food Club" back={MENU}>
        <StateMessage title="Il Club non risponde" text={errText(club.error)} ctaTitle="RIPROVA" onCta={() => club.refresh()}
          linkText="Torna al menu" onLink={() => spaNavigate(MENU)} />
      </Page>
    );
  } else if (!club.available) {
    content = (
      <Page title="Food Club" back={MENU}>
        <StateMessage title="Il Club non è attivo in questo momento" text="Puoi ordinare come sempre: la tessera torna presto."
          ctaTitle="VAI AL MENU" onCta={() => spaNavigate(MENU)} />
      </Page>
    );
  } else if (sub === 'iscriviti' || sub === 'accedi') {
    content = <JoinFlow key={sub} club={club} mode={sub === 'iscriviti' ? 'join' : 'access'} showToast={showToast} />;
  } else if (sub === '') {
    if (club.member) content = <ClubHome club={club} />;
    else if (firstStandalone) content = <Bentornato />;
    else content = <ClubIntro state={club.state} />;
  } else if (!club.member) {
    content = <NeedsMembership />;
  } else if (sub === 'tessera') {
    content = <Tessera club={club} />;
  } else if (sub === 'buoni') {
    content = <Buoni club={club} />;
  } else if (sub === 'amici') {
    content = <Amici club={club} showToast={showToast} />;
  } else if (sub === 'preferenze') {
    content = <Preferenze club={club} showToast={showToast} />;
  } else if (sub === 'messaggi') {
    content = <Messaggi club={club} />;
  } else {
    content = <ClubHome club={club} />;
  }

  return (
    <>
      {content}
      <div className="fc-scope"><ClubToast toast={toast} /></div>
    </>
  );
}
