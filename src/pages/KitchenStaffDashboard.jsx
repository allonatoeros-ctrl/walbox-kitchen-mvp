import { useState, useEffect } from 'react';
import { demoKitchenOrders, kitchenOrderStatuses } from '../data/kitchenMockData';

const PRIMARY_ACTION = {
  received:  { next: 'preparing', label: 'INIZIA' },
  preparing: { next: 'ready',     label: 'PRONTO ✓' },
  ready:     { next: 'delivered', label: 'CONSEGNATO ✓' },
};

const SECTIONS = [
  {
    key: 'ready',
    label: 'PRONTI',
    color: '#10b981',
    bg: '#0a2a0a',
    border: '#10b98133',
  },
  {
    key: 'preparing',
    label: 'IN PREPARAZIONE',
    color: '#3b82f6',
    bg: '#0a1020',
    border: '#3b82f633',
  },
  {
    key: 'received',
    label: 'NUOVI',
    color: '#f5c842',
    bg: '#1a1400',
    border: '#f5c84233',
  },
];

const LS_KEY = 'walbox_kitchen_orders_demo';

function initOrders() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
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

function sortByTime(orders) {
  return [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function buildProductionSummary(orders) {
  const totals = {};
  orders
    .filter((o) => o.status === 'received' || o.status === 'preparing')
    .forEach((o) => {
      o.items.forEach((item) => {
        totals[item.name] = (totals[item.name] || 0) + item.quantity;
      });
    });
  return Object.entries(totals).map(([name, qty]) => `${qty}× ${name}`);
}

function loadOrdersFromStorage() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
}

export default function KitchenStaffDashboard() {
  const [orders, setOrders] = useState(initOrders);

  useEffect(() => {
    const refresh = () => setOrders(loadOrdersFromStorage());

    const onStorage = (e) => {
      if (e.key === LS_KEY) refresh();
    };
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const changeStatus = (id, newStatus) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o));
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetDemo = () => {
    const fresh = demoKitchenOrders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    try { localStorage.setItem(LS_KEY, JSON.stringify(fresh)); } catch {}
    setOrders(fresh);
  };

  const activeCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;
  const productionItems = buildProductionSummary(orders);

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
          <button style={styles.btnReset} onClick={resetDemo}>RESET DEMO</button>
        </div>
      </div>

      {/* Production Summary */}
      <div style={styles.productionBox}>
        <span style={styles.productionLabel}>ORA IN CUCINA</span>
        {productionItems.length > 0 ? (
          <span style={styles.productionItems}>
            {productionItems.join('  ·  ')}
          </span>
        ) : (
          <span style={styles.productionEmpty}>Nessun item da preparare.</span>
        )}
      </div>

      {/* Global ready alert */}
      {readyCount > 0 && (
        <div style={styles.globalReadyAlert}>
          🟢 {readyCount} {readyCount === 1 ? 'ordine pronto' : 'ordini pronti'} — chiama il cliente al banco
        </div>
      )}

      {/* Sections */}
      <div style={styles.sections}>
        {SECTIONS.map((section) => {
          const sectionOrders = sortByTime(
            orders.filter((o) => o.status === section.key)
          );
          if (sectionOrders.length === 0) return null;

          return (
            <div key={section.key} style={styles.section}>
              {/* Section header */}
              <div
                style={{
                  ...styles.sectionHeader,
                  background: section.bg,
                  borderLeft: `3px solid ${section.color}`,
                }}
              >
                <span style={{ ...styles.sectionLabel, color: section.color }}>
                  {section.label}
                </span>
                <span style={{ ...styles.sectionCount, color: section.color }}>
                  {sectionOrders.length}
                </span>
              </div>

              {/* Order rows */}
              <div style={styles.rowList}>
                {sectionOrders.map((order) => {
                  const action = PRIMARY_ACTION[order.status];
                  const itemsSummary = order.items
                    .map((i) => `${i.quantity}× ${i.name}`)
                    .join('  ·  ');

                  return (
                    <div key={order.id} style={styles.row}>
                      {/* Left: table + nickname + time */}
                      <div style={styles.rowLeft}>
                        <span style={styles.rowTable}>{order.table}</span>
                        <span style={styles.rowNickname}>{order.nickname}</span>
                        <span style={styles.rowTime}>
                          {formatTime(order.createdAt)} · {elapsedMinutes(order.createdAt)}
                        </span>
                      </div>

                      {/* Center: items + note */}
                      <div style={styles.rowCenter}>
                        <div style={styles.rowItems}>{itemsSummary}</div>
                        {order.note ? (
                          <div style={styles.rowNote}>
                            ⚠️ {order.note}
                          </div>
                        ) : null}
                      </div>

                      {/* Right: primary action */}
                      <div style={styles.rowRight}>
                        {action && (
                          <button
                            style={{
                              ...styles.btnAction,
                              background: section.color,
                              color: section.key === 'received' ? '#111' : '#fff',
                            }}
                            onClick={() => changeStatus(order.id, action.next)}
                          >
                            {action.label}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeCount === 0 && (
          <div style={styles.empty}>Nessun ordine attivo. In attesa di comande.</div>
        )}
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
    padding: '16px 16px 12px',
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
    padding: '11px 16px',
    textAlign: 'center',
    borderBottom: '1px solid #10b98133',
  },
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  section: {
    borderBottom: '1px solid #1a1a1a',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.5,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: 900,
  },
  rowList: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderTop: '1px solid #1a1a1a',
  },
  rowLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
    flexShrink: 0,
    width: 80,
  },
  rowTable: {
    background: '#f5c842',
    color: '#111',
    fontSize: 15,
    fontWeight: 900,
    borderRadius: 5,
    padding: '2px 8px',
    lineHeight: 1.4,
  },
  rowNickname: {
    fontSize: 12,
    color: '#ccc',
    fontWeight: 600,
    maxWidth: 80,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowTime: {
    fontSize: 11,
    color: '#555',
  },
  rowCenter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  rowItems: {
    fontSize: 14,
    fontWeight: 700,
    color: '#f5f0e8',
    lineHeight: 1.4,
  },
  rowNote: {
    fontSize: 13,
    fontWeight: 700,
    color: '#f5a623',
    lineHeight: 1.3,
  },
  rowRight: {
    flexShrink: 0,
  },
  btnAction: {
    border: 'none',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    fontWeight: 900,
    cursor: 'pointer',
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  },
  empty: {
    color: '#333',
    fontSize: 14,
    textAlign: 'center',
    padding: '48px 16px',
  },
  productionBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 16px',
    background: '#111',
    borderBottom: '1px solid #1e1e1e',
  },
  productionLabel: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 2,
    color: '#444',
    textTransform: 'uppercase',
  },
  productionItems: {
    fontSize: 14,
    fontWeight: 700,
    color: '#f5f0e8',
    lineHeight: 1.5,
  },
  productionEmpty: {
    fontSize: 13,
    color: '#333',
  },
  btnReset: {
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#555',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    cursor: 'pointer',
    letterSpacing: 0.5,
  },
};
