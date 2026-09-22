import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { serviceNightWindow, serviceNightWindowFor, summarizeServiceNightPayments, summarizePaymentsByMethod } from '../lib/kitchenServiceRules';

const VENUE_ID = 'walrus-main';
const RECENT_LIMIT = 30;
const POLL_MS = 15000;

// INCASSO = SOLO kitchen_payments, SERATA = finestra 06:00 -> 06:00 su kitchen_orders.created_at.
//
// Prima questa summary arrivava da `kitchen_payments_daily_summary`, che raggruppa per
// `date_trunc('day', kp.created_at)` (timezone del DB, di fatto UTC). Poi si era passati a
// `kitchen_orders.service_day`, che pero' scatta a mezzanotte e taglia a meta' la serata reale
// (finding live 2026-09-18). Ora la finestra e' quella della serata (vedi kitchenServiceRules):
// filtra sul `created_at` dell'ORDINE, quindi un pagamento incassato dopo mezzanotte su un ordine
// della sera prima resta contato nella serata giusta. Storico e Cassa usano la stessa finestra e
// la stessa funzione di aggregazione: non possono divergere.
//
// Le righe sono aggregate qui e non da una view: nessuna migration, nessun dato toccato, e le
// righe sono gia' leggibili dallo staff con la policy esistente `staff_select_venue_payments`.

const EMPTY_SUMMARY = { incasso: 0, rimborsato: 0, netto: 0, inSospeso: 0, falliti: 0, incassiRiusciti: 0 };
const EMPTY_BY_METHOD = { byMethod: {}, sumup: { succeeded: 0, pending: 0, failed: 0 } };

/**
 * Vero se `nightParam` risolve alla serata live/corrente (adesso). Pura, nessun side-effect —
 * estratta cosi' da essere testabile senza renderizzare l'hook React (stesso motivo per cui
 * useKitchenOrders.js esporta mergeFetchedOrders/supabaseUpdateOrder a parte). Governa il poll
 * 15s: mai su una notte storica selezionata (decisione Eros, Gate 1 2026-09-21).
 */
export function isLiveServiceNight(nightParam, now = new Date()) {
  return serviceNightWindowFor(nightParam).night === serviceNightWindow(now).night;
}

/**
 * Kitchen Payment Hub V1 — staff read-only data layer.
 * Reads kitchen_payments (scoped alla serata via kitchen_orders.created_at),
 * kitchen_payments_provider_drift_candidates e kitchen_payments recenti direttamente
 * (staff_select_venue_payments RLS) — no writes here.
 *
 * `night` (opzionale, 'YYYY-MM-DD' o assente/null = serata corrente) parametrizza la finestra
 * interrogata — selettore Kitchen Analytics V1, Gate 1 approvato da Eros 2026-09-21. Il poll a
 * 15s resta attivo SOLO quando la notte richiesta e' quella live/corrente: su una notte storica i
 * dati sono immutabili, pollare sarebbe query sprecate — vedi
 * ai-ops/reports/kitchen-analytics-service-night-selector-audit-20260921.md PAYMENTS_SUPPORT.
 */
export function useKitchenPayments({ night: nightParam = null } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serviceNight, setServiceNight] = useState(() => serviceNightWindowFor(nightParam).night);
  const [todaySummary, setTodaySummary] = useState(EMPTY_SUMMARY);
  const [paymentsByMethod, setPaymentsByMethod] = useState(EMPTY_BY_METHOD);
  const [anomalies, setAnomalies] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);

  const refresh = async () => {
    // Risolta e pubblicata SUBITO, prima di qualunque chiamata di rete: StoricoView usa
    // `serviceNight` per filtrare `orders` (dati locali, non da kitchen_payments) sulla notte
    // selezionata — deve riflettere la navigazione anche se la query pagamenti fallisce/e' senza
    // sessione, altrimenti lo storico resterebbe "agganciato" alla notte del primo mount.
    const night = serviceNightWindowFor(nightParam);
    setServiceNight(night.night);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sessione staff non trovata — ricarica la pagina.');
        setLoading(false);
        return;
      }

      const [summaryRes, driftRes, recentRes] = await Promise.all([
        // !inner + filtro sulla colonna embedded: solo i pagamenti degli ordini APERTI dentro la
        // serata. Nessun filtro sul created_at del pagamento e nessun filtro su service_day.
        supabase
          .from('kitchen_payments')
          .select('id, direction, status, method, amount, kitchen_orders!inner(created_at)')
          .eq('venue_id', VENUE_ID)
          .gte('kitchen_orders.created_at', night.startIso)
          .lt('kitchen_orders.created_at', night.endIso),
        supabase
          .from('kitchen_payments_provider_drift_candidates')
          .select('*')
          .eq('venue_id', VENUE_ID),
        supabase
          .from('kitchen_payments')
          .select('id, order_id, provider, method, direction, status, amount, failure_reason, created_at')
          .eq('venue_id', VENUE_ID)
          .order('created_at', { ascending: false })
          .limit(RECENT_LIMIT),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (driftRes.error) throw driftRes.error;
      if (recentRes.error) throw recentRes.error;

      const drift = driftRes.data ?? [];
      const recent = recentRes.data ?? [];

      const orderIds = [...new Set([...drift, ...recent].map((r) => r.order_id).filter(Boolean))];
      // `orderInfoById` porta anche `nickname` (Kitchen Analytics V1 — Cassa/Payment Hub filtri +
      // colonna cliente, 2026-09-22): stessa query read-only gia' esistente, solo una colonna in
      // piu' nella select, nessuna nuova RLS/migration (colonna gia' letta con lo stesso ruolo
      // staff da StoricoView.jsx).
      let orderInfoById = {};
      if (orderIds.length > 0) {
        const { data: orders, error: ordersError } = await supabase
          .from('kitchen_orders')
          .select('id, order_code, nickname')
          .in('id', orderIds);
        if (ordersError) throw ordersError;
        orderInfoById = Object.fromEntries((orders ?? []).map((o) => [o.id, o]));
      }

      setTodaySummary(summarizeServiceNightPayments(summaryRes.data));
      setPaymentsByMethod(summarizePaymentsByMethod(summaryRes.data));
      setAnomalies(drift.map((a) => ({ ...a, order_code: orderInfoById[a.order_id]?.order_code ?? null })));
      setRecentPayments(recent.map((p) => ({
        ...p,
        order_code: orderInfoById[p.order_id]?.order_code ?? null,
        nickname: orderInfoById[p.order_id]?.nickname ?? null,
      })));
      setError(null);
    } catch (err) {
      console.warn('[Walbox] useKitchenPayments refresh failed', err);
      setError('Impossibile aggiornare i dati pagamenti — riprova.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch on mount e ad ogni cambio di notte richiesta (selettore Storico/Cassa).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [nightParam]);

  useEffect(() => {
    // Poll SOLO sulla serata live/corrente. Ricalcolato ad ogni tick perche' il rollover 06:00
    // sposta la finestra "corrente" mentre nightParam resta null.
    if (!isLiveServiceNight(nightParam)) return undefined;
    const intervalId = setInterval(() => {
      if (isLiveServiceNight(nightParam)) refresh();
    }, POLL_MS);
    return () => clearInterval(intervalId);
  }, [nightParam]);

  return { loading, error, refresh, serviceNight, todaySummary, paymentsByMethod, anomalies, recentPayments };
}
