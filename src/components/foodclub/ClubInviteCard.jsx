// WALRUS FOOD CLUB V1 — UNA sola card invito (installazione O notifiche) secondo useInstallState (spec PWA §2-§3).
// Il permesso notifiche si chiede SOLO dentro activate(), cioè solo dal tocco su ATTIVA NOTIFICHE.
// Usare solo nei contesti join / tessera / status / home: mai in menu, sacco, checkout, SumUp, OTP.
import { useState } from 'react';
import { useInstallState } from '../../hooks/useInstallState';
import { useWebPushSubscription } from '../../hooks/useWebPushSubscription';
import { pushCardTitle } from '../../lib/installInvite';
import { foodClubApi } from '../../lib/foodClubApi';
import { spaNavigate } from '../../lib/spaNavigate';
import { ClubCta, PhoneIllustration } from './ClubCta';
import InstallGuideSheet from './InstallGuideSheet';
import './FoodClub.css';

function splitTitle(title) {
  // "NON PERDERTI I TUOI 5 €" -> ultima parte in giallo, come nel prototipo.
  const m = title.match(/^(.*?)(\s+(?:\d+\s*€|TI ASPETTA))$/);
  return m ? [m[1], m[2].trim()] : [title, ''];
}

export default function ClubInviteCard({ context, member, hasVoucher = false, onPushChange = null }) {
  const push = useWebPushSubscription();
  const inst = useInstallState({ context, member, pushStatus: push.status });
  const [guideOpen, setGuideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const { kind, guide } = inst.invite;
  const os = inst.platform?.os;

  const openGuide = () => { inst.openGuide(); setGuideOpen(true); };
  const sheet = <InstallGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} guide={guide ?? os} />;

  const activatePush = async () => {
    setBusy(true);
    setNote(null);
    try {
      await push.activate({ scope: 'club' });
    } finally {
      setBusy(false);
    }
    const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    if (perm === 'granted') {
      foodClubApi.track('push_granted', context, inst.platformLabel);
      onPushChange?.();
    } else if (perm === 'denied') {
      foodClubApi.track('push_denied', context, inst.platformLabel);
    } else {
      setNote('Nessun problema: le attivi quando vuoi da Preferenze.');
    }
  };

  if (kind === 'none') {
    if (member && push.status === 'subscribed') {
      return (
        <div className="fc-scope">
          <div className="fc-on-row" data-testid="fc-push-on">
            <span><span aria-hidden="true">🔔 </span>Notifiche attive su questo telefono</span>
            <button type="button" className="fc-link" onClick={() => spaNavigate('/kitchen/club/preferenze')}>Preferenze</button>
          </div>
        </div>
      );
    }
    return null;
  }

  if (kind === 'installed-hint') {
    return (
      <div className="fc-scope">
        <div className="fc-on-row fc-on-row--muted" data-testid="fc-installed-hint"><span>Già installata? Aprila dall’icona sulla Home.</span></div>
      </div>
    );
  }

  if (kind === 'ios-too-old') {
    return (
      <div className="fc-scope">
        <div className="fc-on-row fc-on-row--muted" data-testid="fc-old-note"><span>Per gli avvisi serve iOS 16.4 o successivo: aggiorna l’iPhone da Impostazioni → Generali → Aggiornamento software.</span></div>
      </div>
    );
  }

  if (kind === 'install-prompt' || kind === 'install-guide' || kind === 'open-in-browser') {
    const inApp = kind === 'open-in-browser';
    const label = kind === 'install-prompt' ? 'INSTALLA WALBOX' : inApp ? 'COME SI FA' : 'COME SI INSTALLA';
    const onCta = kind === 'install-prompt' ? () => { inst.install(); } : openGuide;
    return (
      <div className="fc-scope">
        <div className="fc-card fc-inv" data-testid="fc-install-card">
          <div className="fc-inv-row">
            <PhoneIllustration width={52} />
            <div>
              <div className="fc-label">Walbox · sulla Home</div>
              <div className="fc-card-title" style={{ marginTop: 4 }}>IL WALRUS SEMPRE <em>IN TASCA</em></div>
            </div>
          </div>
          <p className="fc-p">Aggiungi Walbox alla schermata Home. Ordini più velocemente e non perdi i tuoi premi.</p>
          {inApp ? <div className="fc-inv-note"><b>Sei in un browser interno.</b> Da qui non si può installare: ti spieghiamo come aprire il browser.</div> : null}
          <ClubCta title={label} onClick={onCta} />
          <div className="fc-inv-foot"><button type="button" className="fc-link fc-link--muted" onClick={inst.dismissInstall}>Non ora</button></div>
        </div>
        {sheet}
      </div>
    );
  }

  if (kind === 'push') {
    const [t1, t2] = splitTitle(pushCardTitle({ hasVoucher }));
    return (
      <div className="fc-scope">
        <div className="fc-card fc-inv" data-testid="fc-push-card">
          <div className="fc-label">Notifiche · solo la tessera</div>
          <div className="fc-card-title" style={{ marginTop: 4 }}>{t1} {t2 ? <em>{t2}</em> : null}</div>
          <p className="fc-p">Ti avvisiamo quando sblocchi un premio o quando sta per scadere.</p>
          <p className="fc-small" style={{ margin: '6px 0 0' }}>Le promo restano spente: le decidi tu nelle Preferenze.</p>
          <ClubCta title="ATTIVA NOTIFICHE" onClick={activatePush} busy={busy} />
          <div aria-live="polite">{note ? <p className="fc-small" style={{ margin: '8px 0 0' }}>{note}</p> : null}</div>
          <div className="fc-inv-foot"><button type="button" className="fc-link fc-link--muted" onClick={inst.dismissPush}>Non ora</button></div>
        </div>
      </div>
    );
  }

  if (kind === 'push-denied-info') {
    const steps = os === 'android'
      ? [<>tocca il lucchetto (ⓘ) accanto all’indirizzo</>, <>scegli <b>Notifiche</b></>, <>imposta <b>Consenti</b></>]
      : [<>apri <b>Impostazioni</b> del telefono</>, <>tocca <b>Notifiche</b></>, <>scegli <b>Walbox</b> e attiva <b>Consenti notifiche</b></>];
    return (
      <div className="fc-scope">
        <div className="fc-card fc-inv" data-testid="fc-denied-card">
          <div className="fc-label">Notifiche · spente dal telefono</div>
          <div className="fc-card-title" style={{ marginTop: 4 }}>NIENTE AVVISI, <em>PER ORA.</em></div>
          <p className="fc-p">Hai scelto di non riceverle, e va bene. Se cambi idea si fa dal telefono:</p>
          <ol className="fc-inv-steps">{steps.map((s, i) => <li key={i}><b>{i + 1}</b> · {s}</li>)}</ol>
          <p className="fc-small" style={{ margin: '8px 0 0' }}>Non te lo richiediamo più. Lo trovi sempre in Preferenze.</p>
          <ClubCta title="HO CAPITO" onClick={inst.ackPushDenied} />
        </div>
      </div>
    );
  }

  return null;
}
