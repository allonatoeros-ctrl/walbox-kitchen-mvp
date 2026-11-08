import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { runOnlineAbandonSweep } from './_lib/onlineAbandonSweep.js';
import { isFoodClubReleaseEnabled, runFoodClubReleasePhase } from './_lib/foodClubVoucherRelease.js';

// Food Club Passo 3B: la fase Club parte solo se il lavoro Kitchen e finito entro questo tempo dall'inizio della
// request (pg_net chiama con timeout 30 s; Kitchen ha budget 25 s + ordine in corso). Club: budget proprio 10 s.
const FOOD_CLUB_MAX_KITCHEN_ELAPSED_MS = 12 * 1000;

// S6 (docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md §S6) — chiusura automatica a 5 minuti degli ordini online non pagati.
//
// Thin HTTP wrapper intorno a api/_lib/onlineAbandonSweep.js. Lo chiama SOLO il job pg_cron di Supabase
// (migration <ts>_kitchen_online_abandon_cron_v1.sql) e solo quando esiste almeno un ordine online scaduto.
// Secret dedicato KITCHEN_ABANDON_SWEEP_SECRET (stesso valore in Vercel e nel Vault Supabase
// `kitchen_abandon_sweep_secret`): non riusa CRON_SECRET, cosi' chi legge il Vault non puo' lanciare altri cron.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const sweepSecret = process.env.KITCHEN_ABANDON_SWEEP_SECRET;
  if (!sweepSecret) {
    console.error('[kitchen-online-abandon-sweep] missing KITCHEN_ABANDON_SWEEP_SECRET env var');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const authHeader = req.headers?.authorization || '';
  if (authHeader !== `Bearer ${sweepSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sumupApiKey = process.env.SUMUP_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !sumupApiKey) {
    console.error('[kitchen-online-abandon-sweep] missing required env vars');
    return res.status(500).json({ error: 'server_configuration_error' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();

  let summary;
  try {
    summary = await runOnlineAbandonSweep({ supabaseAdmin, sumupApiKey });
  } catch (err) {
    console.error('[kitchen-online-abandon-sweep] fatal error', err);
    return res.status(500).json({ error: 'internal_server_error' });
  }

  const finishedAt = new Date().toISOString();

  // Food Club Passo 3B: fase isolata DOPO il lavoro Kitchen riuscito. Flag spento (default) -> nessuna query in piu,
  // risposta identica. Flag acceso: un errore Club non cambia mai status HTTP ne summary Kitchen.
  if (!isFoodClubReleaseEnabled(process.env)) {
    return res.status(200).json({ startedAt, finishedAt, ...summary });
  }
  let foodClub;
  try {
    if (Date.now() - startedMs > FOOD_CLUB_MAX_KITCHEN_ELAPSED_MS) {
      foodClub = { skipped: 'kitchen_elapsed' };
    } else {
      foodClub = await runFoodClubReleasePhase({ supabaseAdmin, sumupApiKey });
    }
  } catch (err) {
    console.error('[kitchen-online-abandon-sweep] food club phase failed', { message: String(err?.message || err).slice(0, 120) });
    foodClub = { error: 'food_club_phase_failed' };
  }
  return res.status(200).json({ startedAt, finishedAt, ...summary, food_club: foodClub });
}
