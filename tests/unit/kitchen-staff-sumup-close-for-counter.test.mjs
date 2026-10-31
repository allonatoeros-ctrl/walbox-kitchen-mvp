// Test mirati S0.5 F2 — api/kitchen-staff-sumup-close-for-counter.js.
// Un checkout SumUp FAILED NON e' terminale: il cliente puo' riprovare con un'altra carta sulla
// stessa pagina hosted. Quindi "Passa al banco" deve: GET -> DELETE -> GET di verifica, e chiudere
// l'attempt SOLO se SumUp conferma EXPIRED/CANCELLED. Ogni incertezza blocca (nessuna RPC di chiusura).
//
// Zero rete reale: globalThis.fetch e' sostituito da un router fake (Supabase REST/auth + SumUp) che
// LANCIA su qualunque URL non previsto. Eseguire a mano con:
//   node --test api/kitchen-staff-sumup-close-for-counter.test.js
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import handler from '../../api/kitchen-staff-sumup-close-for-counter.js';

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
      if (path === '/rest/v1/rpc/kitchen_payment_attempt_close_unpaid') {
        return json(200, { id: ATTEMPT_ID, status: 'failed', failure_reason: 'staff_closed_for_counter' });
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

test('a) GET=FAILED -> DELETE, verify GET=EXPIRED -> chiusura RPC chiamata', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('EXPIRED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(sumupCalls(calls, 'GET').length, 2);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'closed_for_counter');
});

test('a2) GET=PENDING -> DELETE, verify GET=CANCELLED -> chiusura RPC chiamata', async () => {
  const { res, calls } = await run({
    attempt: { ...baseAttempt, status: 'pending', failure_reason: null },
    sumup: { get: [co('PENDING'), co('CANCELLED')], del: { status: 200 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 1);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.body.outcome, 'closed_for_counter');
});

test('b) GET=FAILED -> DELETE 5xx -> 502 sumup_delete_indeterminate, nessuna RPC di chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED')], del: { status: 503 } },
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'sumup_delete_indeterminate');
  assert.equal(sumupCalls(calls, 'GET').length, 1, 'nessun GET di verifica dopo un 5xx');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('b2) GET=FAILED -> DELETE errore di rete -> 502, nessuna RPC di chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED')], del: { throw: true } },
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'sumup_delete_indeterminate');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('c) DELETE 2xx ma verify GET ancora PENDING -> bloccato (unknown), nessuna RPC di chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('PENDING')], del: { status: 204 } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(res.body.reason, 'checkout_close_unverified');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

// Incidente A23 (31/10): SumUp non disattiva un checkout FAILED, il GET dopo il DELETE resta FAILED. Non e' PAID:
// trattato come chiuso, altrimenti l'attempt resta bloccato per sempre.
for (const delStatus of [204, 404, 409]) {
  test(`c2) GET=FAILED -> DELETE ${delStatus} -> verify GET ancora FAILED -> trattato come chiuso, RPC di chiusura chiamata`, async () => {
    const { res, calls } = await run({
      attempt: baseAttempt,
      sumup: { get: [co('FAILED'), co('FAILED')], del: { status: delStatus } },
    });
    assert.equal(sumupCalls(calls, 'DELETE').length, 1);
    assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
    assert.notEqual(res.body.outcome, 'unknown');
  });
}

test('c3) DELETE 4xx rifiutato + verify GET ancora PENDING -> bloccato (non procede piu\')', async () => {
  const { res, calls } = await run({
    attempt: { ...baseAttempt, status: 'pending', failure_reason: null },
    sumup: { get: [co('PENDING'), co('PENDING')], del: { status: 400 } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('d) DELETE 4xx + verify GET=PAID -> resolve paid (409), nessuna chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), co('PAID')], del: { status: 400 } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'cannot_close_already_paid');
  assert.equal(rpcCalls(calls, 'kitchen_payment_confirm').length, 1, 'resolver condiviso invocato');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('e) GET=EXPIRED -> nessun DELETE, procede alla chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('EXPIRED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.body.outcome, 'closed_for_counter');
});

test('e2) GET=CANCELLED -> nessun DELETE, procede alla chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('CANCELLED')], del: { status: 204 } },
  });
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.body.outcome, 'closed_for_counter');
});

test('f) verify GET non affidabile (SumUp 500) dopo DELETE -> bloccato, nessuna RPC di chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('FAILED'), { status: 500, body: { error: 'boom' } }], del: { status: 204 } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('f2) GET iniziale non affidabile (SumUp 500) -> bloccato, nessun DELETE, nessuna RPC', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [{ status: 500, body: { error: 'boom' } }], del: { status: 204 } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('g) GET iniziale=PAID -> resolve paid e STOP, nessun DELETE, nessuna chiusura', async () => {
  const { res, calls } = await run({
    attempt: baseAttempt,
    sumup: { get: [co('PAID')], del: { status: 204 } },
  });
  assert.equal(res.statusCode, 409);
  assert.equal(sumupCalls(calls, 'DELETE').length, 0);
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
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
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, 'closed_for_counter');
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
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
});

test('I-3 c) ref NULL + claim assente dalla riga (undefined) + List not_found -> unknown (fail-closed)', async () => {
  const withoutClaim = { ...neverSentAttempt };
  delete withoutClaim.checkout_claim_at;
  const { res, calls } = await run({
    attempt: withoutClaim,
    sumup: { get: [co('PENDING')], del: { status: 204 }, list: { status: 200, body: [] } },
  });
  assert.equal(res.body.outcome, 'unknown');
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
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
    assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
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
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 0);
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
  assert.equal(rpcCalls(calls, 'kitchen_payment_attempt_close_unpaid').length, 1);
  assert.equal(res.body.outcome, 'closed_for_counter');
});
