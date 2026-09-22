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
import './StoricoView.css';

const HISTORY_PAGE_SIZE = 15;

const STATUS_FILTERS = [
  { key: 'all', label: 'Tutti' },
  { key: 'delivered', label: 'Ritirati' },
  { key: 'cancelled', label: 'Annullati' },
];

const SORT_OPTIONS = [
  { key: 'recent', label: 'Più recenti' },
  { key: 'oldest', label: 'Più vecchi' },
  { key: 'total', label: 'Totale più alto' },
];

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState('recent');
  const [pagination, setPagination] = useState({ key: '', count: HISTORY_PAGE_SIZE });
  const [selectedOrder, setSelectedOrder] = useState(null);

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

  // Storico V1 SaaS (2026-09-22): stesso filtro serata di KPI/Attenzione/fasce/top prodotti sopra
  // (CURRENT_LIMITS #3 dell'audit selettore, invariato) — completed = solo delivered/cancelled
  // della notte selezionata. Sopra questa base si combinano stato/ricerca/sort, tutti client-side
  // sullo stesso array gia' in memoria (ai-ops/reports/kitchen-history-saas-audit-20260922.md).
  const completedInNight = useMemo(
    () => orders.filter((o) => (o.status === 'delivered' || o.status === 'cancelled') && isInServiceNight(o.createdAt, night)),
    [orders, night]
  );

  const filteredOrders = useMemo(() => {
    let list = completedInNight;

    if (statusFilter !== 'all') {
      list = list.filter((o) => o.status === statusFilter);
    }

    const term = historySearch.trim().toLowerCase();
    if (term) {
      list = list.filter((o) => {
        if (o.nickname?.toLowerCase().includes(term)) return true;
        if (o.orderCode?.toLowerCase().includes(term)) return true;
        return o.items?.some((i) => i.name?.toLowerCase().includes(term));
      });
    }

    const sorted = [...list];
    if (sortMode === 'oldest') {
      sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortMode === 'total') {
      sorted.sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
    } else {
      sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return sorted;
  }, [completedInNight, statusFilter, historySearch, sortMode]);

  // "Carica altri" invece dello slice fisso: quando cambia un filtro/ricerca/notte la paginazione
  // torna a HISTORY_PAGE_SIZE, altrimenti si resterebbe bloccati su "0 risultati mostrati" dopo
  // aver caricato piu' pagine su un filtro precedente. Reset durante il render (non in un effect)
  // per evitare un giro di render in piu' — pattern raccomandato da React per "adjusting state
  // when a prop changes" quando la chiave cambia rispetto all'ultimo render committato.
  const paginationKey = `${statusFilter}::${historySearch.trim().toLowerCase()}::${sortMode}::${night.start}::${night.end}`;
  const visibleCount = pagination.key === paginationKey ? pagination.count : HISTORY_PAGE_SIZE;
  if (pagination.key !== paginationKey) {
    setPagination({ key: paginationKey, count: HISTORY_PAGE_SIZE });
  }

  const visibleOrders = useMemo(() => filteredOrders.slice(0, visibleCount), [filteredOrders, visibleCount]);
  const hasMore = visibleOrders.length < filteredOrders.length;

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
              placeholder="Cerca per nome, codice o piatto..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            {historySearch && (
              <button className="ksd-history-search-clear" onClick={() => setHistorySearch('')}>✕</button>
            )}
          </div>

          <div className="kpd-filter-group" data-testid="storico-status-filters">
            <span className="kpd-filter-label">Stato</span>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`kpd-sumup-badge kpd-sumup-badge--neutral${statusFilter === f.key ? ' kpd-sumup-badge--active' : ''}`}
                data-testid={`storico-filter-status-${f.key}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="kpd-filter-group" data-testid="storico-sort-options">
            <span className="kpd-filter-label">Ordina</span>
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`kpd-sumup-badge kpd-sumup-badge--neutral${sortMode === s.key ? ' kpd-sumup-badge--active' : ''}`}
                data-testid={`storico-sort-${s.key}`}
                onClick={() => setSortMode(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {completedInNight.length === 0 ? (
            <div className="ksd-history-empty">Nessun ordine nello storico.</div>
          ) : filteredOrders.length === 0 ? (
            <div className="ksd-history-empty">
              {historySearch ? `Nessun ordine per "${historySearch}"` : 'Nessun ordine con questi filtri.'}
            </div>
          ) : (
            <div className="sv-table" data-testid="storico-table">
              <div className="sv-table-head" aria-hidden="true">
                <span className="sv-col-codice">Codice</span>
                <span className="sv-col-ora">Ora</span>
                <span className="sv-col-nome">Nome</span>
                <span className="sv-col-articoli">Articoli</span>
                <span className="sv-col-totale">Totale</span>
                <span className="sv-col-stato">Stato</span>
              </div>
              <div className="ksd-history-list">
                {visibleOrders.map((order) => {
                  const itemsSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join('  ·  ');
                  const isDelivered = order.status === 'delivered';
                  return (
                    <div
                      key={order.id}
                      className="ksd-history-row sv-table-row"
                      data-testid={`storico-row-${order.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedOrder(order)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedOrder(order);
                      }}
                    >
                      <span className="sv-col-codice ksd-row-code" data-label="Codice">
                        {order.orderCode ? `#${order.orderCode}` : '—'}
                      </span>
                      <span className="sv-col-ora ksd-row-time" data-label="Ora">{formatTime(order.createdAt)}</span>
                      <span className="sv-col-nome ksd-row-nickname" data-label="Nome">{order.nickname}</span>
                      <span className="sv-col-articoli" data-label="Articoli">
                        <span className="sv-row-items ksd-row-items">{itemsSummary}</span>
                        {!isDelivered && order.cancelReason && (
                          <span className="ksd-history-cancel-reason">{order.cancelReason}</span>
                        )}
                      </span>
                      <span className="sv-col-totale" data-label="Totale">
                        {order.total != null ? formatEuro(order.total) : '—'}
                      </span>
                      <span className="sv-col-stato" data-label="Stato">
                        <span className={`ksd-history-status ksd-history-status--${isDelivered ? 'delivered' : 'cancelled'}`}>
                          {isDelivered ? 'RITIRATO' : 'ANNULLATO'}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <div className="sv-load-more-row">
                  <button
                    type="button"
                    className="ksd-btn-reset"
                    data-testid="storico-load-more"
                    onClick={() => setPagination((p) => ({ key: paginationKey, count: p.count + HISTORY_PAGE_SIZE }))}
                  >
                    Carica altri ({filteredOrders.length - visibleOrders.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedOrder && (
        <div
          className="sv-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Dettaglio ordine"
          data-testid="storico-detail-overlay"
          onClick={() => setSelectedOrder(null)}
        >
          <div className="sv-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="sv-detail-header">
              <div>
                <div className="sv-detail-code">{selectedOrder.orderCode ? `#${selectedOrder.orderCode}` : 'Ordine'}</div>
                <div className="sv-detail-sub">{selectedOrder.nickname} · {formatTime(selectedOrder.createdAt)}</div>
              </div>
              <button
                type="button"
                className="ksd-btn-reset"
                data-testid="storico-detail-close"
                aria-label="Chiudi dettaglio ordine"
                onClick={() => setSelectedOrder(null)}
              >
                ✕
              </button>
            </div>

            <span className={`ksd-history-status ksd-history-status--${selectedOrder.status === 'delivered' ? 'delivered' : 'cancelled'}`}>
              {selectedOrder.status === 'delivered' ? 'RITIRATO' : 'ANNULLATO'}
            </span>

            {selectedOrder.status === 'cancelled' && selectedOrder.cancelReason && (
              <div className="sv-detail-section">
                <div className="sv-detail-label">Motivo annullamento</div>
                <div className="sv-detail-text">{selectedOrder.cancelReason}</div>
              </div>
            )}

            <div className="sv-detail-section">
              <div className="sv-detail-label">Articoli</div>
              <ul className="sv-detail-items">
                {selectedOrder.items.map((item, i) => (
                  <li key={i}>
                    <span>{item.quantity}× {item.name}</span>
                    {item.price != null && <span>{formatEuro(item.price * item.quantity)}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {selectedOrder.note && (
              <div className="sv-detail-section">
                <div className="sv-detail-label">Nota cliente</div>
                <div className="sv-detail-text">{selectedOrder.note}</div>
              </div>
            )}

            {selectedOrder.staffNote && (
              <div className="sv-detail-section">
                <div className="sv-detail-label">Nota staff</div>
                <div className="sv-detail-text">{selectedOrder.staffNote}</div>
              </div>
            )}

            {selectedOrder.promoCode && (
              <div className="sv-detail-section">
                <div className="sv-detail-label">Promo applicata</div>
                <div className="sv-detail-text">
                  {selectedOrder.promoCode}
                  {selectedOrder.discountAmount ? ` · -${formatEuro(selectedOrder.discountAmount)}` : ''}
                </div>
              </div>
            )}

            <div className="sv-detail-section">
              <div className="sv-detail-label">Azioni</div>
              {selectedOrder.actionLog?.length > 0 ? (
                <div className="sv-detail-actionlog">
                  {selectedOrder.actionLog.map((entry, i) => (
                    <span key={i} className="sv-detail-action-chip">{entry.action} {formatTime(entry.at)}</span>
                  ))}
                </div>
              ) : (
                <div className="sv-detail-text sv-detail-text--muted">Non disponibile per ordini pre-esistenti.</div>
              )}
            </div>

            <div className="sv-detail-total">
              <span>Totale</span>
              <span>{selectedOrder.total != null ? formatEuro(selectedOrder.total) : '—'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
