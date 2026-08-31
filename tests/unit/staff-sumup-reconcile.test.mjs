// Test mirati Staff Reconcile Endpoint V1 (api/kitchen-staff-sumup-reconcile.js).
// Copre: auth JWT mancante/invalida, non-staff -> 403, staff venue corretto -> confirmed, ordine
// inesistente, pending, already paid, failed(sumup_failed) -> promosso a paid (LONG SESSION F),
// provider non-sumup/unknown, doppia reconcile concorrente/idempotenza.
//
// Non wired a npm/package.json (stessa convenzione delle suite sorelle sumup-*). Eseguire a mano con:
//   node --test tests/unit/staff-sumup-reconcile.test.mjs
//
// Stesso approccio di sumup-refund-reliability.test.mjs: Vite in middleware mode con un modulo
// virtuale al posto di '@supabase/supabase-js', per iniettare DUE mock distinti -- l'endpoint crea
// due client (supabaseAdmin col service role key per lookup/RPC confirm/fail, supabaseAsStaff con
// l'anon key + JWT dello staff per is_staff_for_venue) e devono restare separabili per verificare
// CHI chiama quale RPC/tabella.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-staff-reconcile',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') {
      return '\0virtual:supabaseJsStaffReconcile';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseJsStaffReconcile') {
      return `export function createClient(url, key, options) { return globalThis.__STAFF_RECONCILE_TEST_CREATE_CLIENT__(url, key, options); }`;
    }
  },
};

let server;
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
  ({ default: reconcileHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-staff-sumup-reconcile.js')));
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUMUP_API_KEY = 'test-sumup-key';
});

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(body) { res.body = body; return res; },
  };
  return res;
}

function makeReq({ body = {}, headers = { authorization: 'Bearer staff-tok' } } = {}) {
  return { method: 'POST', body, headers };
}

function jsonFetchResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => { globalThis.fetch = original; });
}

// ---- admin client mock (service_role): auth.getUser, kitchen_orders/kitchen_payments, RPC --------

function makeAdminClient({ authUser, order, attempt, settled, rpc = {} } = {}) {
  const rpcCalls = [];
  const fromCalls = [];
  const from = (table) => {
    fromCalls.push(table);
    const builder = {
      select: (cols) => { builder.__cols = cols; return builder; },
      eq: () => builder,
      in: () => builder,
      or: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (table === 'kitchen_orders') return { data: order ?? null, error: null };
        if (table === 'kitchen_payments') {
          // Second call in the 'already_resolved' path selects 'status, failure_reason' only.
          if (builder.__cols === 'status, failure_reason') return { data: settled ?? null, error: null };
          return { data: attempt ?? null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return builder;
  };
  return {
    from,
    auth: { getUser: async () => authUser ?? { data: { user: null }, error: new Error('no user') } },
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      if (typeof handler === 'function') return handler(params);
      return handler ?? { data: null, error: null };
    },
    __rpcCalls: rpcCalls,
    __fromCalls: fromCalls,
  };
}

// ---- staff client mock (anon + JWT): is_staff_for_venue only ---------------------------------

function makeStaffClient({ isStaff = true, error = null } = {}) {
  const rpcCalls = [];
  return {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      return { data: isStaff, error };
    },
    __rpcCalls: rpcCalls,
  };
}

function withClients({ staff, admin }, fn) {
  globalThis.__STAFF_RECONCILE_TEST_CREATE_CLIENT__ = (url, key) =>
    key === 'test-service-role-key' ? admin : staff;
  return fn();
}

// ================================================================================================
// Auth
// ================================================================================================

test('staff-reconcile: nessun Authorization header -> 401 missing_session, nessuna azione', async () => {
  const admin = makeAdminClient({});
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' }, headers: {} });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'missing_session');
  });
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(admin.__fromCalls.length, 0);
});

test('staff-reconcile: JWT invalido (getUser fallisce) -> 401 invalid_session', async () => {
  const admin = makeAdminClient({ authUser: { data: { user: null }, error: new Error('bad token') } });
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'invalid_session');
  });
  assert.equal(admin.__fromCalls.length, 0, 'nessuna lettura ordine se il JWT non risolve');
});

test('staff-reconcile: order_id mancante -> 400 missing_order_id', async () => {
  const admin = makeAdminClient({});
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'missing_order_id');
  });
});

// ================================================================================================
// Authorization
// ================================================================================================

test('staff-reconcile: ordine inesistente -> 404 order_not_found, staff-check mai chiamato', async () => {
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order: null,
  });
  const staff = makeStaffClient({ isStaff: true });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-404' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'order_not_found');
  });
  assert.equal(staff.__rpcCalls.length, 0, 'is_staff_for_venue non deve essere chiamato per un ordine inesistente');
});

test('staff-reconcile: non-staff per il venue -> 403 not_staff_for_venue, nessuna RPC confirm/fail', async () => {
  const order = { id: 'ord-2', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'not-staff-1' } }, error: null },
    order,
  });
  const staff = makeStaffClient({ isStaff: false });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-2' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'not_staff_for_venue');
  });
  assert.equal(staff.__rpcCalls.length, 1);
  assert.equal(staff.__rpcCalls[0].name, 'is_staff_for_venue');
  assert.equal(staff.__rpcCalls[0].params.p_venue_id, 'walrus-main');
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail'), false);
});

test('staff-reconcile: is_staff_for_venue valutato sul venue_id reale dell\'ordine, non hardcoded', async () => {
  const order = { id: 'ord-2b', venue_id: 'other-venue-xyz', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
  });
  const staff = makeStaffClient({ isStaff: true });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-2b' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.body.outcome, 'no_pending_attempt');
  });
  assert.equal(staff.__rpcCalls[0].params.p_venue_id, 'other-venue-xyz');
});

// ================================================================================================
// Happy path / core outcomes (staff, venue corretto)
// ================================================================================================

test('staff-reconcile: staff venue corretto + SumUp PAID -> confirmed', async () => {
  const order = { id: 'ord-3', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-3', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-3' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
    rpc: { kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null } },
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url) => {
    assert.match(String(url), /checkouts\/co-3$/);
    return jsonFetchResponse(200, { id: 'co-3', status: 'PAID', amount: 10, checkout_reference: 'att-3' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-3' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'confirmed');
      assert.equal(res.body.retryable, false);
      assert.equal(res.body.provider_ref, undefined, 'mai esporre provider_ref al client staff');
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), 'confirm deve girare su supabaseAdmin (service_role)');
});

test('staff-reconcile: ordine gia paid -> already_paid, nessuna chiamata SumUp, idempotente', async () => {
  const order = { id: 'ord-4', venue_id: 'walrus-main', payment_status: 'paid', status: 'received' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
  });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-4' } });
      const res1 = makeRes();
      await reconcileHandler(req, res1);
      assert.equal(res1.body.outcome, 'already_paid');
      const res2 = makeRes();
      await reconcileHandler(req, res2);
      assert.equal(res2.body.outcome, 'already_paid');
    });
  });
  assert.equal(fetchCalled, false, 'un ordine gia paid non deve mai richiamare SumUp');
});

test('staff-reconcile: nessun attempt live -> no_pending_attempt, retryable true', async () => {
  const order = { id: 'ord-5', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt: null,
  });
  const staff = makeStaffClient({ isStaff: true });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-5' } });
    const res = makeRes();
    await reconcileHandler(req, res);
    assert.equal(res.body.outcome, 'no_pending_attempt');
    assert.equal(res.body.retryable, true);
  });
});

test('staff-reconcile: SumUp PENDING -> pending, blocking, nessuna confirm/fail', async () => {
  const order = { id: 'ord-6', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-6', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-6' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-6', status: 'PENDING', amount: 10, checkout_reference: 'att-6' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-6' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'pending');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.filter((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail').length, 0);
});

test('staff-reconcile: provider non-sumup -> unknown, nessuna chiamata SumUp', async () => {
  const order = { id: 'ord-7', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-7', amount: 10, provider: 'cash', status: 'initiated', provider_ref: null };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
  });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-7' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(fetchCalled, false);
});

test('staff-reconcile: checkout_reference non corrisponde all\'attempt -> unknown, mai confermato', async () => {
  const order = { id: 'ord-8', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-8', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-8' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-8', status: 'PAID', amount: 10, checkout_reference: 'someone-elses-attempt' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-8' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
});

// ================================================================================================
// LONG SESSION F — failed(sumup_failed) same-checkout retry, promosso da chiamata staff
// ================================================================================================

test('staff-reconcile: attempt gia FAILED (sumup_failed) + stesso checkout ora PAID -> promuove a confirmed', async () => {
  const order = { id: 'ord-9', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-9', amount: 10, provider: 'sumup', status: 'failed', provider_ref: 'co-9', failure_reason: 'sumup_failed' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
    rpc: { kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null } },
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-9', status: 'PAID', amount: 10, checkout_reference: 'att-9' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-9' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'confirmed');
      assert.equal(res.body.retryable, false);
    });
  });
  const confirmCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_confirm');
  assert.ok(confirmCall, 'kitchen_payment_confirm deve essere chiamato anche partendo da status=failed');
  assert.equal(confirmCall.params.p_attempt_id, 'att-9');
});

// ================================================================================================
// Idempotenza / doppia reconcile concorrente (already_resolved branch)
// ================================================================================================

test('staff-reconcile: doppia reconcile concorrente -- attempt gia risolto a succeeded (already_resolved) -> confirmed, nessuna nuova RPC', async () => {
  const order = { id: 'ord-10', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  // status 'succeeded' fa scattare il ramo already_resolved dentro applySumupCheckoutResult.
  const attempt = { id: 'att-10', amount: 10, provider: 'sumup', status: 'succeeded', provider_ref: 'co-10' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
    settled: { status: 'succeeded', failure_reason: null },
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-10', status: 'PAID', amount: 10, checkout_reference: 'att-10' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-10' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'confirmed');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail'), false, 'gia risolto: nessuna nuova confirm/fail, solo re-read dello stato');
});

test('staff-reconcile: doppia reconcile concorrente -- race in corso (attempt ancora initiated dopo already_resolved) -> pending, mai un esito indovinato', async () => {
  const order = { id: 'ord-11', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };
  const attempt = { id: 'att-11', amount: 10, provider: 'sumup', status: 'cancelled', provider_ref: 'co-11' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order,
    attempt,
    settled: { status: 'initiated', failure_reason: null },
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-11', status: 'PAID', amount: 10, checkout_reference: 'att-11' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-11' } });
      const res = makeRes();
      await reconcileHandler(req, res);
      assert.equal(res.body.outcome, 'pending');
      assert.equal(res.body.retryable, false);
    });
  });
});

console.log('staff-sumup-reconcile.test.mjs: tutti i test superati.');
