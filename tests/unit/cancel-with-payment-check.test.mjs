// Test mirati Payment Cancel Hardening — api/kitchen-cancel-with-payment-check.js.
// Copre: auth, staff check, idempotenza (doppio cancel), guard payment_status=paid, nessun attempt
// live -> cancel diretto, attempt sumup PENDING -> delete + cancel, attempt sumup PAID -> stop
// (resolver esistente, mai cancellato), DELETE "already processed" -> re-GET/reconcile/stop, race
// confirm-vs-cancel (RPC atomica rifiuta payment_attempt_not_cancelable), provider_ref recovery
// fallita -> unknown/mai cancellato, checkout_reference mismatch -> unknown.
//
// Non wired a npm/package.json (stessa convenzione delle suite sorelle sumup-*). Eseguire a mano con:
//   node --test tests/unit/cancel-with-payment-check.test.mjs
//
// Stesso approccio di tests/unit/staff-sumup-reconcile.test.mjs: Vite in middleware mode con un
// modulo virtuale al posto di '@supabase/supabase-js', per iniettare DUE mock distinti -- l'endpoint
// crea due client (supabaseAdmin col service role key per lookup/SumUp/resolver, supabaseAsStaff con
// l'anon key + JWT dello staff per is_staff_for_venue e la RPC atomica di cancel) e devono restare
// separabili per verificare CHI chiama quale RPC/tabella.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-cancel-with-payment-check',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') {
      return '\0virtual:supabaseJsCancelCheck';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseJsCancelCheck') {
      return `export function createClient(url, key, options) { return globalThis.__CANCEL_CHECK_TEST_CREATE_CLIENT__(url, key, options); }`;
    }
  },
};

let server;
let cancelHandler;

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js'] },
    server: { middlewareMode: true },
  });
  ({ default: cancelHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-cancel-with-payment-check.js')));
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

function makeAdminClient({ authUser, order, attempt, rpc = {} } = {}) {
  const rpcCalls = [];
  const fromCalls = [];
  const from = (table) => {
    fromCalls.push(table);
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (table === 'kitchen_orders') return { data: order ?? null, error: null };
        if (table === 'kitchen_payments') return { data: attempt ?? null, error: null };
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

// ---- staff client mock (anon + JWT): is_staff_for_venue + the atomic cancel RPC -----------------

function makeStaffClient({ isStaff = true, staffError = null, cancel } = {}) {
  const rpcCalls = [];
  return {
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      if (name === 'is_staff_for_venue') return { data: isStaff, error: staffError };
      if (name === 'kitchen_order_cancel_with_payment_attempt') {
        if (typeof cancel === 'function') return cancel(params);
        return cancel ?? { data: { id: params.p_order_id, status: 'cancelled', cancel_reason: params.p_reason, cancelled_at: new Date().toISOString() }, error: null };
      }
      return { data: null, error: null };
    },
    __rpcCalls: rpcCalls,
  };
}

function withClients({ staff, admin }, fn) {
  globalThis.__CANCEL_CHECK_TEST_CREATE_CLIENT__ = (url, key) =>
    key === 'test-service-role-key' ? admin : staff;
  return fn();
}

const BASE_ORDER = { id: 'ord-1', venue_id: 'walrus-main', payment_status: 'pending_counter_payment', status: 'pending_counter_payment' };

// ================================================================================================
// Auth / validation
// ================================================================================================

test('cancel-check: nessun Authorization header -> 401 missing_session, nessuna azione', async () => {
  const admin = makeAdminClient({});
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' }, headers: {} });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'missing_session');
  });
  assert.equal(admin.__fromCalls.length, 0);
});

test('cancel-check: JWT invalido -> 401 invalid_session', async () => {
  const admin = makeAdminClient({ authUser: { data: { user: null }, error: new Error('bad token') } });
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' } });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'invalid_session');
  });
});

test('cancel-check: order_id mancante -> 400 missing_order_id', async () => {
  const admin = makeAdminClient({});
  const staff = makeStaffClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: {} });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'missing_order_id');
  });
});

test('cancel-check: ordine inesistente -> 404 order_not_found, staff-check mai chiamato', async () => {
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order: null,
  });
  const staff = makeStaffClient({ isStaff: true });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-404' } });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'order_not_found');
  });
  assert.equal(staff.__rpcCalls.length, 0);
});

test('cancel-check: non-staff per il venue -> 403, nessuna azione su ordine/pagamento', async () => {
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'not-staff-1' } }, error: null },
    order: BASE_ORDER,
  });
  const staff = makeStaffClient({ isStaff: false });
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' } });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'not_staff_for_venue');
  });
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false);
});

// ================================================================================================
// Idempotenza / guard paid — nessuna chiamata SumUp
// ================================================================================================

test('cancel-check: doppio cancel/idempotenza — ordine gia cancelled -> already_cancelled, nessuna chiamata SumUp/RPC cancel', async () => {
  const order = { ...BASE_ORDER, status: 'cancelled' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'already_cancelled');
    });
  });
  assert.equal(fetchCalled, false);
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false);
});

test('cancel-check: ordine gia paid -> 409 order_already_paid_cannot_cancel, nessuna chiamata SumUp', async () => {
  const order = { ...BASE_ORDER, payment_status: 'paid', status: 'received' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'order_already_paid_cannot_cancel');
    });
  });
  assert.equal(fetchCalled, false);
});

// ================================================================================================
// Nessun attempt live -> cancel diretto
// ================================================================================================

test('cancel-check: nessun attempt live -> cancel diretto via RPC atomica, nessuna chiamata SumUp', async () => {
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt: null });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1', reason: 'Fuori stock' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'cancelled');
      assert.equal(res.body.order.status, 'cancelled');
    });
  });
  assert.equal(fetchCalled, false);
  const cancelCall = staff.__rpcCalls.find((c) => c.name === 'kitchen_order_cancel_with_payment_attempt');
  assert.ok(cancelCall);
  assert.equal(cancelCall.params.p_order_id, 'ord-1');
  assert.equal(cancelCall.params.p_reason, 'Fuori stock');
});

test('cancel-check: attempt live non-sumup -> cancel diretto via RPC atomica, nessuna chiamata SumUp', async () => {
  const attempt = { id: 'att-x', amount: 10, provider: 'cash', status: 'initiated', provider_ref: null };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  let fetchCalled = false;
  await withFetch(async () => { fetchCalled = true; return jsonFetchResponse(200, {}); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.body.outcome, 'cancelled');
    });
  });
  assert.equal(fetchCalled, false);
});

// ================================================================================================
// Attempt live SumUp — PENDING/non-PAID -> delete best-effort + cancel
// ================================================================================================

test('cancel-check: initiated/pending sumup, checkout PENDING, delete pulito -> cancella', async () => {
  const attempt = { id: 'att-1', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-1' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  const calls = [];
  await withFetch(async (url, opts) => {
    calls.push({ url: String(url), method: opts?.method ?? 'GET' });
    if ((opts?.method ?? 'GET') === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    return jsonFetchResponse(200, { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'cancelled');
    });
  });
  assert.ok(calls.some((c) => c.method === 'GET' && c.url.includes('checkouts/co-1')));
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('checkouts/co-1')));
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail'), false);
});

test('cancel-check: pending attempt, checkout status PENDING (initiated->pending in flight) -> cancella comunque', async () => {
  const attempt = { id: 'att-1b', amount: 10, provider: 'sumup', status: 'pending', provider_ref: 'co-1b' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url, opts) => {
    if ((opts?.method ?? 'GET') === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    return jsonFetchResponse(200, { id: 'co-1b', status: 'PENDING', amount: 10, checkout_reference: 'att-1b' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.body.outcome, 'cancelled');
    });
  });
});

// ================================================================================================
// Attempt live SumUp — PAID -> STOP, mai cancellato, risolto via resolver esistente
// ================================================================================================

test('cancel-check: checkout gia PAID -> 409 cannot_cancel_already_paid, ordine mai cancellato, confirm via resolver condiviso', async () => {
  const attempt = { id: 'att-2', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-2' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order: BASE_ORDER,
    attempt,
    rpc: { kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null } },
  });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-2', status: 'PAID', amount: 10, checkout_reference: 'att-2' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'cannot_cancel_already_paid');
    });
  });
  assert.ok(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), 'deve risolvere via lo stesso resolver del webhook/reconcile');
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false, 'mai la RPC di cancel quando il checkout e PAID');
});

// ================================================================================================
// DELETE "already processed" -> re-verifica -> reconcile/stop oppure procede
// ================================================================================================

test('cancel-check: DELETE rifiutato (400, gia processato) + re-GET rivela PAID -> stop, mai cancellato', async () => {
  const attempt = { id: 'att-3', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-3' };
  const admin = makeAdminClient({
    authUser: { data: { user: { id: 'staff-1' } }, error: null },
    order: BASE_ORDER,
    attempt,
    rpc: { kitchen_payment_confirm: { data: { ...attempt, status: 'succeeded' }, error: null } },
  });
  const staff = makeStaffClient({ isStaff: true });

  let getCount = 0;
  await withFetch(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    if (method === 'DELETE') {
      return { ok: false, status: 400, json: async () => ({ error: 'checkout_already_processed' }) };
    }
    getCount += 1;
    // Prima GET: ancora PENDING (da qui la decisione di tentare il delete). Seconda GET
    // (post-delete-rejected): rivela che nel frattempo e diventato PAID.
    const status = getCount === 1 ? 'PENDING' : 'PAID';
    return jsonFetchResponse(200, { id: 'co-3', status, amount: 10, checkout_reference: 'att-3' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'cannot_cancel_already_paid');
    });
  });
  assert.equal(getCount, 2, 'deve rifare una GET autoritativa dopo il delete rifiutato');
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false);
});

test('cancel-check: DELETE rifiutato (400) ma re-GET conferma non-paid (CANCELLED) -> procede a cancellare', async () => {
  const attempt = { id: 'att-4', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-4' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  let getCount = 0;
  await withFetch(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    if (method === 'DELETE') return { ok: false, status: 400, json: async () => ({ error: 'checkout_already_processed' }) };
    getCount += 1;
    const status = getCount === 1 ? 'PENDING' : 'CANCELLED';
    return jsonFetchResponse(200, { id: 'co-4', status, amount: 10, checkout_reference: 'att-4' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.body.outcome, 'cancelled');
    });
  });
  assert.equal(getCount, 2);
});

// P0 fix: un errore di rete o un 5xx sul DELETE non e' "best-effort" — non ci dice se il checkout
// e' stato disattivato o e' ancora vivo/pagabile. Fail-closed: nessun cancel locale, staff
// riceve un errore retryable/BLOCKED. Copre entrambi i failure mode richiesti (network error, 5xx).

test('cancel-check: DELETE errore di rete -> fail-closed, NESSUN cancel locale, 502 retryable', async () => {
  const attempt = { id: 'att-5', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-5' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    if (method === 'DELETE') throw new Error('network down');
    return jsonFetchResponse(200, { id: 'co-5', status: 'PENDING', amount: 10, checkout_reference: 'att-5' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.error, 'sumup_delete_indeterminate');
      assert.equal(res.body.retryable, true);
    });
  });
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false, 'mai la RPC di cancel quando il delete e indeterminato');
});

test('cancel-check: DELETE 5xx -> fail-closed, NESSUN cancel locale, 502 retryable', async () => {
  const attempt = { id: 'att-5b', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-5b' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    if (method === 'DELETE') return { ok: false, status: 503, json: async () => ({ error: 'service_unavailable' }) };
    return jsonFetchResponse(200, { id: 'co-5b', status: 'PENDING', amount: 10, checkout_reference: 'att-5b' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.error, 'sumup_delete_indeterminate');
      assert.equal(res.body.retryable, true);
    });
  });
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false, 'mai la RPC di cancel quando il delete e indeterminato');
});

// ================================================================================================
// Race confirm-vs-cancel: la RPC atomica rifiuta -> mai una cancellazione forzata
// ================================================================================================

test('cancel-check: race confirm-vs-cancel — la RPC atomica rifiuta payment_attempt_not_cancelable -> 409, ordine non cancellato', async () => {
  const attempt = { id: 'att-6', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-6' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  // Simula che, tra la nostra GET/DELETE e la RPC, un webhook concorrente abbia gia risolto
  // l'attempt (es. confirm) — la RPC atomica lo scopre sotto lock e rifiuta.
  const staff = makeStaffClient({
    isStaff: true,
    cancel: { data: null, error: { message: 'payment_attempt_not_cancelable' } },
  });

  await withFetch(async (url, opts) => {
    const method = opts?.method ?? 'GET';
    if (method === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    return jsonFetchResponse(200, { id: 'co-6', status: 'PENDING', amount: 10, checkout_reference: 'att-6' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'payment_attempt_not_cancelable');
    });
  });
});

test('cancel-check: la RPC atomica rifiuta order_already_paid_cannot_cancel (race tardiva) -> 409, propagato pulito', async () => {
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt: null });
  const staff = makeStaffClient({
    isStaff: true,
    cancel: { data: null, error: { message: 'order_already_paid_cannot_cancel' } },
  });

  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' } });
    const res = makeRes();
    await cancelHandler(req, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'order_already_paid_cannot_cancel');
  });
});

// ================================================================================================
// provider_ref mancante / mismatch — mai un cancel alla cieca
// ================================================================================================

test('cancel-check: provider_ref mancante, recovery ambigua -> unknown, mai cancellato', async () => {
  const attempt = { id: 'att-7', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: null };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url) => {
    // recoverSumupProviderRef: GET /v0.1/checkouts?checkout_reference=... -> 2 match = ambiguous
    assert.match(String(url), /checkout_reference=att-7/);
    return jsonFetchResponse(200, [
      { id: 'co-7a', checkout_reference: 'att-7' },
      { id: 'co-7b', checkout_reference: 'att-7' },
    ]);
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.needs_manual_reconciliation, true);
    });
  });
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false);
});

test('cancel-check: checkout_reference non corrisponde all\'attempt -> unknown, mai cancellato', async () => {
  const attempt = { id: 'att-8', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-8' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async () => jsonFetchResponse(200, { id: 'co-8', status: 'PAID', amount: 10, checkout_reference: 'someone-elses-attempt' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_confirm'), false);
  assert.equal(staff.__rpcCalls.some((c) => c.name === 'kitchen_order_cancel_with_payment_attempt'), false);
});

// ================================================================================================
// Regressione payment retry/confirm — il path normale non tocca mai queste RPC fuori dal caso PAID
// ================================================================================================

test('regressione: un cancel non-paid non chiama mai kitchen_payment_confirm/kitchen_payment_fail', async () => {
  const attempt = { id: 'att-9', amount: 10, provider: 'sumup', status: 'initiated', provider_ref: 'co-9' };
  const admin = makeAdminClient({ authUser: { data: { user: { id: 'staff-1' } }, error: null }, order: BASE_ORDER, attempt });
  const staff = makeStaffClient({ isStaff: true });

  await withFetch(async (url, opts) => {
    if ((opts?.method ?? 'GET') === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    return jsonFetchResponse(200, { id: 'co-9', status: 'FAILED', amount: 10, checkout_reference: 'att-9' });
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await cancelHandler(req, res);
      assert.equal(res.body.outcome, 'cancelled');
    });
  });
  assert.equal(admin.__rpcCalls.filter((c) => c.name === 'kitchen_payment_confirm' || c.name === 'kitchen_payment_fail').length, 0);
});

console.log('cancel-with-payment-check.test.mjs: tutti i test superati.');
