import { useState } from 'react';
import { useWebPushSubscription } from '../../hooks/useWebPushSubscription';
import {
  isIosNonPwa,
  shouldShowIosInstallGate,
  shouldShowNotificationGate,
} from '../../lib/webPush';
import './NotificationOptIn.css';

// F6 Notification Decision Gate (2026-09-24). Il cliente che atterra su /kitchen/status deve
// accorgersi SEMPRE della possibilità di essere avvisato quando l'ordine è pronto: al primo
// ingresso (nessuna decisione già presa per QUEL ordine) mostriamo un overlay sopra la pagina
// oscurata. Il permesso del browser è richiesto SOLO dal click su "ATTIVA NOTIFICHE" — al mount
// non viene mai chiesto nulla. Se le notifiche sono già attive l'overlay non appare; dopo un
// rifiuto (denied) non c'è nessun loop. La Status page resta la source of truth: qui vivono solo
// la richiesta di consenso e la persistenza locale della scelta "continua senza".
const DISMISS_KEY = 'walbox_kitchen_notification_dismissed_orders';

function readDismissedIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistDismissedId(orderId) {
  try {
    const ids = readDismissedIds();
    if (!ids.includes(orderId)) {
      ids.push(orderId);
      localStorage.setItem(DISMISS_KEY, JSON.stringify(ids));
    }
  } catch {
    // storage non disponibile: l'overlay potrà ricomparire, nessun crash
  }
}

export default function NotificationOptIn({ orderId, orderCode }) {
  const { status, activate, permission } = useWebPushSubscription();
  const [dismissedIds, setDismissedIds] = useState(readDismissedIds);

  const dismissed = Boolean(orderId) && dismissedIds.includes(orderId);

  const handleContinueWithout = () => {
    persistDismissedId(orderId);
    setDismissedIds(readDismissedIds());
  };

  // iOS/Safari non installato come PWA: push non disponibile, ma il cliente deve comunque sapere
  // che può ricevere l'avviso aggiungendo Walbox alla schermata Home. Nessuna richiesta permessi.
  if (status === 'unsupported') {
    if (!shouldShowIosInstallGate({ supported: false, iosNonPwa: isIosNonPwa(), dismissed })) {
      return null;
    }
    return (
      <div
        className="noti-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="noti-gate-title"
        data-testid="notification-gate-ios"
        data-status={status}
      >
        <div className="noti-gate-card">
          <h2 className="noti-gate-title" id="noti-gate-title">🔔 TI AVVISIAMO NOI</h2>
          <p className="noti-gate-body">
            Su iPhone aggiungi Walbox alla schermata Home per ricevere l'avviso quando il tuo
            ordine è pronto.
          </p>
          <button
            type="button"
            className="noti-gate-secondary noti-gate-secondary--solo"
            onClick={handleContinueWithout}
            data-testid="notification-gate-ios-continue"
          >
            CONTINUA
          </button>
        </div>
      </div>
    );
  }

  // Non supportato (browser desktop legacy) o non configurato (VAPID assente): nessuna UI.
  if (status === 'not-configured') return null;

  const showGate = Boolean(orderId) && shouldShowNotificationGate({ status, permission, dismissed });

  return (
    <>
      {showGate && (
        <div
          className="noti-gate"
          role="dialog"
          aria-modal="true"
          aria-labelledby="noti-gate-title"
          data-testid="notification-gate"
          data-status={status}
        >
          <div className="noti-gate-card">
            <h2 className="noti-gate-title" id="noti-gate-title">🔔 TI AVVISIAMO NOI</h2>
            <p className="noti-gate-body">
              Attiva le notifiche e puoi mettere via il telefono.
              <br />
              Ti avvisiamo appena <span className="noti-gate-code">{orderCode || 'il tuo ordine'}</span> è pronto.
            </p>

            {status === 'error' && (
              <p className="noti-gate-error">Non è stato possibile attivare le notifiche. Riprova.</p>
            )}

            <button
              type="button"
              className="noti-gate-primary"
              onClick={activate}
              disabled={status === 'subscribing'}
              data-testid="notification-gate-activate"
            >
              {status === 'subscribing' ? 'ATTIVAZIONE…' : 'ATTIVA NOTIFICHE'}
            </button>

            <button
              type="button"
              className="noti-gate-secondary"
              onClick={handleContinueWithout}
              disabled={status === 'subscribing'}
              data-testid="notification-gate-continue"
            >
              CONTINUA SENZA NOTIFICHE
            </button>
          </div>
        </div>
      )}

      {(status === 'subscribed' || permission === 'granted') && status !== 'denied' && (
        <div className="noti-optin" data-testid="notification-active" data-status={status}>
          <span className="noti-optin-text noti-optin-text--active">🔔 NOTIFICHE ATTIVE</span>
        </div>
      )}

      {(status === 'denied' || permission === 'denied') && status !== 'subscribed' && (
        <div className="noti-optin" data-testid="notification-denied" data-status={status}>
          <span className="noti-optin-text">
            🔕 Notifiche disattivate nel browser. Riattivale dalle impostazioni del sito per essere
            avvisato quando l'ordine è pronto.
          </span>
        </div>
      )}
    </>
  );
}