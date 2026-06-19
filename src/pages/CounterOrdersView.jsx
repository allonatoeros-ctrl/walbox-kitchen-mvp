import { useState } from 'react';

const CANCEL_PRESETS = ['Cliente andato via', 'Fuori stock', 'Errore ordine', 'Altro'];

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

export default function CounterOrdersView({ orders, confirmPayment, updateOrderStatus, cancelOrder }) {
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const pendingOrders = sortByTime(orders.filter((o) => o.status === 'pending_counter_payment'));
  const readyOrders   = sortByTime(orders.filter((o) => o.status === 'ready'));

  const hasAnything = pendingOrders.length > 0 || readyOrders.length > 0;

  const startCancel = (orderId) => {
    setCancellingId(orderId);
    setCancelReason('');
    setCustomReason('');
  };

  const abortCancel = () => {
    setCancellingId(null);
    setCancelReason('');
    setCustomReason('');
  };

  const confirmCancel = (orderId) => {
    const finalReason = cancelReason === 'Altro' ? customReason.trim() : cancelReason;
    cancelOrder(orderId, finalReason);
    setCancellingId(null);
    setCancelReason('');
    setCustomReason('');
  };

  const isConfirmDisabled = !cancelReason || (cancelReason === 'Altro' && !customReason.trim());

  const renderCancelPanel = (order) => (
    <div className="ksd-cancel-panel">
      <div className="ksd-cancel-label">MOTIVO ANNULLAMENTO</div>
      <div className="ksd-cancel-presets">
        {CANCEL_PRESETS.map((p) => (
          <button
            key={p}
            className={`ksd-cancel-preset ${cancelReason === p ? 'ksd-cancel-preset--active' : ''}`}
            onClick={() => setCancelReason(p === cancelReason ? '' : p)}
          >
            {p}
          </button>
        ))}
      </div>
      {cancelReason === 'Altro' && (
        <input
          className="ksd-cancel-input"
          placeholder="Specifica il motivo..."
          value={customReason}
          onChange={(e) => setCustomReason(e.target.value)}
          autoFocus
        />
      )}
      <div className="ksd-cancel-actions">
        <button className="ksd-btn-cancel-abort" onClick={abortCancel}>
          ← INDIETRO
        </button>
        <button
          className="ksd-btn-cancel-confirm"
          disabled={isConfirmDisabled}
          onClick={() => confirmCancel(order.id)}
        >
          CONFERMA ANNULLAMENTO
        </button>
      </div>
    </div>
  );

  if (!hasAnything) {
    return <div className="ksd-empty">Nessun ordine al banco. In attesa di comande.</div>;
  }

  return (
    <div className="ksd-sections">

      {/* Section 1 — pending counter payment */}
      {pendingOrders.length > 0 && (
        <div className="ksd-section">
          <div
            className="ksd-section-header"
            style={{ background: '#1a0a20', borderLeft: '3px solid #a855f7' }}
          >
            <span className="ksd-section-label" style={{ color: '#a855f7' }}>IN ATTESA PAGAMENTO</span>
            <span className="ksd-section-count" style={{ color: '#a855f7' }}>{pendingOrders.length}</span>
          </div>

          <div className="ksd-row-list">
            {pendingOrders.map((order) => {
              const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');
              const isCancelling = cancellingId === order.id;
              return (
                <div key={order.id} className={`ksd-row ${isCancelling ? 'ksd-row--cancelling' : ''}`}>
                  <div className="ksd-row-left">
                    {order.orderCode && <span className="ksd-row-code">#{order.orderCode}</span>}
                    <span className="ksd-row-table">{order.table}</span>
                    <span className="ksd-row-nickname">{order.nickname}</span>
                    <span className="ksd-row-time">{formatTime(order.createdAt)} · {elapsedMinutes(order.createdAt)}</span>
                    {order.total != null && (
                      <span className="ksd-row-total" style={{ color: '#a855f7', fontWeight: 700 }}>
                        € {order.total.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="ksd-row-center">
                    <div className="ksd-row-items">{itemsSummary}</div>
                  </div>
                  {!isCancelling && (
                    <div className="ksd-row-right">
                      <div className="ksd-row-actions">
                        <button
                          className="ksd-btn-action"
                          style={{ background: '#a855f7', color: '#fff' }}
                          onClick={() => confirmPayment(order.id, 'counter')}
                        >
                          PAGATO ✓
                        </button>
                        <button className="ksd-btn-cancel" onClick={() => startCancel(order.id)}>
                          ANNULLA
                        </button>
                      </div>
                    </div>
                  )}
                  {isCancelling && renderCancelPanel(order)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 2 — ready, waiting for counter pickup */}
      {readyOrders.length > 0 && (
        <div className="ksd-section">
          <div
            className="ksd-section-header"
            style={{ background: '#0a2a1a', borderLeft: '3px solid #10b981' }}
          >
            <span className="ksd-section-label" style={{ color: '#10b981' }}>PRONTI AL BANCO</span>
            <span className="ksd-section-count" style={{ color: '#10b981' }}>{readyOrders.length}</span>
          </div>

          <div className="ksd-row-list">
            {readyOrders.map((order) => {
              const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');
              const isCancelling = cancellingId === order.id;
              return (
                <div key={order.id} className={`ksd-row ${isCancelling ? 'ksd-row--cancelling' : ''}`}>
                  <div className="ksd-row-left">
                    {order.orderCode && <span className="ksd-row-code">#{order.orderCode}</span>}
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
                  {!isCancelling && (
                    <div className="ksd-row-right">
                      <div className="ksd-row-actions">
                        <button
                          className="ksd-btn-action"
                          style={{ background: '#10b981', color: '#fff' }}
                          onClick={() => updateOrderStatus(order.id, 'delivered')}
                        >
                          RITIRATO ✓
                        </button>
                        <button className="ksd-btn-cancel" onClick={() => startCancel(order.id)}>
                          ANNULLA
                        </button>
                      </div>
                    </div>
                  )}
                  {isCancelling && renderCancelPanel(order)}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
