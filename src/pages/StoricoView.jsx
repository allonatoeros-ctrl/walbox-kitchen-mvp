import { useState, useMemo } from 'react';
import { serviceNightWindowFor, isInServiceNight, formatServiceNightLabel } from '../lib/kitchenServiceRules';
import AnalyticsKpiStrip from '../components/kitchen/AnalyticsKpiStrip';
import AttentionSection from '../components/kitchen/AttentionSection';
import './PaymentsViewDemo.css';

const HISTORY_PAGE_SIZE = 15;

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function formatEuro(n) {
  return `€ ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * `paymentsSummary` arriva da useKitchenPayments (kitchen_payments), gia' filtrato sulla stessa
 * finestra di serata usata qui.
 * Contratto: gli ordini (consegnati/annullati/top prodotto) restano kitchen_orders, gli IMPORTI
 * di cassa restano kitchen_payments. `order.total` e' il valore della comanda, non un incasso:
 * non viene mai sommato come "incassato". Senza `paymentsSummary` (Preview/Demo, nessuna
 * sessione staff) gli importi di cassa non vengono inventati: restano '—'.
 */
export default function StoricoView({ orders, paymentsSummary = null, serviceNight = null, anomalies = [] }) {
  const [historySearch, setHistorySearch] = useState('');

  const summary = useMemo(() => {
    const delivered = orders.filter((o) => o.status === 'delivered');
    const count = delivered.length;
    const total = delivered.reduce((sum, o) => sum + (o.total ?? 0), 0);
    const avg = count > 0 ? total / count : 0;
    return { count, total, avg };
  }, [orders]);

  // Serata: finestra 06:00 -> 06:00 Europe/Rome su kitchen_orders.created_at — la STESSA che
  // filtra la Cassa/Payment Hub (useKitchenPayments). Mai service_day: scatta a mezzanotte.
  // `serviceNight` arriva da useKitchenPayments ed e' riaggiornato a ogni poll: un solo orologio
  // per Storico e Cassa. Senza hook (Preview/Demo) si ricade sulla serata corrente locale.
  const night = useMemo(() => serviceNightWindowFor(serviceNight), [serviceNight]);

  const reportOggi = useMemo(() => {
    const isTonight = (o) => isInServiceNight(o.createdAt, night);
    const todayDelivered = orders.filter((o) => o.status === 'delivered' && isTonight(o));
    const todayCancelled = orders.filter((o) => o.status === 'cancelled' && isTonight(o));

    const count = todayDelivered.length;

    const itemCounts = {};
    todayDelivered.forEach((o) => {
      o.items?.forEach((i) => { itemCounts[i.name] = (itemCounts[i.name] ?? 0) + i.quantity; });
    });
    const topItem = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0] ?? null;

    const byPayment = { counter: 0, card: 0 };
    todayDelivered.forEach((o) => {
      if (o.paymentMethod === 'counter' || o.paymentMethod === 'cash') byPayment.counter++;
      else if (o.paymentMethod === 'card') byPayment.card++;
    });

    return { count, annullati: todayCancelled.length, topItem, byPayment };
  }, [orders, night]);

  const cassa = paymentsSummary
    ? {
        incasso: formatEuro(paymentsSummary.incasso),
        rimborsato: formatEuro(paymentsSummary.rimborsato),
        netto: formatEuro(paymentsSummary.netto),
        ticket: reportOggi.count > 0 ? formatEuro(paymentsSummary.netto / reportOggi.count) : formatEuro(0),
      }
    : { incasso: '—', rimborsato: '—', netto: '—', ticket: '—' };

  // KPI strip (Kitchen Analytics V1 Fase 3) — ticket medio qui e' netto / pagamenti succeeded
  // (paymentsSummary.incassiRiusciti), diverso dal divisore "ordini consegnati" usato sopra da
  // `cassa.ticket` (blocco Report serata esistente, invariato). Le due tile mostrano quindi
  // volutamente numeri diversi finche' il blocco Report serata non viene consolidato in una fase
  // successiva (fuori scope Fase 3).
  const kpiTicketMedioDisplay = paymentsSummary
    ? formatEuro(
        paymentsSummary.incassiRiusciti > 0 ? paymentsSummary.netto / paymentsSummary.incassiRiusciti : 0
      )
    : '—';

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
          <div style={{ marginBottom: '1rem' }}>
            <AnalyticsKpiStrip
              incassoDisplay={cassa.incasso}
              nettoDisplay={cassa.netto}
              ticketMedioDisplay={kpiTicketMedioDisplay}
              ordiniConsegnati={reportOggi.count}
              annullati={reportOggi.annullati}
              inSospeso={paymentsSummary?.inSospeso ?? 0}
              falliti={paymentsSummary?.falliti ?? 0}
            />
          </div>

          <AttentionSection
            pendingAmount={paymentsSummary?.inSospeso ?? 0}
            failedCount={paymentsSummary?.falliti ?? 0}
            cancelledCount={reportOggi.annullati}
            anomalyCount={anomalies.length}
          />

          <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consegnati</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{summary.count}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valore ordini consegnati</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#facc15' }}>{formatEuro(summary.total)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valore medio ordine</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{formatEuro(summary.avg)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '0.68rem', color: '#6b7280', maxWidth: '20rem', lineHeight: 1.3 }}>
                Valore delle comande, non l&apos;incasso. L&apos;incasso reale è qui sotto e in CASSA.
              </span>
            </div>
          </div>

          {/* Report serata — stessa finestra e stessi importi della Cassa */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Serata {formatServiceNightLabel(night.night)} · dalle 06:00 alle 06:00
            </div>
            <div style={{ display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.75rem 1rem', flexWrap: 'wrap', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ordini</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{reportOggi.count}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incassato</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4ade80' }}>{cassa.incasso}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rimborsato</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f87171' }}>{cassa.rimborsato}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Netto</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#facc15' }}>{cassa.netto}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ticket medio</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{cassa.ticket}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Annullati</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: reportOggi.annullati > 0 ? '#f87171' : '#6b7280' }}>{reportOggi.annullati}</span>
              </div>
              {reportOggi.topItem && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top prodotto</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>{reportOggi.topItem[0]} <span style={{ color: '#6b7280', fontWeight: 400 }}>×{reportOggi.topItem[1]}</span></span>
                </div>
              )}
              {(reportOggi.byPayment.counter > 0 || reportOggi.byPayment.card > 0) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cassa / Carta</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>{reportOggi.byPayment.counter} / {reportOggi.byPayment.card}</span>
                </div>
              )}
            </div>
            {!paymentsSummary && (
              <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '0.4rem' }}>
                Importi di cassa non disponibili qui — aprili in CASSA.
              </div>
            )}
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
