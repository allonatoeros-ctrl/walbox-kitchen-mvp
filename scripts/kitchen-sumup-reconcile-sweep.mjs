#!/usr/bin/env node
// Kitchen Payment Hub V1 — SumUp Online — Autonomous Reconciliation — FASE 1, CLI runner.
//
// Thin wrapper around api/_lib/sumupReconcileSweep.js so the sweep can be invoked by *any*
// scheduler (a plain OS cron entry, a GitHub Action, a manual staff run, or later a Vercel Cron
// route) without this repo committing to one. Wiring an actual recurring schedule touches deploy
// config (vercel.json / hosting secrets), which is a protected area (CLAUDE.md §5) — this script is
// the local, schedule-agnostic piece; the scheduling platform choice + CRON_SECRET/env wiring is a
// HUMAN GATE for Eros on a dedicated task.
//
// Usage:
//   node scripts/kitchen-sumup-reconcile-sweep.mjs
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUMUP_API_KEY (same vars already used
// by api/kitchen-sumup-*.js). Never creates a new payment attempt — read-only against SumUp plus the
// existing confirm/fail RPCs on attempts already 'initiated'/'pending'.

import { createClient } from '@supabase/supabase-js';
import { runReconcileSweep } from '../api/_lib/sumupReconcileSweep.js';

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-sumup-reconcile-sweep] missing required env vars (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUMUP_API_KEY)');
    process.exitCode = 1;
    return;
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = new Date().toISOString();
  const summary = await runReconcileSweep({ supabaseAdmin, sumupApiKey });
  const finishedAt = new Date().toISOString();

  console.log(JSON.stringify({ startedAt, finishedAt, ...summary }, null, 2));

  if (summary.errors.length > 0) {
    // Non-fatal by design (a partial sweep still resolved what it could) — but a non-zero exit
    // lets an external scheduler (cron/CI) surface it as a failed run for staff attention.
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[kitchen-sumup-reconcile-sweep] fatal error', err);
  process.exitCode = 1;
});
