import { createClient } from '@supabase/supabase-js';
import { runReconcileSweep } from './_lib/sumupReconcileSweep.js';

// Kitchen Payment Hub V1 — SumUp Online — Autonomous Reconciliation — scheduler entry point.
//
// Thin HTTP wrapper around api/_lib/sumupReconcileSweep.js (see scripts/kitchen-sumup-reconcile-sweep.mjs
// for the schedule-agnostic CLI version). This route is the one meant to be invoked by Vercel Cron:
// Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET
// is set as a project env var — this handler rejects anything that doesn't present that exact value,
// so the sweep (which resolves real SumUp payment attempts) can never be triggered by an
// unauthenticated request against a guessed URL.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[kitchen-sumup-reconcile-sweep] missing CRON_SECRET env var');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const authHeader = req.headers.authorization || '';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-sumup-reconcile-sweep] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = new Date().toISOString();

  let summary;
  try {
    summary = await runReconcileSweep({ supabaseAdmin, sumupApiKey });
  } catch (err) {
    console.error('[kitchen-sumup-reconcile-sweep] fatal error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  const finishedAt = new Date().toISOString();
  return res.status(200).json({ startedAt, finishedAt, ...summary });
}
