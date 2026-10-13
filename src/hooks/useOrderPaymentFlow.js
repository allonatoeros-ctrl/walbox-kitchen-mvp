import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { reloadIfStale } from '../lib/appVersion';
import {
  STATUS_POP,
  STATUS_PA,
  PAYMENT_ABANDONED_MESSAGE,
  getOnlineWindow,
  switchErrorMessage,
} from '../lib/kitchenOnlineLane';

// Reused across retries for the same order so a re-click before checkout completes doesn't spawn
// a fresh idempotency key every time (server-side RPC idempotency keys off this same value).
function getSumupIdempotencyKey(orderId) {
  const key = `walbox_sumup_idem_${orderId}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return crypto.randomUUID();
  }
}

const SUMUP_ERROR_MESSAGES = {
  not_order_owner: 'Sessione ordine non riconosciuta su questo dispositivo. Paga alla cassa.',
  order_already_paid: 'Questo ordine risulta già pagato.',
  order_cancelled: 'Questo ordine è stato annullato.',
  amount_mismatch_live_attempt: 'Importo del pagamento non più allineato all’ordine. Paga alla cassa.',
  amount_mismatch: 'Importo non allineato all’ordine. Riprova o paga alla cassa.',
  invalid_attempt_status: 'Pagamento già in corso. Attendi qualche secondo e riprova.',
  online_payment_disabled: 'Pagamento al banco — comunica il codice ordine alla cassa.',
  // Client vecchio (scheda aperta prima di un deploy) contro API nuova: basta ricaricare.
  missing_session: 'App aggiornata: ricarica la pagina e riprova.',
  invalid_session: 'App aggiornata: ricarica la pagina e riprova.',
  // S5: finestra online chiusa (attempt_start / create-checkout rispondono con questi codici).
  online_payment_expired: 'Il tempo per pagare online è finito. Puoi pagare al banco.',
  order_payment_abandoned: PAYMENT_ABANDONED_MESSAGE,
};

function friendlySumupError(err) {
  const raw = err?.message || err?.error || String(err ?? '');
  const code = Object.keys(SUMUP_ERROR_MESSAGES).find((c) => raw.includes(c));
  return code ? SUMUP_ERROR_MESSAGES[code] : 'Pagamento con SumUp non disponibile ora. Riprova o paga alla cassa.';
}

/**
 * Avvio pagamento SumUp per un ordine (usata da `handlePaySumup` e dal menu cliente, S5 — una sola
 * implementazione): I-6 reloadIfStale, sessione anonima, `kitchen_payment_attempt_start` con
 * l'importo passato, create-checkout. Non fa il redirect: ritorna
 *  - { kind: 'reloading' } la scheda è vecchia e si sta ricaricando
 *  - { kind: 'pending' } l'attempt è già `failed` lato server
 *  - { kind: 'redirect', url } hosted checkout da aprire
 * e lancia in caso di errore (da mappare con `friendlySumupError`).
 * `amount` deve essere il totale ATTUALE dell'ordine (dopo l'eventuale promo).
 */
export async function startSumupCheckout(orderId, amount) {
  // I-6: se la scheda esegue una versione vecchia, ricarica prima di pagare (max 1 volta per versione).
  if (await reloadIfStale()) return { kind: 'reloading' };
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }
  if (!session) throw new Error('no_session');

  const { data: attempt, error: attemptError } = await supabase.rpc('kitchen_payment_attempt_start', {
    p_order_id: orderId,
    p_channel: 'app',
    p_provider: 'sumup',
    p_method: 'sumup_online',
    p_amount: amount,
    p_idempotency_key: getSumupIdempotencyKey(orderId),
  });
  if (attemptError) throw attemptError;

  if (attempt.status === 'failed') return { kind: 'pending' };

  const res = await fetch('/api/kitchen-sumup-create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ order_id: orderId, payment_attempt_id: attempt.id }),
  });
  const body = await res.json();
  if (!res.ok || !body.hosted_checkout_url) throw new Error(body.error || 'checkout_creation_failed');
  return { kind: 'redirect', url: body.hosted_checkout_url };
}

// AC1 (bivio pagamento): la scelta cassa/online deve sopravvivere al refresh della sessione ed è
// indipendente per ordine — chiave per orderId, mai uno stato condiviso fra ordini diversi (AC7).
const PAYMENT_CHOICE_KEY_PREFIX = 'walbox_kitchen_payment_choice_';

function getStoredPaymentChoice(orderId) {
  if (!orderId) return null;
  try {
    return localStorage.getItem(PAYMENT_CHOICE_KEY_PREFIX + orderId);
  } catch {
    return null;
  }
}

function storePaymentChoice(orderId, choice) {
  if (!orderId) return;
  try {
    localStorage.setItem(PAYMENT_CHOICE_KEY_PREFIX + orderId, choice);
  } catch {
    // best-effort: niente storage disponibile, il bivio ricomparirà al prossimo render
  }
}

// S5: chi sceglie AL BANCO nel menu ha già risposto a "come vuoi pagare?": si registra la stessa
// scelta che farebbe il bivio, così /kitchen/status mostra subito il codice per la cassa e non
// ripropone il bivio. (La v2 crea il PCP con online_payment_disabled=false, quindi questa scelta
// locale è l'unico segnale per il bivio.)
export function rememberCounterPaymentChoice(orderId) {
  storePaymentChoice(orderId, 'counter');
}

/**
 * Logica di pagamento condivisa (AC1 bivio, AC3 recovery SumUp), estratta da
 * `CustomerOrderPanel` (follow-up UX 2026-09-18) perché ora la consumano due superfici:
 * la pagina pagamento dedicata (`CustomerOrderPayment`) e il riquadro ordine su
 * `/kitchen/status` (fallback per chi torna lì senza aver completato la scelta). Un solo
 * posto dove vive lo stato SumUp/scelta pagamento evita che le due superfici divergano.
 * `isReturnTarget` è l'unico segnale che questo ordine è quello a cui appartiene un
 * eventuale `?sumup=return`: solo quando è true lancia la reconciliation automatica al mount.
 */
export function useOrderPaymentFlow(order, isReturnTarget) {
  const [sumup, setSumup] = useState(() => ({ state: isReturnTarget ? 'verifying' : 'idle', error: null }));
  const [, setChoiceVersion] = useState(0);

  const orderId = order?.id ?? null;
  const paymentChoice = getStoredPaymentChoice(orderId);

  const choosePayment = (choice) => {
    storePaymentChoice(orderId, choice);
    setChoiceVersion((v) => v + 1);
  };

  // AC4: un ordine chiuso non arriva mai qui lato container, ma il guard resta per sicurezza —
  // mai trattare pending_counter_payment stale come bivio pagabile.
  const isClosedStatus = order ? (order.status === 'cancelled' || order.status === 'delivered') : false;
  const isPendingPayment = order && !isClosedStatus
    ? (order.status === 'pending_counter_payment' || order.paymentStatus === 'pending_counter_payment')
    : false;
  const displayStatus = order ? (isPendingPayment ? 'pending_counter_payment' : order.status) : null;

  // BUG A fix: online_payment_disabled è la fonte di verità server-side (kitchen_orders, impostata
  // atomicamente da kitchen_payment_attempt_close_unpaid quando lo staff esegue "PASSA AL BANCO").
  // Quando è true il bivio cliente è forzato su 'counter', indipendentemente da cosa dice ancora
  // walbox_kitchen_payment_choice_<orderId> in localStorage su questo o un altro device — nessuna
  // CTA PAGA ONLINE viene più mostrata per questo ordine (vedi OrderPaymentActions).
  const onlinePaymentDisabled = !!(order && order.onlinePaymentDisabled);
  const effectiveChoice = onlinePaymentDisabled
    ? 'counter'
    : (paymentChoice || (sumup.state !== 'idle' ? 'online' : null));
  const showCashFallback = effectiveChoice === 'counter'
    || (effectiveChoice === 'online' && ['error', 'pending', 'unknown'].includes(sumup.state));

  const handlePaySumup = async () => {
    if (!order || order.onlinePaymentDisabled || order.status === STATUS_PA) return;
    setSumup({ state: 'loading', error: null });
    try {
      const result = await startSumupCheckout(order.id, order.total);
      if (result.kind === 'reloading') return;
      if (result.kind === 'pending') {
        setSumup({ state: 'pending', error: null });
        return;
      }
      setSumup({ state: 'redirecting', error: null });
      window.location.href = result.url;
    } catch (err) {
      console.warn('[Walbox] SumUp checkout failed', err);
      setSumup({ state: 'error', error: friendlySumupError(err) });
    }
  };

  // S5 — corsia online. Un ordine POP non ha bivio: pagamento in corso, tempo rimasto, RIPROVA
  // (solo in finestra `active`) e PAGA AL BANCO (endpoint S4, vale finché il server vede POP).
  const isPendingOnline = !!order && order.status === STATUS_POP;
  const isAbandoned = !!order && order.status === STATUS_PA;
  const hasOnlineTimer = isPendingOnline && getOnlineWindow(order.createdAt, 0).secondsLeft !== null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const onlineWindow = isPendingOnline ? getOnlineWindow(order.createdAt, nowMs) : null;
  const onlinePhase = onlineWindow?.phase ?? null;
  // Tick a 1s solo finché il timer serve: mai per ordini non POP, fermo quando la finestra è chiusa.
  const needsTick = hasOnlineTimer && onlinePhase !== 'closing';
  useEffect(() => {
    if (!needsTick) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [needsTick]);

  const [switchState, setSwitchState] = useState({ state: 'idle', error: null });
  const switchInFlightRef = useRef(false);
  const handleSwitchToCounter = async () => {
    if (!order || switchInFlightRef.current) return;
    switchInFlightRef.current = true;
    setSwitchState({ state: 'loading', error: null });
    try {
      // Solo la sessione già esistente: crearne una anonima nuova non sarebbe la proprietaria
      // dell'ordine (403 not_order_owner).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSwitchState({ state: 'error', error: switchErrorMessage({ error: 'missing_session' }) });
        return;
      }
      const res = await fetch('/api/kitchen-customer-switch-to-counter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.outcome === 'switched_to_counter') {
        setSwitchState({ state: 'done', error: null });
      } else {
        setSwitchState({ state: 'error', error: switchErrorMessage(body) });
      }
    } catch (err) {
      console.warn('[Walbox] switch to counter failed', err);
      setSwitchState({ state: 'error', error: switchErrorMessage(err) });
    } finally {
      switchInFlightRef.current = false;
    }
  };

  const handleChooseOnline = () => {
    choosePayment('online');
    handlePaySumup();
  };

  // I-6: al ritorno in primo piano controlla se esiste una versione nuova (la carta e la scelta di
  // pagamento sono in localStorage: il reload non perde nulla).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadIfStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const reconcileInFlightRef = useRef(false);
  const autoReconcileDoneRef = useRef(false);

  const runReconciliation = async () => {
    if (!order || reconcileInFlightRef.current) return;
    reconcileInFlightRef.current = true;
    setSumup({ state: 'verifying', error: null });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSumup({ state: 'unknown', error: null });
        return;
      }
      const res = await fetch('/api/kitchen-sumup-reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSumup({ state: 'unknown', error: null });
        return;
      }
      if (body.outcome === 'confirmed' || body.outcome === 'already_paid') {
        setSumup({ state: 'confirmed', error: null });
      } else if (body.outcome === 'failed') {
        setSumup({ state: 'error', error: 'Il pagamento non è andato a buon fine. Riprova o paga alla cassa.' });
      } else if (body.outcome === 'pending') {
        setSumup({ state: 'pending', error: null });
      } else if (body.outcome === 'no_pending_attempt') {
        setSumup({ state: 'idle', error: null });
      } else {
        setSumup({ state: 'unknown', error: null });
      }
    } catch (err) {
      console.warn('[Walbox] SumUp reconciliation failed', err);
      setSumup({ state: 'unknown', error: null });
    } finally {
      reconcileInFlightRef.current = false;
    }
  };

  // AC7 requisito 6: solo l'ordine il cui id combacia con `?orderId=` sul ritorno da SumUp esegue
  // la reconciliation automatica — `isReturnTarget` è deciso una volta sola dal chiamante.
  useEffect(() => {
    if (!order || !isReturnTarget || autoReconcileDoneRef.current) return;
    autoReconcileDoneRef.current = true;
    runReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  return {
    sumup,
    paymentChoice,
    effectiveChoice,
    showCashFallback,
    onlinePaymentDisabled,
    isClosedStatus,
    isPendingPayment,
    isPendingOnline,
    isAbandoned,
    onlineWindow,
    onlinePhase,
    switchState,
    handleSwitchToCounter,
    displayStatus,
    choosePayment,
    handlePaySumup,
    handleChooseOnline,
    runReconciliation,
  };
}
