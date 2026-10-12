// Test mirati SumUp Online Payment Reliability Hardening (FASE 6 del task).
// Copre: duplicate checkout guard, race ordine-gia-pagato in create-checkout, reconciliation core
// (PAID/FAILED/PENDING/lookup-failure/mismatch/idempotenza), e "browser return non prova nulla".
//
// Non wired a npm/package.json (stessa convenzione di tests/unit/p0a-kitchen-sync.test.mjs):
// eseguire a mano con
//   node --test tests/unit/sumup-payment-reliability.test.mjs
//
// Usa Vite (gia devDependency del progetto) in middleware mode per caricare gli handler api/*.js
// con la loro risoluzione reale, iniettando al posto di '@supabase/supabase-js' un modulo virtuale
// controllabile per test. fetch e mockato riassegnando globalThis.fetch (i file api/*.js chiamano
// fetch globale nativo, nessuna dipendenza aggiuntiva necessaria).
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let currentAdmin = null;

const mockSupabasePlugin = {
  name: 'mock-supabase-client-sumup',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') {
      return '\0virtual:supabaseJs';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseJs') {
      return `export function createClient() { return globalThis.__SUMUP_TEST_ADMIN__(); }`;
    }
  },
};

let server;
let createCheckoutHandler;
let webhookHandler;
let reconcileHandler;

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
  ({ default: webhookHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-webhook.js')));
  ({ default: reconcileHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-reconcile.js')));
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUMUP_API_KEY = 'test-sumup-key';
  process.env.SUMUP_MERCHANT_CODE = 'test-merchant';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.example.com';
});

// ---- fake response/request helpers -----------------------------------------------------------

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
  };
  return res;
}

function makeReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return { method, body, headers };
}

// ---- fake Supabase admin client ---------------------------------------------------------------

function makeSupabaseAdminMock({ tables = {}, rpc = {}, authUser } = {}) {
  const queues = {};
  for (const [t, v] of Object.entries(tables)) {
    queues[t] = Array.isArray(v) ? [...v] : [v];
  }
  const rpcCalls = [];
  const from = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const q = queues[table];
        if (!q || q.length === 0) return { data: null, error: null };
        return q.length > 1 ? q.shift() : q[0];
      },
    };
    return builder;
  };
  return {
    from,
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      if (typeof handler === 'function') return handler(params);
      return handler ?? { data: null, error: null };
    },
    auth: {
      getUser: async () => authUser ?? { data: { user: null }, error: new Error('no user') },
    },
    __rpcCalls: rpcCalls,
  };
}

function withAdmin(admin, fn) {
  globalThis.__SUMUP_TEST_ADMIN__ = () => admin;
  return fn();
}

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = original; });
}

function jsonFetchResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// S0.5 F7: dopo la claim il create-checkout fa una List-by-checkout_reference prima di ogni POST.
const isListUrl = (url) => String(url).includes('/v0.1/checkouts?checkout_reference=');

const CALLER_ID = 'cust-1';
const CALLER_AUTH = { data: { user: { id: CALLER_ID } }, error: null };
const AUTH_HEADERS = { authorization: 'Bearer valid-token' };

// ================================================================================================
// FASE 1 — create-checkout: race guard "ordine gia pagato" (P1-2 / Test #3)
// ================================================================================================

test('create-checkout: ordine gia pagato tra attempt_start e create-checkout -> 409, checkout mai creato', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-1', order_id: 'ord-1', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-1', total: 10, payment_status: 'paid' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: {}, error: null } },
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' }); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-1', payment_attempt_id: 'att-1' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'order_already_paid');
    });
  });
  assert.equal(sumupCalled, false, 'SumUp non deve mai essere chiamato se l\'ordine risulta gia paid');
  assert.equal(admin.__rpcCalls.length, 1);
  assert.equal(admin.__rpcCalls[0].name, 'kitchen_payment_fail');
  assert.equal(admin.__rpcCalls[0].params.p_reason, 'order_already_paid_race');
});

test('create-checkout: ordine non pagato -> procede, checkout creato e provider_ref persistito', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-2', order_id: 'ord-2', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-2', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {
      kitchen_payment_attempt_claim_checkout: { data: { id: 'att-2', provider_ref: null }, error: null },
      kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
    },
  });

  await withFetch(async (url) => (isListUrl(url) ? jsonFetchResponse(200, []) : jsonFetchResponse(200, { id: 'co-2', hosted_checkout_url: 'https://pay.sumup.com/y' })), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-2', payment_attempt_id: 'att-2' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/y');
    });
  });
  const refCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref');
  assert.ok(refCall, 'deve persistere il checkout id su provider_ref');
  assert.equal(refCall.params.p_attempt_id, 'att-2');
  assert.equal(refCall.params.p_provider_ref, 'co-2');
  const claimCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_claim_checkout');
  assert.ok(claimCall, 'deve reclamare lo slot di creazione prima di chiamare SumUp');
  assert.equal(claimCall.params.p_attempt_id, 'att-2');
});

// ================================================================================================
// P0 — duplicate live checkout guard (Layer 1: provider_ref reuse/resolve, Layer 2: claim RPC)
// ================================================================================================

test('create-checkout: provider_ref assente, claim RPC perde la race -> 409 checkout_creation_in_progress, SumUp mai chiamato', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-20', order_id: 'ord-20', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-20', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_attempt_claim_checkout: { data: null, error: null } },
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, { id: 'co-20', hosted_checkout_url: 'https://pay.sumup.com/x' }); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-20', payment_attempt_id: 'att-20' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_creation_in_progress');
    });
  });
  assert.equal(sumupCalled, false, 'perdere la claim non deve mai creare un secondo checkout');
});

// S4: guardie S3 della claim sull'ordine (PA, POP oltre 4:30) -> 409 leggibile, mai 500, SumUp mai chiamato.
for (const code of ['order_payment_abandoned', 'online_payment_expired']) {
  test(`create-checkout: claim RPC rifiuta ${code} -> 409 ${code}, SumUp mai chiamato`, async () => {
    const admin = makeSupabaseAdminMock({
      authUser: CALLER_AUTH,
      tables: {
        kitchen_payments: { data: { id: 'att-s4', order_id: 'ord-s4', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
        kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-s4', total: 10, payment_status: null }, error: null },
      },
      rpc: { kitchen_payment_attempt_claim_checkout: { data: null, error: { code: 'P0001', message: code } } },
    });

    let sumupCalled = false;
    await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, {}); }, async () => {
      await withAdmin(admin, async () => {
        const req = makeReq({ body: { order_id: 'ord-s4', payment_attempt_id: 'att-s4' }, headers: AUTH_HEADERS });
        const res = makeRes();
        await createCheckoutHandler(req, res);
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.error, code);
      });
    });
    assert.equal(sumupCalled, false);
  });
}

test('create-checkout: claim RPC perde la race con la reale forma PostgREST (riga composita NULL, non data:null) -> 409, SumUp mai chiamato', async () => {
  // Regressione bug reale trovato in E2E su Preview (2026-08-30): PostgREST serializza una riga
  // composita NULL (0 righe dalla UPDATE atomica della claim) come un oggetto con ogni campo a
  // null (es. { id: null, order_id: null, ... }), MAI come il letterale JSON null. Un check
  // `if (!claimed)` e sempre falso per questa forma (e un oggetto, non null) e tratta erroneamente
  // una race persa come vinta. Verificato a livello SQL diretto su Supabase che
  // row_to_json(claim_fallita) produce esattamente questa forma, non `null`.
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-20b', order_id: 'ord-20b', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-20b', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {
      kitchen_payment_attempt_claim_checkout: {
        data: {
          id: null, order_id: null, venue_id: null, channel: null, provider: null, method: null,
          direction: null, status: null, amount: null, provider_ref: null, idempotency_key: null,
          initiated_by_actor_type: null, initiated_by_actor_id: null, failure_reason: null,
          raw_last_event: null, created_at: null, updated_at: null, checkout_claim_at: null,
        },
        error: null,
      },
    },
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, { id: 'co-20b', hosted_checkout_url: 'https://pay.sumup.com/x' }); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-20b', payment_attempt_id: 'att-20b' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_creation_in_progress');
    });
  });
  assert.equal(sumupCalled, false, 'una riga composita NULL (tutti campi null) deve essere trattata come race persa, mai come claim riuscita');
});

test('create-checkout: provider_ref gia presente + SumUp GET PENDING -> riusa lo stesso checkout, SumUp POST mai chiamato', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-21', order_id: 'ord-21', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-21' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-21', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  const calls = [];
  await withFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonFetchResponse(200, { id: 'co-21', status: 'PENDING', amount: 10, checkout_reference: 'att-21', hosted_checkout_url: 'https://pay.sumup.com/existing' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-21', payment_attempt_id: 'att-21' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.checkout_id, 'co-21');
      assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/existing');
    });
  });
  assert.equal(calls.length, 1, 'una sola GET di verifica, mai un POST di creazione');
  assert.match(calls[0].url, /checkouts\/co-21$/);
  assert.notEqual(calls[0].url, 'https://api.sumup.com/v0.1/checkouts');
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_attempt_claim_checkout'), false, 'nessun claim quando provider_ref e gia presente');
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail'), false, 'PENDING non deve risolvere nulla');
});

test('create-checkout: provider_ref presente + SumUp GET PAID -> resolve/confirm, 409 order_already_paid, nessun nuovo checkout', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-22', order_id: 'ord-22', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-22' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-22', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_confirm: { data: { status: 'succeeded' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-22', status: 'PAID', amount: 10, checkout_reference: 'att-22' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-22', payment_attempt_id: 'att-22' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'order_already_paid');
    });
  });
  assert.equal(postCalled, false, 'un checkout gia PAID non deve mai portare a un nuovo POST');
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), 'deve confermare via applySumupCheckoutResult condivisa');
});

test('create-checkout: provider_ref presente + SumUp GET FAILED (sumup_failed) -> fail applicato, riusa lo STESSO checkout (retry preservato)', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-23', order_id: 'ord-23', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-23' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-23', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: { status: 'failed' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-23', status: 'FAILED', amount: 10, checkout_reference: 'att-23', hosted_checkout_url: 'https://pay.sumup.com/retry-same' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-23', payment_attempt_id: 'att-23' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.checkout_id, 'co-23');
      assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/retry-same');
    });
  });
  assert.equal(postCalled, false, 'FAILED (sumup_failed) non deve mai creare un nuovo checkout, solo riusare quello esistente');
  const failCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_fail');
  assert.ok(failCall, 'deve registrare il fail per tenere aperta la finestra di retry stesso-checkout (LONG SESSION F)');
  assert.equal(failCall.params.p_reason, 'sumup_failed');
});

test('create-checkout: provider_ref presente + SumUp GET EXPIRED -> fail applicato, checkout non riusabile, nessun nuovo checkout da qui', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-24', order_id: 'ord-24', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-24' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-24', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: { status: 'failed' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-24', status: 'EXPIRED', amount: 10, checkout_reference: 'att-24' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-24', payment_attempt_id: 'att-24' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'attempt_no_longer_valid');
      assert.equal(res.body.reason, 'expired');
    });
  });
  assert.equal(postCalled, false, 'un attempt EXPIRED non deve mai creare un nuovo checkout dalla stessa chiamata: serve un nuovo attempt_start');
  const failCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_fail');
  assert.equal(failCall.params.p_reason, 'sumup_expired');
});

test('create-checkout: provider_ref presente + GET SumUp fallisce (network/5xx) -> fail closed, nessuna azione', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-25', order_id: 'ord-25', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-25' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-25', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => { throw new Error('network down'); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-25', payment_attempt_id: 'att-25' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.error, 'sumup_verify_failed');
    });
  });
  assert.equal(admin.__rpcCalls.length, 0, 'nessuna RPC di risoluzione deve essere chiamata su un lookup fallito (mai indovinare)');
});

test('create-checkout: provider_ref presente + checkout_reference non corrisponde -> 409, mai risolto', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-26', order_id: 'ord-26', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-26' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-26', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-26', status: 'PENDING', amount: 10, checkout_reference: 'someone-elses-attempt', hosted_checkout_url: 'https://pay.sumup.com/z' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-26', payment_attempt_id: 'att-26' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_reference_mismatch');
    });
  });
  assert.equal(admin.__rpcCalls.length, 0);
});

test('create-checkout: provider_ref presente + PENDING ma senza hosted_checkout_url in risposta -> fail closed, nessuna ricostruzione URL', async () => {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-27', order_id: 'ord-27', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-27' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-27', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-27', status: 'PENDING', amount: 10, checkout_reference: 'att-27' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-27', payment_attempt_id: 'att-27' }, headers: AUTH_HEADERS });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_retry_unavailable');
    });
  });
});

// ================================================================================================
// S0.5 F4 — create-checkout: authentication & ownership (auth -> owner -> attempt -> F1 -> SumUp)
// ================================================================================================

const MUTATING_RPCS = ['kitchen_payment_fail', 'kitchen_payment_attempt_claim_checkout', 'kitchen_payment_attempt_set_provider_ref', 'kitchen_payment_confirm'];

function f4Attempt(over = {}) {
  return { id: 'att-f4', order_id: 'ord-f4', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null, ...over };
}
function f4Order(over = {}) {
  return { id: 'ord-f4', customer_id: CALLER_ID, total: 10, payment_status: 'pending_counter_payment', ...over };
}

async function runF4({ headers = AUTH_HEADERS, authUser = CALLER_AUTH, order = f4Order(), attempt = f4Attempt(), rpc = {}, fetchImpl, body = { order_id: 'ord-f4', payment_attempt_id: 'att-f4' } } = {}) {
  const admin = makeSupabaseAdminMock({
    authUser,
    tables: { kitchen_orders: { data: order, error: null }, kitchen_payments: { data: attempt, error: null } },
    rpc,
  });
  const fetchCalls = [];
  const res = makeRes();
  await withFetch(async (url, opts) => {
    fetchCalls.push(String(url));
    if (fetchImpl) return fetchImpl(url, opts);
    if (isListUrl(url)) return jsonFetchResponse(200, []);
    return jsonFetchResponse(200, { id: 'co-f4', hosted_checkout_url: 'https://pay.sumup.com/f4' });
  }, () => withAdmin(admin, () => createCheckoutHandler(makeReq({ body, headers }), res)));
  const mutations = admin.__rpcCalls.filter((c) => MUTATING_RPCS.includes(c.name));
  return { res, admin, fetchCalls, mutations };
}

test('F4 T1: nessun Authorization -> 401 missing_session, 0 RPC, 0 fetch SumUp', async () => {
  const { res, admin, fetchCalls } = await runF4({ headers: {} });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'missing_session');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T2: token invalido -> 401 invalid_session, 0 RPC, 0 fetch SumUp', async () => {
  const { res, admin, fetchCalls } = await runF4({ authUser: { data: { user: null }, error: new Error('bad jwt') } });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'invalid_session');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T3: customer A + order A + attempt A valido -> checkout creato come prima', async () => {
  const { res, admin, fetchCalls } = await runF4({
    rpc: {
      kitchen_payment_attempt_claim_checkout: { data: { id: 'att-f4' }, error: null },
      kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/f4');
  assert.equal(fetchCalls.length, 2, 'List-first + una sola POST');
  assert.ok(admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_claim_checkout'));
});

test('F4 T4: customer A + order di B -> 403 not_order_owner, 0 claim, 0 fail, 0 fetch', async () => {
  const { res, admin, fetchCalls } = await runF4({ order: f4Order({ customer_id: 'cust-B' }) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'not_order_owner');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T5: order A ma attempt appartenente a order B -> 404 payment_attempt_not_found, 0 claim, 0 fetch', async () => {
  const { res, admin, fetchCalls } = await runF4({ attempt: f4Attempt({ order_id: 'ord-B' }) });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'payment_attempt_not_found');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T6: order.customer_id NULL -> 403, 0 mutazioni, 0 fetch', async () => {
  const { res, admin, fetchCalls } = await runF4({ order: f4Order({ customer_id: null }) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'not_order_owner');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T7: order di B gia paid richiesto da A -> 403 (non order_already_paid), nessuna mutazione', async () => {
  const { res, admin, mutations, fetchCalls } = await runF4({ order: f4Order({ customer_id: 'cust-B', payment_status: 'paid' }) });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'not_order_owner');
  assert.equal(mutations.length, 0);
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T8: owner autorizzato ma attempt.amount != order.total -> 409 amount_mismatch (F1 preservata)', async () => {
  const { res, admin, fetchCalls } = await runF4({ attempt: f4Attempt({ amount: 99 }) });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, 'amount_mismatch');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T9: owner autorizzato + provider_ref presente -> reuse invariato (GET, nessun POST)', async () => {
  const { res, fetchCalls } = await runF4({
    attempt: f4Attempt({ provider_ref: 'co-f4' }),
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-f4', status: 'PENDING', amount: 10, checkout_reference: 'att-f4', hosted_checkout_url: 'https://pay.sumup.com/reuse' }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/reuse');
  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0], /\/checkouts\/co-f4$/);
});

test('F4 T10: order inesistente con token valido -> 404 order_not_found, 0 fetch', async () => {
  const { res, admin, fetchCalls } = await runF4({ order: null, attempt: null });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'order_not_found');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T10b: ordine proprio ma attempt inesistente -> 404 payment_attempt_not_found, 0 fetch', async () => {
  const { res, admin, fetchCalls } = await runF4({ attempt: null });
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, 'payment_attempt_not_found');
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

test('F4 T11: sorgente — getUser e check ownership precedono ogni RPC con effetti e fetch SumUp', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js'), 'utf8');
  const idx = (needle) => { const i = src.indexOf(needle); assert.ok(i >= 0, `manca: ${needle}`); return i; };
  const ownership = idx("res.status(403).json({ error: 'not_order_owner' })");
  assert.ok(idx('auth.getUser(accessToken)') < ownership);
  assert.ok(src.indexOf("kitchen_payments") > ownership, 'lookup attempt dopo ownership');
  for (const needle of ["rpc('kitchen_payment_fail'", "rpc('kitchen_payment_attempt_claim_checkout'", "rpc('kitchen_payment_attempt_set_provider_ref'", 'fetch(', 'resolveExistingCheckout({']) {
    assert.ok(idx(needle) > ownership, `${needle} deve seguire il check ownership`);
  }
  assert.doesNotMatch(src, /getSession\(/);
});

test('F4 T12: useOrderPaymentFlow invia Authorization Bearer alla create-checkout', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'src/hooks/useOrderPaymentFlow.js'), 'utf8');
  const call = src.slice(src.indexOf("fetch('/api/kitchen-sumup-create-checkout'"));
  assert.match(call.slice(0, 400), /Authorization:\s*`Bearer \$\{session\.access_token\}`/);
});

// ================================================================================================
// FASE 2/6 — reconciliation core
// ================================================================================================

function reconcileAdmin({ order, attempt, rpcOverrides = {} } = {}) {
  return makeSupabaseAdminMock({
    tables: {
      kitchen_orders: { data: order, error: null },
      kitchen_payments: { data: attempt, error: null },
    },
    rpc: {
      kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null },
      kitchen_payment_fail: { data: { ...attempt, status: 'failed' }, error: null },
      ...rpcOverrides,
    },
    authUser: { data: { user: { id: 'cust-1' } }, error: null },
  });
}

test('reconcile: SumUp PAID + webhook mai arrivato -> conferma ordine (kitchen_payment_confirm chiamato)', async () => {
  const attempt = { id: 'att-3', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-3' };
  const order = { id: 'ord-3', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async (url) => {
    assert.match(String(url), /checkouts\/co-3$/);
    return jsonFetchResponse(200, { id: 'co-3', status: 'PAID', amount: 10, checkout_reference: 'att-3' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-3' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'confirmed');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'));
});

test('reconcile: SumUp FAILED -> fail applicato, retryable FALSE (LONG SESSION F: stesso checkout puo ancora diventare PAID)', async () => {
  const attempt = { id: 'att-4', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-4' };
  const order = { id: 'ord-4', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-4', status: 'FAILED', amount: 10, checkout_reference: 'att-4' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-4' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.reason, 'failed');
      assert.equal(res.body.retryable, false, 'allowlist esplicita: FAILED non e in ["expired","cancelled"]');
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_fail'));
});

test('reconcile: SumUp EXPIRED -> fail applicato, retryable true (equivalente a CANCELLED nel contract)', async () => {
  const attempt = { id: 'att-4b', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-4b' };
  const order = { id: 'ord-4b', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-4b', status: 'EXPIRED', amount: 10, checkout_reference: 'att-4b' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-4b' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.retryable, true);
    });
  });
});

test('reconcile: SumUp PENDING -> nessun retry, blocking', async () => {
  const attempt = { id: 'att-5', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-5' };
  const order = { id: 'ord-5', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-5', status: 'PENDING', amount: 10, checkout_reference: 'att-5' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-5' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'pending');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.filter((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail').length, 0);
});

test('reconcile: lookup SumUp fallisce (network/5xx) -> UNKNOWN, nessun retry', async () => {
  const attempt = { id: 'att-6', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-6' };
  const order = { id: 'ord-6', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => { throw new Error('network down'); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-6' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.retryable, false);
    });
  });
});

// FASE 2: attempt senza provider_ref ora tenta prima una recovery via
// GET /v0.1/checkouts?checkout_reference=<attemptId> (api/_lib/sumupProviderRefRecovery.js) invece
// di arrendersi subito — vedi i test dedicati "provider_ref recovery" piu sotto per i 3 esiti
// (recuperato/not_found/ambiguous). Qui solo il caso "recovery non trova nulla" resta UNKNOWN.
test('reconcile: attempt senza provider_ref, recovery non trova nulla -> UNKNOWN, nessuna GET by-id', async () => {
  const attempt = { id: 'att-7', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: null };
  const order = { id: 'ord-7', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  const fetchCalls = [];
  await withFetch(async (url) => { fetchCalls.push(String(url)); return jsonFetchResponse(200, []); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-7' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(fetchCalls.length, 1, 'deve tentare la recovery via checkout_reference (una sola chiamata)');
  assert.match(fetchCalls[0], /checkout_reference=att-7/);
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
});

test('reconcile: attempt senza provider_ref, recovery ambigua (>1 match) -> UNKNOWN + needs_manual_reconciliation', async () => {
  const attempt = { id: 'att-7b', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: null };
  const order = { id: 'ord-7b', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, [
    { id: 'co-x', checkout_reference: 'att-7b', status: 'PAID', amount: 10 },
    { id: 'co-y', checkout_reference: 'att-7b', status: 'PAID', amount: 10 },
  ]), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-7b' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.needs_manual_reconciliation, true, 'una recovery ambigua deve essere segnalata per riconciliazione manuale');
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
});

test('reconcile: attempt senza provider_ref, recovery trova esattamente 1 match -> persiste il ref e prosegue alla verifica by-id', async () => {
  const attempt = { id: 'att-7c', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: null };
  const order = { id: 'ord-7c', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt, rpcOverrides: {
    kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
  } });

  const fetchCalls = [];
  await withFetch(async (url) => {
    fetchCalls.push(String(url));
    if (String(url).includes('checkout_reference=')) {
      return jsonFetchResponse(200, [{ id: 'co-7c', checkout_reference: 'att-7c', status: 'PAID', amount: 10 }]);
    }
    // seconda chiamata: GET by-id, stesso pattern gia usato dal path con provider_ref presente
    return jsonFetchResponse(200, { id: 'co-7c', status: 'PAID', amount: 10, checkout_reference: 'att-7c' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-7c' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'confirmed');
    });
  });
  assert.equal(fetchCalls.length, 2, 'recovery lookup + verifica by-id');
  const refCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref');
  assert.ok(refCall, 'il provider_ref recuperato deve essere persistito');
  assert.equal(refCall.params.p_provider_ref, 'co-7c');
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'));
});

test('reconcile: amount/reference mismatch -> non conferma (fail applicato con motivo mismatch)', async () => {
  const attempt = { id: 'att-8', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-8' };
  const order = { id: 'ord-8', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-8', status: 'PAID', amount: 999, checkout_reference: 'att-8' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-8' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.reason, 'amount_mismatch');
    });
  });
  const confirmed = admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm');
  assert.equal(confirmed, false, 'un mismatch non deve mai confermare');
});

test('reconcile: checkout_reference non corrisponde all\'attempt -> UNKNOWN, mai confermato', async () => {
  const attempt = { id: 'att-8b', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-8b' };
  const order = { id: 'ord-8b', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-8b', status: 'PAID', amount: 10, checkout_reference: 'someone-elses-attempt' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-8b' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
});

// ================================================================================================
// LONG SESSION F — same-checkout retry: failed (sumup_failed) puo essere promosso a succeeded
// ================================================================================================

test('reconcile: attempt gia FAILED (sumup_failed) + stesso checkout ora PAID -> promuove a succeeded (bug reale E2E)', async () => {
  const attempt = { id: 'att-14', amount: 10, provider: 'sumup', status: 'failed', provider_ref: 'co-14', failure_reason: 'sumup_failed' };
  const order = { id: 'ord-14', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async (url) => {
    assert.match(String(url), /checkouts\/co-14$/);
    return jsonFetchResponse(200, { id: 'co-14', status: 'PAID', amount: 10, checkout_reference: 'att-14' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-14' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'confirmed');
      assert.equal(res.body.retryable, false);
    });
  });
  const confirmCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_confirm');
  assert.ok(confirmCall, 'kitchen_payment_confirm deve essere chiamato anche partendo da status=failed');
  assert.equal(confirmCall.params.p_attempt_id, 'att-14');
});

test('reconcile: attempt gia FAILED (sumup_failed) + checkout ancora FAILED -> resta failed, nessuna promozione', async () => {
  const attempt = { id: 'att-15', amount: 10, provider: 'sumup', status: 'failed', provider_ref: 'co-15', failure_reason: 'sumup_failed' };
  const order = { id: 'ord-15', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-15', status: 'FAILED', amount: 10, checkout_reference: 'att-15' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-15' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_fail'), 're-check ri-applica fail (idempotente lato RPC)');
});

test('reconcile: attempt gia FAILED (sumup_failed) + checkout ora PAID ma importo diverso -> mismatch, non promuove', async () => {
  const attempt = { id: 'att-16', amount: 10, provider: 'sumup', status: 'failed', provider_ref: 'co-16', failure_reason: 'sumup_failed' };
  const order = { id: 'ord-16', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = reconcileAdmin({ order, attempt });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-16', status: 'PAID', amount: 999, checkout_reference: 'att-16' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-16' }, headers: { authorization: 'Bearer tok' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.reason, 'amount_mismatch');
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false, 'un mismatch non deve mai confermare, nemmeno ripartendo da failed');
});

test('webhook: redelivery per un attempt gia FAILED (sumup_failed) con checkout ora PAID -> promuove a succeeded', async () => {
  const attempt = { id: 'att-17', amount: 10, provider: 'sumup', direction: 'charge', provider_ref: 'co-17', status: 'failed', failure_reason: 'sumup_failed' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: attempt, error: null } },
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null },
    },
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-17', status: 'PAID', amount: 10, checkout_reference: 'att-17' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { id: 'co-17' } });
      const res = makeRes();
      await webhookHandler(req, res);
      assert.equal(res.statusCode, 200);
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), 'il webhook deve poter promuovere un attempt gia failed');
});

test('webhook: PAID ridelivered su un attempt gia SUCCEEDED -> nessuna nuova confirm (duplicate idempotente)', async () => {
  const attempt = { id: 'att-18', amount: 10, provider: 'sumup', direction: 'charge', provider_ref: 'co-18', status: 'succeeded' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: attempt, error: null } },
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null },
    },
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-18', status: 'PAID', amount: 10, checkout_reference: 'att-18' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { id: 'co-18' } });
      const res = makeRes();
      await webhookHandler(req, res);
      assert.equal(res.statusCode, 200);
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false, 'un attempt gia succeeded non deve mai ri-chiamare confirm');
  assert.equal(admin.__rpcCalls.length, 0, 'duplicate callback: nessuna mutation ne ingest');
});

test('CustomerOrderStatus: se attempt_start ritorna un attempt failed, il client non chiama create-checkout (niente CTA unsafe)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'src/pages/CustomerOrderStatus.jsx'), 'utf8');
  const attemptIdx = src.indexOf("kitchen_payment_attempt_start");
  const createCheckoutIdx = src.indexOf('/api/kitchen-sumup-create-checkout', attemptIdx);
  const guardIdx = src.indexOf("attempt.status === 'failed'", attemptIdx);
  assert.ok(guardIdx > -1 && guardIdx < createCheckoutIdx, 'il check su attempt.status failed deve precedere la chiamata a create-checkout');
  const guardBlock = src.slice(guardIdx, createCheckoutIdx);
  assert.match(guardBlock, /return;/, 'il ramo failed deve uscire prima di raggiungere create-checkout');
});

test('reconcile: duplicate reconciliation -> idempotente (secondo giro non ri-applica confirm/fail)', async () => {
  // Simula: la prima riconciliazione ha gia risolto l'attempt (status='succeeded' nel DB).
  // La query attempt-lookup del secondo giro (status IN initiated/pending) non trova piu nulla:
  // no_pending_attempt, e l'ordine risulta gia 'paid' -> already_paid, in ogni caso mai un secondo
  // confirm/fail.
  const order = { id: 'ord-9', customer_id: 'cust-1', payment_status: 'paid', status: 'received' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_orders: { data: order, error: null } },
    rpc: {},
    authUser: { data: { user: { id: 'cust-1' } }, error: null },
  });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-9' }, headers: { authorization: 'Bearer tok' } });
      const res1 = makeRes();
      await reconcileHandler(req, res1);
      assert.equal(res1.body.outcome, 'already_paid');
      const res2 = makeRes();
      await reconcileHandler(req, res2);
      assert.equal(res2.body.outcome, 'already_paid');
    });
  });
  assert.equal(fetchCalled, false, 'un ordine gia paid non deve mai richiamare SumUp');
  assert.equal(admin.__rpcCalls.length, 0);
});

test('reconcile: nessun attempt live e ordine non pagato -> no_pending_attempt, retryable', async () => {
  const order = { id: 'ord-10', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_orders: { data: order, error: null }, kitchen_payments: { data: null, error: null } },
    authUser: { data: { user: { id: 'cust-1' } }, error: null },
  });

  await withAdmin(admin, async () => {
    const req = makeReq({ body: { order_id: 'ord-10' }, headers: { authorization: 'Bearer tok' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.body.outcome, 'no_pending_attempt');
    assert.equal(res.body.retryable, true);
  });
});

test('reconcile: ownership -- un cliente non puo riconciliare l\'ordine di un altro (403)', async () => {
  const order = { id: 'ord-11', customer_id: 'someone-else', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_orders: { data: order, error: null } },
    authUser: { data: { user: { id: 'cust-1' } }, error: null },
  });

  await withAdmin(admin, async () => {
    const req = makeReq({ body: { order_id: 'ord-11' }, headers: { authorization: 'Bearer tok' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 403);
  });
});

test('reconcile: nessuna sessione (browser return da solo non prova nulla) -> 401, nessuna azione', async () => {
  const admin = makeSupabaseAdminMock({});
  await withAdmin(admin, async () => {
    const req = makeReq({ body: { order_id: 'ord-12' }, headers: {} });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 401);
  });
  assert.equal(admin.__rpcCalls.length, 0);
});

// ================================================================================================
// Webhook: shared resolution logic invariata dopo l'estrazione (regression, no duplicazione)
// ================================================================================================

test('webhook: PAID valido -> confirm chiamato via applySumupCheckoutResult condivisa', async () => {
  const attempt = { id: 'att-13', amount: 10, provider: 'sumup', direction: 'charge', provider_ref: 'co-13', status: 'initiated' };
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: attempt, error: null } },
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null },
    },
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-13', status: 'PAID', amount: 10, checkout_reference: 'att-13' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { id: 'co-13' } });
      const res = makeRes();
      await webhookHandler(req, res);
      assert.equal(res.statusCode, 200);
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'));
});

// ================================================================================================
// S0.5 F6 — webhook: DB-first binding, input validation, post-GET binding, ingest dopo il binding
// ================================================================================================

const F6_ATTEMPT = { id: 'att-f6', order_id: 'ord-f6', amount: 10, provider: 'sumup', direction: 'charge', provider_ref: 'co-f6', status: 'initiated' };
const F6_CHECKOUT = { id: 'co-f6', status: 'PAID', amount: 10, checkout_reference: 'att-f6' };

async function runF6({ body, attempt = F6_ATTEMPT, checkout = F6_CHECKOUT, rpc, fetchStatus = 200 } = {}) {
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: attempt, error: null } },
    rpc: rpc ?? {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { ...F6_ATTEMPT, status: 'succeeded' }, error: null },
      kitchen_payment_fail: { data: {}, error: null },
    },
  });
  const urls = [];
  const res = makeRes();
  await withFetch(async (url) => { urls.push(String(url)); return jsonFetchResponse(fetchStatus, checkout); }, async () => {
    await withAdmin(admin, async () => {
      await webhookHandler(makeReq({ body }), res);
    });
  });
  return { admin, urls, res };
}

const rpcNames = (admin) => admin.__rpcCalls.map((c) => c.name);

test('F6 T1/T2: id non-string / vuoto / whitespace -> 0 GET SumUp, 0 mutation, 0 ingest', async () => {
  for (const id of [{ a: 1 }, ['co-f6'], 123, true, '', '   ', ' co-f6', 'co-f6 ', null, undefined]) {
    const { admin, urls, res } = await runF6({ body: { id } });
    assert.equal(res.statusCode, 200, `id=${JSON.stringify(id)}`);
    assert.equal(urls.length, 0, `0 GET per id=${JSON.stringify(id)}`);
    assert.equal(admin.__rpcCalls.length, 0, `0 RPC per id=${JSON.stringify(id)}`);
  }
});

test('F6 T3/T4: path traversal / slash / backslash / encoded / query / control chars / troppo lungo -> 0 GET, 0 RPC', async () => {
  const bad = [
    '../../v0.1/me', '..', '.', 'x/../co-f6', 'a/b', '..\\..\\v0.1\\me', '%2e%2e/%2e%2e/v0.1/me',
    '..%2F..%2Fv0.1%2Fme', 'co-f6%2f', 'co-f6?x=1', 'co-f6#frag', 'co f6', 'co-f6\n', 'co\tf6', 'co\u0000f6',
    'co-f6\u007f', 'a'.repeat(129),
  ];
  for (const id of bad) {
    const { admin, urls, res } = await runF6({ body: { id } });
    assert.equal(res.statusCode, 200, `id=${JSON.stringify(id)}`);
    assert.equal(urls.length, 0, `0 GET per id=${JSON.stringify(id)}`);
    assert.equal(admin.__rpcCalls.length, 0, `0 RPC per id=${JSON.stringify(id)}`);
  }
});

test('F6 T5: id sintatticamente valido ma assente dal DB -> 0 GET, 0 mutation, 0 ingest', async () => {
  const { admin, urls, res } = await runF6({ body: { id: 'co-unknown' }, attempt: null });
  assert.equal(res.statusCode, 200);
  assert.equal(urls.length, 0);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('F6: errore tecnico del lookup DB -> 500 (SumUp ritenta), 0 GET, 0 RPC/ingest', async () => {
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: null, error: { message: 'db down' } } },
    rpc: { kitchen_payment_webhook_ingest: { data: {}, error: null } },
  });
  const urls = [];
  const res = makeRes();
  await withFetch(async (url) => { urls.push(String(url)); return jsonFetchResponse(200, F6_CHECKOUT); }, async () => {
    await withAdmin(admin, async () => { await webhookHandler(makeReq({ body: { id: 'co-f6' } }), res); });
  });
  assert.equal(res.statusCode, 500);
  assert.equal(urls.length, 0);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('F6 T6: attempt non-SumUp / non-charge / provider_ref incompatibile -> denied, 0 GET', async () => {
  for (const attempt of [
    { ...F6_ATTEMPT, provider: 'cash' },
    { ...F6_ATTEMPT, direction: 'refund' },
    { ...F6_ATTEMPT, provider_ref: 'co-other' },
    { ...F6_ATTEMPT, provider_ref: null },
  ]) {
    const { admin, urls, res } = await runF6({ body: { id: 'co-f6' }, attempt });
    assert.equal(res.statusCode, 200);
    assert.equal(urls.length, 0, JSON.stringify(attempt));
    assert.equal(admin.__rpcCalls.length, 0, JSON.stringify(attempt));
  }
});

test('F6 T7: attempt SumUp valido -> GET solo del checkout DB-bound (provider_ref dal DB, encoded)', async () => {
  const { urls, res } = await runF6({ body: { id: 'co-f6' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(urls, ['https://api.sumup.com/v0.1/checkouts/co-f6']);
});

test('F6 T8: risposta con checkout.id diverso -> 0 mutation, 0 ingest', async () => {
  const { admin, urls, res } = await runF6({ body: { id: 'co-f6' }, checkout: { ...F6_CHECKOUT, id: 'co-evil' } });
  assert.equal(res.statusCode, 200);
  assert.equal(urls.length, 1);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('F6 T9: checkout_reference diverso dall\'attempt -> 0 mutation, 0 ingest', async () => {
  for (const ref of ['att-other', undefined, null]) {
    const { admin, res } = await runF6({ body: { id: 'co-f6' }, checkout: { ...F6_CHECKOUT, checkout_reference: ref } });
    assert.equal(res.statusCode, 200);
    assert.equal(admin.__rpcCalls.length, 0, `ref=${ref}`);
  }
});

test('F6 T10: PAID valido -> ingest poi confirm con provider_ref = quello del DB', async () => {
  const { admin, res } = await runF6({ body: { id: 'co-f6' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(rpcNames(admin), ['kitchen_payment_webhook_ingest', 'kitchen_payment_confirm']);
  const confirm = admin.__rpcCalls[1].params;
  assert.equal(confirm.p_attempt_id, 'att-f6');
  assert.equal(confirm.p_provider_ref, 'co-f6');
  assert.equal(admin.__rpcCalls[0].params.p_provider_event_id, 'co-f6:PAID');
});

test('F6 T11: PENDING -> solo ingest; FAILED/EXPIRED -> ingest + fail', async () => {
  const pending = await runF6({ body: { id: 'co-f6' }, checkout: { ...F6_CHECKOUT, status: 'PENDING' } });
  assert.deepEqual(rpcNames(pending.admin), ['kitchen_payment_webhook_ingest']);
  for (const st of ['FAILED', 'EXPIRED']) {
    const r = await runF6({ body: { id: 'co-f6' }, checkout: { ...F6_CHECKOUT, status: st } });
    assert.deepEqual(rpcNames(r.admin), ['kitchen_payment_webhook_ingest', 'kitchen_payment_fail']);
    assert.equal(r.admin.__rpcCalls[1].params.p_reason, `sumup_${st.toLowerCase()}`);
  }
});

test('F6 T12: duplicate callback su attempt gia succeeded/cancelled -> 0 GET, 0 RPC', async () => {
  for (const status of ['succeeded', 'cancelled']) {
    const { admin, urls, res } = await runF6({ body: { id: 'co-f6' }, attempt: { ...F6_ATTEMPT, status } });
    assert.equal(res.statusCode, 200);
    assert.equal(urls.length, 0);
    assert.equal(admin.__rpcCalls.length, 0);
  }
});

test('F6 T13: PAID con amount mismatch -> fail sumup_amount_mismatch, mai confirm; lost_race invariato; GET non-2xx -> 502', async () => {
  const mm = await runF6({ body: { id: 'co-f6' }, checkout: { ...F6_CHECKOUT, amount: 999 } });
  assert.equal(mm.res.statusCode, 200);
  assert.equal(rpcNames(mm.admin).includes('kitchen_payment_confirm'), false);
  assert.equal(mm.admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_fail').params.p_reason, 'sumup_amount_mismatch');

  const lr = await runF6({
    body: { id: 'co-f6' },
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { id: 'winner' }, error: null },
    },
  });
  assert.equal(lr.res.statusCode, 200);

  const bad = await runF6({ body: { id: 'co-f6' }, fetchStatus: 500, checkout: { error: 'x' } });
  assert.equal(bad.res.statusCode, 502);
  assert.equal(bad.admin.__rpcCalls.length, 0);
});

test('F6 T14 (static): nessun fetch SumUp prima del lookup DB; URL con encodeURIComponent; nessun override di checkout.id', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'api/kitchen-sumup-webhook.js'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const fetchIdx = code.indexOf('await fetch(');
  const dbIdx = code.indexOf(".from('kitchen_payments')");
  const ingestIdx = code.indexOf("rpc('kitchen_payment_webhook_ingest'");
  const bindIdx = code.indexOf('checkout.checkout_reference !== attempt.id');
  assert.ok(dbIdx > -1 && fetchIdx > dbIdx, 'il lookup DB deve precedere ogni fetch');
  assert.equal(code.split('fetch(').length - 1, 1, 'un solo fetch nel webhook');
  assert.ok(bindIdx > fetchIdx && ingestIdx > bindIdx, 'ingest solo dopo il binding post-GET');
  assert.match(code, /checkouts\/\$\{encodeURIComponent\(checkoutId\)\}/);
  assert.doesNotMatch(code, /\.\.\.checkout, id:/);
  assert.match(code, /const checkoutId = attempt\.provider_ref;/);
});

// ================================================================================================
// Test #10 — "browser return non equivale a payment success" (static source check)
// ================================================================================================

test('CustomerOrderStatus: il redirect ?sumup=return non conferma nulla da solo, deve sempre passare da /api/kitchen-sumup-reconcile', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'src/pages/CustomerOrderStatus.jsx'), 'utf8');
  // Il client non chiama mai le RPC di conferma/fallimento direttamente.
  assert.doesNotMatch(src, /kitchen_payment_confirm/);
  assert.doesNotMatch(src, /kitchen_payment_fail/);
  // Lo stato 'verifying' deve sempre innescare una chiamata server-side autoritativa.
  const verifyingEffectIdx = src.indexOf("sumup.state !== 'verifying'");
  assert.ok(verifyingEffectIdx > -1, "deve esistere un effect che reagisce allo stato 'verifying'");
  const afterVerifying = src.slice(verifyingEffectIdx, verifyingEffectIdx + 800);
  assert.match(afterVerifying, /\/api\/kitchen-sumup-reconcile/);
});

// ================================================================================================
// S0.5 F5 — URL SumUp da VERCEL_PROJECT_PRODUCTION_URL, solo Production, mai Host/X-Forwarded-*
// ================================================================================================

const F5_RPC = {
  kitchen_payment_attempt_claim_checkout: { data: { id: 'att-f4' }, error: null },
  kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
};

async function runF5({ env = {}, headers = AUTH_HEADERS, ...rest } = {}) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k];
  }
  const sent = [];
  try {
    const out = await runF4({
      headers, rpc: F5_RPC, ...rest,
      fetchImpl: async (url, opts) => {
        if (isListUrl(url)) return jsonFetchResponse(200, []);
        if (opts?.body) sent.push(JSON.parse(opts.body));
        return jsonFetchResponse(200, { id: 'co-f4', hosted_checkout_url: 'https://pay.sumup.com/f4' });
      },
    });
    return { ...out, sent };
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
}

function assertFailClosed({ res, fetchCalls, mutations }) {
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'checkout_origin_unavailable');
  assert.equal(fetchCalls.length, 0);
  assert.equal(mutations.length, 0);
}

test('F5 T1/T2: Production + URL valido -> redirect_url e return_url usano esattamente l\'origin HTTPS production', async () => {
  const { res, sent } = await runF5();
  assert.equal(res.statusCode, 200);
  assert.equal(sent[0].redirect_url, 'https://prod.example.com/kitchen/status?orderId=ord-f4&sumup=return');
  assert.equal(sent[0].return_url, 'https://prod.example.com/api/kitchen-sumup-webhook');
});

test('F5 T3/T4/T5: Host, X-Forwarded-Host, X-Forwarded-Proto ostili/multipli/malformed non influenzano gli URL SumUp', async () => {
  const hostile = {
    ...AUTH_HEADERS,
    host: 'evil.com',
    'x-forwarded-host': 'evil.com, evil2.com:8080/x?y=1#z',
    'x-forwarded-proto': 'javascript, http',
  };
  const { res, sent } = await runF5({ headers: hostile });
  assert.equal(res.statusCode, 200);
  assert.equal(sent[0].redirect_url, 'https://prod.example.com/kitchen/status?orderId=ord-f4&sumup=return');
  assert.equal(sent[0].return_url, 'https://prod.example.com/api/kitchen-sumup-webhook');
  assert.ok(!JSON.stringify(sent[0]).includes('evil'));
});

test('F5 T6: Production senza VERCEL_PROJECT_PRODUCTION_URL -> fail closed, 0 fetch, 0 mutation', async () => {
  assertFailClosed(await runF5({ env: { VERCEL_PROJECT_PRODUCTION_URL: undefined } }));
});

test('F5 T7: Production con production URL invalido -> fail closed, 0 fetch, 0 mutation', async () => {
  for (const bad of ['', 'https://prod.example.com', 'prod.example.com/path', 'prod.example.com?x=1', 'prod.example.com#f', 'a.com b.com', 'a.com,b.com', 'localhost', 'user@evil.com', 'prod.example.com:8080']) {
    assertFailClosed(await runF5({ env: { VERCEL_PROJECT_PRODUCTION_URL: bad } }));
  }
});

test('F5 T8: Preview con credenziali SumUp presenti -> fail closed, 0 fetch, 0 mutation', async () => {
  assertFailClosed(await runF5({ env: { VERCEL_ENV: 'preview' } }));
});

test('F5 T9: Development / locale (VERCEL_ENV development o assente) -> fail closed', async () => {
  assertFailClosed(await runF5({ env: { VERCEL_ENV: 'development' } }));
  assertFailClosed(await runF5({ env: { VERCEL_ENV: undefined } }));
});

test('F5 T9b: percorso riuso (provider_ref) fuori Production -> fail closed prima della GET SumUp', async () => {
  assertFailClosed(await runF5({ env: { VERCEL_ENV: 'preview' }, attempt: f4Attempt({ provider_ref: 'co-existing' }) }));
});

test('F5 T10/T11: auth e amount mismatch bloccano prima del controllo origin (anche in Preview)', async () => {
  const noAuth = await runF5({ env: { VERCEL_ENV: 'preview' }, headers: {} });
  assert.equal(noAuth.res.statusCode, 401);
  const mismatch = await runF5({ env: { VERCEL_ENV: 'preview' }, order: f4Order({ total: 99 }) });
  assert.equal(mismatch.res.statusCode, 409);
  assert.equal(mismatch.res.body.error, 'amount_mismatch');
  assert.equal(mismatch.fetchCalls.length, 0);
});

test('F5 T12: riuso provider_ref autorizzato in Production invariato', async () => {
  const { res, fetchCalls, mutations } = await runF4({
    attempt: f4Attempt({ provider_ref: 'co-existing' }),
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-existing', status: 'PENDING', amount: 10, checkout_reference: 'att-f4', hosted_checkout_url: 'https://pay.sumup.com/reuse' }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.hosted_checkout_url, 'https://pay.sumup.com/reuse');
  assert.equal(fetchCalls.length, 1);
  assert.equal(mutations.length, 0);
});

test('F5: sorgente create-checkout non legge piu Host / X-Forwarded-* ne VERCEL_URL', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(src, /x-forwarded|headers\.host|VERCEL_URL/i);
});


// ================================================================================================
// S0.5 F7 — timeout SumUp + List-first recovery + 409 DUPLICATED_CHECKOUT recovery
// ================================================================================================

const F7_URL = 'https://api.sumup.com/v0.1/checkouts';
const F7_RPC = {
  kitchen_payment_attempt_claim_checkout: { data: { id: 'att-f4' }, error: null },
  kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
};
const F7_HOSTED = { id: 'co-f7', hosted_checkout_url: 'https://pay.sumup.com/f7' };
const F7_EXISTING = { id: 'co-f7', status: 'PENDING', amount: 10, checkout_reference: 'att-f4', hosted_checkout_url: 'https://pay.sumup.com/existing' };
const timeoutErr = () => Object.assign(new Error('timeout'), { name: 'TimeoutError' });

// router: list / post / get (by id). Ogni handler e una funzione o un valore (response).
async function runF7({ list, post, get, rpc = F7_RPC, attempt = f4Attempt() } = {}) {
  const calls = [];
  const out = await runF4({
    rpc, attempt,
    fetchImpl: async (url, opts) => {
      const u = String(url);
      const kind = isListUrl(u) ? 'list' : opts?.method === 'POST' ? 'post' : 'get';
      calls.push({ kind, url: u, opts });
      const h = { list, post, get }[kind];
      const r = typeof h === 'function' ? await h() : h;
      return r;
    },
  });
  const count = (k) => calls.filter((c) => c.kind === k).length;
  const rpcCount = (n) => out.admin.__rpcCalls.filter((c) => c.name === n).length;
  return { ...out, calls, count, rpcCount };
}
const noPostNoFail = (r) => {
  assert.equal(r.count('post'), 0, '0 POST');
  assert.equal(r.rpcCount('kitchen_payment_fail'), 0, '0 kitchen_payment_fail');
};

test('F7 T1: List timeout -> 503 checkout_outcome_unknown retryable, 0 POST', async () => {
  const r = await runF7({ list: () => { throw timeoutErr(); } });
  assert.equal(r.res.statusCode, 503);
  assert.equal(r.res.body.error, 'checkout_outcome_unknown');
  assert.equal(r.res.body.retryable, true);
  noPostNoFail(r);
});

test('F7 T2: GET riuso timeout -> fail closed esistente (502 sumup_verify_failed), nessuna mutazione', async () => {
  const r = await runF7({ attempt: f4Attempt({ provider_ref: 'co-f7' }), get: () => { throw timeoutErr(); } });
  assert.equal(r.res.statusCode, 502);
  assert.equal(r.res.body.error, 'sumup_verify_failed');
  assert.equal(r.admin.__rpcCalls.length, 0);
  assert.ok(r.calls[0].opts.signal, 'GET con timeout (AbortSignal)');
});

test('F7 T3/T12: POST timeout / TypeError -> 503 UNKNOWN, 0 kitchen_payment_fail, 0 set_provider_ref', async () => {
  for (const err of [timeoutErr(), new TypeError('fetch failed')]) {
    const r = await runF7({ list: jsonFetchResponse(200, []), post: () => { throw err; } });
    assert.equal(r.res.statusCode, 503);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    assert.equal(r.res.body.retryable, true);
    assert.equal(r.count('post'), 1);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
    assert.ok(r.calls.find((c) => c.kind === 'post').opts.signal, 'POST con timeout (AbortSignal)');
  }
});

test('F7 T4: retry successivo, List trova 1 checkout -> set_provider_ref, GET riuso, 200, 0 POST', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, [{ id: 'co-f7', checkout_reference: 'att-f4' }]), get: jsonFetchResponse(200, F7_EXISTING) });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.res.body.hosted_checkout_url, 'https://pay.sumup.com/existing');
  assert.equal(r.count('post'), 0);
  const ref = r.admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref');
  assert.equal(ref.params.p_provider_ref, 'co-f7');
  assert.match(r.calls.find((c) => c.kind === 'get').url, /checkouts\/co-f7$/);
});

test('F7 T5/T18: List [] -> esattamente 1 POST, 201, provider_ref persistito, response invariata', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(201, F7_HOSTED) });
  assert.equal(r.res.statusCode, 200);
  assert.deepEqual(r.res.body, { checkout_id: 'co-f7', hosted_checkout_url: 'https://pay.sumup.com/f7' });
  assert.equal(r.count('post'), 1);
  assert.deepEqual(r.calls.map((c) => c.kind), ['list', 'post']);
  assert.equal(r.admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref').params.p_provider_ref, 'co-f7');
});

test('F7 T6: POST 409 DUPLICATED_CHECKOUT -> List 1 match -> set_provider_ref -> GET riuso -> success, nessuna seconda POST', async () => {
  let listN = 0;
  const r = await runF7({
    list: () => (++listN === 1 ? jsonFetchResponse(200, []) : jsonFetchResponse(200, [{ id: 'co-f7', checkout_reference: 'att-f4' }])),
    post: jsonFetchResponse(409, { error_code: 'DUPLICATED_CHECKOUT' }),
    get: jsonFetchResponse(200, F7_EXISTING),
  });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.res.body.checkout_id, 'co-f7');
  assert.equal(r.count('post'), 1);
  assert.equal(r.count('list'), 2);
  assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 1);
  assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
});

test('F7 T7: 409 DUPLICATED + List ambiguous -> 409 needs_manual_reconciliation, nessuna seconda POST', async () => {
  let listN = 0;
  const r = await runF7({
    list: () => (++listN === 1 ? jsonFetchResponse(200, []) : jsonFetchResponse(200, [{ id: 'a', checkout_reference: 'att-f4' }, { id: 'b', checkout_reference: 'att-f4' }])),
    post: jsonFetchResponse(409, { error_code: 'DUPLICATED_CHECKOUT' }),
  });
  assert.equal(r.res.statusCode, 409);
  assert.equal(r.res.body.error, 'needs_manual_reconciliation');
  assert.equal(r.count('post'), 1);
  assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
});

test('F7 T8: 409 DUPLICATED + recovery not_found / lookup_failed -> 503 UNKNOWN, nessuna seconda POST', async () => {
  for (const second of [() => jsonFetchResponse(200, []), () => jsonFetchResponse(500, {}), () => { throw timeoutErr(); }]) {
    let listN = 0;
    const r = await runF7({
      list: () => (++listN === 1 ? jsonFetchResponse(200, []) : second()),
      post: jsonFetchResponse(409, { error_code: 'DUPLICATED_CHECKOUT' }),
    });
    assert.equal(r.res.statusCode, 503);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    assert.equal(r.res.body.retryable, true);
    assert.equal(r.count('post'), 1);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
  }
});

test('F7 T9: List ambiguous prima della create -> 409 needs_manual_reconciliation, 0 POST', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, [{ id: 'a', checkout_reference: 'att-f4' }, { id: 'b', checkout_reference: 'att-f4' }]) });
  assert.equal(r.res.statusCode, 409);
  assert.equal(r.res.body.error, 'needs_manual_reconciliation');
  noPostNoFail(r);
  assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
});

test('F7 T10: List lookup_failed (5xx / non-array) -> 503 UNKNOWN, 0 POST', async () => {
  for (const list of [jsonFetchResponse(500, {}), jsonFetchResponse(200, { not: 'array' })]) {
    const r = await runF7({ list });
    assert.equal(r.res.statusCode, 503);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    noPostNoFail(r);
  }
});

test('F7 T11: POST start deadline superato (> 6 s dalla claim) -> 503 UNKNOWN, 0 POST', async () => {
  const realNow = Date.now;
  let t = 1_000_000;
  Date.now = () => t;
  try {
    const r = await runF7({
      rpc: { ...F7_RPC, kitchen_payment_attempt_claim_checkout: () => { t += 0; return { data: { id: 'att-f4' }, error: null }; } },
      list: () => { t += 6001; return jsonFetchResponse(200, []); },
    });
    assert.equal(r.res.statusCode, 503);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    assert.equal(r.res.body.retryable, true);
    noPostNoFail(r);
  } finally {
    Date.now = realNow;
  }
});

test('F7 T13: POST 5xx -> 503 UNKNOWN, 0 kitchen_payment_fail, 0 set_provider_ref', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(502, { message: 'bad gateway' }) });
  assert.equal(r.res.statusCode, 503);
  assert.equal(r.res.body.error, 'checkout_outcome_unknown');
  assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
  assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
  assert.equal(r.count('post'), 1);
});

test('F7 T14: POST con body non-JSON (5xx o 2xx) -> 503 UNKNOWN', async () => {
  const nonJson = (status) => ({ ok: status < 300, status, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  for (const status of [200, 201, 502]) {
    const r = await runF7({ list: jsonFetchResponse(200, []), post: nonJson(status) });
    assert.equal(r.res.statusCode, 503, `status ${status}`);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
  }
});

test('F7 T15: 400 / 401 / 403 documentati -> 502 sumup_create_checkout_failed come prima, 1 sola POST', async () => {
  for (const status of [400, 401, 403]) {
    const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(status, { message: 'x' }) });
    assert.equal(r.res.statusCode, 502, `status ${status}`);
    assert.equal(r.res.body.error, 'sumup_create_checkout_failed');
    assert.equal(r.count('post'), 1);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
  }
});

test('F7 T16: 4xx non previsto (404/422/429 e 409 senza DUPLICATED) -> fail conservativo UNKNOWN, nessun retry cieco', async () => {
  const cases = [[404, {}], [422, {}], [429, {}], [409, { error_code: 'OTHER' }]];
  for (const [status, body] of cases) {
    const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(status, body) });
    assert.equal(r.res.statusCode, 503, `status ${status}`);
    assert.equal(r.res.body.error, 'checkout_outcome_unknown');
    assert.equal(r.count('post'), 1, 'nessuna seconda POST');
    assert.equal(r.count('list'), 1, 'nessun recovery per 409 non-DUPLICATED');
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
  }
});

test('F7 T17 (G4): 201 con id ma senza hosted_checkout_url -> set_provider_ref chiamato, poi errore, id non perso', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(201, { id: 'co-f7' }) });
  assert.equal(r.res.statusCode, 502);
  assert.equal(r.res.body.error, 'sumup_create_checkout_failed');
  const ref = r.admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref');
  assert.ok(ref, 'provider_ref persistito');
  assert.equal(ref.params.p_provider_ref, 'co-f7');
  assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
});

test('F7 T19: provider_ref gia presente -> niente claim, niente List, niente POST; solo GET riuso', async () => {
  const r = await runF7({ attempt: f4Attempt({ provider_ref: 'co-f7' }), get: jsonFetchResponse(200, F7_EXISTING) });
  assert.equal(r.res.statusCode, 200);
  assert.deepEqual(r.calls.map((c) => c.kind), ['get']);
  assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 0);
});

test('F7: recovery trovato ma set_provider_ref fallisce -> 503 UNKNOWN, 0 POST', async () => {
  const r = await runF7({
    list: jsonFetchResponse(200, [{ id: 'co-f7', checkout_reference: 'att-f4' }]),
    rpc: { ...F7_RPC, kitchen_payment_attempt_set_provider_ref: { data: null, error: { message: 'db down' } } },
  });
  assert.equal(r.res.statusCode, 503);
  assert.equal(r.res.body.error, 'checkout_outcome_unknown');
  noPostNoFail(r);
});

test('F7: List usa il timeout GET (AbortSignal) e checkout_reference = attempt.id', async () => {
  const r = await runF7({ list: jsonFetchResponse(200, []), post: jsonFetchResponse(201, F7_HOSTED) });
  const list = r.calls.find((c) => c.kind === 'list');
  assert.ok(list.opts.signal);
  assert.equal(list.url, `${F7_URL}?checkout_reference=att-f4`);
});

console.log('sumup-payment-reliability.test.mjs: tutti i test superati.');
