import { useEffect, useState } from 'react';
import { kitchenMenuItems } from '../data/kitchenMockData';

function elapsedMinutes(isoString) {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
}

function elapsedLabel(mins) {
  if (mins < 1) return 'adesso';
  if (mins === 1) return '1 min fa';
  return `${mins} min fa`;
}

function urgencyClass(isoString) {
  const mins = elapsedMinutes(isoString);
  if (mins >= 15) return 'ksd-row--danger';
  if (mins >= 10) return 'ksd-row--warning';
  return '';
}

function getAllergens(order) {
  const set = new Set();
  order.items.forEach((item) => {
    const mi = kitchenMenuItems.find((m) => m.id === item.itemId);
    if (mi?.allergens) mi.allergens.forEach((a) => set.add(a));
  });
  return [...set];
}

export default function AlertView({ orders }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const activeOrders = orders.filter(
    (o) => o.status !== 'pending_counter_payment' && o.status !== 'delivered' && o.status !== 'cancelled'
  );

  const urgentOrders = activeOrders.filter((o) => elapsedMinutes(o.createdAt) >= 10);

  // Allergen summary: group by table, collect all allergens from active orders
  const allergensByTable = {};
  activeOrders.forEach((o) => {
    const allergens = getAllergens(o);
    if (allergens.length === 0) return;
    if (!allergensByTable[o.table]) allergensByTable[o.table] = { table: o.table, allergens: new Set() };
    allergens.forEach((a) => allergensByTable[o.table].allergens.add(a));
  });
  const allergenRows = Object.values(allergensByTable).map((r) => ({
    table: r.table,
    allergens: [...r.allergens],
  }));

  const hasAlerts = urgentOrders.length > 0 || allergenRows.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {!hasAlerts && (
        <div className="ksd-empty" style={{ color: '#10b981', fontSize: '16px', paddingTop: '64px' }}>
          Tutto a posto 🟢
        </div>
      )}

      {/* ── Urgency section ── */}
      {urgentOrders.length > 0 && (
        <div className="ksd-section" style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div
            className="ksd-section-header"
            style={{ background: '#1a0505', borderLeft: '3px solid #ef4444' }}
          >
            <span className="ksd-section-label" style={{ color: '#ef4444' }}>URGENZA TEMPI</span>
            <span className="ksd-section-count" style={{ color: '#ef4444' }}>{urgentOrders.length}</span>
          </div>

          <div className="ksd-row-list">
            {urgentOrders.map((order) => {
              const mins = elapsedMinutes(order.createdAt);
              const cls  = urgencyClass(order.createdAt);
              const isDanger = mins >= 15;
              const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');

              return (
                <div key={order.id} className={`ksd-row ${cls}`}>
                  <div className="ksd-row-left">
                    <span className="ksd-row-table">{order.table}</span>
                    <span className="ksd-row-nickname">{order.nickname}</span>
                    <span className="ksd-row-time">{elapsedLabel(mins)}</span>
                  </div>
                  <div className="ksd-row-center">
                    <div className="ksd-row-items">{itemsSummary}</div>
                  </div>
                  <div className="ksd-row-right">
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 900,
                      letterSpacing: '1px',
                      borderRadius: '10px',
                      padding: '3px 10px',
                      background: isDanger ? '#3a0808' : '#1e1200',
                      color: isDanger ? '#ef4444' : '#f59e0b',
                      border: `1px solid ${isDanger ? '#ef444455' : '#f59e0b55'}`,
                    }}>
                      {isDanger ? '🔴 CRITICO' : '🟠 LENTO'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Allergen summary section ── */}
      {allergenRows.length > 0 && (
        <div className="ksd-section">
          <div
            className="ksd-section-header"
            style={{ background: '#1a0505', borderLeft: '3px solid #ef4444' }}
          >
            <span className="ksd-section-label" style={{ color: '#ef4444' }}>ALLERGENI ATTIVI</span>
            <span className="ksd-section-count" style={{ color: '#ef4444' }}>{allergenRows.length} tavol{allergenRows.length === 1 ? 'o' : 'i'}</span>
          </div>

          <div className="ksd-row-list">
            {allergenRows.map((row) => (
              <div key={row.table} className="ksd-row">
                <div className="ksd-row-left">
                  <span className="ksd-row-table">{row.table}</span>
                </div>
                <div className="ksd-row-center">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', flexShrink: 0, color: '#ef4444' }}>⚠</span>
                    {row.allergens.map((a) => (
                      <span key={a} style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        background: '#ef4444',
                        color: '#000000',
                        borderRadius: '4px',
                        padding: '2px 7px',
                        border: '1px solid #ff8888',
                        letterSpacing: '0.3px',
                      }}>
                        {a.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
