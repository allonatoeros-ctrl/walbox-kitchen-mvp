import { useEffect, useState } from 'react';
import { resolveOrderAllergens } from '../lib/kitchenAllergens';

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

// P0-3: derivazione condivisa in ../lib/kitchenAllergens — vedi il commento in testa a quel file.

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

  // Allergen summary: one row per ordine attivo con allergeni (no tavoli nel contratto Kitchen).
  // P0-3: entra in ALLERGENI ATTIVI anche un ordine con righe fuori catalogo, che prima usciva
  // dalla lista in silenzio (allergens vuoto) esattamente come un ordine davvero senza allergeni.
  const allergenRows = activeOrders
    .map((o) => {
      const { allergens, unknownItems, hasUnknown } = resolveOrderAllergens(o);
      return { orderCode: o.orderCode, nickname: o.nickname, allergens, unknownItems, hasUnknown };
    })
    .filter((r) => r.allergens.length > 0 || r.hasUnknown);

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
                    {order.orderCode && <span className="ksd-row-code">#{order.orderCode}</span>}
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
            <span className="ksd-section-count" style={{ color: '#ef4444' }}>{allergenRows.length} ordin{allergenRows.length === 1 ? 'e' : 'i'}</span>
          </div>

          <div className="ksd-row-list">
            {allergenRows.map((row) => (
              <div key={row.orderCode ?? row.nickname} className="ksd-row">
                <div className="ksd-row-left">
                  {row.orderCode && <span className="ksd-row-code">#{row.orderCode}</span>}
                  <span className="ksd-row-nickname">{row.nickname}</span>
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
                    {row.hasUnknown && (
                      <span data-testid="alert-allergeni-unverified" style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        background: '#000000',
                        color: '#ffc107',
                        borderRadius: '4px',
                        padding: '2px 7px',
                        border: '1px solid #ffc107',
                        letterSpacing: '0.3px',
                      }}>
                        NON VERIFICATI: {row.unknownItems.map((u) => (u.name || u.itemId).toUpperCase()).join(', ')}
                      </span>
                    )}
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
