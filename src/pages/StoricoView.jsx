import { useState, useMemo } from 'react';

const HISTORY_PAGE_SIZE = 15;

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function StoricoView({ orders }) {
  const [historySearch, setHistorySearch] = useState('');

  const summary = useMemo(() => {
    const delivered = orders.filter((o) => o.status === 'delivered');
    const count = delivered.length;
    const total = delivered.reduce((sum, o) => sum + (o.total ?? 0), 0);
    const avg = count > 0 ? total / count : 0;
    return { count, total, avg };
  }, [orders]);

  const historyOrders = useMemo(() => {
    const completed = orders
      .filter((o) => o.status === 'delivered' || o.status === 'cancelled')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!historySearch.trim()) return completed.slice(0, HISTORY_PAGE_SIZE);
    const term = historySearch.trim().toLowerCase();
    return completed.filter((o) => o.nickname?.toLowerCase().includes(term));
  }, [orders, historySearch]);

  const historyTotal = orders.filter((o) => o.status === 'delivered' || o.status === 'cancelled').length;

  return (
    <div className="ksd-sections">
      <div className="ksd-history" style={{ borderTop: 'none' }}>
        <div className="ksd-history-body">
          <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consegnati</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{summary.count}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Totale incassato</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#facc15' }}>€ {summary.total.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Media ticket</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>€ {summary.avg.toFixed(2)}</span>
            </div>
          </div>

          <div className="ksd-history-search-wrap">
            <input
              className="ksd-history-search"
              placeholder="Cerca per nickname..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            {historySearch && (
              <button className="ksd-history-search-clear" onClick={() => setHistorySearch('')}>✕</button>
            )}
          </div>

          {historyTotal === 0 ? (
            <div className="ksd-history-empty">Nessun ordine nello storico.</div>
          ) : historyOrders.length === 0 ? (
            <div className="ksd-history-empty">Nessun ordine per &quot;{historySearch}&quot;</div>
          ) : (
            <div className="ksd-history-list">
              {historyOrders.map((order) => {
                const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');
                const isDelivered = order.status === 'delivered';
                return (
                  <div key={order.id} className="ksd-history-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div className="ksd-history-row-left">
                        {order.orderCode && <span className="ksd-row-code">#{order.orderCode}</span>}
                        <span className="ksd-row-table">{order.table}</span>
                        <span className="ksd-row-nickname">{order.nickname}</span>
                        <span className="ksd-row-time">{formatTime(order.createdAt)}</span>
                      </div>
                      <div className="ksd-history-row-center">
                        <div className="ksd-row-items">{itemsSummary}</div>
                        {!isDelivered && order.cancelReason && (
                          <div className="ksd-history-cancel-reason">{order.cancelReason}</div>
                        )}
                      </div>
                      <div className="ksd-history-row-right">
                        {order.total != null && (
                          <span className="ksd-history-total">€ {order.total.toFixed(2)}</span>
                        )}
                        <span className={`ksd-history-status ksd-history-status--${isDelivered ? 'delivered' : 'cancelled'}`}>
                          {isDelivered ? 'RITIRATO' : 'ANNULLATO'}
                        </span>
                      </div>
                    </div>
                    {order.actionLog?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingLeft: '0.25rem' }}>
                        {order.actionLog.map((entry, i) => (
                          <span key={i} style={{ fontSize: '0.68rem', color: '#6b7280', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '1px 6px' }}>
                            {entry.action} {formatTime(entry.at)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {!historySearch && historyTotal > HISTORY_PAGE_SIZE && (
                <div className="ksd-history-more">
                  Mostrati gli ultimi {HISTORY_PAGE_SIZE} su {historyTotal} totali
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
