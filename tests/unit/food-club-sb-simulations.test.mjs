// FASE A (2026-11-08): simulazioni SB-1..SB-7 lato JS (create-checkout, evidenza SumUp, fase di rilascio).
// Rete e Supabase SEMPRE finti: qualunque fetch non simulata viene registrata e fa fallire la suite (guardia globale).
// Le risposte SumUp qui sono INVENTATE secondo la documentazione: non sono prove del comportamento reale di SumUp.
// Esecuzione: node --test tests/unit/food-club-sb-simulations.test.mjs
// Lato DB: tests/db/food-club/95_sb_simulations.sql e p95_sb_concorrenza.sh. Report:
// ai-ops/reports/food-club-local-fase-a-sb-2026-11-08.md
// Casi gia' coperti altrove sono citati, non duplicati: C-1..C-20 (food-club-create-checkout.test.mjs),
// E-1..E-9/E-B* (api/_lib/foodClubCheckoutEvidence.test.js), test della fase (api/_lib/foodClubVoucherRelease.test.js).
// Facoltativo: SB_CASES_OUT=<file> scrive una riga JSON per caso (id, ottenuto) per il report.
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { test, before, after, beforeEach } from 'node:test';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFoodClubCheckoutEvidence } from '../../api/_lib/foodClubCheckoutEvidence.js';
import { listEvidenceFields, getEvidenceFields, runFoodClubReleasePhase } from '../../api/_lib/foodClubVoucherRelease.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIN = 60 * 1000;

// ---------------------------------------------------------------------------------------------------------------
// Guardia di rete: ogni fetch non simulata e' un errore della suite.
// ---------------------------------------------------------------------------------------------------------------
const UNMOCKED = [];
const ORIG_FETCH = globalThis.fetch;
const guardFetch = async (url) => {
  UNMOCKED.push(String(url));
  throw new Error(`fetch NON simulata: ${url}`);
};
function rec(id, obtained) {
  if (process.env.SB_CASES_OUT) appendFileSync(process.env.SB_CASES_OUT, `${JSON.stringify({ id, obtained })}\n`);
}

// ---------------------------------------------------------------------------------------------------------------
// Harness create-checkout (stesso schema di tests/unit/food-club-create-checkout.test.mjs)
// ---------------------------------------------------------------------------------------------------------------
const mockSupabasePlugin = {
  name: 'mock-supabase-client-food-club-sb',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source === '@supabase/supabase-js') return '\0virtual:supabaseJs';
  },
  load(id) {
    if (id === '\0virtual:supabaseJs') return 'export function createClient() { return globalThis.__FC_TEST_ADMIN__(); }';
  },
};

let server;
let handler;
before(async () => {
  globalThis.fetch = guardFetch;
  server = await createServer({
    root: ROOT, configFile: false, logLevel: 'error', plugins: [mockSupabasePlugin],
    ssr: { noExternal: ['@supabase/supabase-js'] }, server: { middlewareMode: true },
  });
  ({ default: handler } = await server.ssrLoadModule(path.join(ROOT, 'api/kitchen-sumup-create-checkout.js')));
});
after(async () => {
  await server.close();
  globalThis.fetch = ORIG_FETCH;
  assert.deepEqual(UNMOCKED, [], `fetch non simulate: ${UNMOCKED.join(', ')}`);
});
beforeEach(() => {
  process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  process.env.SUMUP_API_KEY = 'test-sumup-key';
  process.env.SUMUP_MERCHANT_CODE = 'test-merchant';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'prod.example.com';
});

const CALLER_ID = 'cust-1';
const isListUrl = (u) => String(u).includes('/v0.1/checkouts?checkout_reference=');
const jres = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const badJson = (status) => ({ ok: status >= 200 && status < 300, status, json: async () => { throw new SyntaxError('bad json'); } });
const errNamed = (name, msg = name) => Object.assign(new Error(msg), { name });

function makeRes() {
  const res = { statusCode: null, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}

function makeAdmin({ order, attempt, voucher, rpc }) {
  const rpcCalls = [];
  const from = (table) => {
    const b = {
      select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b, or: () => b,
      maybeSingle: async () => {
        if (table === 'food_club_vouchers') return voucher;
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
    rpcCalls,
  };
}

const INTENT_RPC = 'food_club_record_checkout_intent';
const VOUCHER = { data: { id: 'v-1' }, error: null };
const mkAttempt = (extra = {}) => ({ id: 'att-1', order_id: 'ord-1', provider: 'sumup', method: 'sumup_online', amount: 10, status: 'initiated', direction: 'charge', provider_ref: null, ...extra });
const mkOrder = (ageMs, extra = {}, nowMs = Date.now()) => ({
  id: 'ord-1', customer_id: CALLER_ID, payment_status: 'pending_online_payment', total: 10,
  status: 'pending_online_payment', created_at: new Date(nowMs - ageMs).toISOString(), discount_amount: 5, ...extra,
});
const dbValidUntil = (order) => new Date(Math.floor((Date.parse(order.created_at) + 15 * MIN) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const CO_PENDING = { id: 'co-1', status: 'PENDING', amount: 10, checkout_reference: 'att-1', hosted_checkout_url: 'https://pay.sumup.com/e' };

// list/post/get: risposta, Error, oppure funzione (n-esima chiamata) -> risposta/Error. Assente = rete non simulata.
async function run({ order, attempt = mkAttempt(), voucher = VOUCHER, rpc = {}, post, list = jres(200, []), get }) {
  const rpcAll = {
    kitchen_payment_attempt_claim_checkout: { data: { id: attempt.id }, error: null },
    kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
    [INTENT_RPC]: { data: { valid_until: dbValidUntil(order), already_recorded: false }, error: null },
    ...rpc,
  };
  const admin = makeAdmin({ order, attempt, voucher, rpc: rpcAll });
  const calls = [];
  const warns = [];
  const n = { list: 0, post: 0, get: 0 };
  const origWarn = console.warn; const origErr = console.error;
  console.warn = (...a) => warns.push(a); console.error = () => {};
  globalThis.__FC_TEST_ADMIN__ = () => admin;
  globalThis.fetch = async (url, opts = {}) => {
    const kind = isListUrl(url) ? 'list' : opts.method === 'POST' ? 'post' : 'get';
    calls.push({ kind, url: String(url), body: opts.body, rpcBefore: admin.rpcCalls.map((c) => c.name) });
    const h = { list, post, get }[kind];
    if (h === undefined) return guardFetch(url);
    n[kind] += 1;
    const r = typeof h === 'function' ? await h(n[kind]) : h;
    if (r instanceof Error) throw r;
    return r;
  };
  const res = makeRes();
  try {
    await handler({ method: 'POST', body: { order_id: 'ord-1', payment_attempt_id: attempt.id }, headers: { authorization: 'Bearer t' } }, res);
  } finally {
    globalThis.fetch = guardFetch; console.warn = origWarn; console.error = origErr;
  }
  const count = (k) => calls.filter((c) => c.kind === k).length;
  const rpcCount = (name) => admin.rpcCalls.filter((c) => c.name === name).length;
  const rpcParams = (name) => admin.rpcCalls.filter((c) => c.name === name).map((c) => c.params);
  return { res, calls, count, rpcCount, rpcParams, warns, seq: calls.map((c) => c.kind) };
}
const brief = (r) => ({ status: r.res.statusCode, body: r.res.body, seq: r.seq });

// ---------------------------------------------------------------------------------------------------------------
// Harness evidenza (api/_lib/foodClubCheckoutEvidence.js)
// ---------------------------------------------------------------------------------------------------------------
const CREATED = new Date('2026-11-08T20:00:00.000Z');
const VALID_UNTIL = new Date(CREATED.getTime() + 15 * MIN).toISOString();
const at = (min, sec = 0) => new Date(CREATED.getTime() + min * MIN + sec * 1000);
const EV_ORDER = { id: 'ord-1', created_at: CREATED.toISOString() };
const att = (id, extra = {}) => ({ id, status: 'failed', provider_ref: `co-${id}`, checkout_claim_at: '2026-11-08T20:00:05.000Z', ...extra });
const co = (id, status, extra = {}) => ({ id: `co-${id}`, checkout_reference: id, status, valid_until: VALID_UNTIL, amount: 10, currency: 'EUR', ...extra });
const getUrl = (id) => `https://api.sumup.com/v0.1/checkouts/co-${id}`;
const listUrl = (id) => `https://api.sumup.com/v0.1/checkouts?checkout_reference=${id}`;
function evFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method });
    const r = routes[String(url)];
    if (r === undefined) return guardFetch(url);
    const v = typeof r === 'function' ? r() : r;
    if (v instanceof Error) throw v;
    return v;
  };
  impl.calls = calls;
  return impl;
}
async function evidence(attempts, routes, now, flag) {
  const f = evFetch(routes);
  const origErr = console.error; console.error = () => {};
  try {
    const r = await readFoodClubCheckoutEvidence({ order: EV_ORDER, attempts, now, sumupApiKey: 'k', fetchImpl: f, terminalStatesVerified: flag });
    return { ...r, calls: f.calls };
  } finally { console.error = origErr; }
}

// ---------------------------------------------------------------------------------------------------------------
// Harness fase di rilascio (api/_lib/foodClubVoucherRelease.js), Supabase e SumUp finti
// ---------------------------------------------------------------------------------------------------------------
const REL_NOW = Date.parse('2026-11-08T21:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
function relAdmin({ payments, release = { data: { ok: true, released: false, result: 'not_released', reason: 'uncertain:x' }, error: null } }) {
  const rpcCalls = [];
  const tables = {
    food_club_vouchers: [{ reserved_order_id: 'ord-1' }],
    kitchen_orders: [{ id: 'ord-1', created_at: iso(REL_NOW - 30 * MIN), status: 'payment_abandoned' }],
    food_club_release_seals: [],
  };
  const from = (table) => {
    const b = {
      select: () => b, eq: () => b, not: () => b, in: () => b, lt: () => b, order: () => b, limit: () => b,
      then: (resolve) => resolve({ data: table === 'kitchen_payments' ? payments : (tables[table] ?? []), error: null }),
    };
    return b;
  };
  const rpcs = {
    food_club_seal_order_for_release: { data: { ok: true, already_sealed: true, sealed_at: iso(REL_NOW - 2 * MIN) }, error: null },
    food_club_record_checkout_evidence: { data: 1, error: null },
    food_club_release_voucher_after_evidence: release,
  };
  return { from, rpc: async (name, params) => { rpcCalls.push({ name, params }); return rpcs[name] ?? { data: null, error: { message: `rpc ${name}` } }; }, rpcCalls };
}
async function phase({ payments, routes }) {
  const admin = relAdmin({ payments });
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method });
    const r = routes[url];
    if (r === undefined) return guardFetch(url);
    return { status: r.status, text: async () => (r.text ?? JSON.stringify(r.body)) };
  };
  const origErr = console.error; console.error = () => {};
  try {
    const summary = await runFoodClubReleasePhase({ supabaseAdmin: admin, sumupApiKey: 'k', now: () => REL_NOW, fetchImpl });
    return { summary, calls, ev: admin.rpcCalls.filter((c) => c.name === 'food_club_record_checkout_evidence').map((c) => c.params) };
  } finally { console.error = origErr; }
}
const R_LIST = (a) => `https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(a)}`;
const R_GET = (id) => `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(id)}`;
const readOf = (status, body, text) => {
  const t = text ?? JSON.stringify(body);
  let json = null; let jsonOk = true;
  try { json = JSON.parse(t); } catch { jsonOk = false; }
  return { status, sha256: 'a'.repeat(64), json, jsonOk };
};

// =================================================================================================================
// SB-1 valid_until
// =================================================================================================================
test('SB1-01 guardia 4:30 al millisecondo: 4:29.999 procede con valid_until = intento DB, 4:30.000 -> 409 senza claim ne fetch', async () => {
  const realNow = Date.now;
  const T = realNow();
  Date.now = () => T;
  try {
    const okOrder = mkOrder(4 * MIN + 30 * 1000 - 1, {}, T);
    const ok = await run({ order: okOrder, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: dbValidUntil(okOrder) }) });
    assert.equal(ok.res.statusCode, 200);
    assert.equal(JSON.parse(ok.calls.find((c) => c.kind === 'post').body).valid_until, dbValidUntil(okOrder));
    const late = await run({ order: mkOrder(4 * MIN + 30 * 1000, {}, T) });
    assert.equal(late.res.statusCode, 409);
    assert.deepEqual(late.res.body, { error: 'online_payment_expired' });
    assert.equal(late.calls.length, 0);
    assert.equal(late.rpcCount('kitchen_payment_attempt_claim_checkout'), 0);
    rec('SB1-01', { at_4_29_999: brief(ok), at_4_30: brief(late) });
  } finally { Date.now = realNow; }
});

test('SB1-02 riuso del checkout esistente prima e dopo valid_until (attempt ancora initiated): solo GET, mai POST, nessun valid_until nuovo', async () => {
  const before = await run({ order: mkOrder(2 * MIN), attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, { ...CO_PENDING, valid_until: iso(Date.now() + 10 * MIN) }) });
  assert.equal(before.res.statusCode, 200); assert.deepEqual(before.seq, ['get']);
  // OSSERVAZIONE: il ramo riuso (Kitchen, invariato: C-5) precede la guardia 4:30. Dopo valid_until, con attempt ancora
  // initiated e SumUp che risponde PENDING, l'URL esistente viene restituito. Nessun nuovo checkout; se SumUp accettasse
  // il pagamento, e' un PAID tardivo: vince sempre (SB-5) e il buono resta trattenuto fino a prova.
  const afterVu = await run({ order: mkOrder(20 * MIN), attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, { ...CO_PENDING, valid_until: iso(Date.now() - 5 * MIN) }) });
  assert.equal(afterVu.res.statusCode, 200); assert.deepEqual(afterVu.seq, ['get']); assert.equal(afterVu.count('post'), 0);
  assert.equal(afterVu.rpcCount(INTENT_RPC), 0);
  rec('SB1-02', { before: brief(before), after_valid_until: brief(afterVu) });
});

test('SB1-03 FAILED riusabile: GET FAILED su attempt initiated -> kitchen_payment_fail(sumup_failed) e stesso URL; secondo giro con attempt failed -> 409 senza rete', async () => {
  const first = await run({ order: mkOrder(2 * MIN), attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, { ...CO_PENDING, status: 'FAILED' }) });
  assert.equal(first.res.statusCode, 200);
  assert.equal(first.res.body.hosted_checkout_url, 'https://pay.sumup.com/e');
  assert.deepEqual(first.rpcParams('kitchen_payment_fail').map((p) => p.p_reason), ['sumup_failed']);
  assert.equal(first.count('post'), 0);
  const again = await run({ order: mkOrder(3 * MIN), attempt: mkAttempt({ provider_ref: 'co-1', status: 'failed' }) });
  assert.equal(again.res.statusCode, 409);
  assert.deepEqual(again.res.body, { error: 'invalid_attempt_status', status: 'failed' });
  assert.equal(again.calls.length, 0);
  rec('SB1-03', { first: brief(first), second: brief(again) });
});

test('SB1-04 risposta 201 con valid_until assente/diverso/non stringa -> solo warn; provider_ref salvato; attempt mai fallito; evidenza: unknown', async () => {
  const order = mkOrder(MIN);
  const out = [];
  for (const extra of [{}, { valid_until: iso(Date.parse(dbValidUntil(order)) + 60 * 1000) }, { valid_until: 12345 }]) {
    const r = await run({ order, post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', ...extra }) });
    assert.equal(r.res.statusCode, 200);
    assert.equal(r.warns.length, 1);
    assert.deepEqual(r.rpcParams('kitchen_payment_attempt_set_provider_ref'), [{ p_attempt_id: 'att-1', p_provider_ref: 'co-1' }]);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
    out.push(r.res.statusCode);
  }
  // lato evidenza (flag true, +40 min): GET EXPIRED con valid_until assente o diverso -> unknown, mai not_payable
  for (const vu of [undefined, iso(Date.parse(VALID_UNTIL) + 60 * 1000), 12345]) {
    const e = await evidence([att('a')], { [getUrl('a')]: jres(200, co('a', 'EXPIRED', { valid_until: vu })) }, at(40), true);
    assert.equal(e.verdict, 'uncertain'); assert.equal(e.checkouts[0].state, 'unknown');
  }
  rec('SB1-04', { create: out, evidence: 'uncertain/unknown x3' });
});

// =================================================================================================================
// SB-2 stati
// =================================================================================================================
test('SB2-01 stati del checkout con flag spento (stato reale) dopo +40 min: solo PAID decide, tutto il resto uncertain', async () => {
  const got = {};
  for (const [status, state, verdict] of [['PENDING', 'pending', 'uncertain'], ['FAILED', 'failed', 'uncertain'], ['EXPIRED', 'expired', 'uncertain'],
    ['PAID', 'paid', 'paid'], ['PROCESSING', 'unknown', 'uncertain'], ['CANCELLED', 'unknown', 'uncertain'], ['SUCCESSFUL', 'unknown', 'uncertain']]) {
    const e = await evidence([att('a')], { [getUrl('a')]: jres(200, co('a', status)) }, at(40), false);
    assert.equal(e.verdict, verdict, status); assert.equal(e.checkouts[0].state, state, status);
    got[status] = `${e.checkouts[0].state}/${e.verdict}`;
  }
  rec('SB2-01', got);
});

test('SB2-02 flag acceso (solo test): FAILED/EXPIRED -> not_payable (controllo positivo), CANCELLED e stati sconosciuti -> uncertain', async () => {
  const got = {};
  for (const [status, verdict] of [['FAILED', 'not_payable'], ['EXPIRED', 'not_payable'], ['CANCELLED', 'uncertain'], ['PROCESSING', 'uncertain'], ['PENDING', 'uncertain']]) {
    const e = await evidence([att('a')], { [getUrl('a')]: jres(200, co('a', status)) }, at(40), true);
    assert.equal(e.verdict, verdict, status);
    got[status] = e.verdict;
  }
  // FAILED + CANCELLED su due attempt: basta l'incerto per bloccare
  const mix = await evidence([att('a'), att('b')], { [getUrl('a')]: jres(200, co('a', 'FAILED')), [getUrl('b')]: jres(200, co('b', 'CANCELLED')) }, at(40), true);
  assert.equal(mix.verdict, 'uncertain');
  got['FAILED+CANCELLED'] = mix.verdict;
  rec('SB2-02', got);
});

test('SB2-03 transazioni con stati vari: il verdetto usa solo lo stato del checkout; transactions mai nelle evidenze', async () => {
  const cases = [
    ['PENDING', [{ status: 'SUCCESSFUL' }], 'pending', 'uncertain'],
    ['EXPIRED', [{ status: 'CANCELLED' }, { status: 'FAILED' }], 'expired', 'uncertain'],
    ['FAILED', [{ status: 'CANCELLED' }], 'failed', 'uncertain'],
    ['PAID', [{ status: 'REFUNDED' }], 'paid', 'paid'],
    ['PAID', [{ status: 'PENDING' }], 'paid', 'paid'],
  ];
  const got = [];
  for (const [status, transactions, state, verdict] of cases) {
    const body = co('a', status, { transactions: transactions.map((t) => ({ ...t, card: { last_4_digits: '4242' }, id: 'tx-1' })) });
    const e = await evidence([att('a')], { [getUrl('a')]: jres(200, body) }, at(40), false);
    assert.equal(e.checkouts[0].state, state); assert.equal(e.verdict, verdict);
    const fields = getEvidenceFields(readOf(200, body));
    assert.deepEqual(Object.keys(fields).sort(), ['amount', 'body_sha256', 'checkout_id', 'checkout_reference', 'currency', 'http_status', 'sumup_status', 'valid_until']);
    assert.equal(JSON.stringify(fields).includes('4242'), false, 'nessun dato carta');
    got.push(`${status}+${transactions.map((t) => t.status).join('/')}=${verdict}`);
  }
  rec('SB2-03', got);
});

test('SB2-04 nota Kitchen (non modificata): riuso con GET CANCELLED -> kitchen_payment_fail(sumup_cancelled) e 409 attempt_no_longer_valid (ramo morto: stato non documentato)', async () => {
  const r = await run({ order: mkOrder(2 * MIN), attempt: mkAttempt({ provider_ref: 'co-1' }), get: jres(200, { ...CO_PENDING, status: 'CANCELLED' }) });
  assert.equal(r.res.statusCode, 409);
  assert.deepEqual(r.res.body, { error: 'attempt_no_longer_valid', reason: 'cancelled' });
  assert.deepEqual(r.rpcParams('kitchen_payment_fail').map((p) => p.p_reason), ['sumup_cancelled']);
  assert.equal(r.count('post'), 0);
  rec('SB2-04', brief(r));
});

// =================================================================================================================
// SB-3 POST con esito incerto
// =================================================================================================================
test('SB3-01 POST incerta (abort/timeout/rete persa/5xx/4xx non documentati/2xx illeggibile) -> 503 checkout_outcome_unknown, attempt NON fallito', async () => {
  const cases = {
    abort: errNamed('AbortError', 'This operation was aborted'),
    timeout: errNamed('TimeoutError'),
    rete_persa: new TypeError('fetch failed'),
    http500: jres(500, {}), http502: jres(502, {}), http503: jres(503, {}), http504: badJson(504),
    http404: jres(404, { error_code: 'NOT_FOUND' }), http422: jres(422, {}), http429: jres(429, {}),
    http201_illeggibile: badJson(201), http200_illeggibile: badJson(200),
  };
  const got = {};
  for (const [name, post] of Object.entries(cases)) {
    const r = await run({ order: mkOrder(MIN), post });
    assert.equal(r.res.statusCode, 503, name);
    assert.deepEqual(r.res.body, { error: 'checkout_outcome_unknown', retryable: true }, name);
    assert.equal(r.count('post'), 1, name);
    assert.deepEqual(r.seq, ['list', 'post'], name);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0, `${name}: attempt mai fallito`);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0, name);
    assert.equal(r.rpcCount(INTENT_RPC), 1, name);
    got[name] = r.res.body.error;
  }
  rec('SB3-01', got);
});

test('SB3-02 4xx documentati (400/401/403) -> 502 sumup_create_checkout_failed ma attempt NON fallito (resta P-C: claim + intento)', async () => {
  const got = {};
  for (const s of [400, 401, 403]) {
    const r = await run({ order: mkOrder(MIN), post: jres(s, { error_code: s === 400 ? 'MISSING' : 'FORBIDDEN' }) });
    assert.equal(r.res.statusCode, 502); assert.deepEqual(r.res.body, { error: 'sumup_create_checkout_failed' });
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
    got[s] = r.res.body.error;
  }
  rec('SB3-02', got);
});

test('SB3-03 retry dopo esito ignoto: List 1 match -> lega provider_ref, GET, riuso; nessuna POST, nessun intento', async () => {
  const r = await run({ order: mkOrder(MIN), list: jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }]), get: jres(200, CO_PENDING) });
  assert.equal(r.res.statusCode, 200); assert.deepEqual(r.seq, ['list', 'get']);
  assert.deepEqual(r.rpcParams('kitchen_payment_attempt_set_provider_ref'), [{ p_attempt_id: 'att-1', p_provider_ref: 'co-1' }]);
  assert.equal(r.rpcCount(INTENT_RPC), 0);
  rec('SB3-03', brief(r));
});

test('SB3-04 retry con List vuota e claim presente: la create riprova (stesso reference, intento idempotente); l evidenza resta unknown, mai never_created', async () => {
  const order = mkOrder(MIN);
  const r = await run({ order, rpc: { [INTENT_RPC]: { data: { valid_until: dbValidUntil(order), already_recorded: true }, error: null } },
    post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: dbValidUntil(order) }) });
  assert.equal(r.res.statusCode, 200); assert.deepEqual(r.seq, ['list', 'post']);
  assert.equal(JSON.parse(r.calls.find((c) => c.kind === 'post').body).checkout_reference, 'att-1');
  // evidenza (sweep): provider_ref NULL, claim presente, List vuota, flag acceso, +60 min -> unknown
  const e = await evidence([att('a', { provider_ref: null })], { [listUrl('a')]: jres(200, []) }, at(60), true);
  assert.equal(e.verdict, 'uncertain'); assert.equal(e.checkouts[0].reason, 'list_not_found_claim_present');
  rec('SB3-04', { create: brief(r), evidence: e.checkouts[0].reason });
});

test('SB3-05 List ambigua (2 match) -> 409 needs_manual_reconciliation, nessuna POST, nessun intento', async () => {
  const r = await run({ order: mkOrder(MIN), list: jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }, { id: 'co-2', checkout_reference: 'att-1' }]) });
  assert.equal(r.res.statusCode, 409); assert.deepEqual(r.res.body, { error: 'needs_manual_reconciliation' });
  assert.deepEqual(r.seq, ['list']); assert.equal(r.rpcCount(INTENT_RPC), 0);
  rec('SB3-05', brief(r));
});

test('SB3-06 List in errore (500/401/timeout/non array/JSON rotto) -> 503 unknown, nessuna POST, nessun intento', async () => {
  const got = {};
  for (const [name, list] of Object.entries({ http500: jres(500, {}), http401: jres(401, {}), timeout: errNamed('TimeoutError'),
    oggetto: jres(200, { items: [] }), json_rotto: badJson(200) })) {
    const r = await run({ order: mkOrder(MIN), list });
    assert.equal(r.res.statusCode, 503, name); assert.deepEqual(r.res.body, { error: 'checkout_outcome_unknown', retryable: true }, name);
    assert.deepEqual(r.seq, ['list'], name); assert.equal(r.rpcCount(INTENT_RPC), 0, name);
    got[name] = r.res.statusCode;
  }
  rec('SB3-06', got);
});

test('SB3-07 POST arrivata dopo: 1a richiesta timeout (List vuota), 2a richiesta List con 1 match -> riuso; una sola POST in totale', async () => {
  const order = mkOrder(MIN);
  const first = await run({ order, post: errNamed('TimeoutError') });
  const second = await run({ order, list: jres(200, [{ id: 'co-late', checkout_reference: 'att-1' }]), get: jres(200, { ...CO_PENDING, id: 'co-late' }) });
  assert.equal(first.res.statusCode, 503); assert.equal(second.res.statusCode, 200);
  assert.equal(first.count('post') + second.count('post'), 1);
  assert.equal(second.res.body.checkout_id, 'co-late');
  rec('SB3-07', { first: brief(first), second: brief(second) });
});

// =================================================================================================================
// SB-4 GET/List anomale: nessuna produce not_payable
// =================================================================================================================
test('SB4-01 GET anomale con flag ACCESO dopo +40 min -> uncertain (id, reference, valid_until, tipi, corpo non oggetto, 404)', async () => {
  const cases = {
    id_diverso: jres(200, co('a', 'EXPIRED', { id: 'co-altro' })),
    reference_diversa: jres(200, co('a', 'EXPIRED', { checkout_reference: 'altro' })),
    valid_until_diverso: jres(200, co('a', 'EXPIRED', { valid_until: iso(Date.parse(VALID_UNTIL) + 5000) })),
    valid_until_assente: jres(200, co('a', 'EXPIRED', { valid_until: undefined })),
    valid_until_numero: jres(200, co('a', 'EXPIRED', { valid_until: Date.parse(VALID_UNTIL) })),
    status_numero: jres(200, co('a', 7)),
    status_assente: jres(200, co('a', undefined)),
    corpo_array: jres(200, [co('a', 'EXPIRED')]),
    corpo_stringa: jres(200, 'EXPIRED'),
    corpo_null: jres(200, null),
    json_rotto: badJson(200),
    http404: jres(404, { error_code: 'NOT_FOUND' }),
  };
  const got = {};
  for (const [name, resp] of Object.entries(cases)) {
    const e = await evidence([att('a')], { [getUrl('a')]: resp }, at(40), true);
    assert.equal(e.verdict, 'uncertain', name); assert.equal(e.checkouts[0].state, 'unknown', name);
    got[name] = e.checkouts[0].reason;
  }
  rec('SB4-01', got);
});

test('SB4-02 importo/valuta/merchant diversi con flag spento (stato reale) -> uncertain; il legame autorevole e nell SQL (S8, SB4-S1)', async () => {
  const got = {};
  for (const [name, extra] of Object.entries({ importo: { amount: 99 }, valuta: { currency: 'USD' }, merchant: { merchant_code: 'ALTRO' } })) {
    const e = await evidence([att('a')], { [getUrl('a')]: jres(200, co('a', 'EXPIRED', extra)) }, at(40), false);
    assert.equal(e.verdict, 'uncertain', name);
    got[name] = e.verdict;
  }
  rec('SB4-02', got);
});

test('SB4-03 List anomale per attempt senza provider_ref (claim presente), flag acceso, +60 min -> uncertain', async () => {
  const cases = {
    non_array: jres(200, { items: [] }),
    solo_altri_reference: jres(200, [{ id: 'co-x', checkout_reference: 'altro' }]),
    elementi_non_oggetto: jres(200, ['co-a', 7, null]),
    due_match: jres(200, [{ id: 'co-1', checkout_reference: 'a' }, { id: 'co-2', checkout_reference: 'a' }]),
    match_senza_id: jres(200, [{ checkout_reference: 'a' }]),
    http500: jres(500, []),
  };
  const got = {};
  for (const [name, resp] of Object.entries(cases)) {
    const e = await evidence([att('a', { provider_ref: null })], { [listUrl('a')]: resp }, at(60), true);
    assert.equal(e.verdict, 'uncertain', name);
    got[name] = e.checkouts[0].reason;
  }
  rec('SB4-03', got);
});

test('SB4-04 fase di rilascio: List con soli elementi di altri reference o non oggetto -> list_count OMESSO (fix fase A); vuota -> 0; misto -> 1', () => {
  const only = listEvidenceFields(readOf(200, [{ id: 'co-x', checkout_reference: 'att-2' }]), 'att-1');
  assert.equal(only.list_count, undefined); assert.equal(only.http_status, 200);
  const junk = listEvidenceFields(readOf(200, [null, 'x', 3]), 'att-1');
  assert.equal(junk.list_count, undefined);
  assert.equal(listEvidenceFields(readOf(200, []), 'att-1').list_count, 0);
  const mixed = listEvidenceFields(readOf(200, [{ id: 'co-1', checkout_reference: 'att-1' }, { id: 'co-x', checkout_reference: 'att-2' }]), 'att-1');
  assert.equal(mixed.list_count, 1); assert.equal(mixed.checkout_id, 'co-1');
  rec('SB4-04', { solo_altri: only.list_count ?? 'omesso', non_oggetto: junk.list_count ?? 'omesso', vuota: 0, misto: mixed.list_count });
});

test('SB4-05 fase di rilascio P-C: List con soli altri reference -> evidenza senza list_count, nessuna GET, rilascio deciso dall SQL', async () => {
  const payments = [{ id: 'att-1', provider: 'sumup', provider_ref: null, checkout_claim_at: iso(REL_NOW - 29 * MIN), amount: 10, status: 'initiated' }];
  const { calls, ev, summary } = await phase({ payments, routes: { [R_LIST('att-1')]: { status: 200, body: [{ id: 'co-x', checkout_reference: 'att-9' }] } } });
  assert.deepEqual(calls.map((c) => c.url), [R_LIST('att-1')]);
  assert.equal(ev.length, 1); assert.equal(ev[0].p_kind, 'list');
  assert.equal(Object.hasOwn(ev[0].p_fields, 'list_count'), false);
  assert.equal(summary.released.length, 0);
  rec('SB4-05', { fields: Object.keys(ev[0].p_fields).sort(), released: summary.released.length });
});

// =================================================================================================================
// SB-5 PAID tardivo (lato JS; il lato DB e' in 95_sb_simulations.sql SB5-S*)
// =================================================================================================================
test('SB5-01 PAID vince anche se tardivo, con valid_until assente/diverso o altri attempt incerti, prima e dopo +17', async () => {
  const got = {};
  for (const [name, now] of [['dopo_6min', at(6)], ['dopo_40min', at(40)]]) {
    const e = await evidence([att('a'), att('b'), att('c', { provider_ref: null })], {
      [getUrl('a')]: jres(200, co('a', 'PAID', { valid_until: undefined })),
      [getUrl('b')]: jres(200, co('b', 'CANCELLED')),
      [listUrl('c')]: jres(500, {}),
    }, now, true);
    assert.equal(e.verdict, 'paid', name);
    got[name] = e.checkouts.map((c) => c.state).join('/');
  }
  rec('SB5-01', got);
});

test('SB5-02 fase di rilascio: GET PAID registrata anche dopo una List vuota precedente (POST arrivata dopo) -> evidenza PAID, nessun rilascio dal JS', async () => {
  const payments = [{ id: 'att-1', provider: 'sumup', provider_ref: null, checkout_claim_at: iso(REL_NOW - 29 * MIN), amount: 10, status: 'initiated' }];
  const paid = { id: 'co-late', checkout_reference: 'att-1', status: 'PAID', amount: 10, currency: 'EUR', merchant_code: 'M1', valid_until: '2026-11-08T20:45:00Z' };
  const { calls, ev, summary } = await phase({ payments, routes: { [R_LIST('att-1')]: { status: 200, body: [paid] }, [R_GET('co-late')]: { status: 200, body: paid } } });
  assert.deepEqual(calls.map((c) => c.url), [R_LIST('att-1'), R_GET('co-late')]);
  assert.equal(ev[1].p_fields.sumup_status, 'PAID');
  assert.equal(summary.released.length, 0);
  rec('SB5-02', { ev: ev.map((e) => `${e.p_kind}:${e.p_fields.sumup_status ?? '-'}`), released: summary.released.length });
});

// =================================================================================================================
// SB-6 duplicati
// =================================================================================================================
test('SB6-01 409 DUPLICATED_CHECKOUT -> List: 0 match unknown, 2 match manuale, List in errore unknown; mai una seconda POST', async () => {
  const dup = jres(409, { error_code: 'DUPLICATED_CHECKOUT' });
  const got = {};
  for (const [name, second, status, error] of [
    ['zero', jres(200, []), 503, 'checkout_outcome_unknown'],
    ['due', jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }, { id: 'co-2', checkout_reference: 'att-1' }]), 409, 'needs_manual_reconciliation'],
    ['errore', jres(500, {}), 503, 'checkout_outcome_unknown'],
    ['duplicato_stesso_id', jres(200, [{ id: 'co-1', checkout_reference: 'att-1' }, { id: 'co-1', checkout_reference: 'att-1' }]), 409, 'needs_manual_reconciliation'],
  ]) {
    const r = await run({ order: mkOrder(MIN), post: dup, list: (n) => (n === 1 ? jres(200, []) : second) });
    assert.equal(r.res.statusCode, status, name); assert.equal(r.res.body.error, error, name);
    assert.deepEqual(r.seq, ['list', 'post', 'list'], name);
    assert.equal(r.rpcCount('kitchen_payment_fail'), 0, name);
    got[name] = `${r.res.statusCode} ${r.res.body.error}`;
  }
  rec('SB6-01', got);
});

test('SB6-02 409 senza error_code DUPLICATED (altro codice, corpo vuoto o illeggibile) -> unknown, nessuna List dopo, una sola POST', async () => {
  const got = {};
  for (const [name, post] of Object.entries({ altro_codice: jres(409, { error_code: 'CHECKOUT_PROCESSED' }), vuoto: jres(409, {}), illeggibile: badJson(409) })) {
    const r = await run({ order: mkOrder(MIN), post });
    assert.equal(r.res.statusCode, 503, name); assert.deepEqual(r.seq, ['list', 'post'], name);
    got[name] = r.res.body.error;
  }
  rec('SB6-02', got);
});

test('SB6-03 doppio click: claim persa (riga NULL) -> 409 checkout_creation_in_progress, nessuna fetch, nessun intento', async () => {
  const r = await run({ order: mkOrder(MIN), rpc: { kitchen_payment_attempt_claim_checkout: { data: { id: null }, error: null } } });
  assert.equal(r.res.statusCode, 409); assert.deepEqual(r.res.body, { error: 'checkout_creation_in_progress' });
  assert.equal(r.calls.length, 0); assert.equal(r.rpcCount(INTENT_RPC), 0);
  rec('SB6-03', brief(r));
});

test('SB6-04 doppio click CONCORRENTE (due richieste insieme, claim atomica finta): una POST, una 200 e una 409 in_progress', async () => {
  const order = mkOrder(MIN);
  let claimed = false;
  const rpcCalls = [];
  const admin = makeAdmin({ order, attempt: mkAttempt(), voucher: VOUCHER, rpc: {
    kitchen_payment_attempt_claim_checkout: () => { const won = !claimed; claimed = true; return { data: { id: won ? 'att-1' : null }, error: null }; },
    [INTENT_RPC]: { data: { valid_until: dbValidUntil(order), already_recorded: false }, error: null },
  } });
  const origRpc = admin.rpc;
  admin.rpc = async (name, params) => { rpcCalls.push(name); return origRpc(name, params); };
  const calls = [];
  const origErr = console.error; console.error = () => {};
  globalThis.__FC_TEST_ADMIN__ = () => admin;
  globalThis.fetch = async (url, opts = {}) => {
    const kind = isListUrl(url) ? 'list' : opts.method === 'POST' ? 'post' : 'get';
    calls.push(kind);
    await new Promise((r) => setTimeout(r, 5));
    if (kind === 'list') return jres(200, []);
    if (kind === 'post') return jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: dbValidUntil(order) });
    return guardFetch(url);
  };
  const a = makeRes(); const b = makeRes();
  try {
    await Promise.all([
      handler({ method: 'POST', body: { order_id: 'ord-1', payment_attempt_id: 'att-1' }, headers: { authorization: 'Bearer t' } }, a),
      handler({ method: 'POST', body: { order_id: 'ord-1', payment_attempt_id: 'att-1' }, headers: { authorization: 'Bearer t' } }, b),
    ]);
  } finally { globalThis.fetch = guardFetch; console.error = origErr; }
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409]);
  assert.equal(calls.filter((k) => k === 'post').length, 1);
  assert.equal(rpcCalls.filter((n) => n === INTENT_RPC).length, 1);
  rec('SB6-04', { status: [a.statusCode, b.statusCode], posts: 1 });
});

// =================================================================================================================
// SB-7 valid_until gia' passato
// =================================================================================================================
test('SB7-01 intento rifiutato intent_too_late / sigillo -> 409, nessuna POST (C-17 copre i codici; qui anche nessun provider_ref)', async () => {
  const got = {};
  for (const msg of ['intent_too_late', 'food_club_order_sealed']) {
    const r = await run({ order: mkOrder(MIN), rpc: { [INTENT_RPC]: { data: null, error: { message: msg } } } });
    assert.equal(r.res.statusCode, 409); assert.equal(r.count('post'), 0);
    assert.equal(r.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
    got[msg] = r.res.body.error;
  }
  rec('SB7-01', got);
});

test('SB7-02 orologio Vercel indietro di 16 min (guardia 4:30 aggirata): POST con valid_until GIA PASSATO; SumUp 201 o 400 -> mai prova di non pagabilita', async () => {
  const realNow = Date.now;
  const T = realNow();
  const order = mkOrder(16 * MIN, {}, T);                        // created_at secondo il DB: 16 min fa
  const pastVu = dbValidUntil(order);                            // created_at + 15 min = 1 min fa
  Date.now = () => T - 15 * MIN;                                 // il server crede che l'ordine abbia 1 minuto
  const got = {};
  try {
    const accepted = await run({ order, rpc: { [INTENT_RPC]: { data: { valid_until: pastVu, already_recorded: false }, error: null } },
      post: jres(201, { id: 'co-1', hosted_checkout_url: 'https://pay.sumup.com/x', valid_until: pastVu }) });
    const sent = JSON.parse(accepted.calls.find((c) => c.kind === 'post').body).valid_until;
    assert.ok(Date.parse(sent) < T, 'valid_until inviato gia passato');
    assert.equal(accepted.res.statusCode, 200);
    assert.equal(accepted.rpcCount('kitchen_payment_fail'), 0);
    got.sumup_201 = { status: accepted.res.statusCode, provider_ref: accepted.rpcParams('kitchen_payment_attempt_set_provider_ref')[0]?.p_provider_ref };
    const refused = await run({ order, rpc: { [INTENT_RPC]: { data: { valid_until: pastVu, already_recorded: false }, error: null } },
      post: jres(400, { error_code: 'INVALID', param: 'valid_until' }) });
    assert.equal(refused.res.statusCode, 502);
    assert.equal(refused.rpcCount('kitchen_payment_fail'), 0, 'attempt non fallito: resta P-C (claim + intento)');
    assert.equal(refused.rpcCount('kitchen_payment_attempt_set_provider_ref'), 0);
    got.sumup_400 = { status: refused.res.statusCode, body: refused.res.body };
  } finally { Date.now = realNow; }
  // evidenza del checkout accettato: PENDING con valid_until passato -> mai not_payable dal JS (anche a flag acceso)
  const e = await evidence([att('a')], { [getUrl('a')]: jres(200, co('a', 'PENDING')) }, at(60), true);
  assert.equal(e.verdict, 'uncertain');
  got.evidenza_pending_dopo_scadenza = e.verdict;
  rec('SB7-02', got);
});

test('SB-guardia: nessuna fetch reale chiamata finora', () => {
  assert.deepEqual(UNMOCKED, []);
});
