import { useState } from 'react';
import { demoKitchenOrders, kitchenOrderStatuses } from '../data/kitchenMockData';

const STATUS_FLOW = {
  received:  { next: 'preparing', nextLabel: 'INIZIA PREPARAZIONE' },
  preparing: { next: 'ready',     nextLabel: 'SEGNA PRONTO ✓' },
  ready:     { next: 'delivered', nextLabel: 'CONSEGNATO ✓' },
  delivered: { next: null,        nextLabel: null },
  cancelled: { next: null,        nextLabel: null },
};

const STATUS_SORT_ORDER = { received: 0, preparing: 1, ready: 2, delivered: 3, cancelled: 4 };

const FILTERS = [
  { key: 'active', label: 'Attivi' },
  { key: 'ready',  label: '🟢 Pronti' },
  { key: 'all',    label: 'Tutti' },
];

function initOrders() {
  return demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function elapsedMinutes(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return 'adesso';
  if (diff === 1) return '1 min fa';
  return `${diff} min fa`;
}

function sortOrders(orders) {
  return [...orders].sort((a, b) => {
    const statusDiff = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

export default function KitchenStaffDashboard() {
  const [orders, setOrders] = useState(initOrders);
  const [filter, setFilter] = useState('active');

  const changeStatus = (id, newStatus) => {
    if (newStatus === 'cancelled') {
      const ok = window.confirm('Annullare questo ordine? Questa azione non si può recuperare.');
      if (!ok) return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );
  };

  const activeCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;

  const readyCount = orders.filter((o) => o.status === 'ready').length;

  const filteredOrders = orders.filter((o) => {
    if (filter === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
    if (filter === 'ready') return o.status === 'ready';
    return true;
  });

  const visibleOrders = sortOrders(filteredOrders);

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

      {/* Global ready alert */}
      {readyCount > 0 && (
        <div style={styles.globalReadyAlert}>
          🟢 {readyCount} {readyCount === 1 ? 'ordine pronto' : 'ordini pronti'} — chiama il cliente al banco
        </div>
      )}

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
                boxShadow: isReady ? '0 0 14px #10b98140' : 'none',
              }}
            >
              {/* Ready alert inside card */}
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

              {/* Time + elapsed */}
              <div style={styles.cardTime}>
                {formatTime(order.createdAt)} · {elapsedMinutes(order.createdAt)}
              </div>

              {/* Note cucina — SOPRA gli item, massima evidenza */}
              {order.note ? (
                <div style={styles.noteBox}>
                  <span style={styles.noteLabel}>⚠️ NOTA: </span>
                  <span style={styles.noteText}>{order.note}</span>
                </div>
              ) : null}

              {/* Items — solo quantità e nome */}
              <div style={styles.itemList}>
                {order.items.map((item, i) => (
                  <div key={i} style={styles.itemRow}>
                    <span style={styles.itemQty}>{item.quantity}×</span>
                    <span style={styles.itemName}>{item.name}</span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              {!isTerminal && (
                <div style={styles.actions}>
                  {flow.next && (
                    <button
                      style={styles.btnPrimary}
                      onClick={() => changeStatus(order.id, flow.next)}
                    >
                      {flow.nextLabel}
                    </button>
                  )}

                  <div style={styles.actionsSecondary}>
                    {order.status !== 'received' && (
                      <button
                        style={styles.btnSecondary}
                        onClick={() => changeStatus(order.id, 'received')}
                      >
                        ← Torna a ricevuto
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

              {/* Terminal state */}
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
  globalReadyAlert: {
    background: '#0a2a0a',
    color: '#10b981',
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.5,
    padding: '12px 16px',
    textAlign: 'center',
    borderBottom: '1px solid #10b98133',
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
    alignItems: 'center',
    marginBottom: 4,
  },
  cardMeta: { display: 'flex', alignItems: 'center', gap: 10 },
  cardTable: {
    background: '#f5c842',
    color: '#111',
    fontSize: 14,
    fontWeight: 900,
    borderRadius: 6,
    padding: '3px 10px',
  },
  cardNickname: { fontSize: 15, fontWeight: 700, color: '#f5f0e8' },
  cardTime: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  statusChip: {
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 20,
    padding: '4px 12px',
    flexShrink: 0,
  },
  noteBox: {
    background: '#1e1000',
    border: '1px solid #f5c84255',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 12,
  },
  noteLabel: {
    fontSize: 12,
    color: '#f5c842',
    fontWeight: 800,
    letterSpacing: 0.5,
    marginRight: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#f5c842',
    fontWeight: 700,
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginBottom: 14,
  },
  itemRow: { display: 'flex', alignItems: 'baseline', gap: 10 },
  itemQty: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 900,
    minWidth: 32,
    lineHeight: 1,
  },
  itemName: {
    fontSize: 18,
    color: '#f5f0e8',
    fontWeight: 700,
    flex: 1,
    lineHeight: 1.3,
  },
  actions: { display: 'flex', flexDirection: 'column', gap: 10 },
  btnPrimary: {
    background: '#f5c842',
    color: '#111',
    border: 'none',
    borderRadius: 8,
    padding: '16px',
    fontSize: 15,
    fontWeight: 900,
    cursor: 'pointer',
    width: '100%',
    letterSpacing: 0.5,
  },
  actionsSecondary: {
    display: 'flex',
    gap: 8,
    paddingTop: 2,
  },
  btnSecondary: {
    flex: 1,
    background: '#222',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#777',
    padding: '9px',
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
    padding: '9px',
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
