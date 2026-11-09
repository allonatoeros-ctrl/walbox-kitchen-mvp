// send-food-club-push/logic.js — Food Club V1 (I-5), logica pura.
// Nessun import Deno/Supabase/rete: solo funzioni pure testabili con `node --test logic.test.js`.
// index.ts fa l'orchestrazione (claim batch -> invio web-push -> report). Le regole di consenso,
// fascia silenziosa e tetti stanno nel DB (food_club_push_claim_batch), non qui.

// Budget complessivo dell'invocazione: il tick pg_net chiude la richiesta a 30 s.
export const TIME_BUDGET_MS = 25000;
// Timeout del singolo invio verso il push service.
export const SEND_TIMEOUT_MS = 8000;
export const BATCH_LIMIT = 50;

export const TAG_PREFIX = 'food-club-';
const DEFAULT_URL = '/kitchen/club';

// Payload letto da public/sw.js: title, body, tag (sostituisce la notifica dello stesso tipo),
// url + data.url (pagina aperta al click), data.kind. Solo campi in whitelist: mai user_id o endpoint.
export function buildPushPayload(row) {
  const kind = typeof row?.kind === 'string' && row.kind ? row.kind : 'generic';
  // Solo percorsi dello stesso sito: '//host' e '/\\host' sarebbero URL verso un altro dominio.
  const url = typeof row?.url === 'string' && /^\/(?![/\\])/.test(row.url) ? row.url : DEFAULT_URL;
  return {
    title: row?.title || 'Walrus Food Club',
    body: row?.body || '',
    tag: `${TAG_PREFIX}${kind}`,
    url,
    data: { url, kind },
  };
}

// Stessa classificazione di send-order-ready-push: 404/410 = endpoint morto (da cancellare),
// 401/403 = configurazione VAPID/auth, il resto = transitorio (ritenta il DB al prossimo tick).
export function classifyPushSendError({ kind, httpStatus }) {
  if (kind === 'timeout' || kind === 'network') return 'retryable';
  if (kind === 'config') return 'config';
  if (kind === 'http') {
    if (httpStatus === 404 || httpStatus === 410) return 'terminal';
    if (httpStatus === 401 || httpStatus === 403) return 'config';
    if (httpStatus === 429 || (typeof httpStatus === 'number' && httpStatus >= 500)) return 'retryable';
  }
  return 'retryable';
}

// Da un errore lanciato da web-push a { kind, httpStatus }.
export function errorToKind(err) {
  const httpStatus = typeof err?.statusCode === 'number' ? err.statusCode : undefined;
  if (httpStatus) return { kind: 'http', httpStatus };
  if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || /timeout/i.test(String(err?.message ?? ''))) {
    return { kind: 'timeout' };
  }
  return { kind: 'network' };
}

// outcomes: [{ endpoint, ok: true } | { endpoint, ok: false, kind, httpStatus }]
// -> argomenti di food_club_push_report: delivered, goneEndpoints, error (null se almeno una consegna).
export function aggregateOutcomes(outcomes) {
  let delivered = 0;
  const gone = [];
  let firstError = null;
  for (const o of outcomes ?? []) {
    if (o?.ok) { delivered += 1; continue; }
    const cls = classifyPushSendError({ kind: o?.kind, httpStatus: o?.httpStatus });
    if (cls === 'terminal') {
      if (o?.endpoint && !gone.includes(o.endpoint)) gone.push(o.endpoint);
      continue;
    }
    if (!firstError) {
      firstError = cls === 'config'
        ? `config_${o?.httpStatus ?? 'vapid_or_auth'}`
        : (o?.httpStatus ? `http_${o.httpStatus}` : (o?.kind || 'unknown'));
    }
  }
  let error = null;
  if (delivered === 0) {
    error = firstError ?? (gone.length > 0 ? 'all_endpoints_gone' : 'no_subscriptions');
  }
  return { delivered, goneEndpoints: gone, error };
}

export function hasVapidConfig({ publicKey, privateKey, subject }) {
  return Boolean(publicKey && privateKey && subject);
}

export function isAuthorized(authHeader, expectedSecret) {
  return Boolean(expectedSecret) && authHeader === `Bearer ${expectedSecret}`;
}

export function budgetExceeded(startedAt, now, budgetMs = TIME_BUDGET_MS) {
  return now - startedAt >= budgetMs;
}

// Log JSON per riga, whitelist esplicita (mai endpoint, chiavi, titoli/testi o PII).
export function buildLogLine({ messageId, kind, result, delivered, gone, errorCode, timestamp }) {
  return {
    message_id: messageId ?? null,
    event_type: 'food_club_push',
    kind: kind ?? null,
    result: result ?? null,
    delivered: delivered ?? null,
    gone: gone ?? null,
    error_code: errorCode ?? null,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}

// Rifiuta dopo `ms` con un errore di tipo timeout (web-push ha già l'opzione `timeout`, ma sotto Deno/npm non è
// garantita: questo limite vale comunque). Il timer viene sempre cancellato.
export function withTimeout(promise, ms, setTimer = setTimeout, clearTimer = clearTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimer(() => {
      const err = new Error(`push send timeout after ${ms} ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimer(timer));
}

// Un messaggio parte solo se c'è tempo per il suo invio più lento (SEND_TIMEOUT_MS) prima della fine del budget:
// così l'ultima consegna non sfora i 30 s del tick e nessun messaggio resta 'sending' a metà.
export function canStartMessage(startedAt, now, budgetMs = TIME_BUDGET_MS, sendTimeoutMs = SEND_TIMEOUT_MS) {
  return !budgetExceeded(startedAt, now, budgetMs - sendTimeoutMs);
}

// Orchestrazione pura di un batch già reclamato. Dipendenze iniettate (testabili senza rete):
//   sendOne(sub, payloadString) -> Promise (rifiuta con errore web-push)
//   report(row, agg) -> Promise<{ error?: { code } } | void>  (chiama food_club_push_report)
//   log(line), now() -> ms
// Ritorna il riepilogo { sent, deferred, failed, reportErrors }.
export async function processBatch({ batch, vapidOk, vapidError = 'vapid_not_configured', startedAt, now = Date.now,
  sendOne, report, log = () => {}, budgetMs = TIME_BUDGET_MS, sendTimeoutMs = SEND_TIMEOUT_MS }) {
  const summary = { sent: 0, deferred: 0, failed: 0, reportErrors: 0 };
  const doReport = async (row, agg, result) => {
    let error;
    try {
      const res = await report(row, agg);
      error = res?.error ?? null;
    } catch (err) {
      error = { code: err?.code ?? 'report_threw' };
    }
    if (error) summary.reportErrors += 1;
    log(buildLogLine({
      messageId: row?.message_id,
      kind: row?.kind,
      result: error ? 'report_failed' : result,
      delivered: agg.delivered,
      gone: agg.goneEndpoints.length,
      errorCode: error ? (error.code ?? 'report_failed') : agg.error,
    }));
  };
  for (const row of batch ?? []) {
    if (!vapidOk) {
      summary.failed += 1;
      await doReport(row, { delivered: 0, goneEndpoints: [], error: vapidError }, 'config_error');
      continue;
    }
    if (!canStartMessage(startedAt, now(), budgetMs, sendTimeoutMs)) {
      // Fuori tempo: torna subito in coda senza consumare un tentativo (food_club_push_report, 'time_budget').
      summary.deferred += 1;
      await doReport(row, { delivered: 0, goneEndpoints: [], error: 'time_budget' }, 'deferred');
      continue;
    }
    const payload = JSON.stringify(buildPushPayload(row));
    const subs = Array.isArray(row?.subscriptions) ? row.subscriptions : [];
    const outcomes = await Promise.all(subs.map(async (sub) => {
      try {
        await withTimeout(sendOne(sub, payload), sendTimeoutMs);
        return { endpoint: sub?.endpoint, ok: true };
      } catch (err) {
        return { endpoint: sub?.endpoint, ok: false, ...errorToKind(err) };
      }
    }));
    const agg = aggregateOutcomes(outcomes);
    if (agg.delivered > 0) summary.sent += 1; else summary.failed += 1;
    await doReport(row, agg, agg.delivered > 0 ? 'sent' : 'not_delivered');
  }
  return summary;
}
