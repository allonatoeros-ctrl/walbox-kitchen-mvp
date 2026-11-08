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
    // Hook client (src/hooks/useOrderPaymentFlow.js): stub di react / client supabase / appVersion,
    // cosi l'hook gira in node senza import.meta.env, DOM o rete. Solo per quell'importer.
    if (importer && importer.includes('useOrderPaymentFlow')) {
      if (source === 'react') return '\0virtual:fakeReact';
      if (/lib\/supabaseClient(\.js)?$/.test(source)) return '\0virtual:hookSupabaseClient';
      if (/lib\/appVersion(\.js)?$/.test(source)) return '\0virtual:hookAppVersion';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseJs') {
      return `export function createClient() { return globalThis.__SUMUP_TEST_ADMIN__(); }`;
    }
    if (id === '\0virtual:hookSupabaseClient') {
      return `export const supabase = new Proxy({}, { get: (_t, k) => globalThis.__HOOK_SUPABASE__[k] });`;
    }
    if (id === '\0virtual:hookAppVersion') {
      return `export async function reloadIfStale() { return globalThis.__HOOK_RELOAD__ ? globalThis.__HOOK_RELOAD__() : false; }`;
    }
    if (id === '\0virtual:fakeReact') {
      // Mini runtime: slot per useState/useRef in ordine di chiamata; useEffect registrato, mai eseguito da solo.
      return `
        const rt = () => globalThis.__HOOK_RT__;
        export function useState(init) {
          const r = rt(); const i = r.idx++;
          if (!(i in r.slots)) r.slots[i] = { v: typeof init === 'function' ? init() : init };
          return [r.slots[i].v, (n) => { r.slots[i].v = typeof n === 'function' ? n(r.slots[i].v) : n; }];
        }
        export function useRef(init) {
          const r = rt(); const i = r.idx++;
          if (!(i in r.slots)) r.slots[i] = { v: { current: init } };
          return r.slots[i].v;
        }
        export function useEffect(fn) { rt().effects.push(fn); }
      `;
    }
  },
};

let server;
let createCheckoutHandler;
let webhookHandler;
let reconcileHandler;
let startSumupCheckout;
let useOrderPaymentFlow;

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js', 'react'] },
    server: { middlewareMode: true },
  });
  ({ default: createCheckoutHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js')));
  ({ default: webhookHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-webhook.js')));
  ({ default: reconcileHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-reconcile.js')));
  ({ startSumupCheckout, useOrderPaymentFlow } = await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useOrderPaymentFlow.js')));
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
    rpc: { kitchen_payment_confirm: { data: { id: 'att-22', status: 'succeeded' }, error: null } },
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

// ---- lost_race: SumUp ha incassato (PAID) ma il pagamento cassa ha gia vinto lo slot "un solo charge succeeded per ordine".
// kitchen_payment_confirm restituisce la riga del VINCITORE (id diverso dall'attempt) -> applySumupCheckoutResult = 'lost_race'.
// Gli altri endpoint (reconcile / staff-reconcile / webhook) rispondono "non confermato, riconciliazione manuale" e loggano.
async function runCreateCheckoutLostRace({ withHostedUrl }) {
  const admin = makeSupabaseAdminMock({
    authUser: CALLER_AUTH,
    tables: {
      kitchen_payments: { data: { id: 'att-lr', order_id: 'ord-lr', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: 'co-lr' }, error: null },
      kitchen_orders: { data: { customer_id: CALLER_ID, id: 'ord-lr', total: 10, payment_status: 'pending_counter_payment' }, error: null },
    },
    // Riga di un ALTRO pagamento (cassa) gia succeeded sullo stesso ordine.
    rpc: { kitchen_payment_confirm: { data: { id: 'pay-cassa-winner', order_id: 'ord-lr', status: 'succeeded', method: 'cash' }, error: null } },
  });
  const calls = [];
  const res = makeRes();
  await withFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method ?? 'GET' });
    return jsonFetchResponse(200, {
      id: 'co-lr', status: 'PAID', amount: 10, checkout_reference: 'att-lr',
      ...(withHostedUrl ? { hosted_checkout_url: 'https://pay.sumup.com/already-paid' } : {}),
    });
  }, () => withAdmin(admin, () => createCheckoutHandler(makeReq({ body: { order_id: 'ord-lr', payment_attempt_id: 'att-lr' }, headers: AUTH_HEADERS }), res)));
  return { admin, calls, res };
}

test('create-checkout: lost_race (cassa ha vinto, SumUp PAID) -> nessuna POST di creazione checkout', async () => {
  const { admin, calls } = await runCreateCheckoutLostRace({ withHostedUrl: true });
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'mai un nuovo checkout');
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), 'tenta comunque la confirm (e il DB a decidere il vincitore)');
});

// K3 (Passo 4): erano `todo`, ora test normali.
test('create-checkout: lost_race -> NON consegna un hosted_checkout_url di un checkout gia incassato (200 con URL = doppio pagamento)', async () => {
  const { res } = await runCreateCheckoutLostRace({ withHostedUrl: true });
  assert.notEqual(res.statusCode, 200, `risposta ${res.statusCode} ${JSON.stringify(res.body)}`);
  assert.equal(res.body?.hosted_checkout_url, undefined, 'nessun URL di pagamento per un checkout PAID');
});

test('create-checkout: lost_race -> segnala riconciliazione manuale (409 needs_manual_reconciliation, come il ramo ambiguous)', async () => {
  const { res } = await runCreateCheckoutLostRace({ withHostedUrl: false });
  assert.equal(res.statusCode, 409, `risposta ${res.statusCode} ${JSON.stringify(res.body)}`);
  assert.equal(res.body?.error, 'needs_manual_reconciliation');
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

// ---- Hook client (src/hooks/useOrderPaymentFlow.js) eseguito davvero in node: react / supabaseClient /
// appVersion sono stub del plugin vite in cima al file. Nessuna rete reale: fetch e globalThis.fetch mockato.
function hookSupabase({ attempt, attemptError = null, session = { access_token: 'tok-abc' } } = {}) {
  const rpcCalls = [];
  globalThis.__HOOK_SUPABASE__ = {
    auth: {
      getSession: async () => ({ data: { session } }),
      signInAnonymously: async () => ({ data: { session: null }, error: null }),
    },
    rpc: async (name, params) => { rpcCalls.push({ name, params }); return { data: attempt, error: attemptError }; },
  };
  globalThis.__HOOK_RELOAD__ = async () => false;
  return rpcCalls;
}

test('startSumupCheckout: attempt_start ritorna un attempt failed -> { kind: pending } e create-checkout MAI chiamato (niente CTA unsafe)', async () => {
  const rpcCalls = hookSupabase({ attempt: { id: 'att-h1', status: 'failed' } });
  const fetchCalls = [];
  const result = await withFetch(async (url, opts) => { fetchCalls.push({ url: String(url), opts }); return jsonFetchResponse(200, { hosted_checkout_url: 'https://pay.sumup.com/x' }); }, () => startSumupCheckout('ord-h1', 10));
  assert.deepEqual(result, { kind: 'pending' });
  assert.equal(fetchCalls.length, 0, 'zero fetch: nessuna chiamata a create-checkout per un attempt failed');
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'kitchen_payment_attempt_start');
});

test('startSumupCheckout: attempt initiated -> 1 sola POST a create-checkout con Bearer + body {order_id, payment_attempt_id}, ritorna redirect', async () => {
  const rpcCalls = hookSupabase({ attempt: { id: 'att-h2', status: 'initiated' } });
  const fetchCalls = [];
  const result = await withFetch(async (url, opts) => { fetchCalls.push({ url: String(url), opts }); return jsonFetchResponse(200, { checkout_id: 'co-h2', hosted_checkout_url: 'https://pay.sumup.com/h2' }); }, () => startSumupCheckout('ord-h2', 12.5));
  assert.deepEqual(result, { kind: 'redirect', url: 'https://pay.sumup.com/h2' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/kitchen-sumup-create-checkout');
  assert.equal(fetchCalls[0].opts.method, 'POST');
  assert.equal(fetchCalls[0].opts.headers.Authorization, 'Bearer tok-abc');
  assert.deepEqual(JSON.parse(fetchCalls[0].opts.body), { order_id: 'ord-h2', payment_attempt_id: 'att-h2' });
  assert.deepEqual({ ...rpcCalls[0].params, p_idempotency_key: 'ANY' }, {
    p_order_id: 'ord-h2', p_channel: 'app', p_provider: 'sumup', p_method: 'sumup_online', p_amount: 12.5, p_idempotency_key: 'ANY',
  });
});

test('startSumupCheckout: create-checkout risponde !ok -> lancia il codice errore del server, nessun redirect', async () => {
  hookSupabase({ attempt: { id: 'att-h3', status: 'initiated' } });
  await withFetch(async () => jsonFetchResponse(409, { error: 'order_already_paid' }), async () => {
    await assert.rejects(() => startSumupCheckout('ord-h3', 10), /order_already_paid/);
  });
});

test('startSumupCheckout: 200 ma senza hosted_checkout_url -> lancia (mai un redirect senza URL)', async () => {
  hookSupabase({ attempt: { id: 'att-h4', status: 'initiated' } });
  await withFetch(async () => jsonFetchResponse(200, { checkout_id: 'co-h4' }), async () => {
    await assert.rejects(() => startSumupCheckout('ord-h4', 10));
  });
});

test('startSumupCheckout: attempt_start in errore -> lancia e create-checkout MAI chiamato', async () => {
  hookSupabase({ attempt: null, attemptError: new Error('online_payment_expired') });
  let fetched = 0;
  await withFetch(async () => { fetched += 1; return jsonFetchResponse(200, {}); }, async () => {
    await assert.rejects(() => startSumupCheckout('ord-h5', 10), /online_payment_expired/);
  });
  assert.equal(fetched, 0);
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

// Passo 4: 'cancelled' non e piu un no-op senza GET (un PAID dopo annullo va verificato): vedi i test K2 api.
test('F6 T12: duplicate callback su attempt gia succeeded -> 0 GET, 0 RPC', async () => {
  for (const checkoutStatus of ['PAID', 'FAILED', 'EXPIRED', 'PENDING']) {
    const { admin, urls, res } = await runF6({ body: { id: 'co-f6' }, attempt: { ...F6_ATTEMPT, status: 'succeeded' }, checkout: { ...F6_CHECKOUT, status: checkoutStatus } });
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

// Render "a mano" dell'hook con il mini runtime react del plugin: render() riesegue l'hook mantenendo gli slot;
// runEffects() esegue gli effect registrati nell'ultimo render (come al mount); document stubbato per il listener visibilita.
function mountPaymentFlow(order, isReturnTarget) {
  globalThis.__HOOK_RT__ = { idx: 0, slots: {}, effects: [] };
  globalThis.document = { visibilityState: 'hidden', addEventListener() {}, removeEventListener() {} };
  const render = () => { const rt = globalThis.__HOOK_RT__; rt.idx = 0; rt.effects = []; return useOrderPaymentFlow(order, isReturnTarget); };
  const runEffects = async () => {
    for (const fn of globalThis.__HOOK_RT__.effects) fn();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { render, runEffects };
}
const HOOK_ORDER = { id: 'ord-ret', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', total: 10, createdAt: '2026-11-01T10:00:00Z' };

async function runReturnFlow({ reconcileResponse, isReturnTarget = true, session }) {
  const rpcCalls = hookSupabase({ attempt: null, ...(session === undefined ? {} : { session }) });
  const fetchCalls = [];
  const h = mountPaymentFlow(HOOK_ORDER, isReturnTarget);
  const initial = h.render().sumup.state;
  await withFetch(async (url, opts) => { fetchCalls.push({ url: String(url), opts }); return reconcileResponse(); }, async () => {
    await h.runEffects();
  });
  return { initialState: initial, finalState: h.render().sumup, fetchCalls, rpcCalls };
}

test('hook: ritorno ?sumup=return -> parte in "verifying" e chiama SOLO /api/kitchen-sumup-reconcile con Bearer (il client non conferma mai da solo)', async () => {
  const r = await runReturnFlow({ reconcileResponse: () => jsonFetchResponse(200, { outcome: 'confirmed', retryable: false }) });
  assert.equal(r.initialState, 'verifying', 'il ritorno dal browser non prova nulla: stato iniziale verifying, non confirmed');
  assert.equal(r.fetchCalls.length, 1);
  assert.equal(r.fetchCalls[0].url, '/api/kitchen-sumup-reconcile');
  assert.equal(r.fetchCalls[0].opts.headers.Authorization, 'Bearer tok-abc');
  assert.deepEqual(JSON.parse(r.fetchCalls[0].opts.body), { order_id: 'ord-ret' });
  assert.equal(r.rpcCalls.length, 0, 'nessuna RPC (confirm/fail/attempt_start) dal client');
  assert.equal(r.finalState.state, 'confirmed');
});

for (const [outcome, expected] of [['already_paid', 'confirmed'], ['pending', 'pending'], ['failed', 'error'], ['no_pending_attempt', 'idle'], ['unknown', 'unknown'], ['qualcosa_di_nuovo', 'unknown']]) {
  test(`hook: reconcile risponde outcome=${outcome} -> stato client "${expected}"`, async () => {
    const r = await runReturnFlow({ reconcileResponse: () => jsonFetchResponse(200, { outcome, retryable: false }) });
    assert.equal(r.finalState.state, expected);
    assert.equal(r.rpcCalls.length, 0);
  });
}

test('hook: reconcile HTTP !ok (es. 500) -> stato "unknown", mai "confirmed"', async () => {
  const r = await runReturnFlow({ reconcileResponse: () => jsonFetchResponse(500, { error: 'internal_server_error' }) });
  assert.equal(r.finalState.state, 'unknown');
});

test('hook: fetch reconcile in errore di rete -> stato "unknown", mai "confirmed"', async () => {
  const r = await runReturnFlow({ reconcileResponse: () => { throw new TypeError('network down'); } });
  assert.equal(r.finalState.state, 'unknown');
});

test('hook: nessuna sessione al ritorno -> "unknown" e ZERO fetch', async () => {
  const r = await runReturnFlow({ reconcileResponse: () => jsonFetchResponse(200, { outcome: 'confirmed' }), session: null });
  assert.equal(r.finalState.state, 'unknown');
  assert.equal(r.fetchCalls.length, 0);
});

test('hook: ordine NON bersaglio del ritorno (isReturnTarget=false) -> stato idle e nessuna reconcile automatica', async () => {
  const r = await runReturnFlow({ isReturnTarget: false, reconcileResponse: () => jsonFetchResponse(200, { outcome: 'confirmed' }) });
  assert.equal(r.initialState, 'idle');
  assert.equal(r.fetchCalls.length, 0);
  assert.equal(r.finalState.state, 'idle');
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

// ================================================================================================
// Test di COMPORTAMENTO sui casi limite di incasso (pagamento tardivo, duplicati, annullo, timeout).
// Nota: le regole di eleggibilita per status/failure_reason vivono NEL DB (kitchen_payment_confirm /
// kitchen_payment_fail, 20261012100000 / 20260830101227): qui si prova cosa fa il livello applicativo
// (api/*.js) e come reagisce a cio che l'RPC risponde. Il comportamento SQL reale non e testabile con mock.
// ================================================================================================

async function runWebhook({ attempts, attempt, checkout, rpc, fetchImpl, body, times = 1 } = {}) {
  const admin = makeSupabaseAdminMock({
    tables: { kitchen_payments: { data: attempt, error: null } , ...(attempts ? { kitchen_payments: attempts.map((a) => ({ data: a, error: null })) } : {}) },
    rpc: rpc ?? {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: { id: (attempt ?? attempts[0]).id, status: 'succeeded' }, error: null },
      kitchen_payment_fail: { data: {}, error: null },
    },
  });
  const fetchCalls = [];
  const responses = [];
  await withFetch(async (url, opts) => {
    fetchCalls.push({ url: String(url), method: opts?.method ?? 'GET' });
    if (fetchImpl) return fetchImpl(url, opts);
    return jsonFetchResponse(200, checkout);
  }, async () => {
    await withAdmin(admin, async () => {
      for (let i = 0; i < times; i += 1) {
        const res = makeRes();
        await webhookHandler(makeReq({ body: body ?? { id: (attempt ?? attempts[0]).provider_ref } }), res);
        responses.push(res);
      }
    });
  });
  const calls = (n) => admin.__rpcCalls.filter((c) => c.name === n);
  return { admin, fetchCalls, responses, res: responses[0], calls };
}
const wAttempt = (over = {}) => ({ id: 'att-w', order_id: 'ord-w', amount: 10, provider: 'sumup', direction: 'charge', provider_ref: 'co-w', status: 'initiated', ...over });
const wPaid = { id: 'co-w', status: 'PAID', amount: 10, checkout_reference: 'att-w' };

// (a) pagamento tardivo
for (const failure_reason of ['abandoned_timeout', 'sumup_failed']) {
  test(`pagamento tardivo: webhook PAID su attempt failed/${failure_reason} -> kitchen_payment_confirm registrato con id attempt e provider_ref`, async () => {
    const attempt = wAttempt({ status: 'failed', failure_reason });
    const r = await runWebhook({ attempt, checkout: wPaid });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.fetchCalls.length, 1, 'una GET autoritativa a SumUp');
    assert.equal(r.calls('kitchen_payment_confirm').length, 1, 'il pagamento tardivo viene registrato');
    assert.equal(r.calls('kitchen_payment_confirm')[0].params.p_attempt_id, 'att-w');
    assert.equal(r.calls('kitchen_payment_confirm')[0].params.p_provider_ref, 'co-w');
    assert.equal(r.calls('kitchen_payment_fail').length, 0);
  });
}

test('pagamento tardivo: il DB rifiuta la confirm (invalid_attempt_status, es. failed/staff_closed_for_counter) -> webhook 500 rpc_failed (SumUp ritenta), mai 200 "ok"', async () => {
  // Documenta: il filtro per failure_reason e solo nel DB; il webhook non lo conosce (la SELECT non legge failure_reason).
  const attempt = wAttempt({ status: 'failed', failure_reason: 'staff_closed_for_counter' });
  const r = await runWebhook({
    attempt, checkout: wPaid,
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: null, error: Object.assign(new Error('invalid_attempt_status'), { code: 'P0001' }) },
    },
  });
  assert.equal(r.res.statusCode, 500);
  assert.equal(r.res.body.error, 'rpc_failed');
});

// (b) webhook duplicato
test('webhook duplicato (sequenziale): 1a consegna conferma, 2a trova attempt succeeded -> 200 senza GET ne altra confirm', async () => {
  const r = await runWebhook({
    attempts: [wAttempt({ status: 'initiated' }), wAttempt({ status: 'succeeded' })],
    checkout: wPaid, times: 2,
    body: { id: 'co-w' },
  });
  assert.deepEqual(r.responses.map((x) => x.statusCode), [200, 200]);
  assert.equal(r.calls('kitchen_payment_confirm').length, 1, 'una sola confirm');
  assert.equal(r.fetchCalls.length, 1, 'una sola GET: la seconda consegna non richiama SumUp');
  assert.equal(r.calls('kitchen_payment_webhook_ingest').length, 1);
});

test('webhook duplicato (concorrente: entrambe leggono initiated) -> stessa chiave di dedup ingest, 2a confirm innocua (stesso id, nessun lost_race, nessun fail)', async () => {
  const r = await runWebhook({ attempt: wAttempt(), checkout: wPaid, times: 2, body: { id: 'co-w' } });
  assert.deepEqual(r.responses.map((x) => x.statusCode), [200, 200]);
  const ingests = r.calls('kitchen_payment_webhook_ingest');
  assert.equal(ingests.length, 2);
  assert.equal(ingests[0].params.p_provider_event_id, 'co-w:PAID');
  assert.equal(ingests[1].params.p_provider_event_id, ingests[0].params.p_provider_event_id, 'stessa chiave => ON CONFLICT lato DB lo rende un no-op');
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
  for (const c of r.calls('kitchen_payment_confirm')) assert.equal(c.params.p_attempt_id, 'att-w');
});

// (c) PAID dopo annullo staff
// Passo 4 (K2 lato api): prima il webhook scartava l'attempt cancelled senza GET (incasso invisibile). Ora AC1-AC8.
test('K2 api AC1: PAID dopo annullo staff (attempt cancelled) -> 1 GET, ingest, 1 confirm con provider_ref = checkout.id, 200', async () => {
  const r = await runWebhook({ attempt: wAttempt({ status: 'cancelled' }), checkout: wPaid });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.fetchCalls.length, 1, 'GET autorevole a SumUp');
  assert.equal(r.calls('kitchen_payment_webhook_ingest').length, 1);
  assert.equal(r.calls('kitchen_payment_confirm').length, 1, 'il PAID viene registrato');
  assert.equal(r.calls('kitchen_payment_confirm')[0].params.p_attempt_id, 'att-w');
  assert.equal(r.calls('kitchen_payment_confirm')[0].params.p_provider_ref, 'co-w');
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
});

for (const st of ['FAILED', 'EXPIRED', 'PENDING']) {
  test(`K2 api AC2: attempt cancelled + GET ${st} -> ingest (prova diagnostica), 0 fail, 0 confirm, 200`, async () => {
    const r = await runWebhook({ attempt: wAttempt({ status: 'cancelled' }), checkout: { ...wPaid, status: st } });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.calls('kitchen_payment_webhook_ingest').length, 1);
    assert.equal(r.calls('kitchen_payment_fail').length, 0, 'kitchen_payment_fail rifiuta cancelled: mai chiamata');
    assert.equal(r.calls('kitchen_payment_confirm').length, 0);
  });
}

for (const failure_reason of ['customer_switched_to_counter', 'staff_closed_for_counter']) {
  test(`K2 api AC4: PAID su attempt failed/${failure_reason} (passato al banco) -> confirm (D1)`, async () => {
    const r = await runWebhook({ attempt: wAttempt({ status: 'failed', failure_reason }), checkout: wPaid });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.calls('kitchen_payment_confirm').length, 1);
    assert.equal(r.calls('kitchen_payment_confirm')[0].params.p_provider_ref, 'co-w');
    assert.equal(r.calls('kitchen_payment_fail').length, 0);
  });
}

test('K2 api AC5 webhook: GET con id o checkout_reference diversi dal legame DB -> 0 confirm, 0 fail, 0 ingest', async () => {
  for (const checkout of [{ ...wPaid, id: undefined }, { ...wPaid, id: '' }, { ...wPaid, id: 'co-altro' }, { ...wPaid, checkout_reference: 'att-altro' }]) {
    const r = await runWebhook({ attempt: wAttempt({ status: 'cancelled' }), checkout, body: { id: 'co-w' } });
    assert.equal(r.res.statusCode, 200, 'binding post-GET: ignorato come oggi');
    assert.equal(r.calls('kitchen_payment_confirm').length, 0);
    assert.equal(r.calls('kitchen_payment_fail').length, 0);
  }
});

test('K2 api AC5 webhook: cancelled + PAID con importo diverso -> 500, 0 fail, 0 confirm (anomalia, ingest conservato)', async () => {
  const r = await runWebhook({ attempt: wAttempt({ status: 'cancelled' }), checkout: { ...wPaid, amount: 99 } });
  assert.equal(r.res.statusCode, 500);
  assert.equal(r.calls('kitchen_payment_webhook_ingest').length, 1);
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
  assert.equal(r.calls('kitchen_payment_confirm').length, 0);
});

test('K2 api AC6: consegna doppia cancelled+PAID -> stessa chiave ingest, nessun fail, ogni confirm sullo stesso attempt', async () => {
  const r = await runWebhook({ attempt: wAttempt({ status: 'cancelled' }), checkout: wPaid, times: 2 });
  assert.deepEqual(r.responses.map((x) => x.statusCode), [200, 200]);
  const ingests = r.calls('kitchen_payment_webhook_ingest');
  assert.equal(ingests[0].params.p_provider_event_id, 'co-w:PAID');
  assert.equal(ingests[1].params.p_provider_event_id, 'co-w:PAID', 'ON CONFLICT lato DB: nessuna seconda riga');
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
  for (const c of r.calls('kitchen_payment_confirm')) {
    assert.equal(c.params.p_attempt_id, 'att-w');
    assert.equal(c.params.p_provider_ref, 'co-w');
  }
});

test('K2 api AC6: payload webhook che dice FAILED ma la GET dice PAID -> conta la GET (confirm, nessun fail)', async () => {
  const r = await runWebhook({ attempt: wAttempt(), checkout: wPaid, body: { id: 'co-w', event_type: 'CHECKOUT_STATUS_CHANGED', status: 'FAILED' } });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.calls('kitchen_payment_confirm').length, 1);
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
});

test('K2 api AC6: FAILED poi PAID sullo stesso checkout (retry carta) -> fail sumup_failed poi confirm, chiavi ingest distinte', async () => {
  let n = 0;
  const r = await runWebhook({
    attempt: wAttempt(),
    times: 2,
    fetchImpl: async () => jsonFetchResponse(200, n++ === 0 ? { ...wPaid, status: 'FAILED' } : wPaid),
  });
  assert.deepEqual(r.responses.map((x) => x.statusCode), [200, 200]);
  assert.deepEqual(r.calls('kitchen_payment_webhook_ingest').map((c) => c.params.p_provider_event_id), ['co-w:FAILED', 'co-w:PAID']);
  assert.equal(r.calls('kitchen_payment_fail')[0].params.p_reason, 'sumup_failed');
  assert.equal(r.calls('kitchen_payment_confirm').length, 1);
});

test('K2 api AC7: cancelled + PAID che perde la gara col banco (lost_race) -> 200, log di riconciliazione, 0 fail', async () => {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push(String(args[0])); };
  try {
    const r = await runWebhook({
      attempt: wAttempt({ status: 'cancelled' }),
      checkout: wPaid,
      rpc: {
        kitchen_payment_webhook_ingest: { data: {}, error: null },
        kitchen_payment_confirm: { data: { id: 'pay-cassa-winner', status: 'succeeded' }, error: null },
        kitchen_payment_fail: { data: {}, error: null },
      },
    });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.calls('kitchen_payment_confirm').length, 1);
    assert.equal(r.calls('kitchen_payment_fail').length, 0);
  } finally {
    console.error = origError;
  }
  assert.ok(errors.some((e) => e.includes('needs manual reconciliation')), 'lost_race non silenzioso nei log');
});

test('K2 api AC8: GET con body non JSON -> 502 sumup_verify_failed, 0 RPC', async () => {
  const r = await runWebhook({ attempt: wAttempt(), fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }) });
  assert.equal(r.res.statusCode, 502);
  assert.equal(r.res.body.error, 'sumup_verify_failed');
  assert.equal(r.admin.__rpcCalls.length, 0);
});

test('K2 api AC8: la GET del webhook ha un timeout esplicito (AbortSignal)', async () => {
  let signal;
  const r = await runWebhook({ attempt: wAttempt(), fetchImpl: async (url, opts) => { signal = opts?.signal; return jsonFetchResponse(200, wPaid); } });
  assert.equal(r.res.statusCode, 200);
  assert.ok(signal instanceof AbortSignal, 'fetch chiamata con signal di timeout');
});

test('K2 api AC8: ingest in errore -> 500 webhook_ingest_failed, 0 confirm/fail', async () => {
  const r = await runWebhook({
    attempt: wAttempt({ status: 'cancelled' }),
    checkout: wPaid,
    rpc: {
      kitchen_payment_webhook_ingest: { data: null, error: { message: 'boom' } },
      kitchen_payment_confirm: { data: { id: 'att-w' }, error: null },
      kitchen_payment_fail: { data: {}, error: null },
    },
  });
  assert.equal(r.res.statusCode, 500);
  assert.equal(r.res.body.error, 'webhook_ingest_failed');
  assert.equal(r.calls('kitchen_payment_confirm').length, 0);
  assert.equal(r.calls('kitchen_payment_fail').length, 0);
});

test('K2 api AC8: confirm in errore su cancelled + PAID -> 500 rpc_failed, mai 200', async () => {
  const r = await runWebhook({
    attempt: wAttempt({ status: 'cancelled' }),
    checkout: wPaid,
    rpc: {
      kitchen_payment_webhook_ingest: { data: {}, error: null },
      kitchen_payment_confirm: { data: null, error: { message: 'invalid_attempt_status' } },
      kitchen_payment_fail: { data: {}, error: null },
    },
  });
  assert.equal(r.res.statusCode, 500);
  assert.equal(r.res.body.error, 'rpc_failed');
});

// AC5 sul resolver condiviso (usato da tutti i 9 chiamanti): nessun fallback come prova di pagamento.
test('K2 api AC5 resolver: PAID senza prova del provider -> throw sumup_checkout_unverified, 0 RPC', async () => {
  const { applySumupCheckoutResult } = await server.ssrLoadModule(path.join(ROOT, 'api/_lib/sumupPaymentResolution.js'));
  const base = { id: 'att-r', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-r' };
  const good = { id: 'co-r', status: 'PAID', amount: 10, checkout_reference: 'att-r' };
  const cases = [
    [base, { ...good, id: undefined }, 'id assente'],
    [base, { ...good, id: '' }, 'id vuoto'],
    [base, { ...good, id: ' co-r ' }, 'id con spazi'],
    [base, { ...good, id: 'co-altro' }, 'id diverso da provider_ref'],
    [base, { ...good, checkout_reference: 'att-altro' }, 'checkout_reference diverso'],
    [base, { ...good, checkout_reference: undefined }, 'checkout_reference assente'],
    [{ ...base, provider_ref: null }, { ...good, id: undefined }, 'provider_ref e id assenti'],
  ];
  const origError = console.error;
  console.error = () => {};
  try {
    for (const [attempt, checkout, label] of cases) {
      const calls = [];
      const admin = { rpc: async (name) => { calls.push(name); return { data: { id: attempt.id }, error: null }; } };
      await assert.rejects(() => applySumupCheckoutResult(admin, attempt, checkout), /sumup_checkout_unverified/, label);
      assert.equal(calls.length, 0, `${label}: nessuna RPC`);
    }
  } finally {
    console.error = origError;
  }
});

test('K2 api AC5 resolver: prova valida -> confirm con p_provider_ref = checkout.id (anche senza provider_ref sull\'attempt)', async () => {
  const { applySumupCheckoutResult } = await server.ssrLoadModule(path.join(ROOT, 'api/_lib/sumupPaymentResolution.js'));
  for (const provider_ref of ['co-r', null]) {
    const calls = [];
    const admin = { rpc: async (name, params) => { calls.push({ name, params }); return { data: { id: 'att-r' }, error: null }; } };
    const out = await applySumupCheckoutResult(admin, { id: 'att-r', amount: 10, provider: 'sumup', status: 'initiated', provider_ref }, { id: 'co-r', status: 'PAID', amount: 10, checkout_reference: 'att-r' });
    assert.equal(out.outcome, 'confirmed');
    assert.deepEqual(calls.map((c) => c.name), ['kitchen_payment_confirm']);
    assert.equal(calls[0].params.p_provider_ref, 'co-r');
  }
});

test('K2 api AC5 create-checkout: GET con id diverso da provider_ref -> nessun URL, nessuna confirm, nessuna POST', async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    for (const got of [{ id: 'co-altro' }, { id: undefined }]) {
      const r = await runF4({
        attempt: f4Attempt({ provider_ref: 'co-e' }),
        rpc: { kitchen_payment_confirm: { data: { id: 'att-f4' }, error: null } },
        fetchImpl: async () => jsonFetchResponse(200, { status: 'PAID', amount: 10, checkout_reference: 'att-f4', hosted_checkout_url: 'https://pay.sumup.com/x', ...got }),
      });
      assert.notEqual(r.res.statusCode, 200);
      assert.equal(r.res.body?.hosted_checkout_url, undefined);
      assert.equal(r.admin.__rpcCalls.filter((c) => c.name === 'kitchen_payment_confirm').length, 0);
      assert.equal(r.fetchCalls.length, 1, 'solo la GET, nessuna POST');
    }
  } finally {
    console.error = origError;
  }
});

// (d) FAILED/EXPIRED su attempt gia chiuso per il banco
for (const failure_reason of ['staff_closed_for_counter', 'customer_switched_to_counter']) {
  test(`documenta DIFETTO: webhook FAILED su attempt failed/${failure_reason} chiama kitchen_payment_fail('sumup_failed') -> sovrascrive il motivo`, async () => {
    // Il webhook ammette status 'failed' (finestra retry stesso-checkout) senza guardare failure_reason (la SELECT non lo legge).
    // Lato DB (kitchen_payment_fail, 20260830101227 r.~280-300): se failure_reason cambia, UPDATE ... failure_reason = p_reason.
    // Effetto: failed/sumup_failed e "live" per kitchen_payment_attempt_start (20261012100000 r.~480-486) -> blocca un nuovo attempt
    // (anche cassa) finche un check SumUp non lo cambia. Qui si fissa solo il comportamento applicativo osservabile.
    const r = await runWebhook({
      attempt: wAttempt({ status: 'failed', failure_reason }),
      checkout: { ...wPaid, status: 'FAILED' },
    });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.calls('kitchen_payment_fail').length, 1, 'oggi il webhook ri-applica fail');
    assert.equal(r.calls('kitchen_payment_fail')[0].params.p_reason, 'sumup_failed', 'motivo sovrascritto con sumup_failed (riapre la finestra retry)');
    assert.equal(r.calls('kitchen_payment_confirm').length, 0);
  });
}

test('webhook EXPIRED su attempt failed/staff_closed_for_counter -> fail con motivo sumup_expired (non riapre la finestra retry)', async () => {
  const r = await runWebhook({ attempt: wAttempt({ status: 'failed', failure_reason: 'staff_closed_for_counter' }), checkout: { ...wPaid, status: 'EXPIRED' } });
  assert.equal(r.calls('kitchen_payment_fail')[0].params.p_reason, 'sumup_expired');
});

// (e) checkout fallito + retry
test('create-checkout retry: provider_ref + GET FAILED -> riusa lo STESSO URL; esattamente 1 GET, 0 POST, 0 List, 0 claim, 0 set_provider_ref', async () => {
  const r = await runF4({
    attempt: f4Attempt({ provider_ref: 'co-e' }),
    rpc: { kitchen_payment_fail: { data: {}, error: null } },
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-e', status: 'FAILED', amount: 10, checkout_reference: 'att-f4', hosted_checkout_url: 'https://pay.sumup.com/same-e' }),
  });
  assert.equal(r.res.statusCode, 200);
  assert.deepEqual(r.res.body, { checkout_id: 'co-e', hosted_checkout_url: 'https://pay.sumup.com/same-e' });
  assert.deepEqual(r.fetchCalls, ['https://api.sumup.com/v0.1/checkouts/co-e']);
  assert.deepEqual(r.admin.__rpcCalls.map((c) => c.name), ['kitchen_payment_fail']);
  assert.equal(r.admin.__rpcCalls[0].params.p_reason, 'sumup_failed');
});

// (f) corpo della POST a SumUp
test('create-checkout: corpo/headers/URL della POST a SumUp per un ordine normale (deepEqual completo)', async () => {
  let post = null;
  const r = await runF4({
    rpc: F5_RPC,
    fetchImpl: async (url, opts) => {
      if (isListUrl(url)) return jsonFetchResponse(200, []);
      post = { url: String(url), method: opts.method, headers: opts.headers, body: JSON.parse(opts.body) };
      return jsonFetchResponse(200, { id: 'co-f', hosted_checkout_url: 'https://pay.sumup.com/f' });
    },
  });
  assert.equal(r.res.statusCode, 200);
  assert.equal(post.url, 'https://api.sumup.com/v0.1/checkouts');
  assert.equal(post.method, 'POST');
  assert.deepEqual(post.headers, { Authorization: 'Bearer test-sumup-key', 'Content-Type': 'application/json' });
  assert.deepEqual(post.body, {
    checkout_reference: 'att-f4',
    amount: 10,
    currency: 'EUR',
    merchant_code: 'test-merchant',
    description: 'Walrus Pub — ordine ord-f4',
    redirect_url: 'https://prod.example.com/kitchen/status?orderId=ord-f4&sumup=return',
    return_url: 'https://prod.example.com/api/kitchen-sumup-webhook',
    hosted_checkout: { enabled: true },
  });
});

// (g) timeout / errore di rete
for (const [label, err] of [['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })], ['errore di rete', new TypeError('fetch failed')]]) {
  // Passo 4 (B2): errore esplicito 502 sumup_verify_failed (prima 500 internal_server_error). Non si presume il retry di SumUp.
  test(`webhook: GET SumUp in ${label} -> 502 sumup_verify_failed, nessuna ingest/confirm/fail`, async () => {
    const r = await runWebhook({ attempt: wAttempt(), fetchImpl: async () => { throw err; } });
    assert.equal(r.res.statusCode, 502);
    assert.equal(r.res.body.error, 'sumup_verify_failed');
    assert.equal(r.admin.__rpcCalls.length, 0);
  });

  test(`reconcile: GET SumUp in ${label} -> outcome unknown non retryable, mai confirmed, nessuna confirm/fail`, async () => {
    const attempt = { id: 'att-g', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-g' };
    const order = { id: 'ord-g', customer_id: 'cust-1', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
    const admin = reconcileAdmin({ order, attempt });
    const res = makeRes();
    await withFetch(async () => { throw err; }, () => withAdmin(admin, () => reconcileHandler(makeReq({ body: { order_id: 'ord-g' }, headers: { authorization: 'Bearer tok' } }), res)));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.outcome, 'unknown');
    assert.equal(res.body.retryable, false);
    assert.equal(admin.__rpcCalls.length, 0);
  });
}
