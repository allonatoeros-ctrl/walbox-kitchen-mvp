import { useState, useEffect, useRef } from 'react';
import { kitchenOrderStatuses } from '../../data/kitchenMockData';
import { supabase } from '../../lib/supabaseClient';

const TIMELINE_STEPS = ['pending_counter_payment', 'received', 'preparing', 'ready', 'delivered'];

const STEP_LABELS = {
  pending_counter_payment: 'IN ATTESA PAGAMENTO',
  received:  'RICEVUTO',
  preparing: 'IN PREPARAZIONE',
  ready:     'PRONTO PER IL RITIRO',
  delivered: 'CONSEGNATO',
};

function getStepState(step, currentStatus) {
  const currentIndex = TIMELINE_STEPS.indexOf(currentStatus);
  const stepIndex    = TIMELINE_STEPS.indexOf(step);
  if (stepIndex < currentIndex)  return 'done';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function elapsedMinutes(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return 'ora';
  return `${diff} min fa`;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

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
 * AC7 (multi-ordine stacked, 2026-09-18): blocco cliente per UN singolo ordine, completamente
 * isolato — stato SumUp, reconciliation ref, scelta pagamento e CTA vivono solo qui, mai
 * condivisi con altri ordini montati in parallelo da `CustomerOrderStatus`. `isReturnTarget` è
 * l'unico segnale che questo ordine è quello a cui appartiene un eventuale `?sumup=return`: solo
 * quando è true questo blocco lancia la reconciliation automatica al mount.
 */
export default function CustomerOrderPanel({ order, isReturnTarget }) {
  const [readyFlash, setReadyFlash] = useState(false);
  const [sumup, setSumup] = useState(() => ({ state: isReturnTarget ? 'verifying' : 'idle', error: null }));
  const [, setChoiceVersion] = useState(0);

  const paymentChoice = getStoredPaymentChoice(order.id);

  const choosePayment = (choice) => {
    storePaymentChoice(order.id, choice);
    setChoiceVersion((v) => v + 1);
  };

  // AC4: un ordine chiuso non arriva mai qui (il container mostra solo ordini attivi), ma il
  // guard resta per sicurezza — mai trattare pending_counter_payment stale come bivio pagabile.
  const isClosedStatus = order.status === 'cancelled' || order.status === 'delivered';
  const isPendingPayment = !isClosedStatus
    ? (order.status === 'pending_counter_payment' || order.paymentStatus === 'pending_counter_payment')
    : false;
  const displayStatus = isPendingPayment ? 'pending_counter_payment' : order.status;
  const statusInfo = kitchenOrderStatuses[displayStatus];
  const isReady     = order.status === 'ready';
  const isPreparing = order.status === 'preparing';
  const isReceived  = order.status === 'received';

  const effectiveChoice = paymentChoice || (sumup.state !== 'idle' ? 'online' : null);
  const showCashFallback = effectiveChoice === 'counter'
    || (effectiveChoice === 'online' && ['error', 'pending', 'unknown'].includes(sumup.state));

  const prevIsReadyRef = useRef(isReady);
  const elapsed = elapsedMinutes(order.createdAt);
  const elapsedText = elapsed ? ` · ${elapsed}` : '';

  useEffect(() => {
    const wasReady = prevIsReadyRef.current;
    prevIsReadyRef.current = isReady;
    if (isReady && !wasReady) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      setReadyFlash(true);
      const t = setTimeout(() => setReadyFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [isReady]);

  const handlePaySumup = async () => {
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
    if (reconcileInFlightRef.current) return;
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
  // la reconciliation automatica — `isReturnTarget` è deciso una volta sola dal container.
  useEffect(() => {
    if (!isReturnTarget || autoReconcileDoneRef.current) return;
    autoReconcileDoneRef.current = true;
    runReconciliation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ost-order-block" data-testid={`ost-order-block-${order.id}`}>

      {/* WalrusChefHero */}
      <div className={`ost-hero ${isPendingPayment ? 'ost-hero--pending-payment' : ''}`}>
        <div className="ost-hero-glow" />
        <img src="/assets/kitchen/walrus-chef.png" alt="Walrus Chef" className="ost-hero-mascot" />
        <div className="ost-hero-headline">
          {(() => {
            switch (displayStatus) {
              case 'pending_counter_payment':
                return (
                  <>
                    <div className="ost-hero-line1">IN ATTESA DI PAGAMENTO</div>
                    <div className="ost-hero-line2" style={{ color: '#c8960a' }}>DA PAGARE AL BANCO</div>
                  </>
                );
              case 'received':
                return (
                  <>
                    <div className="ost-hero-line1">ORDINE RICEVUTO CON SUCCESSO</div>
                    <div className="ost-hero-line2" style={{ color: '#f59e0b' }}>PRESTO IN PREPARAZIONE</div>
                  </>
                );
              case 'preparing':
                return (
                  <>
                    <div className="ost-hero-line1">IL TUO ORDINE È IN PREPARAZIONE</div>
                    <div className="ost-hero-line2" style={{ color: '#3b82f6' }}>I NOSTRI CHEF SONO AL LAVORO</div>
                  </>
                );
              case 'ready':
                return (
                  <>
                    <div className="ost-hero-line1">IL TUO ORDINE È PRONTO!</div>
                    <div className="ost-hero-line2" style={{ color: '#22c55e' }}>RITIRALO AL BANCO</div>
                  </>
                );
              default:
                return (
                  <>
                    <div className="ost-hero-line1">ORDINE RICEVUTO CON SUCCESSO</div>
                    <div className="ost-hero-line2" style={{ color: '#f59e0b' }}>PRESTO IN PREPARAZIONE</div>
                  </>
                );
            }
          })()}
        </div>
      </div>

      {/* Payment method fork (AC1) */}
      {isPendingPayment && !effectiveChoice && (
        <div style={{ margin: '0 20px 20px' }} data-testid="ost-payment-fork">
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '1px',
            color: 'rgba(245,234,216,0.7)',
            textTransform: 'uppercase',
            textAlign: 'center',
            marginBottom: '10px',
          }}>
            COME VUOI PAGARE?
          </div>
          <button
            onClick={() => choosePayment('counter')}
            data-testid="ost-pay-counter"
            style={{
              width: '100%',
              padding: '16px',
              marginBottom: '10px',
              borderRadius: '12px',
              border: '2px solid #c8960a',
              background: 'transparent',
              color: '#c8960a',
              fontFamily: "'Anton', sans-serif",
              fontSize: '16px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            🧾 PAGA IN CASSA
          </button>
          <button
            onClick={handleChooseOnline}
            data-testid="ost-pay-online"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '12px',
              border: 'none',
              background: '#c8960a',
              color: '#1a1206',
              fontFamily: "'Anton', sans-serif",
              fontSize: '16px',
              letterSpacing: '1px',
              cursor: 'pointer',
            }}
          >
            💳 PAGA ONLINE
          </button>
        </div>
      )}

      {/* Code for payment at counter */}
      {isPendingPayment && showCashFallback && order.orderCode && (
        <div style={{
          margin: '0 20px 20px',
          padding: '16px 24px',
          background: 'rgba(200,150,10,0.12)',
          border: '2px solid #c8960a',
          borderRadius: '12px',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Montserrat', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '1.5px',
            color: 'rgba(245,234,216,0.55)',
            textTransform: 'uppercase',
            marginBottom: '4px'
          }}>
            MOSTRA QUESTO CODICE ALLA CASSA
          </div>
          <div style={{
            fontFamily: "'Anton', sans-serif",
            fontSize: '44px',
            fontWeight: 900,
            letterSpacing: '3px',
            color: '#c8960a',
            lineHeight: 1
          }}>
            {order.orderCode}
          </div>
        </div>
      )}

      {/* SumUp online payment CTA (sandbox) */}
      {isPendingPayment && effectiveChoice === 'online' && (
        <div style={{ margin: '0 20px 20px', textAlign: 'center' }}>
          {sumup.state === 'verifying' ? (
            <div style={{
              padding: '14px',
              color: '#c8960a',
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Stiamo verificando il pagamento con SumUp… aggiorna tra qualche secondo.
            </div>
          ) : sumup.state === 'confirmed' ? (
            <div style={{
              padding: '14px',
              color: '#22c55e',
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
            }}>
              Pagamento confermato — stiamo aggiornando l'ordine…
            </div>
          ) : sumup.state === 'pending' ? (
            <div style={{ padding: '14px' }}>
              <div style={{
                color: '#c8960a',
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '10px',
              }}>
                Pagamento ancora in corso presso SumUp. Non serve ripagare — verifica tra qualche secondo.
              </div>
              <button
                onClick={runReconciliation}
                data-testid="ost-sumup-retry"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '2px solid #c8960a',
                  background: 'transparent',
                  color: '#c8960a',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '13px',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                VERIFICA DI NUOVO
              </button>
            </div>
          ) : sumup.state === 'unknown' ? (
            <div style={{ padding: '14px' }}>
              <div style={{
                color: '#ef4444',
                fontFamily: "'Montserrat', sans-serif",
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '10px',
              }}>
                Non riusciamo a verificare il pagamento in questo momento. Se hai già pagato non serve
                ripagare: mostra questa schermata alla cassa se il problema persiste.
              </div>
              <button
                onClick={runReconciliation}
                data-testid="ost-sumup-retry"
                style={{
                  padding: '10px 20px',
                  borderRadius: '10px',
                  border: '2px solid #ef4444',
                  background: 'transparent',
                  color: '#ef4444',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '13px',
                  letterSpacing: '1px',
                  cursor: 'pointer',
                }}
              >
                VERIFICA DI NUOVO
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handlePaySumup}
                disabled={sumup.state === 'loading' || sumup.state === 'redirecting'}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  background: sumup.state === 'loading' || sumup.state === 'redirecting' ? '#6b5a1e' : '#c8960a',
                  color: '#1a1206',
                  fontFamily: "'Anton', sans-serif",
                  fontSize: '16px',
                  letterSpacing: '1px',
                  cursor: sumup.state === 'loading' || sumup.state === 'redirecting' ? 'default' : 'pointer',
                }}
              >
                {sumup.state === 'loading'
                  ? 'AVVIO PAGAMENTO…'
                  : sumup.state === 'redirecting'
                    ? 'REINDIRIZZAMENTO A SUMUP…'
                    : '💳 PAGA ONLINE'}
              </button>
              {sumup.state === 'error' && (
                <div style={{
                  marginTop: '8px',
                  color: '#ef4444',
                  fontSize: '12px',
                  fontFamily: "'Montserrat', sans-serif",
                }}>
                  {sumup.error}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* OrderInfoGrid */}
      <div className="ost-info-grid">
        <div className="ost-info-grid-header">DATI ORDINE</div>
        <div className="ost-info-grid-cells">
          <div className="ost-info-cell">
            <div className="ost-info-label">RITIRO</div>
            <div className="ost-info-value ost-info-value--yellow">AL BANCO</div>
          </div>
          <div className="ost-info-cell">
            <div className="ost-info-label">NICKNAME</div>
            <div className="ost-info-value ost-info-value--orange">{order.nickname}</div>
          </div>
          <div className="ost-info-cell ost-info-cell--bottom">
            <div className="ost-info-label">ORA ORDINE</div>
            <div className="ost-info-value ost-info-value--time">🕐 {formatTime(order.createdAt)}</div>
          </div>
          <div className="ost-info-cell ost-info-cell--bottom">
            <div className="ost-info-label">CODICE ORDINE</div>
            <div className="ost-info-value ost-info-value--muted">{order.orderCode || '-'}</div>
          </div>
        </div>
      </div>

      {/* CurrentStatusBanner — codice ordine grande e dominante (AC6/AC7) */}
      <div
        className={`ost-status-banner ost-status-banner--${displayStatus}`}
        style={displayStatus === 'pending_counter_payment' ? {
          background: '#c8960a',
          boxShadow: '0 4px 16px rgba(200,150,10,0.33)'
        } : undefined}
      >
        <div className="ost-status-banner-dot" />
        <div className="ost-status-banner-content">
          <div className="ost-order-code-big" data-testid="ost-order-code-big">{order.orderCode || '-'}</div>
          <div className="ost-status-banner-label">
            {displayStatus === 'pending_counter_payment' ? 'IN ATTESA DI PAGAMENTO' : (STEP_LABELS[displayStatus] ?? statusInfo?.label ?? displayStatus.toUpperCase())}
          </div>
          <div className="ost-status-banner-sub">
            {displayStatus === 'pending_counter_payment' && 'Mostra il codice in cassa per completare il pagamento e avviare la preparazione.'}
            {displayStatus === 'received'  && `Abbiamo ricevuto il tuo ordine. La cucina lo prenderà in carico a breve.${elapsedText}`}
            {displayStatus === 'preparing' && `Lo staff sta preparando il tuo ordine.${elapsedText}`}
            {displayStatus === 'ready'     && 'Il tuo ordine è pronto! Presentati al banco con il codice per il ritiro.'}
          </div>
        </div>
      </div>

      {/* StatusTimeline */}
      <div className={`ost-timeline ost-timeline--${displayStatus}`}>
        <div className="ost-timeline-header">PROGRESSIONE</div>
        {TIMELINE_STEPS.map((step, i) => {
          const state = getStepState(step, displayStatus);
          return (
            <div key={step} className={`ost-timeline-item ost-timeline-item--${state}`}>
              <div className="ost-timeline-left">
                <div className={`ost-timeline-dot ost-timeline-dot--${state}`}>
                  {state === 'done'   && <span className="ost-dot-check">✓</span>}
                  {state === 'active' && <span className="ost-dot-inner" />}
                </div>
                {i < TIMELINE_STEPS.length - 1 && (
                  <div className={`ost-timeline-line ost-timeline-line--${state}`} />
                )}
              </div>
              <div className="ost-timeline-content">
                <div className="ost-timeline-label">{STEP_LABELS[step]}</div>
                {state === 'active' && (
                  <div className="ost-timeline-sub">
                    {step === 'pending_counter_payment' && 'Mostra il codice in cassa per completare il pagamento e avviare la preparazione.'}
                    {step === 'received'  && `Abbiamo ricevuto il tuo ordine. La cucina lo prenderà in carico a breve.${elapsedText}`}
                    {step === 'preparing' && `Lo staff sta preparando il tuo ordine.${elapsedText}`}
                    {step === 'ready'     && 'Il tuo ordine è pronto! Presentati al banco con il codice per il ritiro.'}
                    {step === 'delivered' && 'Ordine consegnato. Buon appetito!'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* OrderedItemsPanel */}
      <div className="ost-items-panel">
        <div className="ost-items-panel-header">
          <span>HAI ORDINATO</span>
          <span>QTÀ / PREZZO</span>
        </div>
        {order.items.map((item, i) => (
          <div key={i} className="ost-item-row">
            <div className="ost-item-qty-badge">{item.quantity}</div>
            <span className="ost-item-name">{item.name}</span>
            <span className="ost-item-price">€{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div className="ost-total-row">
          <span className="ost-total-label">TOTALE</span>
          <span className="ost-total-value">€{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* KitchenNotesPanel */}
      {order.note && (
        <div className="ost-notes-panel">
          <div className="ost-notes-header">
            <span>📝</span>
            <span className="ost-notes-label">NOTE PER LA CUCINA</span>
          </div>
          <div className="ost-notes-text">{order.note}</div>
        </div>
      )}

      {/* JukeboxBridgeCard */}
      {(isReceived || isPreparing) && (
        <div
          className="ost-jukebox-card"
          onClick={() => navigate(`/request?table=${(order.table || '').replace(/^T/i, '') || '7'}`)}
        >
          <div className="ost-jukebox-text">
            <div className="ost-jukebox-headline">MENTRE ASPETTI<br />METTI UN PEZZO<br />AL JUKEBOX</div>
            <div className="ost-jukebox-desc">Vota le canzoni, manda una dedica.</div>
          </div>
          <button
            className="ost-jukebox-btn"
            aria-label="Vai al jukebox"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/request?table=${(order.table || '').replace(/^T/i, '') || '7'}`);
            }}
          >
            🎵
          </button>
        </div>
      )}

      {/* Inline CTA — sostituisce la fixed bottom bar globale (AC7 req 7): una CTA per ordine,
          dentro il blocco, mai fissa in fondo alla pagina (colliderebbe con più ordini impilati). */}
      <div className={`ost-inline-cta${readyFlash ? ' ost-ready-flash' : ''}`} style={isReady ? { background: '#0a2a1a', borderColor: '#10b981' } : undefined}>
        <span className="ost-bottom-bar-bell">{isReady ? '🟢' : (isPendingPayment ? '💳' : '🔔')}</span>
        <div className="ost-bottom-bar-text">
          {isReady ? (
            <>
              <div>IL TUO ORDINE È PRONTO</div>
              <div className="ost-bottom-bar-accent">RITIRALO ORA AL BANCO</div>
            </>
          ) : isPendingPayment ? (
            <>
              <div>IN ATTESA DI PAGAMENTO</div>
              <div className="ost-bottom-bar-accent">PAGA ALLA CASSA PER AVVIARE LA PREPARAZIONE</div>
            </>
          ) : (
            <>
              <div>MONITORAGGIO ATTIVO</div>
              <div className="ost-bottom-bar-accent">TI NOTIFICHEREMO QUANDO SARÀ PRONTO</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
