// Test mirati S0.5 F3 — api/kitchen-cancel-with-payment-check.js.
// Un checkout SumUp FAILED NON e' terminale: il cliente puo' riprovare con un'altra carta sulla
// stessa pagina hosted. Quindi l'annullo deve: GET -> DELETE -> GET di verifica, e annullare
// l'ordine SOLO se SumUp conferma EXPIRED/CANCELLED. Ogni incertezza blocca (nessuna RPC di annullo).
// L'attempt 'failed'/sumup_failed deve inoltre essere trovato dal lookup (prima veniva ignorato).
//
// Zero rete reale: globalThis.fetch e' sostituito da un router fake (Supabase REST/auth + SumUp) che
// LANCIA su qualunque URL non previsto. Eseguire a mano con:
//   node --test api/kitchen-cancel-with-payment-check.test.js
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import handler from './kitchen-cancel-with-payment-check.js';

const SB = 'http://supabase.test';
const SUMUP_CHECKOUT = 'https://api.sumup.com/v0.1/checkouts/co-1';
const ATTEMPT_ID = 'att-1';
const SUMUP_LIST = `https://api.sumup.com/v0.1/checkouts?checkout_reference=${ATTEMPT_ID}`;

const origFetch = globalThis.fetch;
const origConsoleError = console.error;
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = SB;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-fake';
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

// sumup.get: array di risposte consumate in ordine (l'ultima si ripete). Ogni voce: { status, body }
// o { throw: true }. sumup.del: { status } oppure { throw: true }. sumup.list (opzionale): risposta
// della List per checkout_reference, { status, body } o { throw: true }.
function installFakeFetch({ attempt, sumup }) {
  const calls = [];
  const getQueue = [...sumup.get];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    const rawBody = init.body ?? null;
    calls.push({ method, url, body: rawBody, headers: init.headers });

    if (url.startsWith('https://api.sumup.com')) {
      if (url === SUMUP_CHECKOUT && method === 'GET') {
        const r = getQueue.length > 1 ? getQueue.shift() : getQueue[0];
        if (r.throw) throw new Error('network down');
        return json(r.status ?? 200, r.body);
      }
      if (url === SUMUP_CHECKOUT && method === 'DELETE') {
        if (sumup.del.throw) throw new Error('network down');
        return json(sumup.del.status, {});
      }
      if (url === SUMUP_LIST && method === 'GET' && sumup.list) {
        if (sumup.list.throw) throw new Error('network down');
        return json(sumup.list.status ?? 200, sumup.list.body);
      }
      throw new Error(`unexpected SumUp call ${method} ${url}`);
    }

    if (url.startsWith(SB)) {
      const path = url.slice(SB.length);
      if (path.startsWith('/auth/v1/user')) {
        return json(200, { id: 'user-1', aud: 'authenticated', email: 'staff@test' });
      }
      if (path.startsWith('/rest/v1/kitchen_orders')) {
        return json(200, { id: 'ord-1', venue_id: 'venue-1', payment_status: 'pending', status: 'new' });
      }
      if (path.startsWith('/rest/v1/kitchen_payments')) {
        const accept = new Headers(init.headers).get('accept') || '';
        return json(200, accept.includes('pgrst.object') ? attempt : [attempt]);
      }
      if (path === '/rest/v1/rpc/is_staff_for_venue') return json(200, true);
      if (path === '/rest/v1/rpc/kitchen_payment_attempt_set_provider_ref') return json(200, null);
      if (path === '/rest/v1/rpc/kitchen_order_cancel_with_payment_attempt') {
        return json(200, { id: 'ord-1', status: 'cancelled', cancel_reason: null, cancelled_at: '2026-10-09T00:00:00Z' });
      }
      if (path === '/rest/v1/rpc/kitchen_payment_confirm') return json(200, { id: ATTEMPT_ID });
      if (path === '/rest/v1/rpc/kitchen_payment_fail') return json(200, null);
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

async function run(opts) {
  const calls = installFakeFetch(opts);
  const res = makeRes();
  await handler(
    { method: 'POST', body: { order_id: 'ord-1' }, headers: { authorization: 'Bearer staff-tok' } },
    res,
  );
  return { res, calls };
}

const baseAttempt = {
  id: ATTEMPT_ID, venue_id: 'venue-1', amount: 10, provider: 'sumup',
  status: 'failed', failure_reason: 'sumup_failed', provider_ref: 'co-1',
};
const co = (status) => ({ status: 200, body: { id: 'co-1', checkout_reference: ATTEMPT_ID, amount: 10, status } });
const sumupCalls = (calls, method) => calls.filter((c) => c.url === SUMUP_CHECKOUT && c.method === method);
const rpcCalls = (calls, name) => calls.filter((c) => c.url === `${SB}/rest/v1/rpc/${name}`);

test('a) GET=FAILED -> DELETE, verify GET=EXPIRED -> annullo RPC chiamata', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('EXPIRED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(sumupCalls(calls, 'GET').length, 2);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'cancelled');
});

test('a2) GET=PENDING -> DELETE, verify GET=CANCELLED -> annullo RPC chiamata', async () => {
  const { res, calls } = await run({
    attempt: { ...baseAttempt, status: 'pending', failure_reason: null },
    sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 200 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.body.outcome, 'cancelled');
});

test('b) GET=FAILED -> DELETE 5xx -> 502 sumup_delete_indeterminate, nessuna RPC di annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED')], del: { status: 503 } },
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'sumup_delete_indeterminate');
  assert.equal(sumupCalls(calls, 'GET').length, 1, 'nessun GET di verifica dopo un 5xx');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('b2) GET=FAILED -> DELETE errore di rete -> 502, nessuna RPC di annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED')], del: { throw: true } },
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'sumup_delete_indeterminate');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

for (const stillOpen of ['PENDING', 'FAILED']) {
  test(`c) DELETE 2xx ma verify GET ancora ${stillOpen} -> bloccato (unknown), nessuna RPC di annullo`, async () => {
    const { res, calls } = await run({
      attempt: baseAttempt,
      sumup: { get: [co('FAILED'), co(stillOpen)], del: { status: 204 } },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.outcome, 'unknown');
    assert.equal(res.body.reason, 'checkout_close_unverified');
    assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
  });
}

test('c2) DELETE 404 ma verify GET ancora FAILED -> bloccato (404 non e\' prova di chiusura)', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('FAILED')], del: { status: 404 } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('c3) DELETE 4xx rifiutato + verify GET ancora PENDING -> bloccato (non procede piu\')', async () => {
  const { res, calls } = await run({
    attempt: { ...baseAttempt, status: 'pending', failure_reason: null },
    sumup: { get: [co('PENDING'), co('PENDING')], del: { status: 400 } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('d) DELETE 4xx + verify GET=PAID -> resolve paid (409), nessun annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('PAID')], del: { status: 400 } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'cannot_cancel_already_paid');
  assert.equal(rpcCalls(calls, 'kitchen_payment_confirm').length, 1, 'resolver condiviso invocato');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('e) GET=EXPIRED -> nessun DELETE, procede all annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('EXPIRED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.body.outcome, 'cancelled');
});

test('e2) GET=CANCELLED -> nessun DELETE, procede all annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('CANCELLED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.body.outcome, 'cancelled');
});

test('f) verify GET non affidabile (SumUp 500) dopo DELETE -> bloccato, nessuna RPC di annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), { status: 500, body: { error: 'boom' } }], del: { status: 204 } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('f2) GET iniziale non affidabile (SumUp 500) -> bloccato, nessun DELETE, nessuna RPC', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [{ status: 500, body: { error: 'boom' } }], del: { status: 204 } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('g) lookup attempt: filtro include failed/sumup_failed e l\'attempt trovato porta a GET+DELETE', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('CANCELLED')], del: { status: 204 } },
  });
  const lookup = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/kitchen_payments`));
  const q = decodeURIComponent(lookup.url);
  assert.match(q, /status=in\.\(initiated,pending,failed\)/);
  assert.ok(q.includes('or=(status.neq.failed,and(provider.eq.sumup,failure_reason.eq.sumup_failed))'), q);
  assert.equal(sumupCalls(calls, 'GET').length, 2);
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.body.outcome, 'cancelled');
});

test('i) GET iniziale=PAID -> resolve paid e STOP, nessun DELETE, nessun annullo', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('PAID')], del: { status: 204 } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

// I-3 (incidente SumUp 401, 2026-10-12): sblocco dell'attempt "unknown" mai arrivato a SumUp.
// Procede solo con tre prove: provider_ref NULL + checkout_claim_at NULL (nessuna POST mai partita:
// create-checkout fa la POST solo dopo aver vinto la claim) + List SumUp not_found. Tutto il resto
// resta fail-closed.
const neverSentAttempt = {
  ...baseAttempt, status: 'initiated', failure_reason: null, provider_ref: null, checkout_claim_at: null,
};
const listCalls = (calls) => calls.filter((c) => c.url === SUMUP_LIST);

test('I-3 a) ref NULL + claim NULL + List not_found -> procede alla RPC, nessun GET/DELETE/bind', async () => {
  const { res, calls } = await run({
    attempt: neverSentAttempt,
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [] } },
  });
  assert.equal(listCalls(calls).length, 1);
  assert.equal(sumupCalls(calls, 'GET').length, 0);
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_set_provider_ref').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'cancelled');
});

test('I-3 a2) la lookup dell attempt legge checkout_claim_at', async () => {
  const { calls } = await run({
    attempt: neverSentAttempt,
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [] } },
  });
  const lookup = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/kitchen_payments`));
  assert.match(decodeURIComponent(lookup.url), /select=[^&]*checkout_claim_at/);
});

test('I-3 b) ref NULL + claim presente + List not_found -> unknown, nessuna RPC', async () => {
  const { res, calls } = await run({
    attempt: { ...neverSentAttempt, checkout_claim_at: '2026-10-11T23:28:38Z' },
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [] } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(res.body.needs_manual_reconciliation, false);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('I-3 c) ref NULL + claim assente dalla riga (undefined) + List not_found -> unknown (fail-closed)', async () => {
  const withoutClaim = { ...neverSentAttempt };
  delete withoutClaim.checkout_claim_at;
  const { res, calls } = await run({
    attempt: withoutClaim,
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [] } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

for (const [label, list] of [
  ['List 5xx', { status: 503, body: { error: 'boom' } }],
  ['List 401 SumUp', { status: 401, body: { error: 'unauthorized' } }],
  ['List errore di rete', { throw: true }],
]) {
  test(`I-3 d) ref NULL + claim NULL + ${label} -> unknown, nessuna RPC`, async () => {
    const { res, calls } = await run({
      attempt: neverSentAttempt,
      sumup: { get: [co('PENDING')], del: { status: 204 }, list },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.outcome, 'unknown');
    assert.equal(res.body.needs_manual_reconciliation, false);
    assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
  });
}

test('I-3 e) ref NULL + claim NULL + List ambigua -> unknown + needs_manual_reconciliation, nessuna RPC', async () => {
  const dup = { id: 'co-x', checkout_reference: ATTEMPT_ID, status: 'PENDING' };
  const { res, calls } = await run({
    attempt: neverSentAttempt,
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [dup, { ...dup, id: 'co-y' }] } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(res.body.needs_manual_reconciliation, true);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 0);
});

test('I-3 f) ref NULL + claim NULL + List trova 1 checkout -> ramo esistente: bind, GET, DELETE+verifica', async () => {
  const { res, calls } = await run({
    attempt: neverSentAttempt,
    sumup: {
      get: [co('PENDING'), co('CANCELLED')], del: { status: 204 },
      list: { status: 200, body: [{ id: 'co-1', checkout_reference: ATTEMPT_ID, status: 'PENDING' }] },
    },
  });
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_set_provider_ref').length, 1);
  assert.equal(sumupCalls(calls, 'GET').length, 2);
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, 'kitchen_order_cancel_with_payment_attempt').length, 1);
  assert.equal(res.body.outcome, 'cancelled');
});
