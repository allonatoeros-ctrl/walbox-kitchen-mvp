import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
  amount_mismatch: 'Importo non allineato all’ordine. Riprova o paga alla cassa.',
  invalid_attempt_status: 'Pagamento già in corso. Attendi qualche secondo e riprova.',
  online_payment_disabled: 'Pagamento al banco — comunica il codice ordine alla cassa.',
};

function friendlySumupError(err) {
  const raw = err?.message || err?.error || String(err ?? '');
  const code = Object.keys(SUMUP_ERROR_MESSAGES).find((c) => raw.includes(c));
  return code ? SUMUP_ERROR_MESSAGES[code] : 'Pagamento con SumUp non disponibile ora. Riprova o paga alla cassa.';
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
    if (!order || order.onlinePaymentDisabled) return;
    setSumup({ state: 'loading', error: null });
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
      }
      if (!session) throw new Error('no_session');

      const { data: attempt, error: attemptError } = await supabase.rpc('kitchen_payment_attempt_start', {
        p_order_id: order.id,
        p_channel: 'app',
        p_provider: 'sumup',
        p_method: 'sumup_online',
        p_amount: order.total,
        p_idempotency_key: getSumupIdempotencyKey(order.id),
      });
      if (attemptError) throw attemptError;

      if (attempt.status === 'failed') {
        setSumup({ state: 'pending', error: null });
        return;
      }

      const res = await fetch('/api/kitchen-sumup-create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: order.id, payment_attempt_id: attempt.id }),
      });
      const body = await res.json();
      if (!res.ok || !body.hosted_checkout_url) throw new Error(body.error || 'checkout_creation_failed');

      setSumup({ state: 'redirecting', error: null });
      window.location.href = body.hosted_checkout_url;
    } catch (err) {
      console.warn('[Walbox] SumUp checkout failed', err);
      setSumup({ state: 'error', error: friendlySumupError(err) });
    }
  };

  const handleChooseOnline = () => {
    choosePayment('online');
    handlePaySumup();
  };

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
    displayStatus,
    choosePayment,
    handlePaySumup,
    handleChooseOnline,
    runReconciliation,
  };
}
