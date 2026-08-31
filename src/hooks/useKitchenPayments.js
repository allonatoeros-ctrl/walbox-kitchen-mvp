import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const VENUE_ID = 'walrus-main';
const RECENT_LIMIT = 30;
const POLL_MS = 15000;

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// kitchen_payments_daily_summary.day is a date_trunc('day', created_at) timestamptz (DB timezone,
// not necessarily the browser's) — compared as a UTC calendar date, same known edge-of-midnight
// caveat as the rest of this app's "today" logic (see StoricoView.jsx todayLocalDate).
function isToday(dayValue) {
  if (!dayValue) return false;
  return String(dayValue).slice(0, 10) === todayLocalDate();
}

function summarizeToday(rows) {
  const today = rows.filter((r) => isToday(r.day));
  let incasso = 0;
  let rimborsato = 0;
  let inSospeso = 0;
  let falliti = 0;
  today.forEach((r) => {
    const amount = Number(r.total_amount) || 0;
    if (r.direction === 'charge' && r.status === 'succeeded') incasso += amount;
    else if (r.direction === 'refund' && r.status === 'succeeded') rimborsato += amount;
    else if (r.status === 'initiated' || r.status === 'pending') inSospeso += amount;
    else if (r.status === 'failed') falliti += Number(r.attempt_count) || 0;
  });
  return { incasso, rimborsato, netto: incasso - rimborsato, inSospeso, falliti };
}

/**
 * Kitchen Payment Hub V1 — staff read-only data layer.
 * Reads kitchen_payments_daily_summary / kitchen_payments_provider_drift_candidates /
 * kitchen_payments directly (staff_select_venue_payments RLS) — no writes here.
 */
export function useKitchenPayments() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [todaySummary, setTodaySummary] = useState({ incasso: 0, rimborsato: 0, netto: 0, inSospeso: 0, falliti: 0 });
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

      const [summaryRes, driftRes, recentRes] = await Promise.all([
        supabase
          .from('kitchen_payments_daily_summary')
          .select('*')
          .eq('venue_id', VENUE_ID),
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

      setTodaySummary(summarizeToday(summaryRes.data ?? []));
      setAnomalies(driftRes.data ?? []);
      setRecentPayments(recentRes.data ?? []);
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

  return { loading, error, refresh, todaySummary, anomalies, recentPayments };
}
