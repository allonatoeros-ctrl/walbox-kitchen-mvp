// supabase/functions/send-order-ready-push/index.ts — F6 Phase 2 (2026-09-24).
// NON DEPLOYATA in questa sessione (implementazione locale, vedi PRODUCTION_GATES nel report
// Final Architecture Gate + runbook ai-ops/runbooks/kitchen-f6-webpush-vault-secret-setup.md).
//
// Invariante: PUSH = side effect, MAI source of truth. Questa funzione non scrive MAI
// kitchen_orders.status/payment_status — l'unico write su kitchen_orders è il claim su
// ready_push_claimed_at, un campo dedicato senza alcun altro consumer nell'app.
//
// Invocata dal trigger `kitchen_orders_ready_push_webhook_trg`
// (20260924130000_kitchen_orders_ready_push_identity_v1.sql) con body
// { order_id: text, ready_event_id: uuid }.
//
// Secrets attesi a runtime (mai in questo file, mai nel repo — vedi AUTH_IMPLEMENTATION):
// - KITCHEN_PUSH_WEBHOOK_SECRET  — deve combaciare col secret Vault 'kitchen_push_webhook_secret'
//   letto dal trigger SQL. Placeholder/gate: se assente, ogni richiesta è rifiutata (401).
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — iniettate automaticamente dalla piattaforma
//   Supabase per ogni Edge Function, non gestite/commitate da noi.
// - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT — assenti oggi in ogni ambiente
//   (placeholder/gate): finché mancano, ogni invio si ferma con result=config_error,
//   error_code=vapid_not_configured, senza retry (un problema di configurazione non si risolve
//   riprovando).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import {
  WAIT_MS,
  MAX_SEND_ATTEMPTS,
  isStillSameReadyEvent,
  classifyPushSendError,
  shouldRetry,
  retryDelayForAttempt,
  buildLogLine,
} from './logic.js';

function log(line) {
  // Un oggetto JSON per riga, finisce nei log nativi della Edge Function (Supabase Studio /
  // mcp__supabase__query_logs) — nessuna nuova tabella per V1 (OBSERVABILITY).
  console.log(JSON.stringify(line));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  // AUTH_IMPLEMENTATION: nessuna auth implicita. Confronto esplicito contro il secret condiviso
  // (env, mai hardcoded) — vedi runbook per come il valore arriva qui.
  const expectedSecret = Deno.env.get('KITCHEN_PUSH_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization') ?? '';
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    log(buildLogLine({ orderId: null, result: 'auth_rejected', errorCode: 'invalid_webhook_secret', attempt: 1 }));
    return new Response('unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const orderId = body?.order_id;
  const capturedReadyEventId = body?.ready_event_id;
  if (!orderId || !capturedReadyEventId) {
    return new Response('bad request', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    log(buildLogLine({ orderId, readyEventId: capturedReadyEventId, result: 'config_error', errorCode: 'supabase_service_role_missing', attempt: 1 }));
    return new Response('server misconfigured', { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Step 1 — wait > Undo Window (9s), vedi READY_EVENT_IDENTITY.
  await sleep(WAIT_MS);

  // Step 2 — re-read + verifica IDENTITÀ (non solo stato). Nessun write qui: solo lettura.
  const { data: order, error: readError } = await supabase
    .from('kitchen_orders')
    .select('id,status,ready_event_id,customer_id')
    .eq('id', orderId)
    .maybeSingle();

  if (readError || !isStillSameReadyEvent(order, capturedReadyEventId)) {
    log(buildLogLine({ orderId, readyEventId: capturedReadyEventId, result: 'skipped_stale_event', attempt: 1 }));
    return new Response('ok', { status: 200 });
  }

  // Step 3 — claim atomico SOLO dopo la verifica (ordine esplicito di questa fase, DEDUP).
  // La WHERE clause è il vero cancello atomico: la SELECT sopra è solo un early-exit, la
  // correttezza del dedup dipende esclusivamente da questa UPDATE condizionata.
  const { data: claimed, error: claimError } = await supabase
    .from('kitchen_orders')
    .update({ ready_push_claimed_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('status', 'ready')
    .eq('ready_event_id', capturedReadyEventId)
    .is('ready_push_claimed_at', null)
    .select('id')
    .maybeSingle();

  if (claimError || !claimed) {
    log(buildLogLine({ orderId, readyEventId: capturedReadyEventId, result: 'duplicate_skip', attempt: 1 }));
    return new Response('ok', { status: 200 });
  }

  // Step 4 — invio. Da qui in poi nessun write torna mai a toccare status/payment_status.
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    log(buildLogLine({ orderId, readyEventId: capturedReadyEventId, result: 'config_error', errorCode: 'vapid_not_configured', attempt: 1 }));
    return new Response('ok', { status: 200 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('kitchen_push_subscriptions')
    .select('id,endpoint,p256dh,auth_key')
    .eq('customer_id', order.customer_id);

  if (subscriptionsError) {
    // Query fallita: nessuna subscription letta, nessun invio possibile per questo evento.
    // Log esplicito (mai silenzioso) — solo il codice errore Postgres, mai endpoint/keys/PII.
    log(buildLogLine({
      orderId,
      readyEventId: capturedReadyEventId,
      result: 'failed',
      errorCode: subscriptionsError.code ?? 'subscriptions_fetch_failed',
      attempt: 1,
    }));
    return new Response('ok', { status: 200 });
  }

  for (const sub of subscriptions ?? []) {
    await sendWithBoundedRetry(supabase, sub, orderId, capturedReadyEventId);
  }

  return new Response('ok', { status: 200 });
});

async function sendWithBoundedRetry(supabase, sub, orderId, readyEventId) {
  // Stesso contratto payload/tag già atteso da public/sw.js (Phase 1, addEventListener('push')).
  const payload = JSON.stringify({
    orderId,
    title: 'Il tuo ordine è pronto!',
    body: 'Passa al banco per ritirarlo.',
    url: `/kitchen/status?orderId=${orderId}`,
  });

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      );
      log(buildLogLine({ orderId, readyEventId, result: 'sent', attempt }));
      return;
    } catch (err) {
      const httpStatus = err?.statusCode;
      const kind = httpStatus ? 'http' : (err?.name === 'AbortError' ? 'timeout' : 'network');
      const classification = classifyPushSendError({ kind, httpStatus });

      if (classification === 'terminal') {
        // 404/410 — cleanup immediato, mai retry (FAILURE_STRATEGY).
        await supabase.from('kitchen_push_subscriptions').delete().eq('id', sub.id);
        log(buildLogLine({ orderId, readyEventId, result: 'cleanup_stale', errorCode: String(httpStatus), attempt }));
        return;
      }
      if (classification === 'config') {
        // Auth/config — no infinite retry: un solo log, uscita immediata per questa subscription.
        log(buildLogLine({ orderId, readyEventId, result: 'config_error', errorCode: String(httpStatus ?? 'vapid_or_auth'), attempt }));
        return;
      }
      // retryable — bounded, tutto dentro questa singola invocazione, mai una coda/cron esterni.
      if (!shouldRetry(attempt)) {
        log(buildLogLine({ orderId, readyEventId, result: 'failed', errorCode: String(httpStatus ?? kind), attempt }));
        return;
      }
      log(buildLogLine({ orderId, readyEventId, result: 'retrying', errorCode: String(httpStatus ?? kind), attempt }));
      await sleep(retryDelayForAttempt(attempt));
    }
  }
}
