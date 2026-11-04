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
import { FOOD_CLUB_PUSH_TEXT_VERSION } from '../lib/foodClubConfig';

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
  //
  // FOOD CLUB V1 (A10/A11 della spec PWA): a ogni apertura e dopo ogni cambio di utente (iscrizione col
  // numero, accesso da altro dispositivo, PWA iPhone) la subscription già concessa viene riassociata
  // all'uid corrente con la stessa RPC claim, che aggiorna anche last_seen_at (la retention 180 gg non
  // cancella più la push di chi usa l'app). Solo se esiste già una sessione: mai creare un anonimo qui.
  useEffect(() => {
    if (!isPushSupported()) return undefined;
    let cancelled = false;
    let lastUid = null;
    const reclaim = async (session) => {
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!subscription || cancelled) return;
        setStatus('subscribed');
        const uid = session?.user?.id ?? null;
        if (!uid || uid === lastUid) return;
        lastUid = uid;
        const row = subscriptionToRow(subscription);
        await supabase.rpc('kitchen_push_subscription_claim', {
          p_venue_id: 'walrus-main',
          p_endpoint: row.endpoint,
          p_p256dh: row.p256dh,
          p_auth_key: row.auth_key,
          p_user_agent: navigator.userAgent,
        });
      } catch {
        // nessuna subscription rilevabile o rete assente: lo stato iniziale resta valido
      }
    };
    supabase.auth.getSession().then(({ data }) => reclaim(data?.session ?? null), () => reclaim(null));
    const authSub = supabase.auth.onAuthStateChange?.((event, session) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') reclaim(session);
    });
    return () => {
      cancelled = true;
      authSub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  // `scope: 'club'` (FOOD CLUB V1): il tocco su ATTIVA NOTIFICHE della card Club registra la subscription
  // con consenso agli avvisi tessera/premi (food_club_push_subscribe). Senza scope: comportamento storico.
  const activate = useCallback(async ({ scope = null } = {}) => {
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
      if (scope === 'club') {
        const { error: clubError } = await supabase.rpc('food_club_push_subscribe', {
          p_venue_id: 'walrus-main',
          p_endpoint: row.endpoint,
          p_p256dh: row.p256dh,
          p_auth_key: row.auth_key,
          p_user_agent: navigator.userAgent,
          p_scope: 'club',
          p_text_version: FOOD_CLUB_PUSH_TEXT_VERSION,
        });
        if (clubError) throw clubError;
      } else {
        const { error: claimError } = await supabase.rpc('kitchen_push_subscription_claim', {
          p_venue_id: 'walrus-main',
          p_endpoint: row.endpoint,
          p_p256dh: row.p256dh,
          p_auth_key: row.auth_key,
          p_user_agent: navigator.userAgent,
        });
        if (claimError) throw claimError;
      }

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
