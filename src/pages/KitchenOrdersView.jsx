import { useEffect, useState } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

const PRIMARY_ACTION = {
  received:  { next: 'preparing', label: 'INIZIA' },
  preparing: { next: 'ready',     label: 'PRONTO ✓' },
  ready:     { next: 'delivered', label: 'CONSEGNATO ✓' },
};

const SECTIONS = [
  { key: 'ready',     label: 'PRONTI',          color: '#10b981', bg: '#0a2a0a' },
  { key: 'preparing', label: 'IN PREPARAZIONE', color: '#3b82f6', bg: '#0a1020' },
  { key: 'received',  label: 'NUOVI',           color: '#f5c842', bg: '#1a1400' },
];

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function elapsedMinutes(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return 'adesso';
  if (diff === 1) return '1 min fa';
  return `${diff} min fa`;
}

function urgencyClass(isoString) {
  const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
  if (mins >= 15) return 'ksd-row--danger';
  if (mins >= 10) return 'ksd-row--warning';
  return '';
}

function timerRef(order) {
  if (order.status === 'ready') return order.readyAt || order.createdAt;
  return order.createdAt;
}

function sortByTime(orders) {
  return [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getAllergens(order) {
  const set = new Set();
  order.items.forEach((item) => {
    const mi = kitchenMenuItems.find((m) => m.id === item.itemId);
    if (mi?.allergens) mi.allergens.forEach((a) => set.add(a));
  });
  return [...set];
}

function buildProductionSummary(orders) {
  const totals = {};
  orders
    .filter((o) => o.status === 'received' || o.status === 'preparing')
    .forEach((o) => o.items.forEach((item) => {
      totals[item.name] = (totals[item.name] || 0) + item.quantity;
    }));
  return Object.entries(totals).map(([name, qty]) => `${qty}× ${name}`);
}

function isKitchenReady(order) {
  return order.paymentStatus === 'paid' || order.paymentStatus == null;
}

export default function KitchenOrdersView({ orders, updateOrderStatus }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const kitchenOrders   = orders.filter((o) => o.status !== 'pending_counter_payment' && isKitchenReady(o));
  const activeCount     = kitchenOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const readyCount      = kitchenOrders.filter((o) => o.status === 'ready').length;
  const productionItems = buildProductionSummary(kitchenOrders);

  return (
    <>
      {/* Production summary */}
      <div className="ksd-production">
        <span className="ksd-production-label">ORA IN CUCINA</span>
        {productionItems.length > 0
          ? <span className="ksd-production-items">{productionItems.join('  ·  ')}</span>
          : <span className="ksd-production-empty">Nessun item da preparare.</span>
        }
      </div>

      {/* Ready alert */}
      {readyCount > 0 && (
        <div className="ksd-ready-alert">
          🟢 {readyCount} {readyCount === 1 ? 'ordine pronto' : 'ordini pronti'} — chiama il cliente al banco
        </div>
      )}

      {/* Kitchen sections */}
      <div className="ksd-sections">
        {SECTIONS.map((section) => {
          const sectionOrders = sortByTime(kitchenOrders.filter((o) => o.status === section.key));
          if (sectionOrders.length === 0) return null;

          return (
            <div key={section.key} className="ksd-section">
              <div
                className="ksd-section-header"
                style={{ background: section.bg, borderLeft: `3px solid ${section.color}` }}
              >
                <span className="ksd-section-label" style={{ color: section.color }}>{section.label}</span>
                <span className="ksd-section-count" style={{ color: section.color }}>{sectionOrders.length}</span>
              </div>

              <div className="ksd-row-list">
                {sectionOrders.map((order) => {
                  const action       = PRIMARY_ACTION[order.status];

                  const allergens = getAllergens(order);

                  return (
                    <div key={order.id} className={`ksd-row ${urgencyClass(timerRef(order))}`}>
                      <div className="ksd-row-left">
                        <span className="ksd-row-table">{order.table}</span>
                        <span className="ksd-row-nickname">{order.nickname}</span>
                        <span className="ksd-row-time">
                          {formatTime(order.createdAt)}
                          {order.status === 'ready' && order.readyAt
                            ? ` · pronto ${elapsedMinutes(order.readyAt)}`
                            : ` · ${elapsedMinutes(order.createdAt)}`}
                        </span>
                        {order.total != null && (
                          <span className="ksd-row-total">€ {order.total.toFixed(2)}</span>
                        )}
                      </div>
                      <div className="ksd-row-center">
                        <div className="ksd-row-items">
                          {order.items.map((item, idx) => (
                            <div key={idx}>
                              {item.quantity}× {item.name}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="ksd-row-right">
                        {action && (
                          <button
                            className="ksd-btn-action"
                            style={{
                              background: section.color,
                              color: section.key === 'received' ? '#111' : '#fff',
                            }}
                            onClick={() => updateOrderStatus(order.id, action.next)}
                          >
                            {action.label}
                          </button>
                        )}
                      </div>
                      {order.note && (
                        <div className="ksd-row-note-block">
                          <span className="ksd-note-icon">⚠️</span>
                          <span className="ksd-note-text">{order.note}</span>
                        </div>
                      )}
                      {allergens.length > 0 && (
                        <div style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                          background: '#2b0b0b', border: '1px solid #ef4444', borderRadius: '6px',
                          padding: '6px 10px', marginTop: '2px',
                        }}>
                          <span style={{ fontSize: '13px', flexShrink: 0, color: '#ef4444' }}>⚠</span>
                          <span style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.5px', color: '#ef4444', flexShrink: 0 }}>ALLERGENI:</span>
                          {allergens.map((a) => (
                            <span key={a} style={{
                              fontSize: '11px', fontWeight: 900, background: '#ef4444',
                              color: '#000000', borderRadius: '4px', padding: '2px 7px',
                              border: '1px solid #ff8888', letterSpacing: '0.3px',
                            }}>{a.toUpperCase()}</span>
                          ))}
                        </div>
                      )}
                      {order.staffNote && (
                        <div style={{
                          width: '100%', display: 'flex', alignItems: 'flex-start', gap: '8px',
                          background: '#071420', border: '1px solid #3b82f655', borderRadius: '6px',
                          padding: '7px 12px', marginTop: '2px',
                        }}>
                          <span style={{ fontSize: '14px', flexShrink: 0 }}>📋</span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa', lineHeight: 1.4 }}>{order.staffNote}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeCount === 0 && (
          <div className="ksd-empty">Nessun ordine in cucina. In attesa di comande.</div>
        )}
      </div>
    </>
  );
}
