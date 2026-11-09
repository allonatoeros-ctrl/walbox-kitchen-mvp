// node --test supabase/functions/send-food-club-push/logic.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildPushPayload,
  classifyPushSendError,
  errorToKind,
  aggregateOutcomes,
  hasVapidConfig,
  isAuthorized,
  budgetExceeded,
  buildLogLine,
  TIME_BUDGET_MS,
} from './logic.js';

test('payload: tag per tipo, url in chiaro e in data (chiavi lette da sw.js)', () => {
  const p = buildPushPayload({ message_id: 'm1', user_id: 'u1', kind: 'voucher_unlocked', title: '5 € SBLOCCATI', body: 'ok', url: '/kitchen/club/buoni?n=m1' });
  assert.deepEqual(p, {
    title: '5 € SBLOCCATI',
    body: 'ok',
    tag: 'food-club-voucher_unlocked',
    url: '/kitchen/club/buoni?n=m1',
    data: { url: '/kitchen/club/buoni?n=m1', kind: 'voucher_unlocked' },
  });
  assert.equal('user_id' in p, false);
  assert.equal('message_id' in p, false);
});

test('payload: url non relativo o assente -> /kitchen/club; kind assente -> generic', () => {
  assert.equal(buildPushPayload({ url: 'https://evil.example/x' }).url, '/kitchen/club');
  assert.equal(buildPushPayload({}).tag, 'food-club-generic');
  assert.equal(buildPushPayload({}).title, 'Walrus Food Club');
});

test('classificazione errori: 404/410 terminal, 401/403 config, 429/5xx/rete retryable', () => {
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 404 }), 'terminal');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 410 }), 'terminal');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 401 }), 'config');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 403 }), 'config');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 429 }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'http', httpStatus: 503 }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'timeout' }), 'retryable');
  assert.equal(classifyPushSendError({ kind: 'network' }), 'retryable');
});

test('errorToKind: statusCode web-push, timeout, rete', () => {
  assert.deepEqual(errorToKind({ statusCode: 410 }), { kind: 'http', httpStatus: 410 });
  assert.deepEqual(errorToKind({ name: 'AbortError' }), { kind: 'timeout' });
  assert.deepEqual(errorToKind(new Error('Socket timeout')), { kind: 'timeout' });
  assert.deepEqual(errorToKind(new Error('ECONNRESET')), { kind: 'network' });
});

test('aggregazione: consegne contate, endpoint morti raccolti, nessun errore se almeno una consegna', () => {
  const r = aggregateOutcomes([
    { endpoint: 'a', ok: true },
    { endpoint: 'b', ok: false, kind: 'http', httpStatus: 410 },
    { endpoint: 'c', ok: false, kind: 'http', httpStatus: 404 },
    { endpoint: 'd', ok: false, kind: 'timeout' },
  ]);
  assert.deepEqual(r, { delivered: 1, goneEndpoints: ['b', 'c'], error: null });
});

test('aggregazione: zero consegne -> codice errore per il report', () => {
  assert.equal(aggregateOutcomes([{ endpoint: 'a', ok: false, kind: 'http', httpStatus: 503 }]).error, 'http_503');
  assert.equal(aggregateOutcomes([{ endpoint: 'a', ok: false, kind: 'http', httpStatus: 403 }]).error, 'config_403');
  assert.equal(aggregateOutcomes([{ endpoint: 'a', ok: false, kind: 'network' }]).error, 'network');
  const gone = aggregateOutcomes([{ endpoint: 'a', ok: false, kind: 'http', httpStatus: 410 }]);
  assert.deepEqual(gone, { delivered: 0, goneEndpoints: ['a'], error: 'all_endpoints_gone' });
  assert.deepEqual(aggregateOutcomes([]), { delivered: 0, goneEndpoints: [], error: 'no_subscriptions' });
});

test('aggregazione: endpoint duplicati non ripetuti', () => {
  const r = aggregateOutcomes([
    { endpoint: 'x', ok: false, kind: 'http', httpStatus: 410 },
    { endpoint: 'x', ok: false, kind: 'http', httpStatus: 410 },
  ]);
  assert.deepEqual(r.goneEndpoints, ['x']);
});

test('VAPID: servono tutte e tre le variabili', () => {
  assert.equal(hasVapidConfig({ publicKey: 'p', privateKey: 'k', subject: 'mailto:x' }), true);
  assert.equal(hasVapidConfig({ publicKey: 'p', privateKey: 'k' }), false);
  assert.equal(hasVapidConfig({}), false);
});

test('auth: secret assente -> sempre rifiutato; header deve combaciare esatto', () => {
  assert.equal(isAuthorized('Bearer ', undefined), false);
  assert.equal(isAuthorized('Bearer undefined', undefined), false);
  assert.equal(isAuthorized('Bearer s3', 's3'), true);
  assert.equal(isAuthorized('bearer s3', 's3'), false);
  assert.equal(isAuthorized('Bearer s3x', 's3'), false);
});

test('budget tempo ~25 s', () => {
  assert.equal(TIME_BUDGET_MS, 25000);
  assert.equal(budgetExceeded(0, 24999), false);
  assert.equal(budgetExceeded(0, 25000), true);
});

test('log: whitelist, niente endpoint/titoli anche se passati per errore', () => {
  const line = buildLogLine({ messageId: 'm', kind: 'stamp', result: 'sent', delivered: 1, gone: 0, endpoint: 'secret', title: 'x', timestamp: 't' });
  assert.deepEqual(Object.keys(line).sort(), ['delivered', 'error_code', 'event_type', 'gone', 'kind', 'message_id', 'result', 'timestamp']);
  assert.equal(line.event_type, 'food_club_push');
});

test('index.ts: setVapidDetails dentro try/catch (chiavi malformate non fanno cadere la funzione, errore vapid_invalid)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(src, /try\s*\{\s*(\/\/[^\n]*\n\s*)*webpush\.setVapidDetails/);
  assert.match(src, /vapidError = 'vapid_invalid'/);
  assert.match(src, /error: vapidError/);
});
