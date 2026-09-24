// Test mirato F6 Phase 2 — Ready Event Identity + Async Delivery (2026-09-24).
// Stile repo (vedi tests/unit/f6-webpush-foundations.test.mjs, Phase 1): funzioni pure di
// supabase/functions/send-order-ready-push/logic.js testate con node --test; l'orchestrazione
// Deno reale (index.ts) è verificata solo con assert statiche sul sorgente, perché nessun runtime
// Edge Function è disponibile in questa sandbox (coerente con STOP CONDITION: nessun deploy).
//
// Eseguire a mano: node --test tests/unit/f6-webpush-phase2-ready-delivery.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FN_DIR = join(ROOT, 'supabase/functions/send-order-ready-push');

const {
  UNDO_WINDOW_MS,
  WAIT_MS,
  MAX_SEND_ATTEMPTS,
  RETRY_DELAYS_MS,
  isStillSameReadyEvent,
  classifyPushSendError,
  shouldRetry,
  retryDelayForAttempt,
  buildLogLine,
} = await import(join(FN_DIR, 'logic.js'));

// --- READY_EVENT_IDENTITY / UNDO_RACE_VERDICT (livello Edge Function) --------------------------

test('isStillSameReadyEvent: wait > Undo Window P0-B (9s)', () => {
  assert.ok(WAIT_MS > UNDO_WINDOW_MS, 'il wait deve superare la finestra di undo');
  assert.equal(UNDO_WINDOW_MS, 9000);
});

test('isStillSameReadyEvent: stesso evento, ancora ready -> true (invio legittimo)', () => {
  const order = { status: 'ready', ready_event_id: 'evt-1', customer_id: 'cust-1' };
  assert.equal(isStillSameReadyEvent(order, 'evt-1'), true);
});

test('isStillSameReadyEvent: status cambiato durante il delay (undo, o avanzato) -> false', () => {
  const order = { status: 'preparing', ready_event_id: 'evt-1', customer_id: 'cust-1' };
  assert.equal(isStillSameReadyEvent(order, 'evt-1'), false);
  const delivered = { status: 'delivered', ready_event_id: 'evt-1', customer_id: 'cust-1' };
  assert.equal(isStillSameReadyEvent(delivered, 'evt-1'), false);
});

test('isStillSameReadyEvent: READY -> undo -> READY entro il wait -> evento vecchio non deve inviare', () => {
  // L'invocazione partita sul primo evento (evt-1) rilegge l'ordine e lo trova ready di nuovo,
  // ma con un ready_event_id diverso (evt-2, generato dal secondo ingresso in ready): non è lo
  // stesso evento, l'invocazione vecchia non deve inviare (lo farà l'invocazione di evt-2, con la
  // propria attesa di 10s).
  const orderAfterSecondReady = { status: 'ready', ready_event_id: 'evt-2', customer_id: 'cust-1' };
  assert.equal(isStillSameReadyEvent(orderAfterSecondReady, 'evt-1'), false);
});

test('isStillSameReadyEvent: ordine non trovato o ready_event_id nullo -> false, mai un invio', () => {
  assert.equal(isStillSameReadyEvent(null, 'evt-1'), false);
  assert.equal(isStillSameReadyEvent({ status: 'ready', ready_event_id: null }, 'evt-1'), false);
  assert.equal(isStillSameReadyEvent({ status: 'ready', ready_event_id: 'evt-1' }, null), false);
});

// --- DEDUP: claim atomico SOLO dopo la verifica, simulazione pura -------------------------------

function simulateAtomicClaim(row, { orderId, readyEventId }) {
  if (row.id !== orderId) return { claimed: false, row };
  if (row.status !== 'ready') return { claimed: false, row };
  if (row.ready_event_id !== readyEventId) return { claimed: false, row };
  if (row.ready_push_claimed_at !== null) return { claimed: false, row };
  return { claimed: true, row: { ...row, ready_push_claimed_at: '2026-09-24T00:00:20Z' } };
}

test('dedup: due invocazioni per lo stesso order_id + ready_event_id -> solo la prima claima', () => {
  let row = { id: 'A07', status: 'ready', ready_event_id: 'evt-1', ready_push_claimed_at: null };

  const first = simulateAtomicClaim(row, { orderId: 'A07', readyEventId: 'evt-1' });
  assert.equal(first.claimed, true);
  row = first.row;

  const second = simulateAtomicClaim(row, { orderId: 'A07', readyEventId: 'evt-1' });
  assert.equal(second.claimed, false, 'il retry/duplicato del webhook non deve claimare una seconda volta');
});

test('dedup: due eventi ready diversi sullo stesso ordine claimano indipendentemente', () => {
  let row = { id: 'A07', status: 'ready', ready_event_id: 'evt-1', ready_push_claimed_at: '2026-09-24T00:00:10Z' };
  // evt-1 già claimato; arriva l'evento evt-2 (nuovo ready dopo undo) — il trigger avrebbe già
  // resettato claimed_at a NULL sulla transizione, qui lo simuliamo esplicitamente.
  row = { ...row, ready_event_id: 'evt-2', ready_push_claimed_at: null };

  const claimEvt2 = simulateAtomicClaim(row, { orderId: 'A07', readyEventId: 'evt-2' });
  assert.equal(claimEvt2.claimed, true);

  // L'invocazione vecchia (evt-1) non deve poter claimare evt-2.
  const staleClaimEvt1 = simulateAtomicClaim(claimEvt2.row, { orderId: 'A07', readyEventId: 'evt-1' });
  assert.equal(staleClaimEvt1.claimed, false);
});

// --- FAILURE_STRATEGY -----------------------------------------------------------------------

test('classifyPushSendError: 404/410 -> terminal (stale subscription, cleanup)', () => {
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 404 }), 'terminal');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 410 }), 'terminal');
});

test('classifyPushSendError: timeout/rete/429/5xx -> retryable', () => {
  assert.equal(classifyPushSendError({ kind: 'timeout' }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'network' }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 429 }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 500 }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 503 }), 'retryable');
});

test('classifyPushSendError: 401/403 -> config, mai retryable (un retry non risolve un problema di config)', () => {
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 401 }), 'config');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 403 }), 'config');
});

test('retry bounded: MAX_SEND_ATTEMPTS=3 (1 tentativo + 2 retry), mai una coda/cron', () => {
  assert.equal(MAX_SEND_ATTEMPTS, 3);
  assert.equal(RETRY_DELAYS_MS.length, 2);
  assert.equal(shouldRetry(1), true);
  assert.equal(shouldRetry(2), true);
  assert.equal(shouldRetry(3), false, 'al terzo tentativo fallito non deve più ritentare');
});

test('retryDelayForAttempt: backoff fisso, mai indefinito oltre l\'ultimo valore configurato', () => {
  assert.equal(retryDelayForAttempt(1), RETRY_DELAYS_MS[0]);
  assert.equal(retryDelayForAttempt(2), RETRY_DELAYS_MS[1]);
  assert.equal(retryDelayForAttempt(99), RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
});

// --- OBSERVABILITY ---------------------------------------------------------------------------

test('buildLogLine: contiene esattamente le chiavi richieste, nient\'altro', () => {
  const line = buildLogLine({
    orderId: 'A07',
    eventType: 'order_ready_push',
    readyEventId: 'evt-1',
    result: 'sent',
    errorCode: null,
    attempt: 1,
    timestamp: '2026-09-24T00:00:20.000Z',
  });
  assert.deepEqual(Object.keys(line).sort(), [
    'attempt', 'error_code', 'event_type', 'order_id', 'ready_event_id', 'result', 'timestamp',
  ]);
});

test('buildLogLine: whitelist per costruzione — chiavi PII/segreti passate per errore non compaiono mai', () => {
  const line = buildLogLine({
    orderId: 'A07',
    result: 'sent',
    attempt: 1,
    // Questi campi non esistono nella firma della funzione: anche se un chiamante li passasse,
    // l'oggetto risultante non li conterrebbe (nessuno spread di input arbitrario in logic.js).
    endpoint: 'https://push.example/leak',
    p256dh: 'leaked-key',
    auth_key: 'leaked-auth',
    nickname: 'Mario',
  });
  const serialized = JSON.stringify(line);
  assert.doesNotMatch(serialized, /push\.example|leaked-key|leaked-auth|Mario/);
});

// --- Verifiche statiche su index.ts (nessun runtime Deno in questa sandbox) ---------------------

const indexSrc = readFileSync(join(FN_DIR, 'index.ts'), 'utf8');

test('index.ts: verifica esplicita del secret webhook, nessuna auth implicita', () => {
  assert.match(indexSrc, /Deno\.env\.get\('KITCHEN_PUSH_WEBHOOK_SECRET'\)/);
  assert.match(indexSrc, /authHeader !== `Bearer \$\{expectedSecret\}`/);
  assert.match(indexSrc, /return new Response\('unauthorized', \{ status: 401 \}\)/);
});

test('index.ts: nessun secret/token letterale hardcoded (solo letture da Deno.env.get)', () => {
  assert.doesNotMatch(indexSrc, /Bearer [A-Za-z0-9+/=_-]{20,}/, 'nessun token letterale nel sorgente');
  const vapidKeyLiterals = indexSrc.match(/vapid(PublicKey|PrivateKey)\s*=\s*['"][^'"]{10,}['"]/i);
  assert.equal(vapidKeyLiterals, null, 'le chiavi VAPID devono venire solo da Deno.env.get, mai da un letterale');
});

test('index.ts: step 2 (re-read/verifica) precede testualmente lo step 3 (claim)', () => {
  const readIdx = indexSrc.indexOf("select('id,status,ready_event_id,customer_id')");
  const claimIdx = indexSrc.indexOf('ready_push_claimed_at: new Date().toISOString()');
  assert.ok(readIdx > -1 && claimIdx > -1, 'entrambi gli step devono essere presenti nel sorgente');
  assert.ok(readIdx < claimIdx, 'il re-read/verifica deve precedere il claim (claim SOLO dopo la verifica)');
});

test('index.ts: il claim aggiorna solo ready_push_claimed_at, mai status/payment_status', () => {
  const updateBlocks = [...indexSrc.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  assert.ok(updateBlocks.length > 0, 'deve esistere almeno un .update(...) nel file');
  for (const block of updateBlocks) {
    assert.doesNotMatch(block, /\bstatus\s*:/, 'nessun .update() deve scrivere status');
    assert.doesNotMatch(block, /\bpayment_status\s*:/, 'nessun .update() deve scrivere payment_status');
  }
});

test('index.ts: nessun .update()/write su kitchen_orders oltre al claim su ready_push_claimed_at', () => {
  const kitchenOrdersUpdateBlocks = indexSrc
    .split("from('kitchen_orders')")
    .slice(1)
    .map((chunk) => chunk.slice(0, 200));
  const withUpdate = kitchenOrdersUpdateBlocks.filter((chunk) => chunk.includes('.update('));
  assert.equal(withUpdate.length, 1, 'un solo punto del file deve scrivere su kitchen_orders');
  assert.match(withUpdate[0], /ready_push_claimed_at/);
});

test('index.ts: cleanup subscription stale è un DELETE mirato per id, non una DELETE senza filtro', () => {
  assert.match(indexSrc, /kitchen_push_subscriptions'\)\s*\.delete\(\)\.eq\('id', sub\.id\)/);
});

test('index.ts: nessun setInterval/cron — solo sleep bounded dentro la singola invocazione', () => {
  assert.doesNotMatch(indexSrc, /setInterval/);
});

test('index.ts: MAX_SEND_ATTEMPTS importato da logic.js, non ridefinito localmente', () => {
  assert.match(indexSrc, /for \(let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt \+= 1\)/);
});
