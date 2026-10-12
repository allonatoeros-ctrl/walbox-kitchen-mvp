// S6 — api/kitchen-online-abandon-sweep.js + api/_lib/onlineAbandonSweep.js (chiusura automatica a 5 minuti).
// Test fuori da api/ di proposito: ogni file .js in api/ conta come funzione Vercel (T6).
// Zero rete reale: globalThis.fetch sostituito da un router fake (Supabase REST + SumUp) che LANCIA su qualunque URL
// non previsto.   node --test tests/unit/online-abandon-sweep.test.mjs
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import handler from '../../api/kitchen-online-abandon-sweep.js';
import { runOnlineAbandonSweep, MAX_ORDERS_PER_RUN, RUN_BUDGET_MS } from '../../api/_lib/onlineAbandonSweep.js';

const SB = 'http://supabase.test';
const SECRET = 'sweep-secret';
const NOW = Date.parse('2026-10-12T20:00:00Z');
const ago = (min) => new Date(NOW - min * 60 * 1000).toISOString();
const CO = (ref) => `https://api.sumup.com/v0.1/checkouts/${ref}`;
const LIST = (attemptId) => `https://api.sumup.com/v0.1/checkouts?checkout_reference=${attemptId}`;

const origFetch = globalThis.fetch;
const origConsoleError = console.error;
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-fake';
  process.env.SUMUP_API_KEY = 'sumup-fake';
  process.env.KITCHEN_ABANDON_SWEEP_SECRET = SECRET;
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = origFetch;
  console.error = origConsoleError;
  process.env = { ...origEnv };
});

function json(status, body) {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const attempt = (over = {}) => ({
  id: 'att-1', amount: 10, provider: 'sumup', status: 'initiated', failure_reason: null,
  provider_ref: 'co-1', checkout_claim_at: ago(6), ...over,
});
const co = (ref, attemptId, status) => ({ status: 200, body: { id: ref, checkout_reference: attemptId, amount: 10, status } });

// orders: righe restituite dalla select degli ordini. attemptsByOrder: { orderId: [attempt] } (o { error }).
// sumup.get[ref]: risposte in coda (l'ultima si ripete); sumup.del[ref]; sumup.list[attemptId].
// rpc[name]: { status, body } oppure funzione (body parsato) -> { status, body }.
function installFakeFetch({ orders = [], attemptsByOrder = {}, sumup = {}, rpc = {} } = {}) {
  const calls = [];
  const getQueues = Object.fromEntries(Object.entries(sumup.get || {}).map(([k, v]) => [k, [...v]]));
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ?? null, signal: init.signal });

    if (url.startsWith('https://api.sumup.com/v0.1/checkouts')) {
      const listMatch = url.match(/checkout_reference=([^&]+)$/);
      if (listMatch && method === 'GET') {
        const r = sumup.list?.[decodeURIComponent(listMatch[1])];
        if (!r) throw new Error(`unexpected SumUp list ${url}`);
        return json(r.status ?? 200, r.body);
      }
      const ref = url.slice('https://api.sumup.com/v0.1/checkouts/'.length);
      if (method === 'GET' && getQueues[ref]) {
        const q = getQueues[ref];
        const r = q.length > 1 ? q.shift() : q[0];
        if (r.throw) throw new Error('network down');
        return json(r.status ?? 200, r.body);
      }
      if (method === 'DELETE' && sumup.del?.[ref]) {
        if (sumup.del[ref].throw) throw new Error('network down');
        return json(sumup.del[ref].status, {});
      }
      throw new Error(`unexpected SumUp call ${method} ${url}`);
    }

    if (url.startsWith(SB)) {
      const path = url.slice(SB.length);
      if (path.startsWith('/rest/v1/kitchen_orders')) return json(200, orders);
      if (path.startsWith('/rest/v1/kitchen_payments')) {
        const orderId = decodeURIComponent(path.match(/order_id=eq\.([^&]+)/)[1]);
        const a = attemptsByOrder[orderId] ?? [];
        if (a.error) return json(500, { message: a.error });
        return json(200, a);
      }
      const name = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null;
      if (name && rpc[name]) {
        const r = typeof rpc[name] === 'function' ? rpc[name](JSON.parse(init.body)) : rpc[name];
        return json(r.status, r.body);
      }
      if (name === 'kitchen_payment_attempt_set_provider_ref') return json(200, null);
      if (name === 'kitchen_payment_confirm') return json(200, { id: JSON.parse(init.body).p_attempt_id, status: 'succeeded' });
      if (name === 'kitchen_payment_fail') return json(200, null);
      if (name === 'kitchen_order_mark_payment_abandoned') return json(200, { id: JSON.parse(init.body).p_order_id, status: 'payment_abandoned' });
      if (name === 'kitchen_order_log_online_abandon_stuck') return json(200, true);
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return calls;
}

async function sweep(opts = {}, { now = () => NOW } = {}) {
  const calls = installFakeFetch(opts);
  const supabaseAdmin = createClient(SB, 'service-fake');
  const summary = await runOnlineAbandonSweep({ supabaseAdmin, sumupApiKey: 'sumup-fake', now });
  return { summary, calls };
}

const rpcCalls = (calls, name) => calls.filter((c) => c.url === `${SB}/rest/v1/rpc/${name}`);
const sumupCalls = (calls) => calls.filter((c) => c.url.startsWith('https://api.sumup.com'));
const ABANDON = 'kitchen_order_mark_payment_abandoned';
const STUCK = 'kitchen_order_log_online_abandon_stuck';
const CONFIRM = 'kitchen_payment_confirm';
const ord = (id, minAgo) => ({ id, created_at: ago(minAgo) });

// --- handler: metodo e secret --------------------------------------------------------------------------------

function makeRes() {
  const res = { statusCode: null, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}
async function callHandler(req, opts = {}) {
  const calls = installFakeFetch(opts);
  const res = makeRes();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` }, ...req }, res);
  return { res, calls };
}

test('handler: metodo diverso da GET/POST -> 405', async () => {
  const { res } = await callHandler({ method: 'PUT' });
  assert.equal(res.statusCode, 405);
});

test('handler: secret non configurato -> 500, nessuna chiamata', async () => {
  delete process.env.KITCHEN_ABANDON_SWEEP_SECRET;
  const { res, calls } = await callHandler({});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'server_configuration_error');
  assert.equal(calls.length, 0);
});

test('handler: senza Authorization -> 401 unauthorized, nessuna chiamata', async () => {
  const { res, calls } = await callHandler({ headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
  assert.equal(calls.length, 0);
});

test('handler: secret sbagliato (anche CRON_SECRET) -> 401, nessuna chiamata', async () => {
  process.env.CRON_SECRET = 'cron-secret';
  const { res, calls } = await callHandler({ headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test('handler: secret giusto -> 200 con riepilogo', async () => {
  const { res } = await callHandler({}, { orders: [] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.scanned, 0);
  assert.ok(res.body.startedAt && res.body.finishedAt);
});

test('handler: errore DB sulla lista ordini -> 500 internal_server_error', async () => {
  globalThis.fetch = async () => json(500, { message: 'db down' });
  const res = makeRes();
  await handler({ method: 'POST', headers: { authorization: `Bearer ${SECRET}` } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'internal_server_error');
});

// --- selezione ordini ----------------------------------------------------------------------------------------

test('query: solo POP piu vecchi di 5 minuti, piu recenti prima, max 20', async () => {
  const { calls } = await sweep({ orders: [] });
  const q = decodeURIComponent(calls[0].url);
  assert.match(q, /status=eq\.pending_online_payment/);
  assert.match(q, new RegExp(`created_at=lt\\.${ago(5).replace(/[.]/g, '\\.')}`));
  assert.match(q, /order=created_at\.desc/);
  assert.match(q, new RegExp(`limit=${MAX_ORDERS_PER_RUN}`));
});

test('nessun ordine scaduto -> nessuna chiamata SumUp e nessuna RPC', async () => {
  const { summary, calls } = await sweep({ orders: [] });
  assert.equal(summary.scanned, 0);
  assert.equal(sumupCalls(calls).length, 0);
  assert.equal(calls.filter((c) => c.url.includes('/rpc/')).length, 0);
});

// --- esiti -----------------------------------------------------------------------------------------------------

test('POP senza attempt -> abbandonato, nessuna chiamata SumUp', async () => {
  const { summary, calls } = await sweep({ orders: [ord('o1', 6)] });
  assert.deepEqual(summary.abandoned, ['o1']);
  assert.equal(sumupCalls(calls).length, 0);
  assert.deepEqual(JSON.parse(rpcCalls(calls, ABANDON)[0].body), { p_order_id: 'o1' });
});

test('checkout gia EXPIRED -> nessun DELETE, abbandonato', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'EXPIRED')] } },
  });
  assert.deepEqual(summary.abandoned, ['o1']);
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 0);
});

test('D4: checkout PENDING -> DELETE + rilettura CANCELLED -> abbandonato DOPO la disattivazione', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'PENDING'), co('co-1', 'att-1', 'CANCELLED')] }, del: { 'co-1': { status: 204 } } },
  });
  assert.deepEqual(summary.abandoned, ['o1']);
  const iDel = calls.findIndex((c) => c.method === 'DELETE');
  const iReread = calls.findIndex((c, i) => i > iDel && c.method === 'GET' && c.url === CO('co-1'));
  const iAbandon = calls.findIndex((c) => c.url.endsWith(`/rpc/${ABANDON}`));
  assert.ok(iDel >= 0 && iDel < iReread && iReread < iAbandon, 'ordine: DELETE -> rilettura -> abandon');
});

test('PAID alla prima lettura -> confirm, mai abandon', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'PAID')] } },
  });
  assert.deepEqual(summary.paid, ['o1']);
  assert.equal(rpcCalls(calls, CONFIRM).length, 1);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

test('pagamento completato tra DELETE e rilettura -> vince PAID', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'PENDING'), co('co-1', 'att-1', 'PAID')] }, del: { 'co-1': { status: 204 } } },
  });
  assert.deepEqual(summary.paid, ['o1']);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

test('PAID su un attempt dopo uno incerto -> vince PAID', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)],
    attemptsByOrder: { o1: [attempt(), attempt({ id: 'att-2', provider_ref: 'co-2' })] },
    sumup: { get: { 'co-1': [{ throw: true }], 'co-2': [co('co-2', 'att-2', 'PAID')] } },
  });
  assert.deepEqual(summary.paid, ['o1']);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

test('DELETE 5xx -> incerto, nessun abandon, nessun log prima dei 15 minuti', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'PENDING')] }, del: { 'co-1': { status: 502 } } },
  });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'sumup_delete_indeterminate' }]);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
  assert.equal(rpcCalls(calls, STUCK).length, 0);
});

test('SumUp irraggiungibile -> incerto, nessun abandon', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [{ throw: true }] } },
  });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'checkout_unverifiable' }]);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

test('incerto oltre 15 minuti -> log online_abandon_stuck con il motivo', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 16)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [{ throw: true }] } },
  });
  assert.deepEqual(summary.stuck_logged, ['o1']);
  assert.deepEqual(JSON.parse(rpcCalls(calls, STUCK)[0].body), { p_order_id: 'o1', p_reason: 'checkout_unverifiable' });
});

test('log stuck gia scritto (RPC false) -> non conteggiato di nuovo', async () => {
  const { summary } = await sweep({
    orders: [ord('o1', 16)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [{ throw: true }] } },
    rpc: { [STUCK]: { status: 200, body: false } },
  });
  assert.deepEqual(summary.stuck_logged, []);
  assert.equal(summary.uncertain.length, 1);
});

test('log stuck in errore -> lo sweep non si ferma', async () => {
  const { summary } = await sweep({
    orders: [ord('o1', 16), ord('o2', 7)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [{ throw: true }] } },
    rpc: { [STUCK]: { status: 500, body: { message: 'boom' } } },
  });
  assert.deepEqual(summary.abandoned, ['o2']);
});

// --- recupero riferimento (I-3) --------------------------------------------------------------------------------

test('attempt senza provider_ref, claim NULL, List vuota -> chiuso -> abbandonato', async () => {
  const { summary } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt({ provider_ref: null, checkout_claim_at: null })] },
    sumup: { list: { 'att-1': { body: [] } } },
  });
  assert.deepEqual(summary.abandoned, ['o1']);
});

test('attempt senza provider_ref con claim presente, List vuota -> incerto (fail-closed)', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt({ provider_ref: null })] },
    sumup: { list: { 'att-1': { body: [] } } },
  });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'provider_ref_not_found' }]);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

test('List ambigua -> incerto e log subito (riconciliazione manuale)', async () => {
  const { summary } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt({ provider_ref: null })] },
    sumup: { list: { 'att-1': { body: [{ id: 'a', checkout_reference: 'att-1' }, { id: 'b', checkout_reference: 'att-1' }] } } },
  });
  assert.deepEqual(summary.stuck_logged, ['o1']);
});

test('attempt non SumUp -> nessuna chiamata SumUp, la RPC lo chiude', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt({ provider: 'manual', provider_ref: null })] },
  });
  assert.deepEqual(summary.abandoned, ['o1']);
  assert.equal(sumupCalls(calls).length, 0);
});

// --- errori della RPC abandon ----------------------------------------------------------------------------------

const rpcErr = (message) => ({ status: 400, body: { message, code: 'P0001' } });

test('RPC: checkout_claim_in_progress -> incerto, riprova al giro dopo', async () => {
  const { summary } = await sweep({ orders: [ord('o1', 6)], rpc: { [ABANDON]: rpcErr('checkout_claim_in_progress') } });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'checkout_claim_in_progress' }]);
});

test('RPC: ordine passato al banco mentre lo sweep girava -> skipped', async () => {
  const { summary } = await sweep({ orders: [ord('o1', 6)], rpc: { [ABANDON]: rpcErr('order_not_pending_online_payment') } });
  assert.deepEqual(summary.skipped, [{ order_id: 'o1', reason: 'order_not_pending_online_payment' }]);
  assert.deepEqual(summary.abandoned, []);
});

test('RPC: online_payment_not_expired (orologio) -> skipped', async () => {
  const { summary } = await sweep({ orders: [ord('o1', 6)], rpc: { [ABANDON]: rpcErr('online_payment_not_expired') } });
  assert.deepEqual(summary.skipped, [{ order_id: 'o1', reason: 'online_payment_not_expired' }]);
});

test('RPC: charge riuscito sull ordine -> incerto e log subito, mai annullato', async () => {
  const { summary } = await sweep({ orders: [ord('o1', 6)], rpc: { [ABANDON]: rpcErr('order_has_succeeded_charge') } });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'order_has_succeeded_charge' }]);
  assert.deepEqual(summary.stuck_logged, ['o1']);
});

test('RPC: errore inatteso -> errors, gli altri ordini proseguono', async () => {
  const { summary } = await sweep({
    orders: [ord('o1', 6), ord('o2', 7)],
    rpc: { [ABANDON]: (b) => (b.p_order_id === 'o1' ? { status: 500, body: { message: 'boom' } } : { status: 200, body: { id: 'o2' } }) },
  });
  assert.deepEqual(summary.errors, ['o1']);
  assert.deepEqual(summary.abandoned, ['o2']);
});

test('lettura attempt in errore -> errors, nessun abandon su quell ordine', async () => {
  const { summary, calls } = await sweep({ orders: [ord('o1', 6)], attemptsByOrder: { o1: { error: 'db down' } } });
  assert.deepEqual(summary.errors, ['o1']);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

// --- soldi da riconciliare ------------------------------------------------------------------------------------

test('PAID ma lost_race -> incerto, log subito, mai abandon', async () => {
  const { summary, calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt()] },
    sumup: { get: { 'co-1': [co('co-1', 'att-1', 'PAID')] } },
    rpc: { [CONFIRM]: { status: 200, body: { id: 'other-charge', status: 'succeeded' } } },
  });
  assert.deepEqual(summary.uncertain, [{ order_id: 'o1', reason: 'paid_needs_reconciliation_lost_race' }]);
  assert.deepEqual(summary.stuck_logged, ['o1']);
  assert.equal(rpcCalls(calls, ABANDON).length, 0);
});

// --- limiti --------------------------------------------------------------------------------------------------

test('ogni chiamata SumUp ha un timeout (AbortSignal)', async () => {
  const { calls } = await sweep({
    orders: [ord('o1', 6)], attemptsByOrder: { o1: [attempt({ provider_ref: null, checkout_claim_at: null }), attempt({ id: 'att-2', provider_ref: 'co-2' })] },
    sumup: { list: { 'att-1': { body: [] } }, get: { 'co-2': [co('co-2', 'att-2', 'PENDING'), co('co-2', 'att-2', 'EXPIRED')] }, del: { 'co-2': { status: 204 } } },
  });
  const s = sumupCalls(calls);
  assert.ok(s.length >= 4);
  assert.ok(s.every((c) => c.signal instanceof AbortSignal));
});

test('budget di tempo esaurito -> ordini rimanenti rimandati al giro dopo', async () => {
  let t = NOW;
  const { summary } = await sweep(
    { orders: [ord('o1', 6), ord('o2', 7), ord('o3', 8)] },
    { now: () => { const v = t; t += RUN_BUDGET_MS / 2 + 1; return v; } },
  );
  assert.ok(summary.deferred >= 1);
  assert.equal(summary.abandoned.length + summary.deferred, 3);
});

test('sweep doppio: abandon gia fatto (RPC idempotente) -> abbandonato senza errori', async () => {
  const opts = { orders: [ord('o1', 6)] };
  const a = await sweep(opts);
  const b = await sweep(opts);
  assert.deepEqual(a.summary.abandoned, ['o1']);
  assert.deepEqual(b.summary.abandoned, ['o1']);
  assert.deepEqual(b.summary.errors, []);
});
