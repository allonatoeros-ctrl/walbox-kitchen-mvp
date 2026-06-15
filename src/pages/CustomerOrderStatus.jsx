import { useState } from 'react';
import { demoKitchenOrders, kitchenOrderStatuses } from '../data/kitchenMockData';

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
  const [selectedIndex, setSelectedIndex] = useState(1); // default: order-002, status ready

  const order = demoKitchenOrders[selectedIndex];
  const statusInfo = kitchenOrderStatuses[order.status];
  const isReady = order.status === 'ready';
  const isCancelled = order.status === 'cancelled';

  return (
    <div style={styles.page}>
      {/* Demo selector */}
      <div style={styles.demoBar}>
        <span style={styles.demoLabel}>Demo ordine:</span>
        {demoKitchenOrders.map((o, i) => (
          <button
            key={o.id}
            style={{ ...styles.demoBtn, ...(i === selectedIndex ? styles.demoBtnActive : {}) }}
            onClick={() => setSelectedIndex(i)}
          >
            {o.nickname} · {kitchenOrderStatuses[o.status]?.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLogo}>🦭</div>
        <div>
          <div style={styles.headerTitle}>WALBOX KITCHEN</div>
          <div style={styles.headerSub}>The Walrus Pub — il tuo ordine</div>
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
          <div style={styles.cancelledMsg}>Ordine annullato. Parla con il personale.</div>
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
                      {step === 'received' && 'Ordine preso in carico dalla cucina.'}
                      {step === 'preparing' && 'Stanno preparando il tuo ordine. Tieniti pronto.'}
                      {step === 'ready' && 'Pronto al banco. Corri.'}
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

      {/* Status chip */}
      <div style={styles.statusChipWrap}>
        <span style={{ ...styles.statusChip, background: statusInfo?.color + '22', color: statusInfo?.color, border: `1px solid ${statusInfo?.color}44` }}>
          {statusInfo?.label}
        </span>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#111',
    color: '#f5f0e8',
    fontFamily: "'Inter', sans-serif",
    paddingBottom: 48,
  },
  demoBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: '#0a0a0a',
    borderBottom: '1px solid #1e1e1e',
    overflowX: 'auto',
    flexWrap: 'nowrap',
  },
  demoLabel: { fontSize: 11, color: '#555', flexShrink: 0 },
  demoBtn: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 16,
    color: '#777',
    padding: '5px 12px',
    fontSize: 11,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  demoBtnActive: {
    background: '#2a2000',
    border: '1px solid #f5c842',
    color: '#f5c842',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '20px 16px 12px',
    borderBottom: '1px solid #1e1e1e',
  },
  headerLogo: { fontSize: 30 },
  headerTitle: { fontSize: 18, fontWeight: 800, letterSpacing: 2, color: '#f5c842' },
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
  },
  metaRow: { display: 'flex', justifyContent: 'space-between' },
  metaKey: { fontSize: 12, color: '#555' },
  metaVal: { fontSize: 13, fontWeight: 700, color: '#f5f0e8' },
  readyBanner: {
    margin: '16px',
    background: 'linear-gradient(135deg, #0a1a0a, #0a2a0a)',
    border: '2px solid #10b981',
    borderRadius: 12,
    padding: '18px 16px',
    textAlign: 'center',
  },
  readyEmoji: { fontSize: 40, marginBottom: 8 },
  readyTitle: { fontSize: 28, fontWeight: 900, color: '#10b981', letterSpacing: 3, marginBottom: 8 },
  readyMsg: { fontSize: 15, color: '#a7f3d0', lineHeight: 1.5 },
  cancelledBanner: {
    margin: '16px',
    background: '#1a0a0a',
    border: '1px solid #ef4444',
    borderRadius: 10,
    padding: '14px 16px',
    textAlign: 'center',
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
  },
  sectionTitle: {
    fontSize: 12,
    color: '#555',
    fontWeight: 700,
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
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
  totalValue: { fontSize: 18, fontWeight: 800, color: '#f5c842' },
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
};
