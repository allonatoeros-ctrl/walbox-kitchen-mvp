import { createClient } from '@supabase/supabase-js';
import { checkPaymentOrderDrift } from '../_lib/paymentOrderDriftSensor.js';

// Kitchen Payment / Order Drift Sensor V1 — read-only endpoint for the Watchdog.
//
// GET /api/kitchen-ops/payment-order-drift
//
// Server-to-server only: requires `Authorization: Bearer $KITCHEN_OPS_WATCHDOG_TOKEN` (same fixed-token
// pattern as api/kitchen-sumup-reconcile-sweep.js's CRON_SECRET — no session, no cookies). The token
// itself is never created or set here; it must already exist as a Vercel project env var.
//
// Response body is deliberately minimal (status, drift_count, up to 10 minimal records) — never the
// raw Supabase/Postgres error, which is logged server-side only. service-role key is used ONLY in this
// Vercel-side handler; the Watchdog process on the VPS never sees it, only this endpoint's JSON output.
const VENUE_ID = 'walrus-main';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const watchdogToken = process.env.KITCHEN_OPS_WATCHDOG_TOKEN;
  if (!watchdogToken) {
    console.error('[kitchen-ops/payment-order-drift] missing KITCHEN_OPS_WATCHDOG_TOKEN env var');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${watchdogToken}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[kitchen-ops/payment-order-drift] missing required Supabase env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const result = await checkPaymentOrderDrift(supabaseAdmin, { venueId: VENUE_ID });

  if (result.status === 'sensor_error') {
    console.error('[kitchen-ops/payment-order-drift] sensor_error', result.error);
  }

  return res.status(200).json({
    status: result.status,
    drift_count: result.drift_count,
    records: result.records,
    checked_at: new Date().toISOString(),
  });
}
