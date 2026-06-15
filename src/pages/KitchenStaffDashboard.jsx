import { useState } from 'react';
import { demoKitchenOrders, kitchenOrderStatuses } from '../data/kitchenMockData';

const STATUS_FLOW = {
  received:  { next: 'preparing', nextLabel: 'Inizia preparazione' },
  preparing: { next: 'ready',     nextLabel: 'Segna pronto' },
  ready:     { next: 'delivered', nextLabel: 'Consegnato' },
  delivered: { next: null,        nextLabel: null },
  cancelled: { next: null,        nextLabel: null },
};

const FILTERS = [
  { key: 'all',       label: 'Tutti' },
  { key: 'active',    label: 'Attivi' },
  { key: 'ready',     label: '🟢 Pronti' },
];

function initOrders() {
  return demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function KitchenStaffDashboard() {
  const [orders, setOrders] = useState(initOrders);
  const [filter, setFilter] = useState('all');

  const changeStatus = (id, newStatus) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );
  };

  const activeCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;

  const readyCount = orders.filter((o) => o.status === 'ready').length;

  const visibleOrders = orders.filter((o) => {
    if (filter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
    if (filter === 'ready') return o.status === 'ready';
    return true;
  });

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>WALBOX KITCHEN</div>
          <div style={styles.headerSub}>Staff · Cucina</div>
        </div>
        <div style={styles.headerBadges}>
          <span style={styles.badgeActive}>{activeCount} attivi</span>
          {readyCount > 0 && (
            <span style={styles.badgeReady}>{readyCount} pronti 🟢</span>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterRow}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            style={{ ...styles.filterBtn, ...(filter === f.key ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div style={styles.orderList}>
        {visibleOrders.length === 0 && (
          <div style={styles.empty}>Nessun ordine in questa vista.</div>
        )}

        {visibleOrders.map((order) => {
          const statusInfo = kitchenOrderStatuses[order.status];
          const flow = STATUS_FLOW[order.status];
          const isReady = order.status === 'ready';
          const isTerminal = order.status === 'delivered' || order.status === 'cancelled';

          return (
            <div
              key={order.id}
              style={{
                ...styles.card,
                borderColor: isReady ? '#10b981' : '#2a2a2a',
                boxShadow: isReady ? '0 0 12px #10b98133' : 'none',
              }}
            >
              {/* Ready alert */}
              {isReady && (
                <div style={styles.readyAlert}>
                  🟢 PRONTO — CHIAMA IL CLIENTE
                </div>
              )}

              {/* Card header */}
              <div style={styles.cardHeader}>
                <div style={styles.cardMeta}>
                  <span style={styles.cardTable}>{order.table}</span>
                  <span style={styles.cardNickname}>{order.nickname}</span>
                  <span style={styles.cardTime}>{formatTime(order.createdAt)}</span>
                </div>
                <span
                  style={{
                    ...styles.statusChip,
                    background: statusInfo.color + '22',
                    color: statusInfo.color,
                    border: `1px solid ${statusInfo.color}55`,
                  }}
                >
                  {statusInfo.label}
                </span>
              </div>

              {/* Items */}
              <div style={styles.itemList}>
                {order.items.map((item, i) => (
                  <div key={i} style={styles.itemRow}>
                    <span style={styles.itemQty}>{item.quantity}×</span>
                    <span style={styles.itemName}>{item.name}</span>
                    <span style={styles.itemPrice}>€{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div style={styles.totalRow}>
                <span style={styles.totalLabel}>Totale</span>
                <span style={styles.totalValue}>€{order.total.toFixed(2)}</span>
              </div>

              {/* Note */}
              {order.note ? (
                <div style={styles.noteBox}>
                  <span style={styles.noteLabel}>Nota: </span>
                  <span style={styles.noteText}>{order.note}</span>
                </div>
              ) : null}

              {/* Actions */}
              {!isTerminal && (
                <div style={styles.actions}>
                  {/* Primary next action */}
                  {flow.next && (
                    <button
                      style={styles.btnPrimary}
                      onClick={() => changeStatus(order.id, flow.next)}
                    >
                      {flow.nextLabel}
                    </button>
                  )}

                  {/* Secondary actions */}
                  <div style={styles.actionsSecondary}>
                    {order.status !== 'received' && (
                      <button
                        style={styles.btnSecondary}
                        onClick={() => changeStatus(order.id, 'received')}
                      >
                        ← Ricevuto
                      </button>
                    )}
                    <button
                      style={styles.btnCancel}
                      onClick={() => changeStatus(order.id, 'cancelled')}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              )}

              {/* Terminal state label */}
              {isTerminal && (
                <div style={styles.terminalLabel}>
                  {order.status === 'delivered' ? '✓ Consegnato' : '✕ Annullato'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0d0d0d',
    color: '#f5f0e8',
    fontFamily: "'Inter', sans-serif",
    paddingBottom: 40,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 16px 14px',
    borderBottom: '1px solid #1e1e1e',
  },
  headerTitle: { fontSize: 18, fontWeight: 900, letterSpacing: 2, color: '#f5c842' },
  headerSub: { fontSize: 12, color: '#555', marginTop: 2 },
  headerBadges: { display: 'flex', gap: 8, alignItems: 'center' },
  badgeActive: {
    background: '#1e1e1e',
    color: '#888',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 20,
    padding: '4px 12px',
    border: '1px solid #2a2a2a',
  },
  badgeReady: {
    background: '#0a2a0a',
    color: '#10b981',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 20,
    padding: '4px 12px',
    border: '1px solid #10b98155',
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #1a1a1a',
  },
  filterBtn: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 20,
    color: '#666',
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  filterBtnActive: {
    background: '#2a2000',
    border: '1px solid #f5c842',
    color: '#f5c842',
  },
  orderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '16px',
  },
  empty: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
    padding: '40px 0',
  },
  card: {
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '14px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  readyAlert: {
    background: '#0a2a0a',
    color: '#10b981',
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 1,
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 12,
    textAlign: 'center',
    border: '1px solid #10b98133',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 10 },
  cardTable: {
    background: '#f5c842',
    color: '#111',
    fontSize: 13,
    fontWeight: 900,
    borderRadius: 6,
    padding: '3px 10px',
  },
  cardNickname: { fontSize: 14, fontWeight: 700, color: '#f5f0e8' },
  cardTime: { fontSize: 12, color: '#555' },
  statusChip: {
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 20,
    padding: '4px 12px',
    flexShrink: 0,
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    marginBottom: 10,
  },
  itemRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  itemQty: { fontSize: 13, color: '#f5c842', fontWeight: 700, minWidth: 22 },
  itemName: { fontSize: 14, color: '#ccc', flex: 1 },
  itemPrice: { fontSize: 13, color: '#888' },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: '1px solid #2a2a2a',
    paddingTop: 8,
    marginBottom: 10,
  },
  totalLabel: { fontSize: 12, color: '#555', fontWeight: 600 },
  totalValue: { fontSize: 16, fontWeight: 800, color: '#f5c842' },
  noteBox: {
    background: '#111',
    border: '1px solid #222',
    borderRadius: 6,
    padding: '7px 10px',
    marginBottom: 12,
  },
  noteLabel: { fontSize: 11, color: '#555' },
  noteText: { fontSize: 13, color: '#aaa' },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  btnPrimary: {
    background: '#f5c842',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '11px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    width: '100%',
    letterSpacing: 0.5,
  },
  actionsSecondary: { display: 'flex', gap: 8 },
  btnSecondary: {
    flex: 1,
    background: '#222',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#aaa',
    padding: '8px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnCancel: {
    flex: 1,
    background: '#1a0a0a',
    border: '1px solid #ef444433',
    borderRadius: 8,
    color: '#ef4444',
    padding: '8px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  terminalLabel: {
    textAlign: 'center',
    fontSize: 13,
    color: '#444',
    fontWeight: 600,
    paddingTop: 4,
  },
};
