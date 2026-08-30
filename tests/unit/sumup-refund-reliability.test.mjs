// Test mirati SumUp Online — Real Refund (LONG SESSION B, FASE 3/4/6).
// Copre: refund happy path, duplicate refund (claim atomico), SumUp 4xx/5xx/timeout, transaction id
// mancante, provider non-sumup (cash/manual, invariato), e l'invariante "confirm solo dopo 204".
//
// Non wired a npm/package.json (stessa convenzione di tests/unit/sumup-payment-reliability.test.mjs).
// Eseguire a mano con:
//   node --test tests/unit/sumup-refund-reliability.test.mjs
//
// Stesso approccio della suite sorella: Vite in middleware mode con un modulo virtuale al posto di
// '@supabase/supabase-js', cosi possiamo iniettare due mock distinti — l'endpoint crea DUE client
// (supabaseAdmin col service role key, supabaseAsStaff con l'anon key + JWT dello staff) e devono
// restare separabili nei test per verificare CHI chiama quale RPC.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let currentCreateClient = null;

const mockSupabasePlugin = {
  name: 'mock-supabase-client-sumup-refund',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') {
      return '\0virtual:supabaseJsRefund';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseJsRefund') {
      return `export function createClient(url, key, options) { return globalThis.__SUMUP_REFUND_TEST_CREATE_CLIENT__(url, key, options); }`;
    }
  },
};

let server;
let refundHandler;

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: 'error',
    plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js'] },
    server: { middlewareMode: true },
  });
  ({ default: refundHandler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-refund.js')));
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

// ---- mock RPC-capable client (mirrors the sister suite's pattern) -----------------------------

function makeRpcClient({ rpc = {} } = {}) {
  const rpcCalls = [];
  const from = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => builder.__result ?? { data: null, error: null },
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
    __rpcCalls: rpcCalls,
  };
}

// staff client only ever needs .rpc('kitchen_payment_refund', ...) — admin client needs .rpc(...) +
// .from('kitchen_payments').select().eq().eq().eq().maybeSingle() for the charge/transaction lookup.
function makeAdminClient({ rpc = {}, chargeRow } = {}) {
  const rpcCalls = [];
  const from = (table) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: chargeRow ?? null, error: null }),
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
    __rpcCalls: rpcCalls,
  };
}

function withClients({ staff, admin }, fn) {
  globalThis.__SUMUP_REFUND_TEST_CREATE_CLIENT__ = (url, key) =>
    key === 'test-service-role-key' ? admin : staff;
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

const CHARGE_ROW_WITH_TXN = {
  id: 'charge-1',
  raw_last_event: { transactions: [{ id: 'txn-abc', transaction_code: 'TX123' }] },
};

function refundInitiatedRow(overrides = {}) {
  return { id: 'refund-1', order_id: 'ord-1', status: 'initiated', provider: 'sumup', amount: 10, ...overrides };
}

// ================================================================================================
// T13 — refund happy path (sumup)
// ================================================================================================

test('refund: happy path sumup -> claim, SumUp 204, confirm chiamato con provider_ref=txn id', async () => {
  const refund = refundInitiatedRow();
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: {
      kitchen_payment_refund_claim_provider_call: { data: refund, error: null },
      kitchen_payment_refund_confirm: { data: { ...refund, status: 'succeeded' }, error: null },
    },
    chargeRow: CHARGE_ROW_WITH_TXN,
  });

  await withFetch(async (url) => {
    assert.match(String(url), /\/v0\.1\/me\/refund\/txn-abc$/);
    return jsonFetchResponse(204, null);
  }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1', reason: 'cliente insoddisfatto' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'refunded');
    });
  });
  const confirmCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_refund_confirm');
  assert.ok(confirmCall, 'confirm deve essere chiamato dopo 204');
  assert.equal(confirmCall.params.p_provider_ref, 'txn-abc');
});

// ================================================================================================
// T14 — duplicate refund (claim gia preso da una richiesta concorrente)
// ================================================================================================

test('refund: duplicate/concorrente -> claim gia preso, SumUp mai richiamato una seconda volta', async () => {
  const refund = refundInitiatedRow({ raw_last_event: { provider_call_claimed_at: '2026-08-30T10:00:00Z' } });
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: {
      kitchen_payment_refund_claim_provider_call: { data: null, error: new Error('refund_call_already_claimed') },
    },
    chargeRow: CHARGE_ROW_WITH_TXN,
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(204, null); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'in_progress');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(sumupCalled, false, 'una richiesta duplicata non deve mai richiamare SumUp una seconda volta');
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_confirm'), false);
});

// ================================================================================================
// T15 — SumUp 4xx
// ================================================================================================

test('refund: SumUp 4xx -> fail applicato, outcome failed retryable, mai confirm', async () => {
  const refund = refundInitiatedRow();
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: {
      kitchen_payment_refund_claim_provider_call: { data: refund, error: null },
      kitchen_payment_refund_fail: { data: { ...refund, status: 'failed' }, error: null },
    },
    chargeRow: CHARGE_ROW_WITH_TXN,
  });

  await withFetch(async () => jsonFetchResponse(400, { message: 'transaction already refunded' }), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.outcome, 'failed');
      assert.equal(res.body.retryable, true);
    });
  });
  const failCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_refund_fail');
  assert.ok(failCall, 'fail deve essere chiamato su 4xx');
  assert.match(failCall.params.p_reason, /sumup_refund_rejected_400/);
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_confirm'), false);
});

// ================================================================================================
// T16 — SumUp 5xx: inconcludente, mai fail, mai confirm
// ================================================================================================

test('refund: SumUp 5xx -> UNKNOWN, mai fail ne confirm (resta initiated/blocking)', async () => {
  const refund = refundInitiatedRow();
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: { kitchen_payment_refund_claim_provider_call: { data: refund, error: null } },
    chargeRow: CHARGE_ROW_WITH_TXN,
  });

  await withFetch(async () => jsonFetchResponse(500, {}), async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_fail'), false);
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_confirm'), false);
});

// ================================================================================================
// T17 — timeout/network error: stesso esito UNKNOWN del 5xx
// ================================================================================================

test('refund: timeout/errore di rete su SumUp -> UNKNOWN, mai fail ne confirm', async () => {
  const refund = refundInitiatedRow();
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: { kitchen_payment_refund_claim_provider_call: { data: refund, error: null } },
    chargeRow: CHARGE_ROW_WITH_TXN,
  });

  await withFetch(async () => { throw new Error('ETIMEDOUT'); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.body.outcome, 'unknown');
      assert.equal(res.body.retryable, false);
    });
  });
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_fail'), false);
  assert.equal(admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_confirm'), false);
});

// ================================================================================================
// T18 — charge/transaction id non trovato -> fail closed, mai una chiamata SumUp
// ================================================================================================

test('refund: transaction id mancante sul charge originale -> fail closed, SumUp mai chiamato', async () => {
  const refund = refundInitiatedRow();
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: {
      kitchen_payment_refund_claim_provider_call: { data: refund, error: null },
      kitchen_payment_refund_fail: { data: { ...refund, status: 'failed' }, error: null },
    },
    chargeRow: { id: 'charge-1', raw_last_event: {} }, // niente transactions[]
  });

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(204, null); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 502);
      assert.equal(res.body.error, 'sumup_transaction_id_missing');
    });
  });
  assert.equal(sumupCalled, false, 'senza transaction id non si deve mai inventare una chiamata a SumUp');
  const failCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_refund_fail');
  assert.ok(failCall);
  assert.equal(failCall.params.p_reason, 'sumup_transaction_id_missing');
});

// ================================================================================================
// T19 — provider non-sumup (cash/manual): comportamento ledger-only invariato, mai SumUp
// ================================================================================================

test('refund: provider cash -> confirm immediato senza chiamare SumUp (comportamento pre-esistente invariato)', async () => {
  const refund = refundInitiatedRow({ provider: 'cash' });
  const staff = makeRpcClient({ rpc: { kitchen_payment_refund: { data: refund, error: null } } });
  const admin = makeAdminClient({
    rpc: { kitchen_payment_refund_confirm: { data: { ...refund, status: 'succeeded' }, error: null } },
  });

  let sumupCalled = false;
  let claimCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(204, null); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.outcome, 'refunded');
    });
  });
  claimCalled = admin.__rpcCalls.some((c) => c.name === 'kitchen_payment_refund_claim_provider_call');
  assert.equal(sumupCalled, false, 'un refund cash non deve mai chiamare SumUp');
  assert.equal(claimCalled, false, 'il claim provider-call e specifico del path sumup');
  const confirmCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_refund_confirm');
  assert.equal(confirmCall.params.p_provider_ref, null);
});

// ================================================================================================
// T20 — staff non autorizzato: nessuna azione oltre l'RPC iniziale
// ================================================================================================

test('refund: staff non autorizzato (RPC solleva not_staff_for_venue) -> 403, nessuna chiamata SumUp', async () => {
  const staff = makeRpcClient({
    rpc: { kitchen_payment_refund: { data: null, error: new Error('not_staff_for_venue') } },
  });
  const admin = makeAdminClient({});

  let sumupCalled = false;
  await withFetch(async () => { sumupCalled = true; return jsonFetchResponse(204, null); }, async () => {
    await withClients({ staff, admin }, async () => {
      const req = makeReq({ body: { order_id: 'ord-1' } });
      const res = makeRes();
      await refundHandler(req, res);
      assert.equal(res.statusCode, 403);
    });
  });
  assert.equal(sumupCalled, false);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('refund: nessuna sessione -> 401, nessuna RPC chiamata', async () => {
  const admin = makeAdminClient({});
  const staff = makeRpcClient({});
  await withClients({ staff, admin }, async () => {
    const req = makeReq({ body: { order_id: 'ord-1' }, headers: {} });
    const res = makeRes();
    await refundHandler(req, res);
    assert.equal(res.statusCode, 401);
  });
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(staff.__rpcCalls.length, 0);
});

console.log('sumup-refund-reliability.test.mjs: definiti tutti i test.');
