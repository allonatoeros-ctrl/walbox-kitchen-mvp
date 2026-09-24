// send-order-ready-push/logic.js — F6 Phase 2, logica pura (2026-09-24).
// Nessun import Deno/Supabase/rete qui: solo funzioni pure, testabili con `node --test` come
// src/lib/webPush.js (Phase 1). index.ts importa questo modulo per l'orchestrazione reale
// (wait/read/claim/send), che resta verificata solo staticamente (nessun runtime Edge Function
// disponibile in questa sandbox) — vedi tests/unit/f6-webpush-phase2-ready-delivery.test.mjs.

// Wait dopo il webhook, prima del re-read: deve superare l'Undo Window P0-B (9s,
// src/pages/KitchenSoloService.jsx). Vedi OPEN_RISKS nel report Final Architecture Gate:
// accoppiamento documentato, non enforced automaticamente se P0-B cambia durata in futuro.
export const UNDO_WINDOW_MS = 9000;
export const WAIT_MS = 10000;

// 1 tentativo + al massimo 2 retry bounded, mai una coda/cron esterni.
export const MAX_SEND_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [300, 800];

// READY_EVENT_IDENTITY / UNDO_RACE_VERDICT: verifica IDENTITÀ dell'evento, non solo lo status.
// Un ordine tornato 'ready' con un ready_event_id diverso da quello catturato al momento del
// webhook NON è lo stesso evento (es. READY -> undo -> READY entro il wait) e non deve generare
// un invio per l'invocazione "vecchia".
export function isStillSameReadyEvent(order, capturedReadyEventId) {
  return Boolean(
    order &&
    order.status === 'ready' &&
    order.ready_event_id != null &&
    capturedReadyEventId != null &&
    order.ready_event_id === capturedReadyEventId
  );
}

// FAILURE_STRATEGY: classifica l'esito di un tentativo di invio push verso un singolo endpoint.
// 'terminal'  -> 404/410, l'endpoint non esiste più, cleanup immediato, mai retry.
// 'config'    -> 401/403 o VAPID mancante, un retry non risolve un problema di configurazione.
// 'retryable' -> timeout/rete/429/5xx, bounded retry in-process (mai coda/cron).
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

export function shouldRetry(attempt, maxAttempts = MAX_SEND_ATTEMPTS) {
  return attempt < maxAttempts;
}

export function retryDelayForAttempt(attempt) {
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

// OBSERVABILITY: whitelist esplicita delle chiavi loggabili — anche se un chiamante passasse
// endpoint/keys/nickname per errore, questa funzione non li includerebbe mai nell'oggetto
// risultante (nessuno spread di input arbitrario).
export function buildLogLine({ orderId, eventType, readyEventId, result, errorCode, attempt, timestamp }) {
  return {
    order_id: orderId ?? null,
    event_type: eventType ?? 'order_ready_push',
    ready_event_id: readyEventId ?? null,
    result: result ?? null,
    error_code: errorCode ?? null,
    attempt: attempt ?? null,
    timestamp: timestamp ?? new Date().toISOString(),
  };
}
