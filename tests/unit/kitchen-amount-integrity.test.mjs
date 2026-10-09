// S0.5 F1 — Amount Integrity: create-checkout non crea/riusa un checkout se attempt.amount != order.total.
// Eseguire a mano: node --test tests/unit/kitchen-amount-integrity.test.mjs
// Stesso approccio di tests/unit/sumup-payment-reliability.test.mjs (Vite middleware + mock supabase).
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-amount-integrity',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') return '\0virtual:supabaseJsAmountIntegrity';
  },
  load(id) {
    if (id === '\0virtual:supabaseJsAmountIntegrity') {
      return `export function createClient() { return globalThis.__AMOUNT_INTEGRITY_ADMIN__(); }`;
    }
  },
};

let server;
let createCheckoutHandler;

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js'] },
    server: { middlewareMode: true },
  });
  ({ default: createCheckoutHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js')));
});

after(async () => { await server.close(); });

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUMUP_API_KEY = 'test-sumup-key';
  process.env.SUMUP_MERCHANT_CODE = 'test-merchant';
});

function makeRes() {
  const res = { statusCode: null, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}

function makeAdmin({ attempt, order }) {
  const rpcCalls = [];
  const from = (table) => {
    const b = {
      select: () => b, eq: () => b,
      maybeSingle: async () => ({ data: table === 'kitchen_payments' ? attempt : order, error: null }),
    };
    return b;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: 'cust-1' } }, error: null }) }, rpc: async (name, params) => { rpcCalls.push({ name, params }); return { data: null, error: null }; }, __rpcCalls: rpcCalls };
}

async function run({ attempt, order }) {
  const admin = makeAdmin({ attempt, order });
  globalThis.__AMOUNT_INTEGRITY_ADMIN__ = () => admin;
  const fetchCalls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { fetchCalls.push({ url: String(url), method: opts?.method ?? 'GET' }); throw new Error('SumUp must not be called'); };
  const res = makeRes();
  try {
    await createCheckoutHandler({ method: 'POST', body: { order_id: 'ord-1', payment_attempt_id: 'att-1' }, headers: { authorization: 'Bearer valid-token' } }, res);
  } finally {
    globalThis.fetch = original;
  }
  return { res, admin, fetchCalls };
}

const baseAttempt = { id: 'att-1', order_id: 'ord-1', provider: 'sumup', method: 'sumup_online', amount: 100, status: 'initiated', direction: 'charge', provider_ref: null };
const baseOrder = { id: 'ord-1', payment_status: 'pending_counter_payment', total: 90, customer_id: 'cust-1' };

test('create-checkout: attempt.amount != order.total (path nuovo checkout) -> 409 amount_mismatch, nessuna fetch SumUp, nessun claim', async () => {
  const { res, admin, fetchCalls } = await run({ attempt: baseAttempt, order: baseOrder });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'amount_mismatch');
  assert.equal(fetchCalls.length, 0, 'nessuna chiamata SumUp (ne POST ne GET ne PATCH)');
  assert.equal(admin.__rpcCalls.length, 0, 'nessun claim / provider_ref / fail');
});

test('create-checkout: attempt.amount != order.total (path reuse con provider_ref) -> 409, nessuna fetch SumUp, nessun URL', async () => {
  const { res, fetchCalls } = await run({ attempt: { ...baseAttempt, provider_ref: 'co-1' }, order: baseOrder });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'amount_mismatch');
  assert.equal(res.body.hosted_checkout_url, undefined);
  assert.equal(fetchCalls.length, 0);
});

test('create-checkout: total mancante/non numerico -> fail closed (nessuna fetch SumUp)', async () => {
  const { res, fetchCalls } = await run({ attempt: baseAttempt, order: { ...baseOrder, total: undefined } });
  assert.equal(res.statusCode, 409);
  assert.equal(fetchCalls.length, 0);
});

test('create-checkout: amount uguale (numeric come stringa PostgREST) -> non bloccato dal guard', async () => {
  const { res, fetchCalls } = await run({ attempt: { ...baseAttempt, amount: '90.00' }, order: baseOrder });
  // Supera il guard e arriva al claim (il mock ritorna riga vuota -> lost race): comportamento invariato.
  assert.equal(res.body.error, 'checkout_creation_in_progress');
  assert.equal(fetchCalls.length, 0);
});

test('create-checkout: sorgente senza alcun PATCH/PUT verso SumUp', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js'), 'utf8');
  assert.doesNotMatch(src, /method:\s*'(PATCH|PUT)'/);
});
