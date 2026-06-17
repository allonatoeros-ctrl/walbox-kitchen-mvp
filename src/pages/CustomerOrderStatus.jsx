import { useState, useEffect } from 'react';
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

const TIMELINE_STEPS = ['received', 'preparing', 'ready'];

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
  return getMostRecentId(orders);
}

export default function CustomerOrderStatus() {
  const { orders } = useKitchenOrders();
  const [selectedId, setSelectedId] = useState(() => resolveInitialId(orders));
  const [devOpen, setDevOpen] = useState(false);

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
  const statusInfo = order ? kitchenOrderStatuses[order.status] : null;
  const isReady      = order?.status === 'ready';
  const isPreparing  = order?.status === 'preparing';
  const isReceived   = order?.status === 'received';
  const isCancelled  = order?.status === 'cancelled';

  useEffect(() => {
    if (isReady && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }, [isReady]);

  const handleSelectOrder = (oId) => {
    setSelectedId(oId);
    navigate(`/kitchen/status?orderId=${oId}`);
  };

  if (!order) {
    return (
      <div className="ost-page">
        <div className="ost-header">
          <div className="ost-header-logo">🦭</div>
          <div>
            <div className="ost-header-title">WALRUS KITCHEN</div>
            <div className="ost-header-sub">Segui il tuo ordine in tempo reale</div>
          </div>
        </div>
        <div style={{ padding: '60px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h2 style={{ color: 'var(--k-yellow)', marginBottom: 12, fontSize: 20, fontWeight: 800, fontFamily: 'var(--k-font-display)', letterSpacing: 1 }}>
            Nessun ordine trovato
          </h2>
          <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
            Non abbiamo trovato nessun ordine attivo da mostrare.
          </p>
          <div className="ost-back-wrap">
            <button className="ost-back-btn" onClick={() => navigate('/kitchen')}>
              ← Torna al menu
            </button>
          </div>
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
    <div className="ost-page">

      {/* Header */}
      <div className="ost-header">
        <div className="ost-header-logo">🦭</div>
        <div>
          <div className="ost-header-title">WALRUS KITCHEN</div>
          <div className="ost-header-sub">Segui il tuo ordine in tempo reale</div>
        </div>
      </div>

      {/* Orders switcher */}
      {sortedOrders.length > 1 && (
        <div className="ost-orders-list">
          <div className="ost-orders-list-title">I MIEI ORDINI</div>
          <div className="ost-orders-grid">
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

      {/* Order meta */}
      <div className="ost-meta-box">
        <div className="ost-meta-row"><span className="ost-meta-key">Ordine</span><span className="ost-meta-val">#{order.id.replace('order-', '')}</span></div>
        <div className="ost-meta-row"><span className="ost-meta-key">Tavolo</span><span className="ost-meta-val">{order.table}</span></div>
        <div className="ost-meta-row"><span className="ost-meta-key">Nickname</span><span className="ost-meta-val">{order.nickname}</span></div>
        <div className="ost-meta-row"><span className="ost-meta-key">Orario</span><span className="ost-meta-val">{formatTime(order.createdAt)}</span></div>
      </div>

      {/* Status banners */}
      {isPreparing && (
        <div className="ost-banner ost-banner--preparing">
          <div className="ost-banner-emoji">🍳</div>
          <div className="ost-banner-title ost-banner-title--preparing">IN PREPARAZIONE</div>
          <div className="ost-banner-msg ost-banner-msg--preparing">
            Stanno preparando il tuo ordine. Tieniti pronto — ti avvisiamo qui.
          </div>
        </div>
      )}
      {isReady && (
        <div className="ost-banner ost-banner--ready">
          <div className="ost-banner-emoji ost-banner-emoji--ready">🐴</div>
          <div className="ost-banner-title ost-banner-title--ready">CAVALLOOOO</div>
          <div className="ost-banner-msg ost-banner-msg--ready">
            Il tuo ordine è pronto. Vieni a ritirarlo al banco.
          </div>
        </div>
      )}
      {isCancelled && (
        <div className="ost-banner ost-banner--cancelled">
          <div className="ost-banner-msg ost-banner-msg--cancelled">
            Ordine annullato dalla SALA VAR. Parla con il personale.
          </div>
        </div>
      )}

      {/* Timeline */}
      {!isCancelled && (
        <div className="ost-timeline">
          {TIMELINE_STEPS.map((step, i) => {
            const state = getStepState(step, order.status);
            const info  = kitchenOrderStatuses[step];
            const dotBg = state === 'active' ? info.color : state === 'done' ? '#10b981' : '#2a2a2a';
            const dotBorder = state === 'pending' ? '2px solid #444' : `2px solid ${state === 'done' ? '#10b981' : info.color}`;
            const lineBg = state === 'done' ? '#10b981' : '#2a2a2a';
            const labelColor = state === 'active' ? info.color : state === 'done' ? '#10b981' : '#555';
            return (
              <div key={step} className="ost-timeline-item">
                <div className="ost-timeline-left">
                  <div
                    className="ost-timeline-dot"
                    style={{
                      background: dotBg,
                      border: dotBorder,
                      boxShadow: state === 'active' ? `0 0 10px ${info.color}88` : 'none',
                    }}
                  >
                    {state === 'done'   && <span className="ost-dot-check">✓</span>}
                    {state === 'active' && <span className="ost-dot-pulse" />}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className="ost-timeline-line" style={{ background: lineBg }} />
                  )}
                </div>
                <div className="ost-timeline-content">
                  <div
                    className="ost-timeline-label"
                    style={{ color: labelColor, fontWeight: state === 'active' ? 800 : 600 }}
                  >
                    {info.label}
                  </div>
                  {state === 'active' && (
                    <div className="ost-timeline-sub">
                      {step === 'received'  && 'Ordine ricevuto. La cucina è avvisata.'}
                      {step === 'preparing' && 'Ci stanno mettendo le mani.'}
                      {step === 'ready'     && 'CAVALLOOOO. È pronto al banco.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Items summary */}
      <div className="ost-section">
        <div className="ost-section-title">Riepilogo ordine</div>
        {order.items.map((item, i) => (
          <div key={i} className="ost-item-row">
            <span className="ost-item-qty">{item.quantity}×</span>
            <span className="ost-item-name">{item.name}</span>
            <span className="ost-item-price">€{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div className="ost-divider" />
        <div className="ost-total-row">
          <span className="ost-total-label">Totale</span>
          <span className="ost-total-value">€{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Note */}
      {order.note && (
        <div className="ost-note-box">
          <span className="ost-note-label">Note cucina: </span>
          <span className="ost-note-text">{order.note}</span>
        </div>
      )}

      {/* Jukebox bridge */}
      {(isReceived || isPreparing) && (
        <div className="ost-juke-bridge">
          <span className="ost-juke-bridge-text">Mentre aspetti, metti una canzone.</span>
          <button
            className="ost-juke-bridge-btn"
            onClick={() => navigate(`/request?table=${(order.table || '').replace(/^T/i, '') || '7'}`)}
          >
            🎵 Vai al jukebox
          </button>
        </div>
      )}

      {/* Status chip */}
      <div className="ost-status-chip-wrap">
        <span
          className="ost-status-chip"
          style={{
            background: statusInfo?.color + '22',
            color: statusInfo?.color,
            border: `1px solid ${statusInfo?.color}44`,
          }}
        >
          {statusInfo?.label}
        </span>
      </div>

      {/* Back */}
      <div className="ost-back-wrap">
        <button className="ost-back-btn" onClick={() => navigate('/kitchen')}>
          ← Torna al menu
        </button>
      </div>

      {/* Dev tools */}
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
