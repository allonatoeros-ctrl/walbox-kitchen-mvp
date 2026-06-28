import { useState, useEffect, useRef } from 'react';
import { kitchenOrderStatuses } from '../data/kitchenMockData';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import KitchenOrderCard from '../components/kitchen/KitchenOrderCard';
import './CustomerOrderStatus.css';

function getMostRecentId(orders) {
  if (!orders || orders.length === 0) return null;
  return orders.reduce((best, o) =>
    new Date(o.createdAt) > new Date(best.createdAt) ? o : best
  ).id;
}

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

function resolveInitialId(orders) {
  const urlParams  = new URLSearchParams(window.location.search);
  const urlOrderId = urlParams.get('orderId');
  if (urlOrderId && orders.some((o) => o.id === urlOrderId)) return urlOrderId;
  try {
    const lastId = localStorage.getItem('walbox_kitchen_last_order_id');
    if (lastId && orders.some((o) => o.id === lastId)) return lastId;
  } catch { }
  try {
    const sessionRaw = localStorage.getItem('walboxCustomerSession');
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      const filtered = orders.filter((o) =>
        (session.table && o.table === `T${session.table}`) ||
        (session.nickname && o.nickname === session.nickname)
      );
      return getMostRecentId(filtered);
    }
  } catch { }
  return null;
}

export default function CustomerOrderStatus() {
  const { orders } = useKitchenOrders();
  const [selectedId, setSelectedId] = useState(() => resolveInitialId(orders));
  const [devOpen, setDevOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [readyFlash, setReadyFlash] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Keep selectedId in sync when orders update (e.g. cross-tab) or URL changes
  useEffect(() => {
    setSelectedId((prev) => {
      const stillExists = orders.find((o) => o.id === prev);
      return stillExists ? prev : getMostRecentId(orders);
    });
  }, [orders]);

  useEffect(() => {
    const handleNav = () => {
      const urlParams  = new URLSearchParams(window.location.search);
      const urlOrderId = urlParams.get('orderId');
      if (urlOrderId && orders.some((o) => o.id === urlOrderId)) {
        setSelectedId(urlOrderId);
      }
    };
    window.addEventListener('popstate', handleNav);
    return () => window.removeEventListener('popstate', handleNav);
  }, [orders]);

  const order      = orders.find((o) => o.id === selectedId) ?? orders[0];
  const isPendingPayment = order ? (order.status === 'pending_counter_payment' || order.paymentStatus === 'pending_counter_payment') : false;
  const displayStatus = isPendingPayment ? 'pending_counter_payment' : (order ? order.status : 'received');
  const statusInfo = order ? kitchenOrderStatuses[displayStatus] : null;
  const isReady      = order?.status === 'ready';
  const isPreparing  = order?.status === 'preparing';
  const isReceived   = order?.status === 'received';
  const isCancelled  = order?.status === 'cancelled';
  const hasBottomBar = order && order.status !== 'delivered' && order.status !== 'cancelled';

  const prevIsReadyRef = useRef(isReady);

  const elapsed = order ? elapsedMinutes(order.createdAt) : '';
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

  const handleSelectOrder = (oId) => {
    setSelectedId(oId);
    navigate(`/kitchen/status?orderId=${oId}`);
  };

  if (!order) {
    return (
      <div className="ost-page">
        <div className="ost-topbar">
          <button className="ost-topbar-back" onClick={() => navigate('/kitchen')}>←</button>
          <span className="ost-topbar-title">STATO ORDINE</span>
          <span className="ost-topbar-bell">🔔</span>
        </div>
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <h2 className="ost-empty-title">Nessun ordine trovato</h2>
          <p className="ost-empty-sub">Non abbiamo trovato nessun ordine attivo da mostrare.</p>
          <button className="ost-topbar-back-btn" onClick={() => navigate('/kitchen')}>
            ← Torna al menu
          </button>
        </div>
      </div>
    );
  }

  const relevantOrders = orders.filter((o) => {
    if (o.id === order.id) return true;
    return !!(order.table && o.table === order.table) || !!(order.nickname && o.nickname === order.nickname);
  });

  const sortedOrders = [...relevantOrders]
    .filter((o) => o.id === order.id || (o.status !== 'delivered' && o.status !== 'cancelled'))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <div className={`ost-page${hasBottomBar ? ' ost-page--has-bottom-bar' : ''}`}>

      {/* TopBar */}
      <div className="ost-topbar">
        <button className="ost-topbar-back" onClick={() => navigate('/kitchen')}>←</button>
        <span className="ost-topbar-title">STATO ORDINE</span>
        <span className="ost-topbar-bell">🔔</span>
      </div>

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
              case 'delivered':
                return (
                  <>
                    <div className="ost-hero-line1">ORDINE CONSEGNATO</div>
                    <div className="ost-hero-line2" style={{ color: '#94a3b8' }}>GRAZIE E BUON APPETITO!</div>
                  </>
                );
              case 'cancelled':
                return (
                  <>
                    <div className="ost-hero-line1">ORDINE ANNULLATO</div>
                    <div className="ost-hero-line2" style={{ color: '#ef4444' }}>RIVOLGITI AL PERSONALE</div>
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

      {/* Code for payment at counter */}
      {isPendingPayment && order.orderCode && (
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

      {/* OrderInfoGrid */}
      <div className="ost-info-grid">
        <div className="ost-info-grid-header">DATI ORDINE</div>
        <div className="ost-info-grid-cells">
          <div className="ost-info-cell">
            <div className="ost-info-label">TAVOLO</div>
            <div className="ost-info-value ost-info-value--yellow">{order.table}</div>
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

      {/* CurrentStatusBanner */}
      <div 
        className={`ost-status-banner ost-status-banner--${displayStatus}`}
        style={displayStatus === 'pending_counter_payment' ? {
          background: '#c8960a',
          boxShadow: '0 4px 16px rgba(200,150,10,0.33)'
        } : undefined}
      >
        <div className="ost-status-banner-dot" />
        <div className="ost-status-banner-content">
          <div className="ost-status-banner-label">
            {displayStatus === 'pending_counter_payment' ? 'IN ATTESA DI PAGAMENTO' : (STEP_LABELS[displayStatus] ?? statusInfo?.label ?? displayStatus.toUpperCase())}
          </div>
          <div className="ost-status-banner-sub">
            {displayStatus === 'pending_counter_payment' && 'Mostra il codice in cassa per completare il pagamento e avviare la preparazione.'}
            {displayStatus === 'received'  && `Abbiamo ricevuto il tuo ordine. La cucina lo prenderà in carico a breve.${elapsedText}`}
            {displayStatus === 'preparing' && `Lo staff sta preparando il tuo ordine.${elapsedText}`}
            {displayStatus === 'ready'     && 'Il tuo ordine è pronto! Presentati al banco con il codice per il ritiro.'}
            {displayStatus === 'delivered' && 'Ordine consegnato. Buon appetito!'}
            {displayStatus === 'cancelled' && 'L\'ordine è stato annullato. Rivolgiti al personale per assistenza.'}
          </div>
        </div>
      </div>

      {/* StatusTimeline */}
      {!isCancelled && (
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

      {/* MyOrdersSwitcher */}
      {sortedOrders.length > 1 && (
        <div className="ost-switcher">
          <div className="ost-switcher-label">I MIEI ORDINI</div>
          <div className="ost-switcher-scroll">
            {sortedOrders.map((o) => (
              <KitchenOrderCard
                key={o.id}
                order={o}
                isSelected={o.id === selectedId}
                onClick={() => handleSelectOrder(o.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ReadyAlertBottomBox */}
      {hasBottomBar && (
        <div className={`ost-bottom-bar${readyFlash ? ' ost-ready-flash' : ''}`} style={isReady ? { background: '#0a2a1a', borderTop: '2px solid #10b981' } : undefined}>
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
      )}

      {/* DemoStateControls */}
      {import.meta.env.DEV && (
        <>
          <div className="ost-dev-toggle-row">
            <button className="ost-dev-toggle-btn" onClick={() => setDevOpen((v) => !v)}>
              {devOpen ? '▲ Dev tools' : '▼ Dev tools'}
            </button>
          </div>
          {devOpen && (
            <div className="ost-dev-bar">
              <span className="ost-dev-label">simula ordine:</span>
              {orders.map((o) => (
                <button
                  key={o.id}
                  className={`ost-dev-btn${o.id === selectedId ? ' ost-dev-btn--active' : ''}`}
                  onClick={() => setSelectedId(o.id)}
                >
                  {o.nickname} · {kitchenOrderStatuses[o.status]?.label}
                </button>
              ))}
              <div className="ost-dev-note">Demo locale · sync multi-device richiederà Supabase</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
