import { useState, useMemo } from 'react';
import { serviceNightWindowFor, isInServiceNight, bucketOrdersByWalrusServiceHours, computeTopProductsAndCategories } from '../lib/kitchenServiceRules';
import { kitchenMenuItems } from '../data/kitchenMockData';
import AnalyticsKpiStrip from '../components/kitchen/AnalyticsKpiStrip';
import AttentionSection from '../components/kitchen/AttentionSection';
import HourlySalesChart from '../components/kitchen/HourlySalesChart';
import TopProductsList from '../components/kitchen/TopProductsList';
import TopCategoriesChart from '../components/kitchen/TopCategoriesChart';
import PaymentMixChart from '../components/kitchen/PaymentMixChart';
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
export default function StoricoView({ orders, paymentsSummary = null, serviceNight = null, anomalies = [], paymentsByMethod = null, onOpenCassa = null }) {
  const [historySearch, setHistorySearch] = useState('');

  // Serata: finestra 06:00 -> 06:00 Europe/Rome su kitchen_orders.created_at — la STESSA che
  // filtra la Cassa/Payment Hub (useKitchenPayments). Mai service_day: scatta a mezzanotte.
  // `serviceNight` arriva da useKitchenPayments ed e' riaggiornato a ogni poll: un solo orologio
  // per Storico e Cassa. Senza hook (Preview/Demo) si ricade sulla serata corrente locale.
  const night = useMemo(() => serviceNightWindowFor(serviceNight), [serviceNight]);

  const reportOggi = useMemo(() => {
    const isTonight = (o) => isInServiceNight(o.createdAt, night);
    const todayDelivered = orders.filter((o) => o.status === 'delivered' && isTonight(o));
    const todayCancelled = orders.filter((o) => o.status === 'cancelled' && isTonight(o));

    return { count: todayDelivered.length, annullati: todayCancelled.length };
  }, [orders, night]);

  // Kitchen Analytics V1 Fase 5 — VENDITE PER FASCIA ORARIA. Bucket 2h sulla stessa finestra
  // serata di `reportOggi`/Cassa, sui soli ordini delivered (stesso filtro di reportOggi).
  // Fase 5 follow-up v2: il grafico mostra solo le fasce operative Walrus — pranzo 12-15 (1h) e
  // sera/notte 18-02 (2h), tutte le fasce di chiusura escluse. La serata canonica 06:00->06:00 e
  // il totale aggregato per gli altri consumer (KPI/Top prodotti-categorie/AC6) restano su
  // `bucketOrdersByServiceNight`/`isInServiceNight`, invariati.
  const hourlyBuckets = useMemo(
    () => bucketOrdersByWalrusServiceHours(orders, night),
    [orders, night]
  );

  // Kitchen Analytics V1 Fase 6 — TOP PRODOTTI + TOP CATEGORIE. Stessa finestra serata/filtro
  // delivered di hourlyBuckets/reportOggi, mappatura prodotto->categoria contro il catalogo
  // Kitchen esistente (kitchenMenuItems), nessuna nuova query.
  const { topProducts, topCategories } = useMemo(
    () => computeTopProductsAndCategories(orders, night, kitchenMenuItems, 5),
    [orders, night]
  );

  const cassa = paymentsSummary
    ? {
        incasso: formatEuro(paymentsSummary.incasso),
        netto: formatEuro(paymentsSummary.netto),
      }
    : { incasso: '—', netto: '—' };

  // KPI strip (Kitchen Analytics V1 Fase 3) — ticket medio = netto / pagamenti succeeded
  // (paymentsSummary.incassiRiusciti).
  const kpiTicketMedioDisplay = paymentsSummary
    ? formatEuro(
        paymentsSummary.incassiRiusciti > 0 ? paymentsSummary.netto / paymentsSummary.incassiRiusciti : 0
      )
    : '—';

  // Allineata alla stessa finestra serata di KPI/Attenzione/fasce/top prodotti sopra (CURRENT_LIMITS
  // #3 dell'audit selettore): prima mostrava "sempre tutto lo storico" invece della sola notte
  // selezionata, incoerenza visibile ora che la notte e' navigabile (RISKS #4 dello stesso audit).
  const historyOrders = useMemo(() => {
    const completed = orders
      .filter((o) => (o.status === 'delivered' || o.status === 'cancelled') && isInServiceNight(o.createdAt, night))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!historySearch.trim()) return completed.slice(0, HISTORY_PAGE_SIZE);
    const term = historySearch.trim().toLowerCase();
    return completed.filter((o) => o.nickname?.toLowerCase().includes(term));
  }, [orders, historySearch, night]);

  const historyTotal = useMemo(
    () => orders.filter((o) => (o.status === 'delivered' || o.status === 'cancelled') && isInServiceNight(o.createdAt, night)).length,
    [orders, night]
  );

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
            />
          </div>

          <AttentionSection
            pendingAmount={paymentsSummary?.inSospeso ?? 0}
            failedCount={paymentsSummary?.falliti ?? 0}
            cancelledCount={reportOggi.annullati}
            anomalyCount={anomalies.length}
          />

          {onOpenCassa && (
            <div className="kpd-cassa-ref-row">
              <button type="button" className="kpd-cassa-ref-btn" data-testid="storico-open-cassa" onClick={onOpenCassa}>
                Apri Cassa →
              </button>
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <div className="kpd-section-title">Vendite per fascia oraria</div>
            <HourlySalesChart buckets={hourlyBuckets} />
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div style={{ flex: '1 1 260px', minWidth: '240px' }}>
              <div className="kpd-section-title">Top prodotti</div>
              <TopProductsList products={topProducts} />
            </div>
            <div style={{ flex: '1 1 260px', minWidth: '240px' }}>
              <div className="kpd-section-title">Top categorie</div>
              <TopCategoriesChart categories={topCategories} />
            </div>
          </div>

          {/* Kitchen Analytics V1 Fase 7 — MIX PAGAMENTI. Visual complement alla tabella
              CONTROLLO SERATA/CASSA (PaymentsView/CassaControlSection): stessa aggregazione
              paymentsByMethod (Fase 1), stessa fonte dati, zero divergenza (AC8). Senza
              paymentsByMethod (Preview/Demo senza sessione staff) la sezione non inventa dati. */}
          <div style={{ marginBottom: '1rem' }}>
            <div className="kpd-section-title">Mix pagamento</div>
            <PaymentMixChart paymentsByMethod={paymentsByMethod} />
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
