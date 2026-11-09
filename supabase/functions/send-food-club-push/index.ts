// supabase/functions/send-food-club-push/index.ts — Food Club V1 (I-5).
// SOLO FILE LOCALE: non deployata. Deploy, secret e cron sono gate di Eros
// (docs/food-club/implementation/RUNBOOK-push-food-club.md).
//
// Invariante: PUSH = side effect, MAI source of truth. Il messaggio esiste già in "Messaggi"
// (food_club_messages); qui si consegna soltanto e si riporta l'esito.
//
// Chiamata da public.food_club_push_tick(url) (pg_net, ogni 5 min via pg_cron) con body {}.
// Secrets attesi a runtime (mai nel repo):
// - FOOD_CLUB_PUSH_SECRET — deve combaciare col secret Vault 'food_club_push_secret'. Assente => 401.
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — iniettate dalla piattaforma.
// - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT — le stesse di send-order-ready-push.
//   Mancanti => ogni messaggio reclamato viene riportato con p_error='vapid_not_configured'
//   (il DB lo marca 'failed', nessun retry).
//
// Regole di consenso, fascia silenziosa, tetti e dedup: tutte in food_club_push_claim_batch.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import {
  SEND_TIMEOUT_MS,
  BATCH_LIMIT,
  hasVapidConfig,
  isAuthorized,
  buildLogLine,
  processBatch,
} from './logic.js';

type Subscription = { endpoint: string; p256dh: string; auth: string };
type ClaimRow = {
  message_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  subscriptions: Subscription[] | null;
};

function log(line: Record<string, unknown>) {
  console.log(JSON.stringify(line));
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  const expectedSecret = Deno.env.get('FOOD_CLUB_PUSH_SECRET');
  if (!isAuthorized(req.headers.get('authorization') ?? '', expectedSecret)) {
    log(buildLogLine({ result: 'auth_rejected', errorCode: 'invalid_push_secret' }));
    return new Response('unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    log(buildLogLine({ result: 'config_error', errorCode: 'supabase_service_role_missing' }));
    return new Response('server misconfigured', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error: claimError } = await supabase.rpc('food_club_push_claim_batch', { p_limit: BATCH_LIMIT });
  if (claimError) {
    log(buildLogLine({ result: 'claim_failed', errorCode: claimError.code ?? 'claim_failed' }));
    return new Response('ok', { status: 200 });
  }
  const batch = (rows ?? []) as ClaimRow[];
  if (batch.length === 0) {
    log(buildLogLine({ result: 'empty_batch' }));
    return new Response('ok', { status: 200 });
  }

  const vapid = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY'),
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY'),
    subject: Deno.env.get('VAPID_SUBJECT'),
  };
  let vapidOk = hasVapidConfig(vapid);
  let vapidError = 'vapid_not_configured';
  if (vapidOk) {
    try {
      webpush.setVapidDetails(vapid.subject!, vapid.publicKey!, vapid.privateKey!);
    } catch {
      // Chiavi presenti ma malformate: setVapidDetails lancia. Senza questo catch la funzione cadeva con 500 e i
      // messaggi restavano 'sending' (recuperati dal DB come orfani dopo 10 min). Ora vengono riportati: il DB li
      // rimette in coda e dopo 3 tentativi li segna 'failed'.
      vapidOk = false;
      vapidError = 'vapid_invalid';
    }
  }

  // Orchestrazione in logic.js (processBatch, testata con node --test): timeout per invio, budget, esiti, log.
  const summary = await processBatch({
    batch,
    vapidOk,
    vapidError,
    startedAt,
    now: Date.now,
    sendOne: (sub: Subscription, payload: string) => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { timeout: SEND_TIMEOUT_MS, TTL: 12 * 60 * 60 },
    ),
    report: (row: ClaimRow, agg: { delivered: number; goneEndpoints: string[]; error: string | null }) =>
      supabase.rpc('food_club_push_report', {
        p_message_id: row.message_id,
        p_delivered: agg.delivered,
        p_gone_endpoints: agg.goneEndpoints,
        p_error: agg.error,
      }),
    log,
  });

  log(buildLogLine({ result: 'batch_done', delivered: summary.sent, errorCode: vapidOk ? null : vapidError }));
  return new Response('ok', { status: 200 });
});

