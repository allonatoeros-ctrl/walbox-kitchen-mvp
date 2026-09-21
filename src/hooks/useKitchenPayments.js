import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { serviceNightWindow, summarizeServiceNightPayments } from '../lib/kitchenServiceRules';

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

/**
 * Kitchen Payment Hub V1 — staff read-only data layer.
 * Reads kitchen_payments (scoped alla serata via kitchen_orders.created_at),
 * kitchen_payments_provider_drift_candidates e kitchen_payments recenti direttamente
 * (staff_select_venue_payments RLS) — no writes here.
 */
export function useKitchenPayments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [serviceNight, setServiceNight] = useState(() => serviceNightWindow().night);
  const [todaySummary, setTodaySummary] = useState(EMPTY_SUMMARY);
  const [anomalies, setAnomalies] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);

  const refresh = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sessione staff non trovata — ricarica la pagina.');
        setLoading(false);
        return;
      }

      const night = serviceNightWindow();

      const [summaryRes, driftRes, recentRes] = await Promise.all([
        // !inner + filtro sulla colonna embedded: solo i pagamenti degli ordini APERTI dentro la
        // serata. Nessun filtro sul created_at del pagamento e nessun filtro su service_day.
        supabase
          .from('kitchen_payments')
          .select('id, direction, status, amount, kitchen_orders!inner(created_at)')
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
      let orderCodeById = {};
      if (orderIds.length > 0) {
        const { data: orders, error: ordersError } = await supabase
          .from('kitchen_orders')
          .select('id, order_code')
          .in('id', orderIds);
        if (ordersError) throw ordersError;
        orderCodeById = Object.fromEntries((orders ?? []).map((o) => [o.id, o.order_code]));
      }

      setServiceNight(night.night);
      setTodaySummary(summarizeServiceNightPayments(summaryRes.data));
      setAnomalies(drift.map((a) => ({ ...a, order_code: orderCodeById[a.order_id] ?? null })));
      setRecentPayments(recent.map((p) => ({ ...p, order_code: orderCodeById[p.order_id] ?? null })));
      setError(null);
    } catch (err) {
      console.warn('[Walbox] useKitchenPayments refresh failed', err);
      setError('Impossibile aggiornare i dati pagamenti — riprova.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch on mount, same pattern as useKitchenOrders.fetchSupabaseOrders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(refresh, POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

  return { loading, error, refresh, serviceNight, todaySummary, anomalies, recentPayments };
}
