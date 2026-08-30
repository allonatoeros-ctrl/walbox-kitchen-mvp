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

// ================================================================================================
// FASE 1 — create-checkout: race guard "ordine gia pagato" (P1-2 / Test #3)
// ================================================================================================

test('create-checkout: ordine gia pagato tra attempt_start e create-checkout -> 409, checkout mai creato', async () => {
  const admin = makeSupabaseAdminMock({
    tables: {
      kitchen_payments: { data: { id: 'att-1', order_id: 'ord-1', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge' }, error: null },
      kitchen_orders: { data: { id: 'ord-1', payment_status: 'paid' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: {}, error: null } },
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' }); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-1', payment_attempt_id: 'att-1' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-2', order_id: 'ord-2', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { id: 'ord-2', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {
      kitchen_payment_attempt_claim_checkout: { data: { id: 'att-2', provider_ref: null }, error: null },
      kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
    },
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-2', hosted_checkout_url: 'https://pay.sumup.com/y' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-2', payment_attempt_id: 'att-2' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-20', order_id: 'ord-20', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { id: 'ord-20', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_attempt_claim_checkout: { data: null, error: null } },
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(200, { id: 'co-20', hosted_checkout_url: 'https://pay.sumup.com/x' }); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-20', payment_attempt_id: 'att-20' } });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_creation_in_progress');
    });
  });
  assert.equal(sumupCalled, false, 'perdere la claim non deve mai creare un secondo checkout');
});

test('create-checkout: claim RPC perde la race con la reale forma PostgREST (riga composita NULL, non data:null) -> 409, SumUp mai chiamato', async () => {
  // Regressione bug reale trovato in E2E su Preview (2026-08-30): PostgREST serializza una riga
  // composita NULL (0 righe dalla UPDATE atomica della claim) come un oggetto con ogni campo a
  // null (es. { id: null, order_id: null, ... }), MAI come il letterale JSON null. Un check
  // `if (!claimed)` e sempre falso per questa forma (e un oggetto, non null) e tratta erroneamente
  // una race persa come vinta. Verificato a livello SQL diretto su Supabase che
  // row_to_json(claim_fallita) produce esattamente questa forma, non `null`.
  const admin = makeSupabaseAdminMock({
    tables: {
      kitchen_payments: { data: { id: 'att-20b', order_id: 'ord-20b', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null }, error: null },
      kitchen_orders: { data: { id: 'ord-20b', payment_status: 'pending_counter_payment' }, error: null },
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
      const req = makeReq({ body: { order_id: 'ord-20b', payment_attempt_id: 'att-20b' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-21', order_id: 'ord-21', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-21' }, error: null },
      kitchen_orders: { data: { id: 'ord-21', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  const calls = [];
  await withFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method });
    return jsonFetchResponse(200, { id: 'co-21', status: 'PENDING', amount: 10, checkout_reference: 'att-21', hosted_checkout_url: 'https://pay.sumup.com/existing' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-21', payment_attempt_id: 'att-21' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-22', order_id: 'ord-22', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-22' }, error: null },
      kitchen_orders: { data: { id: 'ord-22', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_confirm: { data: { status: 'succeeded' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-22', status: 'PAID', amount: 10, checkout_reference: 'att-22' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-22', payment_attempt_id: 'att-22' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-23', order_id: 'ord-23', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-23' }, error: null },
      kitchen_orders: { data: { id: 'ord-23', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: { status: 'failed' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-23', status: 'FAILED', amount: 10, checkout_reference: 'att-23', hosted_checkout_url: 'https://pay.sumup.com/retry-same' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-23', payment_attempt_id: 'att-23' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-24', order_id: 'ord-24', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-24' }, error: null },
      kitchen_orders: { data: { id: 'ord-24', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: { kitchen_payment_fail: { data: { status: 'failed' }, error: null } },
  });

  let postCalled = false;
  await withFetch(async (url, opts) => {
    if (opts?.method === 'POST') postCalled = true;
    return jsonFetchResponse(200, { id: 'co-24', status: 'EXPIRED', amount: 10, checkout_reference: 'att-24' });
  }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-24', payment_attempt_id: 'att-24' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-25', order_id: 'ord-25', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-25' }, error: null },
      kitchen_orders: { data: { id: 'ord-25', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => { throw new Error('network down'); }, async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-25', payment_attempt_id: 'att-25' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-26', order_id: 'ord-26', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-26' }, error: null },
      kitchen_orders: { data: { id: 'ord-26', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-26', status: 'PENDING', amount: 10, checkout_reference: 'someone-elses-attempt', hosted_checkout_url: 'https://pay.sumup.com/z' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-26', payment_attempt_id: 'att-26' } });
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
    tables: {
      kitchen_payments: { data: { id: 'att-27', order_id: 'ord-27', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-27' }, error: null },
      kitchen_orders: { data: { id: 'ord-27', payment_status: 'pending_counter_payment' }, error: null },
    },
    rpc: {},
  });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-27', status: 'PENDING', amount: 10, checkout_reference: 'att-27' }), async () => {
    await withAdmin(admin, async () => {
      const req = makeReq({ body: { order_id: 'ord-27', payment_attempt_id: 'att-27' } });
      const res = makeRes();
      await createCheckoutHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'checkout_retry_unavailable');
    });
  });
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
  const attempt = { id: 'att-17', amount: 10, provider: 'sumup', status: 'failed', failure_reason: 'sumup_failed' };
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
  const attempt = { id: 'att-18', amount: 10, provider: 'sumup', status: 'succeeded' };
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
  const attempt = { id: 'att-13', amount: 10, provider: 'sumup', status: 'initiated' };
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

console.log('sumup-payment-reliability.test.mjs: tutti i test superati.');
