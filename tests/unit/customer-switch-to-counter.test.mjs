// S4 — api/kitchen-customer-switch-to-counter.js ("Paga al banco" del cliente su un ordine POP).
// Test fuori da api/ di proposito: ogni file .js in api/ conta come funzione Vercel (T6).
// Zero rete reale: globalThis.fetch sostituito da un router fake (Supabase REST/auth + SumUp) che LANCIA su
// qualunque URL non previsto.   node --test tests/unit/customer-switch-to-counter.test.mjs
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import handler from '../../api/kitchen-customer-switch-to-counter.js';

const SB = 'http://supabase.test';
const ATTEMPT_ID = 'att-1';
const CO_URL = 'https://api.sumup.com/v0.1/checkouts/co-1';
const LIST_URL = `https://api.sumup.com/v0.1/checkouts?checkout_reference=${ATTEMPT_ID}`;
const CUSTOMER = 'cust-1';

const origFetch = globalThis.fetch;
const origConsoleError = console.error;
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = SB;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-fake';
  process.env.SUMUP_API_KEY = 'sumup-fake';
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

const popOrder = {
  id: 'ord-1', customer_id: CUSTOMER, status: 'pending_online_payment', payment_status: null,
  online_payment_disabled: false,
};
const liveAttempt = {
  id: ATTEMPT_ID, order_id: 'ord-1', amount: 10, provider: 'sumup', status: 'initiated',
  failure_reason: null, provider_ref: 'co-1', checkout_claim_at: '2026-10-12T10:00:00Z',
};
const co = (status) => ({ status: 200, body: { id: 'co-1', checkout_reference: ATTEMPT_ID, amount: 10, status } });

// sumup.get: risposte consumate in ordine (l'ultima si ripete). sumup.del / sumup.list opzionali.
// rpc: override per nome RPC -> { status, body }.
function installFakeFetch({ order = popOrder, attempts = [liveAttempt], sumup = {}, rpc = {}, user = { id: CUSTOMER } }) {
  const calls = [];
  const getQueue = [...(sumup.get || [])];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    calls.push({ method, url, body: init.body ?? null, signal: init.signal });

    if (url.startsWith('https://api.sumup.com')) {
      if (url === CO_URL && method === 'GET') {
        const r = getQueue.length > 1 ? getQueue.shift() : getQueue[0];
        if (!r || r.throw) throw new Error('network down');
        return json(r.status ?? 200, r.body);
      }
      if (url === CO_URL && method === 'DELETE') {
        if (sumup.del?.throw) throw new Error('network down');
        return json(sumup.del.status, {});
      }
      const att2List = 'https://api.sumup.com/v0.1/checkouts?checkout_reference=att-2';
      if (url === att2List && method === 'GET' && sumup.list2) return json(200, sumup.list2.body);
      if (url === LIST_URL && method === 'GET' && sumup.list) {
        if (sumup.list.throw) throw new Error('network down');
        return json(sumup.list.status ?? 200, sumup.list.body);
      }
      throw new Error(`unexpected SumUp call ${method} ${url}`);
    }

    if (url.startsWith(SB)) {
      const path = url.slice(SB.length);
      if (path.startsWith('/auth/v1/user')) {
        return user ? json(200, { ...user, aud: 'authenticated' }) : json(401, { message: 'invalid JWT' });
      }
      if (path.startsWith('/rest/v1/kitchen_orders')) return json(200, order);
      if (path.startsWith('/rest/v1/kitchen_payments')) return json(200, attempts);
      const name = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : null;
      if (name && rpc[name]) return json(rpc[name].status, rpc[name].body);
      if (name === 'kitchen_payment_attempt_set_provider_ref') return json(200, null);
      if (name === 'kitchen_payment_confirm') return json(200, { id: ATTEMPT_ID, status: 'succeeded' });
      if (name === 'kitchen_payment_fail') return json(200, null);
      if (name === 'kitchen_order_switch_to_counter_system') {
        return json(200, { ...popOrder, status: 'pending_counter_payment', payment_status: 'pending_counter_payment', online_payment_disabled: true });
      }
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return calls;
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
  };
  return res;
}

async function run(opts = {}, req = {}) {
  const calls = installFakeFetch(opts);
  const res = makeRes();
  await handler({
    method: 'POST',
    body: { order_id: 'ord-1' },
    headers: { authorization: 'Bearer cust-tok' },
    ...req,
  }, res);
  return { res, calls };
}

const sumupCalls = (calls, method) => calls.filter((c) => c.url === CO_URL && c.method === method);
const rpcCalls = (calls, name) => calls.filter((c) => c.url === `${SB}/rest/v1/rpc/${name}`);
const SWITCH = 'kitchen_order_switch_to_counter_system';
const rpcBody = (calls, name) => JSON.parse(rpcCalls(calls, name)[0].body);

// --- auth e input --------------------------------------------------------------------------------------------

test('metodo diverso da POST -> 405', async () => {
  const { res } = await run({}, { method: 'GET' });
  assert.equal(res.statusCode, 405);
});

test('order_id mancante -> 400', async () => {
  const { res } = await run({}, { body: {} });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'missing_order_id');
});

test('senza token -> 401 missing_session, nessuna chiamata', async () => {
  const { res, calls } = await run({}, { headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'missing_session');
  assert.equal(calls.length, 0);
});

test('token non valido -> 401 invalid_session, nessuna lettura ordine ne SumUp', async () => {
  const { res, calls } = await run({ user: null });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'invalid_session');
  assert.equal(calls.some((c) => c.url.includes('kitchen_orders') || c.url.includes('sumup')), false);
});

test('env mancanti -> 500 server_configuration_error', async () => {
  delete process.env.SUMUP_API_KEY;
  const { res } = await run();
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'server_configuration_error');
});

test('cliente non proprietario -> 403 not_order_owner, nessuna chiamata SumUp ne RPC', async () => {
  const { res, calls } = await run({ order: { ...popOrder, customer_id: 'altro' }, sumup: { get: [co('PENDING')] } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'not_order_owner');
  assert.equal(calls.some((c) => c.url.includes('sumup.com')), false);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ordine inesistente -> 404', async () => {
  const { res } = await run({ order: null });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'order_not_found');
});

// --- stato dell'ordine ---------------------------------------------------------------------------------------

test('ordine gia passato al banco (PCP + online disattivato) -> 200 idempotente, nessuna chiamata', async () => {
  const { res, calls } = await run({
    order: { ...popOrder, status: 'pending_counter_payment', payment_status: 'pending_counter_payment', online_payment_disabled: true },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'switched_to_counter');
  assert.equal(calls.some((c) => c.url.includes('sumup.com')), false);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ordine PA -> 409 order_payment_abandoned', async () => {
  const { res, calls } = await run({ order: { ...popOrder, status: 'payment_abandoned' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_payment_abandoned');
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ordine gia pagato -> 409 order_already_paid', async () => {
  const { res } = await run({ order: { ...popOrder, status: 'received', payment_status: 'paid' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_already_paid');
});

test('ordine annullato -> 409 order_cancelled', async () => {
  const { res } = await run({ order: { ...popOrder, status: 'cancelled' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_cancelled');
});

test('ordine PCP legacy (online non disattivato) -> 409 order_not_pending_online_payment', async () => {
  const { res, calls } = await run({ order: { ...popOrder, status: 'pending_counter_payment', payment_status: 'pending_counter_payment' } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_not_pending_online_payment');
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

// --- matrice SumUp (come F2) ---------------------------------------------------------------------------------

test('nessun attempt vivo -> RPC switch con il cliente come attore -> 200', async () => {
  const { res, calls } = await run({ attempts: [] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'switched_to_counter');
  assert.deepEqual(rpcBody(calls, SWITCH), { p_order_id: 'ord-1', p_actor_customer_id: CUSTOMER });
  assert.equal(calls.some((c) => c.url.includes('sumup.com')), false);
});

test('GET=PENDING -> DELETE (con timeout) -> verifica CANCELLED -> switch', async () => {
  const { res, calls } = await run({ sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 204 } } });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.ok(sumupCalls(calls, 'DELETE')[0].signal instanceof AbortSignal);
  assert.ok(sumupCalls(calls, 'GET').every((c) => c.signal instanceof AbortSignal));
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'switched_to_counter');
});

test('attempt failed/sumup_failed: GET=FAILED -> DELETE -> verifica EXPIRED -> switch', async () => {
  const { res, calls } = await run({
    attempts: [{ ...liveAttempt, status: 'failed', failure_reason: 'sumup_failed' }],
    sumup: { get: [co('FAILED'), co('EXPIRED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
});

test('GET=EXPIRED gia chiuso -> nessun DELETE -> switch', async () => {
  const { res, calls } = await run({ sumup: { get: [co('EXPIRED')] } });
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
});

test('GET=PAID -> confirm (POP -> received), 409 order_already_paid, nessuno switch', async () => {
  const { res, calls } = await run({ sumup: { get: [co('PAID')] } });
  assert.equal(rpcCalls(calls, 'kitchen_payment_confirm').length, 1);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_already_paid');
  assert.equal(res.body.outcome, 'confirmed');
});

test('PAID scoperto durante lo switch (DELETE, verifica PAID) -> confirm, 409 order_already_paid, nessuno switch', async () => {
  const { res, calls } = await run({ sumup: { get: [co('PENDING'), co('PAID')], del: { status: 204 } } });
  assert.equal(rpcCalls(calls, 'kitchen_payment_confirm').length, 1);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'order_already_paid');
});

test('PAID ma confirm in errore -> 500, nessuno switch', async () => {
  const { res, calls } = await run({
    sumup: { get: [co('PAID')] },
    rpc: { kitchen_payment_confirm: { status: 400, body: { message: 'boom' } } },
  });
  assert.equal(res.statusCode, 500);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

for (const [label, sumup] of [
  ['SumUp giu sul GET', { get: [{ throw: true }] }],
  ['GET non ok', { get: [{ status: 500, body: {} }] }],
  ['DELETE 5xx', { get: [co('PENDING')], del: { status: 503 } }],
  ['DELETE errore di rete', { get: [co('PENDING')], del: { throw: true } }],
  ['verifica dopo DELETE ancora PENDING', { get: [co('PENDING'), co('PENDING')], del: { status: 204 } }],
  ['verifica dopo DELETE non leggibile', { get: [co('PENDING'), { status: 502, body: {} }], del: { status: 404 } }],
]) {
  test(`incerto (${label}) -> 409 switch_to_counter_uncertain retryable, nessuno switch`, async () => {
    const { res, calls } = await run({ sumup });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'switch_to_counter_uncertain');
    assert.equal(res.body.retryable, true);
    assert.equal(rpcCalls(calls, SWITCH).length, 0);
    assert.equal(rpcCalls(calls, 'kitchen_payment_confirm').length, 0);
  });
}

// --- provider_ref mancante (logica I-3) ---------------------------------------------------------------------

test('ref NULL + claim NULL + List not_found -> nessun checkout possibile -> switch', async () => {
  const { res, calls } = await run({
    attempts: [{ ...liveAttempt, provider_ref: null, checkout_claim_at: null }],
    sumup: { list: { body: [] } },
  });
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
});

test('ref NULL + claim presente + List not_found -> incerto (I-3 invariata), nessuno switch', async () => {
  const { res, calls } = await run({
    attempts: [{ ...liveAttempt, provider_ref: null }],
    sumup: { list: { body: [] } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'switch_to_counter_uncertain');
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ref NULL + claim NULL + List in errore -> incerto, nessuno switch', async () => {
  const { res, calls } = await run({
    attempts: [{ ...liveAttempt, provider_ref: null, checkout_claim_at: null }],
    sumup: { list: { throw: true } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ref NULL + List ambigua -> incerto con needs_manual_reconciliation', async () => {
  const two = [{ id: 'co-1', checkout_reference: ATTEMPT_ID }, { id: 'co-2', checkout_reference: ATTEMPT_ID }];
  const { res, calls } = await run({ attempts: [{ ...liveAttempt, provider_ref: null }], sumup: { list: { body: two } } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.needs_manual_reconciliation, true);
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('ref NULL + List trova il checkout -> lega provider_ref, DELETE+verifica, switch', async () => {
  const { res, calls } = await run({
    attempts: [{ ...liveAttempt, provider_ref: null }],
    sumup: { list: { body: [{ id: 'co-1', checkout_reference: ATTEMPT_ID }] }, get: [co('PENDING'), co('CANCELLED')], del: { status: 204 } },
  });
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_set_provider_ref').length, 1);
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
  const listCall = calls.find((c) => c.url === LIST_URL);
  assert.ok(listCall.signal instanceof AbortSignal, 'timeout anche sulla List');
});

test('attempt non sumup -> nessuna verifica remota, switch', async () => {
  const { res, calls } = await run({ attempts: [{ ...liveAttempt, provider: 'counter', provider_ref: null }] });
  assert.equal(calls.some((c) => c.url.includes('sumup.com')), false);
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
});

test('due attempt vivi -> ognuno verificato prima dello switch; il secondo non verificabile blocca tutto', async () => {
  const second = { ...liveAttempt, id: 'att-2', provider_ref: null, checkout_claim_at: '2026-10-12T10:00:00Z' };
  const { res, calls } = await run({
    attempts: [liveAttempt, second],
    sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 204 }, list2: { body: [] } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1, 'il primo e\' stato disattivato');
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'switch_to_counter_uncertain');
  assert.equal(rpcCalls(calls, SWITCH).length, 0);
});

test('due attempt vivi entrambi chiudibili -> switch una sola volta', async () => {
  const second = { ...liveAttempt, id: 'att-2', provider_ref: null, checkout_claim_at: null };
  const { res, calls } = await run({
    attempts: [liveAttempt, second],
    sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 204 }, list2: { body: [] } },
  });
  assert.equal(rpcCalls(calls, SWITCH).length, 1);
  assert.equal(res.statusCode, 200);
});

// --- errori della RPC switch ---------------------------------------------------------------------------------

for (const [msg, status, error] of [
  ['checkout_claim_in_progress', 409, 'switch_to_counter_uncertain'],
  ['order_has_succeeded_charge', 409, 'order_already_paid'],
  ['order_not_pending_online_payment', 409, 'order_not_pending_online_payment'],
  ['not_order_owner', 403, 'not_order_owner'],
  ['order_not_found', 404, 'order_not_found'],
]) {
  test(`RPC switch rifiuta ${msg} -> ${status} ${error}`, async () => {
    const { res } = await run({
      attempts: [],
      rpc: { [SWITCH]: { status: 400, body: { code: 'P0001', message: msg } } },
    });
    assert.equal(res.statusCode, status);
    assert.equal(res.body.error, error);
  });
}

test('RPC switch errore inatteso -> 500', async () => {
  const { res } = await run({ attempts: [], rpc: { [SWITCH]: { status: 500, body: { message: 'boom' } } } });
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'internal_server_error');
});

test('doppio tap: seconda chiamata su ordine gia PCP -> 200 senza rifare SumUp ne RPC', async () => {
  const first = await run({ sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 204 } } });
  assert.equal(first.res.statusCode, 200);
  const second = await run({
    order: { ...popOrder, status: 'pending_counter_payment', payment_status: 'pending_counter_payment', online_payment_disabled: true },
  });
  assert.equal(second.res.statusCode, 200);
  assert.equal(second.calls.some((c) => c.url.includes('sumup.com')), false);
  assert.equal(rpcCalls(second.calls, SWITCH).length, 0);
});
