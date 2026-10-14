// Kitchen Watchdog V1 — Payment / Order Drift Sensor.
//
// Read-only sensor over the existing kitchen_payments_order_reconciliation view (see
// supabase/migrations/20260828100600_kitchen_payment_reporting_views_v1.sql). Reports whether any
// order for the given venue, created at/after the Payment Hub V1 baseline, is marked paid without a
// matching succeeded charge row — the "Direction A" drift already described in
// 20260830121000_kitchen_payment_provider_drift_v1.sql, exposed here as a small deterministic sensor
// instead of a page staff has to open.
//
// Status contract (never conflate the two — see ai-ops/watchdog/watchdog.js, which alerts on them as
// two SEPARATE incident episodes: business drift vs sensor malfunction):
//   'healthy'      — query succeeded, zero drifting orders for the venue at/after baseline
//   'drift'        — query succeeded, 1+ drifting orders found
//   'sensor_error' — the query itself failed (auth/network/DB error) — NEVER reported as healthy
//
// Baseline: PAYMENT_HUB_BASELINE_V1 is the first real Payment Hub record observed live on
// pcrqfdzipotprqtuemso. Orders created before this instant predate Payment Hub and are deliberately
// excluded ("legacy ignored") — there is no charge-row expectation for them in the first place, so
// they would otherwise show up as permanent false-positive drift.
export const PAYMENT_HUB_BASELINE_V1 = '2026-08-28T15:53:58.298771Z';

// Cap on records returned to the caller — this is a sensor, not a reporting page. drift_count still
// reflects the TRUE total (via Supabase's exact count), even when it exceeds this cap.
export const MAX_RECORDS = 10;

// supabaseAdmin: a Supabase client authenticated with the service-role key (Vercel-side only, see
// api/kitchen-ops/payment-order-drift.js — this module never creates or holds credentials itself).
export async function checkPaymentOrderDrift(
  supabaseAdmin,
  { venueId, baseline = PAYMENT_HUB_BASELINE_V1 } = {}
) {
  if (!venueId) {
    throw new Error('venueId is required');
  }

  try {
    const { data, error, count } = await supabaseAdmin
      .from('kitchen_payments_order_reconciliation')
      .select('order_id, total, order_created_at', { count: 'exact' })
      .eq('venue_id', venueId)
      .gte('order_created_at', baseline)
      .order('order_created_at', { ascending: true })
      .limit(MAX_RECORDS);

    if (error) {
      return {
        status: 'sensor_error',
        drift_count: null,
        records: [],
        error: error.message || String(error),
      };
    }

    const records = data || [];
    const driftCount = typeof count === 'number' ? count : records.length;

    return {
      status: driftCount > 0 ? 'drift' : 'healthy',
      drift_count: driftCount,
      // Ordered ascending by order_created_at, so records[0] (when present) is the oldest drift —
      // the record the Watchdog surfaces to Hermes as `oldest_drift`.
      records,
      error: null,
    };
  } catch (err) {
    return {
      status: 'sensor_error',
      drift_count: null,
      records: [],
      error: err.message || String(err),
    };
  }
}
