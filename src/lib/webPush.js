// Web Push — helpers puri (F6 Phase 1, 2026-09-24).
// Nessun VAPID production qui: se VITE_WEB_PUSH_VAPID_PUBLIC_KEY manca (sempre vero finché la
// Fase 2 non la configura), il feature resta 'not-configured' e invisibile al cliente — invariato
// per gli ambienti attuali. Vedi ai-ops/reports/kitchen-f6-webpush-audit-20260924.md.

// Optional chaining su import.meta.env: sotto Vite è l'oggetto env reale, sotto plain Node
// (node --test di questo modulo per i test statici) import.meta.env non esiste — deve restare ''
// senza esplodere, non solo sotto Vite.
export const VAPID_PUBLIC_KEY = import.meta.env?.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '';

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

export function hasVapidPublicKey() {
  return Boolean(VAPID_PUBLIC_KEY);
}

// Stato iniziale derivato da tre segnali indipendenti — funzione pura, testabile senza DOM/browser.
export function resolvePushStatus({ supported, hasVapidKey, permission }) {
  if (!supported) return 'unsupported';
  if (!hasVapidKey) return 'not-configured';
  if (permission === 'denied') return 'denied';
  return 'idle';
}

// applicationServerKey vuole un Uint8Array, PushManager.subscribe non accetta la stringa raw.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Estrae solo i campi che kitchen_push_subscriptions accetta (RLS/insert coerenti con la
// migration 20260924120000): mai passare l'oggetto PushSubscription così com'è a Supabase.
export function subscriptionToRow(subscription) {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth_key: json.keys?.auth,
  };
}
