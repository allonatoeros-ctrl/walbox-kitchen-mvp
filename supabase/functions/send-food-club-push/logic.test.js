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
  SEND_TIMEOUT_MS,
  withTimeout,
  canStartMessage,
  processBatch,
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
  assert.match(src, /processBatch\(\{[\s\S]*vapidOk,\s*vapidError,/); // l'errore arriva al report via processBatch (test sotto)
});

// ---------------------------------------------------------------------------------------------------
// Orchestrazione (processBatch): rete finta, nessun push service reale.
// ---------------------------------------------------------------------------------------------------
const sub = (n) => ({ endpoint: `https://push.test/${n}`, p256dh: 'k', auth: 'a' });
const row = (id, subs, extra = {}) => ({ message_id: id, user_id: 'u-' + id, kind: 'stamp', title: 'T', body: 'B',
  url: `/kitchen/club?n=${id}`, subscriptions: subs, ...extra });
const httpErr = (statusCode) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
function harness({ send = async () => {}, reportImpl, clock } = {}) {
  const reports = [];
  const logs = [];
  const sends = [];
  return {
    reports, logs, sends,
    deps: {
      sendOne: (s, payload) => { sends.push({ endpoint: s.endpoint, payload: JSON.parse(payload) }); return send(s); },
      report: async (r, agg) => { reports.push({ id: r.message_id, ...agg }); return reportImpl ? reportImpl(r, agg) : { error: null }; },
      log: (l) => logs.push(l),
      now: clock ?? (() => 0),
      startedAt: 0,
    },
  };
}

test('withTimeout: invio appeso -> TimeoutError classificato come timeout (ritentabile)', async () => {
  const hang = new Promise(() => {});
  await assert.rejects(withTimeout(hang, 20), (err) => {
    assert.equal(err.name, 'TimeoutError');
    assert.deepEqual(errorToKind(err), { kind: 'timeout' });
    return true;
  });
  assert.equal(await withTimeout(Promise.resolve('ok'), 20), 'ok');
});

test('canStartMessage: un messaggio parte solo se resta tempo per un invio intero prima del budget', () => {
  assert.equal(canStartMessage(0, 0), true);
  assert.equal(canStartMessage(0, TIME_BUDGET_MS - SEND_TIMEOUT_MS - 1), true);
  assert.equal(canStartMessage(0, TIME_BUDGET_MS - SEND_TIMEOUT_MS), false);
  assert.ok(TIME_BUDGET_MS + 0 < 30000, 'budget sotto il timeout del tick pg_net (30 s)');
});

test('processBatch: consegna, 410 = endpoint da cancellare, 500 = ritenta, payload senza dati personali', async () => {
  const h = harness({ send: async (s) => {
    if (s.endpoint.endsWith('/gone')) throw httpErr(410);
    if (s.endpoint.endsWith('/err')) throw httpErr(500);
  } });
  const out = await processBatch({ batch: [row('a', [sub('ok'), sub('gone')]), row('b', [sub('err')]), row('c', [sub('gone')])],
    vapidOk: true, ...h.deps });
  assert.deepEqual(out, { sent: 1, deferred: 0, failed: 2, reportErrors: 0 });
  assert.deepEqual(h.reports, [
    { id: 'a', delivered: 1, goneEndpoints: ['https://push.test/gone'], error: null },
    { id: 'b', delivered: 0, goneEndpoints: [], error: 'http_500' },
    { id: 'c', delivered: 0, goneEndpoints: ['https://push.test/gone'], error: 'all_endpoints_gone' },
  ]);
  for (const s of h.sends) {
    assert.deepEqual(Object.keys(s.payload).sort(), ['body', 'data', 'tag', 'title', 'url']);
    assert.equal(JSON.stringify(s.payload).includes('u-'), false, 'mai user_id nel payload');
  }
});

test('processBatch: invio che non risponde -> timeout, messaggio riportato come ritentabile, batch prosegue', async () => {
  const h = harness({ send: (s) => (s.endpoint.endsWith('/hang') ? new Promise(() => {}) : Promise.resolve()) });
  const out = await processBatch({ batch: [row('a', [sub('hang')]), row('b', [sub('ok')])], vapidOk: true,
    sendTimeoutMs: 25, budgetMs: 10000, ...h.deps });
  assert.deepEqual(h.reports.map((r) => [r.id, r.delivered, r.error]), [['a', 0, 'timeout'], ['b', 1, null]]);
  assert.equal(out.sent, 1);
});

test('processBatch: budget superato a metà -> i restanti tornano in coda con time_budget, nessun invio', async () => {
  let t = 0;
  const h = harness({ clock: () => t, send: async () => { t += 9000; } });
  const out = await processBatch({ batch: [row('a', [sub('1')]), row('b', [sub('2')]), row('c', [sub('3')])],
    vapidOk: true, ...h.deps });
  // a parte a 0 (t=9000), b parte a 9000 (< 25000-8000) e finisce a 18000, c non parte (18000 >= 17000)
  assert.deepEqual(h.reports.map((r) => [r.id, r.error]), [['a', null], ['b', null], ['c', 'time_budget']]);
  assert.equal(h.sends.length, 2);
  assert.deepEqual(out, { sent: 2, deferred: 1, failed: 0, reportErrors: 0 });
  assert.equal(h.logs.at(-1).result, 'deferred');
});

test('processBatch: VAPID assenti o malformate -> nessun invio, ogni messaggio riportato con l errore di config', async () => {
  const h = harness({ send: async () => { throw new Error('non deve essere chiamato'); } });
  const out = await processBatch({ batch: [row('a', [sub('1')]), row('b', [sub('2')])], vapidOk: false,
    vapidError: 'vapid_invalid', ...h.deps });
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.reports.map((r) => r.error), ['vapid_invalid', 'vapid_invalid']);
  assert.equal(out.failed, 2);
});

test('processBatch: report fallito (errore RPC o eccezione) -> log report_failed, batch prosegue', async () => {
  let n = 0;
  const h = harness({ reportImpl: async () => {
    n += 1;
    if (n === 1) return { error: { code: 'PGRST301' } };
    if (n === 2) throw new Error('network down');
    return { error: null };
  } });
  const out = await processBatch({ batch: [row('a', [sub('1')]), row('b', [sub('2')]), row('c', [sub('3')])],
    vapidOk: true, ...h.deps });
  assert.equal(out.reportErrors, 2);
  assert.deepEqual(h.logs.map((l) => [l.message_id, l.result, l.error_code]),
    [['a', 'report_failed', 'PGRST301'], ['b', 'report_failed', 'report_threw'], ['c', 'sent', null]]);
});

test('processBatch: log senza endpoint, chiavi, titoli o testi', async () => {
  const h = harness({ send: async () => { throw httpErr(410); } });
  await processBatch({ batch: [row('a', [sub('segreto')], { title: 'TITOLO-X', body: 'CORPO-X' })], vapidOk: true, ...h.deps });
  const text = JSON.stringify(h.logs);
  for (const bad of ['push.test', 'segreto', 'TITOLO-X', 'CORPO-X', 'p256dh']) assert.equal(text.includes(bad), false, bad);
});

test('processBatch: sottoscrizioni assenti -> no_subscriptions (il DB chiude il messaggio)', async () => {
  const h = harness();
  await processBatch({ batch: [row('a', null)], vapidOk: true, ...h.deps });
  assert.deepEqual(h.reports[0], { id: 'a', delivered: 0, goneEndpoints: [], error: 'no_subscriptions' });
});

test('payload: URL protocol-relative (//host) o con backslash rifiutati', () => {
  assert.equal(buildPushPayload({ url: '//evil.example/x' }).url, '/kitchen/club');
  assert.equal(buildPushPayload({ url: '/\\evil.example' }).url, '/kitchen/club');
  assert.equal(buildPushPayload({ url: '/kitchen/club/buoni?n=1' }).url, '/kitchen/club/buoni?n=1');
});
