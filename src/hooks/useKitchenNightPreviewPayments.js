// Kitchen V2 — Fase 2 / micro-fase B2 — adapter DEV pagamenti, "Serata Walrus".
//
// Hook drop-in a contratto compatibile con useKitchenPayments.js (stessa shape di ritorno:
// loading, error, refresh, todaySummary, anomalies, recentPayments), ma 100% locale: unica
// source dati e' kitchenNightMockData.js (dataset B1 "Serata Walrus"), nessun import di
// supabaseClient, nessuna rete, nessun polling. Vedi
// ai-ops/reports/kitchen-v2-fase2-dev-mock-layer-audit.md (PROPOSED_MINIMAL_ARCHITECTURE
// punto 3) — stesso pattern gia' validato da kitchenStaffPaymentsDemoFixtures.js.
//
// Non collegato a nessuna route/pagina in questa micro-fase (nessun consumer applicativo).
//
// buildNightPaymentsView() e' pura (nessun useState/useEffect: il dataset B1 e' statico e
// deterministico) cosi' resta testabile senza renderizzare l'hook React.
import { serataWalrusOrders, serataWalrusPayments } from '../data/kitchenNightMockData.js';
import { summarizePaymentsByMethod, serviceNightWindowFor, isInServiceNight } from '../lib/kitchenServiceRules';

const RECENT_LIMIT = 30;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// `night` ('YYYY-MM-DD' o null/assente = nessun filtro, comportamento storico) parametrizza la
// finestra serata SOLO per il DEV harness /kitchen/night-preview (Kitchen Analytics — DEV harness
// fix, selettore condiviso): stesso pattern di useKitchenPayments.js, il filtro segue il
// created_at dell'ORDINE (kitchen_orders), mai un created_at proprio del pagamento. Il dataset B1
// e' fisso sulla notte 2026-09-20: su qualunque altra notte le righe filtrate sono vuote, cosi'
// Storico/KPI/Attenzione/Mix pagamento restano coerenti con "nessun dato per questa serata" invece
// di continuare a mostrare sempre gli stessi importi della serata demo.
export function buildNightPaymentsView(night = null) {
  const orderById = new Map(serataWalrusOrders.map((order) => [order.id, order]));
  const orderCodeById = new Map(serataWalrusOrders.map((order) => [order.id, order.orderCode]));
  const window = night ? serviceNightWindowFor(night) : null;
  const paymentsInWindow = window
    ? serataWalrusPayments.filter((payment) => isInServiceNight(orderById.get(payment.order_id)?.createdAt, window))
    : serataWalrusPayments;

  let incasso = 0;
  let rimborsato = 0;
  let inSospeso = 0;
  let falliti = 0;
  let incassiRiusciti = 0;
  paymentsInWindow.forEach((payment) => {
    const amount = Number(payment.amount) || 0;
    if (payment.direction === 'charge' && payment.status === 'succeeded') {
      incasso += amount;
      incassiRiusciti += 1;
    } else if (payment.direction === 'refund' && payment.status === 'succeeded') rimborsato += amount;
    else if (payment.status === 'initiated' || payment.status === 'pending') inSospeso += amount;
    else if (payment.status === 'failed') falliti += 1;
  });

  const todaySummary = {
    incasso: round2(incasso),
    rimborsato: round2(rimborsato),
    netto: round2(incasso - rimborsato),
    inSospeso: round2(inSospeso),
    falliti,
    incassiRiusciti,
  };

  // I pagamenti SumUp "stuck" del dataset B1 (gruppo pending_sumup_stuck) sono l'unico scenario
  // di drift modellato: charge initiated senza succeeded corrispondente, stessa forma delle righe
  // kitchen_payments_provider_drift_candidates lette da useKitchenPayments.js.
  const anomalies = paymentsInWindow
    .filter((payment) => payment.status === 'initiated' && payment.direction === 'charge')
    .map((payment) => ({
      order_id: payment.order_id,
      order_code: orderCodeById.get(payment.order_id) ?? payment.order_code ?? null,
      drift_type: 'sumup_online_stuck_initiated',
      total: payment.amount,
    }));

  const recentPayments = [...paymentsInWindow]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, RECENT_LIMIT)
    .map((payment) => ({ ...payment, order_code: orderCodeById.get(payment.order_id) ?? payment.order_code ?? null }));

  // Fase 7 (MIX PAGAMENTI): stessa aggregazione pura del hook reale, sulle stesse righe
  // (forma compatibile: method/direction/status/amount) — nessun nuovo dataset mock, solo filtro
  // per serata quando `night` e' passato.
  const paymentsByMethod = summarizePaymentsByMethod(paymentsInWindow);

  return { todaySummary, anomalies, recentPayments, paymentsByMethod };
}

/** Adapter DEV — contratto compatibile con useKitchenPayments(), solo in-memory/deterministico. */
export function usePreviewKitchenNightPayments({ night = null } = {}) {
  const loading = false;
  const error = null;
  const refresh = () => {};
  const { todaySummary, anomalies, recentPayments, paymentsByMethod } = buildNightPaymentsView(night);
  return { loading, error, refresh, todaySummary, anomalies, recentPayments, paymentsByMethod };
}
