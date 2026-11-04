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
  const url = typeof row?.url === 'string' && row.url.startsWith('/') ? row.url : DEFAULT_URL;
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
