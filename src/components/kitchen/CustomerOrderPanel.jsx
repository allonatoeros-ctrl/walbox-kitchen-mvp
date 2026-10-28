import { useState, useEffect, useRef } from 'react';
import { kitchenOrderStatuses } from '../../data/kitchenMockData';
import { useOrderPaymentFlow } from '../../hooks/useOrderPaymentFlow';
import OrderPaymentActions from './OrderPaymentActions';
import { loadCart, saveCart } from '../../lib/kitchenCart';
import { getOrderStatusLabel, buildRebuildCart, PAYMENT_ABANDONED_MESSAGE } from '../../lib/kitchenOnlineLane';
import { formatPickupSentence } from '../../lib/kitchenPickup';

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

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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

/**
 * AC7 (multi-ordine stacked, 2026-09-18): blocco cliente per UN singolo ordine, completamente
 * isolato — la logica di pagamento vive in `useOrderPaymentFlow` (condivisa con
 * `CustomerOrderPayment`), ma ogni istanza del hook qui ha il proprio stato, mai condiviso con
 * altri ordini montati in parallelo da `CustomerOrderStatus`. `isReturnTarget` è l'unico segnale
 * che questo ordine è quello a cui appartiene un eventuale `?sumup=return`: solo quando è true
 * questo blocco lancia la reconciliation automatica al mount (dentro il hook).
 */
export default function CustomerOrderPanel({ order, isReturnTarget, onDismissAbandoned }) {
  const [readyFlash, setReadyFlash] = useState(false);
  // Riquadro compatto (follow-up UX 2026-09-18): il dettaglio pesante (hero, timeline, articoli,
  // note) resta chiuso di default — il blocco sempre visibile è codice + stato + CTA.
  const [expanded, setExpanded] = useState(false);

  const flow = useOrderPaymentFlow(order, isReturnTarget);
  const { isPendingPayment, isPendingOnline, isAbandoned, displayStatus } = flow;
  // POP/PA (S5) non esistono in kitchenOrderStatuses: l'etichetta passa dall'helper con fallback.
  const isOnlineLane = isPendingOnline || isAbandoned;
  const isReady = order.status === 'ready';

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

  return (
    <div className="ost-order-block ost-order-card" data-testid={`ost-order-block-${order.id}`}>

      {/* CurrentStatusBanner — sempre visibile: codice ordine grande, stato, info essenziali */}
      <div
        className={`ost-status-banner ${isAbandoned ? 'ost-status-banner--cancelled' : `ost-status-banner--${displayStatus}`}`}
        style={(displayStatus === 'pending_counter_payment' || isPendingOnline) ? {
          background: '#c8960a',
          boxShadow: '0 4px 16px rgba(200,150,10,0.33)'
        } : undefined}
      >
        <div className="ost-status-banner-dot" />
        <div className="ost-status-banner-content">
          {/* Customer Experience V2: il nome scelto nel checkout è il primo saluto dell'ordine. */}
          {order.nickname && order.nickname !== 'Ospite Walrus' && (
            <div className="ost-greeting" data-testid="ost-greeting">Ciao {order.nickname}! 🦭</div>
          )}
          <div className="ost-order-code-big" data-testid="ost-order-code-big">{order.orderCode || '-'}</div>
          {/* RITIRO AL WALRUS (2026-10-28): l'orario scelto, ben in vista sotto il codice. */}
          {formatPickupSentence(order.pickupSlot) && (
            <div
              data-testid="ost-pickup"
              style={{ display: 'inline-block', margin: '2px 0 6px', padding: '2px 10px', borderRadius: 6, background: '#fff', color: '#111', fontFamily: "'Anton', sans-serif", fontSize: 20, letterSpacing: 1 }}
            >
              {formatPickupSentence(order.pickupSlot)}
            </div>
          )}
          <div className="ost-status-banner-label">
            {displayStatus === 'pending_counter_payment'
              ? 'IN ATTESA DI PAGAMENTO'
              : (STEP_LABELS[displayStatus] ?? getOrderStatusLabel(displayStatus, kitchenOrderStatuses).toUpperCase())}
          </div>
          <div className="ost-status-banner-sub">
            {displayStatus === 'pending_counter_payment' && 'Mostra il codice in cassa per completare il pagamento e avviare la preparazione.'}
            {isPendingOnline && 'Completa il pagamento qui sotto, oppure scegli di pagare al banco con il codice.'}
            {isAbandoned && PAYMENT_ABANDONED_MESSAGE}
            {displayStatus === 'received'  && `Abbiamo ricevuto il tuo ordine. La cucina lo prenderà in carico a breve.${elapsedText}`}
            {displayStatus === 'preparing' && `Lo staff sta preparando il tuo ordine.${elapsedText}`}
            {displayStatus === 'ready'     && 'Il tuo ordine è pronto! Presentati al banco con il codice per il ritiro.'}
          </div>
        </div>
      </div>

      {isAbandoned && (
        <div style={{ margin: '0 20px 20px' }} data-testid="ost-pa-card">
          <button
            type="button"
            onClick={() => {
              // Stessi piatti nel sacco (persistenza esistente del menu), poi si torna al menu.
              saveCart(buildRebuildCart(order, loadCart()));
              navigate('/kitchen');
            }}
            data-testid="ost-pa-rebuild"
            style={{ width: '100%', padding: '16px', marginBottom: '10px', borderRadius: '12px', border: 'none', background: '#c8960a', color: '#1a1206', fontFamily: "'Anton', sans-serif", fontSize: '16px', letterSpacing: '1px', cursor: 'pointer' }}
          >
            RIFAI L'ORDINE
          </button>
          <button
            type="button"
            onClick={() => onDismissAbandoned?.(order.id)}
            data-testid="ost-pa-dismiss"
            style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid rgba(245,234,216,0.35)', background: 'transparent', color: 'rgba(245,234,216,0.8)', fontFamily: "'Anton', sans-serif", fontSize: '14px', letterSpacing: '1px', cursor: 'pointer' }}
          >
            CHIUDI
          </button>
        </div>
      )}

      <OrderPaymentActions order={order} flow={flow} />

      {/* Inline CTA — info essenziali sempre visibili, compatte (AC7 req 7 preservato). */}
      {!isAbandoned && (
      <div className={`ost-inline-cta${readyFlash ? ' ost-ready-flash' : ''}`} style={isReady ? { background: '#0a2a1a', borderColor: '#10b981' } : undefined}>
        <span className="ost-bottom-bar-bell">{isReady ? '🟢' : ((isPendingPayment || isPendingOnline) ? '💳' : '🔔')}</span>
        <div className="ost-bottom-bar-text">
          {isReady ? (
            <>
              <div>IL TUO ORDINE È PRONTO</div>
              <div className="ost-bottom-bar-accent">RITIRALO ORA AL BANCO</div>
            </>
          ) : isPendingOnline ? (
            <>
              <div>PAGAMENTO ONLINE IN CORSO</div>
              <div className="ost-bottom-bar-accent">COMPLETA IL PAGAMENTO PER AVVIARE LA PREPARAZIONE</div>
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
      )}

      {/* Toggle dettaglio — riquadro compatto di default, dettaglio pesante solo su richiesta */}
      <button
        type="button"
        className="ost-detail-toggle"
        data-testid={`ost-detail-toggle-${order.id}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'NASCONDI DETTAGLIO ▲' : 'VEDI DETTAGLIO ORDINE ▾'}
      </button>

      {expanded && (
        <div className="ost-order-detail" data-testid={`ost-order-detail-${order.id}`}>
          {/* WalrusChefHero */}
          <div className={`ost-hero ${(isPendingPayment || isPendingOnline) ? 'ost-hero--pending-payment' : ''}`}>
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
                  case 'pending_online_payment':
                    return (
                      <>
                        <div className="ost-hero-line1">PAGAMENTO ONLINE IN CORSO</div>
                        <div className="ost-hero-line2" style={{ color: '#c8960a' }}>COMPLETALO O PAGA AL BANCO</div>
                      </>
                    );
                  case 'payment_abandoned':
                    return (
                      <>
                        <div className="ost-hero-line1">ORDINE ANNULLATO</div>
                        <div className="ost-hero-line2" style={{ color: '#ef4444' }}>PAGAMENTO NON COMPLETATO</div>
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

          {/* StatusTimeline — per POP/PA (corsia online, S5) la progressione non ha ancora senso:
              il passo pagamento è già mostrato sopra, la timeline compare da `received`. */}
          {!isOnlineLane && (
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
          )}

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
        </div>
      )}
    </div>
  );
}
