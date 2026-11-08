// Test Food Club Passo 2a: create-checkout con buono (valid_until + guardia 4:30) e invarianza per gli ordini senza buono.
// Rete e Supabase SEMPRE finti. Esecuzione: node --test tests/unit/food-club-create-checkout.test.mjs
// Stesso harness di tests/unit/sumup-payment-reliability.test.mjs (Vite ssrLoadModule + globalThis.fetch finta).
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-food-club',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') return '\0virtual:supabaseJs';
  },
  load(id) {
    if (id === '\0virtual:supabaseJs') return `export function createClient() { return globalThis.__FC_TEST_ADMIN__(); }`;
  },
};

let server;
let handler;

before(async () => {
  server = await createServer({
    root: ROOT, configFile: false, logLevel: 'error', plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js'] }, server: { middlewareMode: true },
  });
  ({ default: handler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js')));
});
after(async () => { await server.close(); });
beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUMUP_API_KEY = 'test-sumup-key';
  process.env.SUMUP_MERCHANT_CODE = 'test-merchant';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.example.com';
});

const MIN = 60 * 1000;
const CALLER_ID = 'cust-1';
const AUTH_HEADERS = { authorization: 'Bearer valid-token' };
const isListUrl = (u) => String(u).includes('/v0.1/checkouts?checkout_reference=');
const jres = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function makeRes() {
  const res = { statusCode: null, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}

// Supabase finto: kitchen_orders/kitchen_payments restituiscono la riga data; food_club_vouchers registra i filtri .or().
function makeAdmin({ order, attempt, voucher = { data: null, error: null }, rpc = {} }) {
  const rpcCalls = [];
  const voucherQueries = [];
  const from = (table) => {
    const q = { table, or: null };
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
      or: (f) => { q.or = f; return b; },
      maybeSingle: async () => {
        if (table === 'food_club_vouchers') { voucherQueries.push(q); return voucher; }
        if (table === 'kitchen_orders') return { data: order, error: null };
        if (table === 'kitchen_payments') return { data: attempt, error: null };
        return { data: null, error: null };
      },
    };
    return b;
  };
  return {
    from,
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      const h = rpc[name];
      return typeof h === 'function' ? h(params) : (h ?? { data: null, error: null });
    },
    auth: { getUser: async () => ({ data: { user: { id: CALLER_ID } }, error: null }) },
    __rpcCalls: rpcCalls, __voucherQueries: voucherQueries,
  };
}

const RPC_OK = {
  kitchen_payment_attempt_claim_checkout: { data: { id: 'att-1' }, error: null },
  kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
};
const mkAttempt = (extra = {}) => ({ id: 'att-1', order_id: 'ord-1', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null, ...extra });
const mkOrder = (ageMs, extra = {}) => ({
  id: 'ord-1', customer_id: CALLER_ID, payment_status: 'pending_online_payment', total: 10,
  status: 'pending_online_payment', created_at: new Date(Date.now() - ageMs).toISOString(), ...extra,
});
const VOUCHER = { data: { id: 'v-1' }, error: null };

// Passo 3B: valid_until come lo restituisce il DB (created_at + 15 min troncato al secondo, formato senza frazioni).
const dbValidUntil = (order) => new Date(Math.floor((Date.parse(order.created_at) + 15 * MIN) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const INTENT_RPC = 'food_club_record_checkout_intent';

async function run({ order, attempt = mkAttempt(), voucher, rpc = RPC_OK, post = jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' }), list = jres(200, []), get, onPost }) {
  // Default: intento riuscito con il valore del DB (sovrascrivibile passando rpc[INTENT_RPC]).
  const rpcWithIntent = { [INTENT_RPC]: { data: { valid_until: dbValidUntil(order), already_recorded: false }, error: null }, ...rpc };
  const admin = makeAdmin({ order, attempt, voucher, rpc: rpcWithIntent });
  const calls = [];
  const warns = [];
  const origFetch = globalThis.fetch;
  const origWarn = console.warn; const origErr = console.error;
  console.warn = (...a) => warns.push(a); console.error = () => {};
  globalThis.__FC_TEST_ADMIN__ = () => admin;
  globalThis.fetch = async (url, opts = {}) => {
    const kind = isListUrl(url) ? 'list' : opts.method === 'POST' ? 'post' : 'get';
    calls.push({ kind, url: String(url), body: opts.body, rpcBefore: admin.__rpcCalls.map((c) => c.name) });
    if (kind === 'post' && onPost) await onPost();
    const h = { list, post, get }[kind];
    const r = typeof h === 'function' ? await h() : h;
    if (r instanceof Error) throw r;
    return r;
  };
  const res = makeRes();
  try {
    await handler({ method: 'POST', body: { order_id: 'ord-1', payment_attempt_id: 'att-1' }, headers: AUTH_HEADERS }, res);
  } finally {
    globalThis.fetch = origFetch; console.warn = origWarn; console.error = origErr;
  }
  const count = (k) => calls.filter((c) => c.kind === k).length;
  const rpcCount = (n) => admin.__rpcCalls.filter((c) => c.name === n).length;
  return { res, calls, count, rpcCount, admin, warns };
}

// Corpo POST di OGGI (pre Passo 2), scritto a mano: stesso ordine di chiavi, byte per byte.
const baselineBody = () => ({
  checkout_reference: 'att-1',
  amount: 10,
  currency: 'EUR',
  merchant_code: 'test-merchant',
  description: 'Walrus Pub — ordine ord-1',
  redirect_url: 'https://prod.example.com/kitchen/status?orderId=ord-1&sumup=return',
  return_url: 'https://prod.example.com/api/kitchen-sumup-webhook',
  hosted_checkout: { enabled: true },
});

test('C-1 senza buono: corpo POST identico a oggi (byte per byte, nessun valid_until) e risposta invariata', async () => {
  // anche con ordine vecchio di 10 minuti: nessuna guardia 4:30 per ordini senza buono
  for (const ageMs of [MIN, 10 * MIN]) {
    const r = await run({ order: mkOrder(ageMs), voucher: { data: null, error: null } });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(r.res.body, { checkout_id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' });
    const post = r.calls.find((c) => c.kind === 'post');
    assert.deepEqual(JSON.parse(post.body), baselineBody());
    assert.equal(post.body, JSON.stringify(baselineBody()), 'stringa identica');
    assert.equal(post.body.includes('valid_until'), false);
    assert.deepEqual(r.calls.map((c) => c.kind), ['list', 'post']);
    assert.equal(r.warns.length, 0);
  }
});

test('C-2 con buono e now < 4:30: valid_until = valore del DB (intento), nessun altro campo cambiato', async () => {
  const order = mkOrder(MIN);
  const expected = dbValidUntil(order);
  const r = await run({ order, voucher: VOUCHER, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: expected }) });
  assert.equal(r.res.statusCode, 200);
  const post = r.calls.find((c) => c.kind === 'post');
  assert.equal(post.body, JSON.stringify({ ...baselineBody(), valid_until: expected }));
  assert.match(JSON.parse(post.body).valid_until, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.deepEqual(Object.keys(JSON.parse(post.body)).slice(-1), ['valid_until'], 'valid_until in coda');
  assert.equal(r.warns.length, 0, 'scadenza confermata da SumUp: nessun warn');
  // la query del buono usa l'id ordine, sia reserved sia used
  const q = r.admin.__voucherQueries[0].or;
  assert.ok(q.includes('reserved_order_id.eq."ord-1"') && q.includes('status.eq.reserved') && q.includes('used_order_id.eq."ord-1"'), q);
});

test('C-3 lettura buono in errore -> 503 food_club_lookup_failed, nessuna claim, nessuna fetch', async () => {
  const r = await run({ order: mkOrder(MIN), voucher: { data: null, error: { message: 'db down' } } });
  assert.equal(r.res.statusCode, 503);
  assert.deepEqual(r.res.body, { error: 'food_club_lookup_failed' });
  assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 0);
  assert.equal(r.calls.length, 0);
});

test('C-4 con buono e now >= created_at + 4:30, qualunque status ordine -> 409 online_payment_expired, nessuna claim, nessuna fetch', async () => {
  for (const status of ['pending_online_payment', 'payment_abandoned', 'pending_counter_payment', 'new', 'cancelled']) {
    const r = await run({ order: mkOrder(4 * MIN + 31 * 1000, { status }), voucher: VOUCHER });
    assert.equal(r.res.statusCode, 409, status);
    assert.deepEqual(r.res.body, { error: 'online_payment_expired' }, status);
    assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 0, status);
    assert.equal(r.calls.length, 0, status);
  }
  // appena prima del limite: procede
  const ok = await run({ order: mkOrder(4 * MIN + 20 * 1000), voucher: VOUCHER });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.count('post'), 1);
});

test('C-4b senza buono, ordine oltre 4:30 e status non online: nessuna guardia nuova (comportamento di oggi)', async () => {
  const r = await run({ order: mkOrder(10 * MIN, { status: 'payment_abandoned' }), voucher: { data: null, error: null } });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.count('post'), 1);
});

test('C-5 riuso (provider_ref presente): nessuna POST, nessun valid_until, nessuna lettura buono', async () => {
  const r = await run({
    order: mkOrder(MIN), voucher: VOUCHER, attempt: mkAttempt({ provider_ref: 'co-1' }),
    get: jres(200, { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1', hosted_checkout_url: 'https://pay.sumup.com/existing' }),
  });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.res.body.hosted_checkout_url, 'https://pay.sumup.com/existing');
  assert.equal(r.count('post'), 0);
  assert.deepEqual(r.calls.map((c) => c.kind), ['get']);
  assert.equal(r.admin.__voucherQueries.length, 0, 'il ramo riuso e invariato');
  assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 0);
});

test('C-6 con buono: POST timeout / 5xx / 409 DUPLICATED -> mai una seconda POST nella stessa request', async () => {
  const t = await run({ order: mkOrder(MIN), voucher: VOUCHER, post: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) });
  assert.equal(t.res.statusCode, 503); assert.equal(t.count('post'), 1);
  const s = await run({ order: mkOrder(MIN), voucher: VOUCHER, post: jres(503, {}) });
  assert.equal(s.res.statusCode, 503); assert.equal(s.count('post'), 1);
  let n = 0;
  const d = await run({
    order: mkOrder(MIN), voucher: VOUCHER, post: jres(409, { error_code: 'DUPLICATED_CHECKOUT' }),
    list: () => (++n === 1 ? jres(200, []) : jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }])),
    get: jres(200, { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1', hosted_checkout_url: 'https://pay.sumup.com/e' }),
  });
  assert.equal(d.res.statusCode, 200); assert.equal(d.count('post'), 1); assert.equal(d.count('list'), 2);
  // retry dopo timeout: List trova il checkout, nessuna POST
  const retry = await run({
    order: mkOrder(MIN), voucher: VOUCHER,
    list: jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }]),
    get: jres(200, { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1', hosted_checkout_url: 'https://pay.sumup.com/e' }),
  });
  assert.equal(retry.res.statusCode, 200); assert.equal(retry.count('post'), 0);
});

test('C-7 risposta 2xx con valid_until diverso (>1 s) o assente -> warn food_club_valid_until_mismatch, redirect invariato', async () => {
  const order = mkOrder(MIN);
  const sent = dbValidUntil(order);
  const diverso = new Date(Date.parse(sent) + 5000).toISOString();
  for (const extra of [{ valid_until: diverso }, {}, { valid_until: 'boh' }]) {
    const r = await run({ order, voucher: VOUCHER, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', ...extra }) });
    assert.equal(r.res.statusCode, 200);
    assert.deepEqual(r.res.body, { checkout_id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' });
    assert.equal(r.warns.length, 1);
    assert.match(String(r.warns[0][0]), /food_club_valid_until_mismatch/);
    assert.equal(r.warns[0][1].sent, sent);
  }
  // entro 1 s: nessun warn
  const near = await run({ order, voucher: VOUCHER, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: new Date(Date.parse(sent) + 900).toISOString() }) });
  assert.equal(near.warns.length, 0);
  // ordine senza buono: nessun warn anche se SumUp non restituisce valid_until
  const nov = await run({ order, voucher: { data: null, error: null } });
  assert.equal(nov.warns.length, 0);
});

test('C-8 K3: riuso con GET PAID su attempt cancelled / lost_race -> stesse risposte di oggi (con buono presente)', async () => {
  const paid = { id: 'co-1', status: 'PAID', amount: 10, checkout_reference: 'att-1' };
  // PAID confermato -> 409 order_already_paid
  const a = await run({
    order: mkOrder(MIN), voucher: VOUCHER, attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, paid),
    rpc: { kitchen_payment_confirm: { data: { id: 'att-1', status: 'succeeded' }, error: null } },
  });
  assert.equal(a.res.statusCode, 409); assert.equal(a.res.body.error, 'order_already_paid'); assert.equal(a.count('post'), 0);
  // lost_race (altra riga vincitrice) -> 409 needs_manual_reconciliation, nessun URL
  const b = await run({
    order: mkOrder(MIN), voucher: VOUCHER, attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, { ...paid, hosted_checkout_url: 'https://pay.sumup.com/paid' }),
    rpc: { kitchen_payment_confirm: { data: { id: 'pay-cassa', order_id: 'ord-1', status: 'succeeded', method: 'cash' }, error: null } },
  });
  assert.equal(b.res.statusCode, 409); assert.equal(b.res.body.error, 'needs_manual_reconciliation');
  assert.equal(b.res.body.hosted_checkout_url, undefined); assert.equal(b.count('post'), 0);
});

// Fix A (isolamento): sconto esattamente zero -> nessuna lettura del Club, checkout normale anche col Club giu.
const CLUB_DOWN = { data: null, error: { message: 'relation "food_club_vouchers" does not exist' } };

test('C-9 sconto esattamente zero (0, "0", "0.00", -0) + Club in errore -> checkout normale, nessuna lettura buono, corpo identico', async () => {
  for (const discount_amount of [0, '0', '0.00', -0]) {
    const r = await run({ order: mkOrder(MIN, { discount_amount }), voucher: CLUB_DOWN });
    assert.equal(r.res.statusCode, 200, String(discount_amount));
    assert.deepEqual(r.res.body, { checkout_id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x' });
    assert.equal(r.admin.__voucherQueries.length, 0, `nessuna query food_club_vouchers (${discount_amount})`);
    const post = r.calls.find((c) => c.kind === 'post');
    assert.equal(post.body, JSON.stringify(baselineBody()), 'corpo POST e importo identici a oggi');
    assert.deepEqual(r.calls.map((c) => c.kind), ['list', 'post']);
    assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 1);
    assert.equal(r.warns.length, 0);
  }
  // sconto zero, ordine vecchio e status non online: comportamento Kitchen di oggi (nessuna guardia Club)
  const old = await run({ order: mkOrder(10 * MIN, { discount_amount: 0, status: 'payment_abandoned' }), voucher: CLUB_DOWN });
  assert.equal(old.res.statusCode, 200);
  assert.equal(old.admin.__voucherQueries.length, 0);
});

test('C-10 sconto positivo/negativo/null/undefined/non numerico + Club in errore -> 503 fail closed, nessuna claim, nessuna fetch', async () => {
  for (const discount_amount of [5, '5.00', 0.01, -1, '-0.5', null, undefined, '', 'abc', NaN, '0x0', ' 0', '0.', {}, true]) {
    const r = await run({ order: mkOrder(MIN, { discount_amount }), voucher: CLUB_DOWN });
    const tag = JSON.stringify(discount_amount) ?? 'undefined';
    assert.equal(r.res.statusCode, 503, tag);
    assert.deepEqual(r.res.body, { error: 'food_club_lookup_failed' }, tag);
    assert.equal(r.admin.__voucherQueries.length, 1, `verifica del buono eseguita (${tag})`);
    assert.equal(r.rpcCount('kitchen_payment_attempt_claim_checkout'), 0, tag);
    assert.equal(r.calls.length, 0, tag);
  }
});

test('C-11 sconto positivo con buono: protezioni invariate (valid_until entro 4:30, 409 oltre)', async () => {
  const order = mkOrder(MIN, { discount_amount: 5 });
  const expected = dbValidUntil(order);
  const ok = await run({ order, voucher: VOUCHER, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: expected }) });
  assert.equal(ok.res.statusCode, 200);
  assert.equal(ok.calls.find((c) => c.kind === 'post').body, JSON.stringify({ ...baselineBody(), valid_until: expected }));
  const late = await run({ order: mkOrder(4 * MIN + 31 * 1000, { discount_amount: '5.00' }), voucher: VOUCHER });
  assert.equal(late.res.statusCode, 409);
  assert.deepEqual(late.res.body, { error: 'online_payment_expired' });
  assert.equal(late.calls.length, 0);
});

test('C-12 sconto positivo senza buono (promo) e Club disponibile -> checkout normale, corpo identico', async () => {
  const r = await run({ order: mkOrder(MIN, { discount_amount: 3 }), voucher: { data: null, error: null } });
  assert.equal(r.res.statusCode, 200);
  assert.equal(r.admin.__voucherQueries.length, 1);
  assert.equal(r.calls.find((c) => c.kind === 'post').body, JSON.stringify(baselineBody()));
});

test('C-13 la select dell\'ordine include discount_amount', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js'), 'utf8');
  assert.match(src, /\.from\('kitchen_orders'\)\s*\.select\('[^']*\bdiscount_amount\b[^']*'\)/);
});

// ---------------------------------------------------------------------------------------------------------------
// Passo 3B: intento pre-POST (food_club_record_checkout_intent)
// ---------------------------------------------------------------------------------------------------------------

test('C-14 senza buono: nessuna RPC intento, sequenza e corpo POST identici a oggi', async () => {
  for (const voucher of [{ data: null, error: null }]) {
    for (const discount_amount of [0, 3, undefined]) {
      const r = await run({ order: mkOrder(MIN, discount_amount === undefined ? {} : { discount_amount }), voucher });
      assert.equal(r.res.statusCode, 200);
      assert.equal(r.rpcCount(INTENT_RPC), 0, `nessun intento (sconto ${discount_amount})`);
      assert.equal(r.calls.find((c) => c.kind === 'post').body, JSON.stringify(baselineBody()));
      assert.deepEqual(r.admin.__rpcCalls.map((c) => c.name), ['kitchen_payment_attempt_claim_checkout', 'kitchen_payment_attempt_set_provider_ref']);
    }
  }
});

test('C-15 con buono: intento registrato DOPO claim e List, PRIMA della POST; valid_until del corpo = valore DB', async () => {
  const order = mkOrder(MIN);
  const r = await run({ order, voucher: VOUCHER, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: dbValidUntil(order) }) });
  assert.equal(r.res.statusCode, 200);
  assert.deepEqual(r.calls.map((c) => c.kind), ['list', 'post']);
  const listCall = r.calls.find((c) => c.kind === 'list');
  const postCall = r.calls.find((c) => c.kind === 'post');
  assert.deepEqual(listCall.rpcBefore, ['kitchen_payment_attempt_claim_checkout'], 'List dopo la claim, prima dell intento');
  assert.deepEqual(postCall.rpcBefore, ['kitchen_payment_attempt_claim_checkout', INTENT_RPC], 'intento prima della POST');
  assert.deepEqual(r.admin.__rpcCalls.find((c) => c.name === INTENT_RPC).params, { p_attempt_id: 'att-1' });
  assert.equal(JSON.parse(postCall.body).valid_until, dbValidUntil(order));
  assert.equal(r.warns.length, 0);
  // il valore inviato e quello del DB anche se differisce (entro 1 s) dal calcolo JS
  const dbValue = new Date(Date.parse(order.created_at) + 15 * MIN - 800).toISOString();
  const r2 = await run({ order, voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: { data: { valid_until: dbValue, already_recorded: true }, error: null } } });
  assert.equal(r2.res.statusCode, 200);
  assert.equal(JSON.parse(r2.calls.find((c) => c.kind === 'post').body).valid_until, dbValue);
});

test('C-16 intento fallito / assente / non parsabile / incoerente -> 503 food_club_intent_failed, nessuna POST', async () => {
  const order = mkOrder(MIN);
  const far = new Date(Date.parse(order.created_at) + 15 * MIN + 1500).toISOString();
  const cases = [
    { error: { message: 'connection reset' } },
    { error: { message: 'no_reserved_voucher' } },
    { error: { message: 'claim_missing' } },
    { data: null, error: null },
    { data: {}, error: null },
    { data: { valid_until: 12345 }, error: null },
    { data: { valid_until: 'boh' }, error: null },
    { data: { valid_until: far }, error: null },
    () => { throw new Error('fetch failed'); },
  ];
  for (const intent of cases) {
    const r = await run({ order, voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: intent } });
    const tag = typeof intent === 'function' ? 'throw' : JSON.stringify(intent);
    assert.equal(r.res.statusCode, 503, tag);
    assert.deepEqual(r.res.body, { error: 'food_club_intent_failed' }, tag);
    assert.equal(r.count('post'), 0, tag);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0, tag);
  }
});

test('C-17 intento rifiutato per sigillo o troppo tardi -> 409 con codice stabile, nessuna POST', async () => {
  const sealed = await run({ order: mkOrder(MIN), voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: { data: null, error: { message: 'food_club_order_sealed' } } } });
  assert.equal(sealed.res.statusCode, 409); assert.deepEqual(sealed.res.body, { error: 'food_club_order_sealed' }); assert.equal(sealed.count('post'), 0);
  const late = await run({ order: mkOrder(MIN), voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: { data: null, error: { message: 'intent_too_late' } } } });
  assert.equal(late.res.statusCode, 409); assert.deepEqual(late.res.body, { error: 'online_payment_expired' }); assert.equal(late.count('post'), 0);
});

test('C-18 claim rifiutata con food_club_order_sealed -> 409, nessuna fetch, nessun intento (anche senza buono)', async () => {
  for (const voucher of [VOUCHER, { data: null, error: null }]) {
    const r = await run({
      order: mkOrder(MIN), voucher,
      rpc: { ...RPC_OK, kitchen_payment_attempt_claim_checkout: { data: null, error: { message: 'food_club_order_sealed' } } },
    });
    assert.equal(r.res.statusCode, 409);
    assert.deepEqual(r.res.body, { error: 'food_club_order_sealed' });
    assert.equal(r.calls.length, 0);
    assert.equal(r.rpcCount(INTENT_RPC), 0);
  }
  // altri errori della claim: invariati (500 generico)
  const other = await run({ order: mkOrder(MIN), voucher: VOUCHER, rpc: { ...RPC_OK, kitchen_payment_attempt_claim_checkout: { data: null, error: { message: 'boom' } } } });
  assert.equal(other.res.statusCode, 500); assert.deepEqual(other.res.body, { error: 'internal_server_error' });
});

test('C-19 con buono: POST timeout / 5xx / 4xx non documentato / corpo illeggibile -> una sola POST; il retry usa List-first e intento idempotente', async () => {
  const order = mkOrder(MIN);
  const bad = { ok: true, status: 201, json: async () => { throw new SyntaxError('bad json'); } };
  for (const post of [Object.assign(new Error('timeout'), { name: 'TimeoutError' }), jres(500, {}), jres(502, {}), jres(422, {}), bad]) {
    const r = await run({ order, voucher: VOUCHER, post });
    assert.equal(r.res.statusCode, 503);
    assert.deepEqual(r.res.body, { error: 'checkout_outcome_unknown', retryable: true });
    assert.equal(r.count('post'), 1);
    assert.equal(r.rpcCount(INTENT_RPC), 1);
  }
  // retry: la List trova il checkout -> nessuna POST, nessun intento
  const found = await run({
    order, voucher: VOUCHER, list: jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }]),
    get: jres(200, { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1', hosted_checkout_url: 'https://pay.sumup.com/e' }),
  });
  assert.equal(found.count('post'), 0); assert.equal(found.rpcCount(INTENT_RPC), 0);
  // retry: List vuota -> intento idempotente (already_recorded, stesso valid_until) -> una POST con lo stesso valore
  const again = await run({ order, voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: { data: { valid_until: dbValidUntil(order), already_recorded: true }, error: null } } });
  assert.equal(again.count('post'), 1);
  assert.equal(JSON.parse(again.calls.find((c) => c.kind === 'post').body).valid_until, dbValidUntil(order));
});

test('C-20 deadline POST: intento lento oltre POST_START_DEADLINE -> nessuna POST (esito sconosciuto)', async () => {
  const order = mkOrder(MIN);
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  try {
    const r = await run({ order, voucher: VOUCHER, rpc: { ...RPC_OK, [INTENT_RPC]: () => { shift = 7000; return { data: { valid_until: dbValidUntil(order) }, error: null }; } } });
    assert.equal(r.res.statusCode, 503);
    assert.deepEqual(r.res.body, { error: 'checkout_outcome_unknown', retryable: true });
    assert.equal(r.count('post'), 0);
  } finally {
    Date.now = realNow;
  }
});
