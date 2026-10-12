// Test del runner smoke con fetch finto (nessuna rete). node --test tests/unit/post-deploy-smoke.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runSmoke } from '../../scripts/post-deploy-smoke.mjs';

const HTML = '<script type="module" src="/assets/index-AAA111.js"></script>';
const GOOD_JS = 'fetch(`/api/kitchen-sumup-create-checkout`,{headers:{Authorization:`Bearer ${t}`}})';
const OLD_JS = 'fetch(`/api/kitchen-sumup-create-checkout`,{headers:{"Content-Type":"json"}})';

function makeFetch({ js = GOOD_JS, apiOverride = {}, pageStatus = 200 } = {}) {
  return async (url, opts = {}) => {
    const path = new URL(url).pathname;
    if (path.startsWith('/api/')) {
      const hasToken = !!opts.headers?.Authorization;
      const o = apiOverride[`${path}|${hasToken ? 'tok' : 'no'}`];
      const [status, error] = o ?? (hasToken ? [401, 'invalid_session'] : [401, 'missing_session']);
      return { status, ok: status < 400, json: async () => ({ error }) };
    }
    if (path === '/assets/index-AAA111.js') return { status: 200, ok: true, text: async () => js };
    return { status: pageStatus, ok: pageStatus === 200, text: async () => HTML };
  };
}

test('tutto ok -> PASS', async () => {
  const r = await runSmoke('https://x.test', makeFetch());
  assert.equal(r.ok, true);
});

test('bundle vecchio senza Authorization -> FAIL', async () => {
  const r = await runSmoke('https://x.test', makeFetch({ js: OLD_JS }));
  assert.equal(r.ok, false);
  assert.ok(r.results.some((x) => !x.pass && /Authorization/.test(x.name)));
});

test('500 server_configuration_error col token finto -> FAIL', async () => {
  const r = await runSmoke('https://x.test', makeFetch({ apiOverride: { '/api/kitchen-sumup-create-checkout|tok': [500, 'server_configuration_error'] } }));
  assert.equal(r.ok, false);
});

test('pagina non 200 -> FAIL', async () => {
  assert.equal((await runSmoke('https://x.test', makeFetch({ pageStatus: 500 }))).ok, false);
});

test('rete giu\' -> FAIL senza lanciare', async () => {
  const r = await runSmoke('https://x.test', async () => { throw new Error('offline'); });
  assert.equal(r.ok, false);
});

test('il refund non riceve mai un token finto', async () => {
  const seen = [];
  const f = makeFetch();
  await runSmoke('https://x.test', async (u, o) => { seen.push([new URL(u).pathname, !!o?.headers?.Authorization]); return f(u, o); });
  assert.equal(seen.some(([p, tok]) => p === '/api/kitchen-sumup-refund' && tok), false);
});

test('S4: il nuovo endpoint paga-al-banco del cliente e\' provato senza token e con token finto', async () => {
  const seen = [];
  const f = makeFetch();
  const r = await runSmoke('https://x.test', async (u, o) => { seen.push([new URL(u).pathname, !!o?.headers?.Authorization]); return f(u, o); });
  assert.equal(r.ok, true);
  const path = '/api/kitchen-customer-switch-to-counter';
  assert.ok(seen.some(([p, tok]) => p === path && !tok));
  assert.ok(seen.some(([p, tok]) => p === path && tok));
  const bad = await runSmoke('https://x.test', makeFetch({ apiOverride: { [`${path}|tok`]: [500, 'server_configuration_error'] } }));
  assert.equal(bad.ok, false);
});
