// S4 (T4) — api/_lib/sumupCheckout.js. Zero rete reale: fetchImpl fake che registra le chiamate.
//   node --test api/_lib/sumupCheckout.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deactivateAndVerify, getCheckoutVerified } from './sumupCheckout.js';

const URL_CO = 'https://api.sumup.com/v0.1/checkouts/co-1';
const base = { sumupApiKey: 'k', providerRef: 'co-1', attemptId: 'att-1', logTag: 'test' };
const quiet = () => { const orig = console.error; console.error = () => {}; return () => { console.error = orig; }; };

function fakeFetch({ get = [], del }) {
  const calls = [];
  const queue = [...get];
  const impl = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ url, method, init });
    if (url !== URL_CO) throw new Error(`unexpected ${method} ${url}`);
    if (method === 'DELETE') {
      if (del.throw) throw del.throw;
      return new Response(null, { status: del.status });
    }
    const r = queue.length > 1 ? queue.shift() : queue[0];
    if (r.throw) throw r.throw;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { impl, calls };
}
const co = (status, ref = 'att-1') => ({ body: { id: 'co-1', checkout_reference: ref, status } });

test('GET ok con reference giusta -> ok, con timeout (signal) sulla fetch', async () => {
  const f = fakeFetch({ get: [co('PENDING')] });
  const r = await getCheckoutVerified({ ...base, fetchImpl: f.impl });
  assert.equal(r.outcome, 'ok');
  assert.equal(r.data.status, 'PENDING');
  assert.ok(f.calls[0].init.signal instanceof AbortSignal);
});

test('GET con checkout_reference diversa -> unknown', async () => {
  const restore = quiet();
  const f = fakeFetch({ get: [co('PAID', 'altro')] });
  const r = await getCheckoutVerified({ ...base, fetchImpl: f.impl });
  restore();
  assert.equal(r.outcome, 'unknown');
});

test('GET non ok o timeout -> unknown (mai "non pagato")', async () => {
  const restore = quiet();
  const a = await getCheckoutVerified({ ...base, fetchImpl: fakeFetch({ get: [{ status: 500, body: {} }] }).impl });
  const timeoutErr = new DOMException('timeout', 'TimeoutError');
  const b = await getCheckoutVerified({ ...base, fetchImpl: fakeFetch({ get: [{ throw: timeoutErr }] }).impl });
  restore();
  assert.equal(a.outcome, 'unknown');
  assert.equal(b.outcome, 'unknown');
});

test('DELETE 5xx / rete / timeout -> indeterminate, nessun GET di verifica', async () => {
  const restore = quiet();
  for (const del of [{ status: 503 }, { throw: new Error('down') }, { throw: new DOMException('t', 'TimeoutError') }]) {
    const f = fakeFetch({ get: [co('PENDING')], del });
    const r = await deactivateAndVerify({ ...base, fetchImpl: f.impl });
    assert.equal(r.kind, 'indeterminate');
    assert.equal(f.calls.filter((c) => c.method === 'GET').length, 0);
  }
  restore();
});

test('DELETE con timeout (signal) + verifica: CANCELLED/EXPIRED/FAILED -> closed, PAID -> paid, PENDING -> unverified', async () => {
  const restore = quiet();
  const cases = [['CANCELLED', 'closed'], ['EXPIRED', 'closed'], ['FAILED', 'closed'], ['PAID', 'paid'], ['PENDING', 'unverified']];
  for (const [status, kind] of cases) {
    const f = fakeFetch({ get: [co(status)], del: { status: 204 } });
    const r = await deactivateAndVerify({ ...base, fetchImpl: f.impl });
    assert.equal(r.kind, kind, status);
    assert.ok(f.calls[0].init.signal instanceof AbortSignal);
    if (kind === 'paid') assert.equal(r.data.status, 'PAID');
  }
  restore();
});

test('DELETE 404 ma verifica non leggibile -> unknown', async () => {
  const restore = quiet();
  const f = fakeFetch({ get: [{ status: 502, body: {} }], del: { status: 404 } });
  const r = await deactivateAndVerify({ ...base, fetchImpl: f.impl });
  restore();
  assert.equal(r.kind, 'unknown');
});
