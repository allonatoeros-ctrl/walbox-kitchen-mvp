import { useState, useEffect } from 'react';
import { demoKitchenOrders, kitchenOrderStatuses } from '../data/kitchenMockData';

const LS_KEY = 'walbox_kitchen_orders_demo';

function readOrders() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch { }
  return demoKitchenOrders;
}

function getMostRecentId(orders) {
  if (!orders || orders.length === 0) return null;
  return orders.reduce((best, o) =>
    new Date(o.createdAt) > new Date(best.createdAt) ? o : best
  ).id;
}

const TIMELINE_STEPS = ['received', 'preparing', 'ready'];

function getStepState(step, currentStatus) {
  const currentIndex = TIMELINE_STEPS.indexOf(currentStatus);
  const stepIndex = TIMELINE_STEPS.indexOf(step);
  if (stepIndex < currentIndex) return 'done';
  if (stepIndex === currentIndex) return 'active';
  return 'pending';
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function CustomerOrderStatus() {
  const [orders, setOrders] = useState(readOrders);
  const [selectedId, setSelectedId] = useState(() => {
    const list = readOrders();
    const urlParams = new URLSearchParams(window.location.search);
    const urlOrderId = urlParams.get('orderId');
    if (urlOrderId && list.some((o) => o.id === urlOrderId)) {
      return urlOrderId;
    }
    return getMostRecentId(list);
  });
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue);
          setOrders(updated);
          setSelectedId((prev) => {
            const stillExists = updated.find((o) => o.id === prev);
            return stillExists ? prev : getMostRecentId(updated);
          });
        } catch { }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const handleNav = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlOrderId = urlParams.get('orderId');
      if (urlOrderId) {
        const fresh = readOrders();
        if (fresh.some((o) => o.id === urlOrderId)) {
          setOrders(fresh);
          setSelectedId(urlOrderId);
        }
      }
    };
    window.addEventListener('popstate', handleNav);
    return () => window.removeEventListener('popstate', handleNav);
  }, []);

  const order = orders.find((o) => o.id === selectedId) ?? orders[0];
  const statusInfo = kitchenOrderStatuses[order.status];
  const isReady = order.status === 'ready';
  const isPreparing = order.status === 'preparing';
  const isReceived = order.status === 'received';
  const isCancelled = order.status === 'cancelled';

  useEffect(() => {
    if (isReady && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [isReady]);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLogo}>🦭</div>
        <div>
          <div style={styles.headerTitle}>WALRUS KITCHEN</div>
          <div style={styles.headerSub}>Segui il tuo ordine in tempo reale</div>
        </div>
      </div>

      {/* Order meta */}
      <div style={styles.metaBox}>
        <div style={styles.metaRow}>
          <span style={styles.metaKey}>Ordine</span>
          <span style={styles.metaVal}>#{order.id.replace('order-', '')}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaKey}>Tavolo</span>
          <span style={styles.metaVal}>{order.table}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaKey}>Nickname</span>
          <span style={styles.metaVal}>{order.nickname}</span>
        </div>
        <div style={styles.metaRow}>
          <span style={styles.metaKey}>Orario</span>
          <span style={styles.metaVal}>{formatTime(order.createdAt)}</span>
        </div>
      </div>

      {/* Preparing banner */}
      {isPreparing && (
        <div style={styles.preparingBanner}>
          <div style={styles.preparingEmoji}>🍳</div>
          <div style={styles.preparingTitle}>IN PREPARAZIONE</div>
          <div style={styles.preparingMsg}>
            Stanno preparando il tuo ordine. Tieniti pronto — ti avvisiamo qui.
          </div>
        </div>
      )}

      {/* CAVALLOOOO banner */}
      {isReady && (
        <div style={styles.readyBanner}>
          <div style={styles.readyEmoji}>🐴</div>
          <div style={styles.readyTitle}>CAVALLOOOO</div>
          <div style={styles.readyMsg}>
            Il tuo ordine è pronto. Vieni a ritirarlo al banco.
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {isCancelled && (
        <div style={styles.cancelledBanner}>
          <div style={styles.cancelledMsg}>Ordine annullato dalla SALA VAR. Parla con il personale.</div>
        </div>
      )}

      {/* Timeline */}
      {!isCancelled && (
        <div style={styles.timelineWrap}>
          {TIMELINE_STEPS.map((step, i) => {
            const state = getStepState(step, order.status);
            const info = kitchenOrderStatuses[step];
            return (
              <div key={step} style={styles.timelineItem}>
                <div style={styles.timelineLeft}>
                  <div style={{
                    ...styles.timelineDot,
                    background: state === 'active' ? info.color : state === 'done' ? '#10b981' : '#2a2a2a',
                    border: state === 'pending' ? '2px solid #444' : `2px solid ${state === 'done' ? '#10b981' : info.color}`,
                    boxShadow: state === 'active' ? `0 0 10px ${info.color}88` : 'none',
                  }}>
                    {state === 'done' && <span style={styles.dotCheck}>✓</span>}
                    {state === 'active' && <span style={styles.dotPulse} />}
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div style={{
                      ...styles.timelineLine,
                      background: state === 'done' ? '#10b981' : '#2a2a2a',
                    }} />
                  )}
                </div>
                <div style={styles.timelineContent}>
                  <div style={{
                    ...styles.timelineLabel,
                    color: state === 'active' ? info.color : state === 'done' ? '#10b981' : '#555',
                    fontWeight: state === 'active' ? 800 : 600,
                  }}>
                    {info.label}
                  </div>
                  {state === 'active' && (
                    <div style={styles.timelineSubActive}>
                      {step === 'received' && 'Ordine ricevuto. La cucina è avvisata.'}
                      {step === 'preparing' && 'Ci stanno mettendo le mani.'}
                      {step === 'ready' && 'CAVALLOOOO. È pronto al banco.'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Items */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Riepilogo ordine</div>
        {order.items.map((item, i) => (
          <div key={i} style={styles.itemRow}>
            <span style={styles.itemQty}>{item.quantity}×</span>
            <span style={styles.itemName}>{item.name}</span>
            <span style={styles.itemPrice}>€{(item.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div style={styles.divider} />
        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>Totale</span>
          <span style={styles.totalValue}>€{order.total.toFixed(2)}</span>
        </div>
      </div>

      {/* Note */}
      {order.note ? (
        <div style={styles.noteBox}>
          <span style={styles.noteLabel}>Note cucina: </span>
          <span style={styles.noteText}>{order.note}</span>
        </div>
      ) : null}

      {/* Jukebox bridge */}
      {(isReceived || isPreparing) && (
        <div style={styles.jukeBridge}>
          <span style={styles.jukeBridgeText}>Mentre aspetti, metti una canzone.</span>
          <button
            style={styles.jukeBridgeBtn}
            onClick={() => {
              const tableNumber = (order.table || '').replace(/^T/i, '') || '7';
              window.history.pushState({}, '', `/request?table=${tableNumber}`);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            🎵 Vai al jukebox
          </button>
        </div>
      )}

      {/* Status chip */}
      <div style={styles.statusChipWrap}>
        <span style={{ ...styles.statusChip, background: statusInfo?.color + '22', color: statusInfo?.color, border: `1px solid ${statusInfo?.color}44` }}>
          {statusInfo?.label}
        </span>
      </div>

      {/* Back to menu CTA */}
      <div style={styles.backBtnWrap}>
        <button
          style={styles.backBtn}
          onClick={() => {
            window.history.pushState({}, "", "/kitchen");
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
        >
          ← Torna al menu
        </button>
      </div>

      {/* Dev selector — solo per demo */}
      {import.meta.env.DEV && (
        <>
          <div style={styles.demoToggleRow}>
            <button style={styles.demoToggleBtn} onClick={() => setDevOpen((v) => !v)}>
              {devOpen ? '▲ Dev tools' : '▼ Dev tools'}
            </button>
          </div>
          {devOpen && (
            <div style={styles.demoBar}>
              <span style={styles.demoLabel}>simula ordine:</span>
              {orders.map((o) => (
                <button
                  key={o.id}
                  style={{ ...styles.demoBtn, ...(o.id === selectedId ? styles.demoBtnActive : {}) }}
                  onClick={() => setSelectedId(o.id)}
                >
                  {o.nickname} · {kitchenOrderStatuses[o.status]?.label}
                </button>
              ))}
              <div style={styles.demoNote}>
                Demo locale · sync multi-device richiederà Supabase
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#20120b',
    color: '#f5f0e8',
    fontFamily: "var(--font-sans)",
    paddingBottom: 48,
  },
  backBtnWrap: {
    margin: '32px 16px 0',
    display: 'flex',
    justifyContent: 'center',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 20,
    color: '#aaa',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 20px',
    cursor: 'pointer',
  },
  demoToggleRow: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 0,
  },
  demoToggleBtn: {
    background: 'transparent',
    border: 'none',
    color: '#2a2a2a',
    fontSize: 10,
    cursor: 'pointer',
    letterSpacing: 0.5,
    padding: '4px 8px',
  },
  demoBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px 24px',
    overflowX: 'auto',
    flexWrap: 'nowrap',
    opacity: 0.5,
  },
  demoLabel: { fontSize: 10, color: '#444', flexShrink: 0, letterSpacing: 0.5 },
  demoBtn: {
    background: 'transparent',
    border: '1px solid #222',
    borderRadius: 12,
    color: '#444',
    padding: '4px 10px',
    fontSize: 10,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  demoBtnActive: {
    border: '1px solid #555',
    color: '#888',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 16px 12px',
    borderTop: '5px solid #f05a24',
    borderBottom: '1px solid #1e1e1e',
  },
  headerLogo: { fontSize: 30 },
  headerTitle: { fontSize: 18, fontWeight: 800, letterSpacing: 2, color: '#f5c842', fontFamily: 'var(--font-display)' },
  headerSub: { fontSize: 12, color: '#666', marginTop: 2 },
  metaBox: {
    margin: '16px 16px 0',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    boxShadow: '4px 4px 0 #000',
  },
  metaRow: { display: 'flex', justifyContent: 'space-between' },
  metaKey: { fontSize: 12, color: '#555' },
  metaVal: { fontSize: 13, fontWeight: 700, color: '#f5f0e8' },
  preparingBanner: {
    margin: '16px',
    background: 'linear-gradient(135deg, #0a0e1a, #0a1428)',
    border: '2px solid #3b82f6',
    borderRadius: 12,
    padding: '18px 16px',
    textAlign: 'center',
    boxShadow: '4px 4px 0 #000',
  },
  preparingEmoji: { fontSize: 32, marginBottom: 8 },
  preparingTitle: { fontSize: 18, fontWeight: 900, color: '#3b82f6', letterSpacing: 2, marginBottom: 8, fontFamily: 'var(--font-display)' },
  preparingMsg: { fontSize: 14, color: '#93c5fd', lineHeight: 1.5 },
  readyBanner: {
    margin: '16px',
    background: 'linear-gradient(135deg, #1f1600, #3d2c00)',
    border: '2px solid #f5c842',
    borderRadius: 12,
    padding: '18px 16px',
    textAlign: 'center',
    boxShadow: '4px 4px 0 #000',
  },
  readyEmoji: { fontSize: 40, marginBottom: 8 },
  readyTitle: { fontSize: 28, fontWeight: 900, color: '#f5c842', letterSpacing: 3, marginBottom: 8, fontFamily: 'var(--font-display)' },
  readyMsg: { fontSize: 15, color: '#f7dfb5', lineHeight: 1.5 },
  cancelledBanner: {
    margin: '16px',
    background: '#1a0a0a',
    border: '1px solid #ef4444',
    borderRadius: 10,
    padding: '14px 16px',
    textAlign: 'center',
    boxShadow: '4px 4px 0 #000',
  },
  cancelledMsg: { fontSize: 14, color: '#ef4444' },
  timelineWrap: {
    margin: '20px 16px 0',
  },
  timelineItem: {
    display: 'flex',
    gap: 14,
    minHeight: 56,
  },
  timelineLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    flexShrink: 0,
    width: 28,
  },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  dotCheck: { fontSize: 13, color: '#fff', fontWeight: 800 },
  dotPulse: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#fff',
    opacity: 0.9,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 20,
    margin: '4px 0',
    borderRadius: 2,
  },
  timelineContent: {
    paddingTop: 4,
    paddingBottom: 16,
    flex: 1,
  },
  timelineLabel: {
    fontSize: 15,
    marginBottom: 4,
  },
  timelineSubActive: {
    fontSize: 12,
    color: '#888',
    lineHeight: 1.4,
  },
  section: {
    margin: '20px 16px 0',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '14px',
    boxShadow: '4px 4px 0 #000',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#555',
    fontWeight: 700,
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
    fontFamily: 'var(--font-display)',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 6,
  },
  itemQty: { fontSize: 13, color: '#f5c842', fontWeight: 700, minWidth: 20 },
  itemName: { fontSize: 14, color: '#ccc', flex: 1 },
  itemPrice: { fontSize: 13, color: '#f5f0e8', fontWeight: 600 },
  divider: { borderTop: '1px solid #2a2a2a', margin: '10px 0' },
  totalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, color: '#888', fontWeight: 600 },
  totalValue: { fontSize: 18, fontWeight: 800, color: '#f5c842', fontFamily: 'var(--font-display)' },
  noteBox: {
    margin: '12px 16px 0',
    background: '#151510',
    border: '1px solid #2a2500',
    borderRadius: 8,
    padding: '10px 14px',
  },
  noteLabel: { fontSize: 11, color: '#666' },
  noteText: { fontSize: 13, color: '#aaa' },
  statusChipWrap: {
    margin: '16px 16px 0',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  statusChip: {
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 20,
    padding: '4px 14px',
    letterSpacing: 0.5,
  },
  jukeBridge: {
    margin: '20px 16px 0',
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    boxShadow: '4px 4px 0 #000',
  },
  jukeBridgeText: {
    fontSize: 13,
    color: '#888',
    flex: 1,
    lineHeight: 1.4,
  },
  jukeBridgeBtn: {
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 20,
    color: '#f5c842',
    fontSize: 13,
    fontWeight: 700,
    padding: '8px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  demoNote: {
    fontSize: 9,
    color: '#2a2a2a',
    marginTop: 8,
    letterSpacing: 0.3,
    flexBasis: '100%',
    paddingTop: 4,
  },
};
