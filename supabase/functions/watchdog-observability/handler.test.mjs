import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createHandler } from './handler.ts';

// Synthetic credentials and upstream only: this suite never accesses a network or environment secrets.
const secret = Buffer.alloc(32, 7);
const kid = 'test-key';
const installation = 'walrus-melegnano';
const now = Date.parse('2026-10-25T12:00:00Z');
const hash = s => createHash('sha256').update(s).digest('hex');
const mac = s => createHmac('sha256', secret).update(s).digest('base64url');
const body = { v: 1, installation_id: installation, venue_id: 'walrus-main', check: 'probe', params: {} };
const result = () => ({ identity: { installation_id: installation, venue_id: 'walrus-main' }, visibility: {}, gateway: { transaction_read_only: true }, data: null });

function setup({ key = {}, response = result(), status = 200, limits = {} } = {}) {
  const calls = [];
  const logs = [];
  const env = {
    SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key',
    WATCHDOG_INSTALLATION_ID: installation,
    WATCHDOG_OBS_KEYS: JSON.stringify([{ kid, installation_id: installation, secret: secret.toString('base64url'), status: 'active', ...key }]),
  };
  const handler = createHandler({ env: name => env[name], now: () => now, log: line => logs.push(line),
    fetch: async (url, init) => {
      calls.push({ url, init });
      return url.endsWith('/rest/v1/') ? new Response(null, { status: 406 }) : Response.json(response, { status });
    },
  }, limits);
  return { handler, calls, logs };
}

function request(value = body, { timestamp = now / 1000, nonce = randomBytes(24).toString('base64url'), signature } = {}) {
  const text = JSON.stringify(value);
  const canonical = ['wdobs-v1-req', kid, String(timestamp), nonce, value.installation_id, hash(text)].join('\n');
  return new Request('https://synthetic.invalid/functions/v1/watchdog-observability', { method: 'POST', body: text,
    headers: { 'x-watchdog-key-id': kid, 'x-watchdog-timestamp': String(timestamp), 'x-watchdog-nonce': nonce, 'x-watchdog-signature': `v1=${signature ?? mac(canonical)}` },
  });
}

test('unsigned requests never reach upstream', async () => {
  const h = setup();
  assert.equal((await h.handler(new Request('https://synthetic.invalid', { method: 'POST', body: '{}' }))).status, 401);
  assert.equal(h.calls.length, 0);
});
for (const [name, options, config] of [
  ['bad signature', { signature: 'a'.repeat(43) }, {}],
  ['stale timestamp', { timestamp: now / 1000 - 31 }, {}],
  ['revoked key', {}, { key: { status: 'revoked' } }],
  ['expired key', {}, { key: { expires_at: '2026-10-24T00:00:00Z' } }],
]) test(`${name} rejected before upstream`, async () => {
  const h = setup(config);
  assert.equal((await h.handler(request(body, options))).status, 401);
  assert.equal(h.calls.length, 0);
});
test('valid probe uses fixed RPC, verifies net exposure and signs response bound to nonce', async () => {
  const h = setup();
  const req = request();
  const nonce = req.headers.get('x-watchdog-nonce');
  const res = await h.handler(req);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-watchdog-response-signature'), `v1=${mac(['wdobs-v1-res', kid, nonce, '200', hash(text)].join('\n'))}`);
  assert.equal(JSON.parse(text).result.gateway.net_api_exposed, false);
  assert.equal(h.calls[0].url, 'https://synthetic.invalid/rest/v1/rpc/watchdog_obs_gateway');
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { p_check: 'probe', p_params: {} });
  assert.ok(!text.includes('synthetic-service-key'));
  assert.ok(!JSON.stringify(h.logs).includes(secret.toString('base64url')));
});
test('replayed nonce rejected without another upstream call', async () => {
  const h = setup(); const req = request(); const duplicate = req.clone();
  assert.equal((await h.handler(req)).status, 200);
  const count = h.calls.length;
  assert.equal((await h.handler(duplicate)).status, 401);
  assert.equal(h.calls.length, count);
});
for (const [name, value, status] of [
  ['unknown check', { ...body, check: 'sql' }, 400],
  ['unknown parameter', { ...body, params: { sql: 'select 1' } }, 400],
  ['wrong installation', { ...body, installation_id: 'other-installation' }, 403],
]) test(`${name} fails closed`, async () => {
  const h = setup(); assert.equal((await h.handler(request(value))).status, status); assert.equal(h.calls.length, 0);
});
for (const [name, response, status] of [
  ['wrong venue', { ...result(), identity: { installation_id: installation, venue_id: 'other' } }, 409],
  ['missing attestation', { identity: result().identity }, 502],
  ['truncated data', { ...result(), data: Array(201).fill(1) }, 502],
]) test(`${name} never returns success`, async () => {
  const h = setup({ response }); assert.equal((await h.handler(request())).status, status);
});
test('database errors hide upstream details', async () => {
  const h = setup({ status: 500, response: { code: 'XX000', message: 'private database details' } });
  const res = await h.handler(request()); assert.equal(res.status, 502); assert.ok(!(await res.text()).includes('private database details'));
});
test('rate limit rejects second authenticated request with capacity one', async () => {
  const h = setup({ limits: { perKeyPerMinute: 1 } });
  assert.equal((await h.handler(request())).status, 200);
  assert.equal((await h.handler(request())).status, 429);
});
