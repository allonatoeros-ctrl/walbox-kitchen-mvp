import { useWebPushSubscription } from '../../hooks/useWebPushSubscription';
import './NotificationOptIn.css';

// F6 Phase 1 — solo fondamenta: nessun invio push reale ancora (nessun trigger DB, nessuna Edge
// Function). Il bottone attiva permission + subscribe + persistenza della subscription; se
// VITE_WEB_PUSH_VAPID_PUBLIC_KEY non è configurata (sempre vero oggi), il componente non
// renderizza nulla — enhancement opzionale, invisibile finché non è pronto end-to-end.
export default function NotificationOptIn() {
  const { status, activate } = useWebPushSubscription();

  if (status === 'unsupported' || status === 'not-configured') return null;

  return (
    <div className="noti-optin" data-testid="notification-opt-in" data-status={status}>
      {status === 'subscribed' && (
        <span className="noti-optin-text noti-optin-text--active">
          🔔 Notifiche attive su questo dispositivo
        </span>
      )}

      {status === 'denied' && (
        <span className="noti-optin-text">
          🔕 Notifiche disattivate nel browser. Riattivale dalle impostazioni del sito per essere
          avvisato quando l'ordine è pronto.
        </span>
      )}

      {(status === 'idle' || status === 'subscribing' || status === 'error') && (
        <button
          type="button"
          className="noti-optin-btn"
          onClick={activate}
          disabled={status === 'subscribing'}
        >
          {status === 'subscribing' ? 'Attivazione…' : '🔔 Avvisami quando è pronto'}
        </button>
      )}

      {status === 'error' && (
        <span className="noti-optin-text noti-optin-text--error">
          Non è stato possibile attivare le notifiche. Riprova.
        </span>
      )}
    </div>
  );
}
