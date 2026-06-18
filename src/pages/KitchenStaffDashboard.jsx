import { kitchenOrderStatuses } from '../data/kitchenMockData';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import './KitchenStaffDashboard.css';

const PRIMARY_ACTION = {
  received:  { next: 'preparing', label: 'INIZIA' },
  preparing: { next: 'ready',     label: 'PRONTO ✓' },
  ready:     { next: 'delivered', label: 'CONSEGNATO ✓' },
};

// Per-section colors are data-driven → must stay inline
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

function sortByTime(orders) {
  return [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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

export default function KitchenStaffDashboard() {
  const { orders, updateOrderStatus, resetToDemo } = useKitchenOrders();

  const activeCount    = orders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length;
  const readyCount     = orders.filter((o) => o.status === 'ready').length;
  const productionItems = buildProductionSummary(orders);

  return (
    <div className="ksd-page">

      {/* Header */}
      <div className="ksd-header">
        <div>
          <div className="ksd-header-title">WALBOX KITCHEN</div>
          <div className="ksd-header-sub">Staff · Cucina</div>
        </div>
        <div className="ksd-header-badges">
          <span className="ksd-badge-active">{activeCount} attivi</span>
          {readyCount > 0 && <span className="ksd-badge-ready">{readyCount} pronti 🟢</span>}
          <button className="ksd-btn-reset" onClick={resetToDemo}>RESET DEMO</button>
        </div>
      </div>

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

      {/* Sections */}
      <div className="ksd-sections">
        {SECTIONS.map((section) => {
          const sectionOrders = sortByTime(orders.filter((o) => o.status === section.key));
          if (sectionOrders.length === 0) return null;

          return (
            <div key={section.key} className="ksd-section">
              {/* Section header — colors from data, must stay inline */}
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
                  const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');

                  return (
                    <div key={order.id} className={`ksd-row ${urgencyClass(order.createdAt)}`}>
                      <div className="ksd-row-left">
                        <span className="ksd-row-table">{order.table}</span>
                        <span className="ksd-row-nickname">{order.nickname}</span>
                        <span className="ksd-row-time">{formatTime(order.createdAt)} · {elapsedMinutes(order.createdAt)}</span>
                        {order.total != null && (
                          <span className="ksd-row-total">€ {order.total.toFixed(2)}</span>
                        )}
                      </div>
                      <div className="ksd-row-center">
                        <div className="ksd-row-items">{itemsSummary}</div>
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
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {activeCount === 0 && (
          <div className="ksd-empty">Nessun ordine attivo. In attesa di comande.</div>
        )}
      </div>
    </div>
  );
}
