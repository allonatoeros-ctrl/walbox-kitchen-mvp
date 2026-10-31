import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  VAPID_PUBLIC_KEY,
  hasVapidPublicKey,
  isPushSupported,
  resolvePushStatus,
  subscriptionToRow,
  urlBase64ToUint8Array,
} from '../lib/webPush';

// status: 'unsupported' | 'not-configured' | 'denied' | 'idle' | 'subscribing' | 'subscribed' | 'error'
//
// Fondamenta F6 Phase 1: nessun trigger DB, nessuna Edge Function, nessun invio push reale.
// `activate()` fa solo permission + registrazione SW + subscribe + persistenza della
// subscription su kitchen_push_subscriptions (customer/device, non per ordine — vedi migration
// 20260924120000). Vedi ai-ops/reports/kitchen-f6-webpush-audit-20260924.md.
export function useWebPushSubscription() {
  const [status, setStatus] = useState(() =>
    resolvePushStatus({
      supported: isPushSupported(),
      hasVapidKey: hasVapidPublicKey(),
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
    })
  );
  const [error, setError] = useState(null);
  const permission =
    typeof Notification !== 'undefined' ? Notification.permission : 'default';

  // F6 Notification Decision Gate (2026-09-24): al mount, se il permesso è già concesso, verifica
  // se esiste una subscription attiva e in tal caso segnala 'subscribed' — così un device già
  // iscritto non rivede mai l'overlay dopo un reload. Nessun prompt: getSubscription non chiede
  // permessi (il permesso resta richiesto SOLO dal click sulla CTA primaria, dentro `activate`).
  useEffect(() => {
    if (!isPushSupported()) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (subscription && !cancelled) setStatus('subscribed');
      } catch {
        // nessuna subscription rilevabile: lo stato iniziale resta valido
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activate = useCallback(async () => {
    if (status === 'unsupported' || status === 'not-configured' || status === 'subscribing') return;

    setStatus('subscribing');
    setError(null);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'idle');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError) throw signInError;
        session = data.session;
      }
      if (!session) throw new Error('customer_session_missing');

      // Passa dalla RPC SECURITY DEFINER, mai da un upsert diretto sulla tabella: solo la RPC può
      // riassegnare atomicamente un endpoint stale (vedi migration 20260924120000, OWNERSHIP FIX).
      // auth.uid() è preso server-side dentro la RPC: nessun customer_id passato dal client.
      const row = subscriptionToRow(subscription);
      const { error: claimError } = await supabase.rpc('kitchen_push_subscription_claim', {
        p_venue_id: 'walrus-main',
        p_endpoint: row.endpoint,
        p_p256dh: row.p256dh,
        p_auth_key: row.auth_key,
        p_user_agent: navigator.userAgent,
      });
      if (claimError) throw claimError;

      setStatus('subscribed');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [status]);

  // Disattivazione (GDPR, 2026-10-30): annulla la subscription nel browser e prova a cancellare la
  // propria riga (policy DELETE own-only già esistente, nessuna RPC nuova). Se la cancellazione
  // della riga fallisce (rete/grant) la subscription browser è comunque annullata: nessuna push
  // può più arrivare, la riga orfana verrà ripulita dalla retention. Ritorna true se l'unsubscribe
  // browser è andato a buon fine.
  const deactivate = useCallback(async () => {
    if (!isPushSupported()) return false;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        try {
          await supabase.from('kitchen_push_subscriptions').delete().eq('endpoint', endpoint);
        } catch {
          // riga non cancellata: vedi nota sopra
        }
      }
      setStatus('idle');
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  }, []);

  return { status, error, activate, deactivate, permission };
}
