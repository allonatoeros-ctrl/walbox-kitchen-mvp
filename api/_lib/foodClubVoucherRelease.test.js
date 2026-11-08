// Food Club Passo 3B — test unitari della fase di rilascio. Rete e Supabase SEMPRE finti.
//   node --test api/_lib/foodClubVoucherRelease.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  isFoodClubReleaseEnabled, runFoodClubReleasePhase, makeReadOnlySumupFetch,
  listEvidenceFields, getEvidenceFields, checkoutFields, SUMUP_READ_TIMEOUT_MS,
} from './foodClubVoucherRelease.js';

const NOW = Date.parse('2026-11-08T21:00:00Z');
const MIN = 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

// --- Supabase finto ---------------------------------------------------------------------------------------------
// tables: { food_club_vouchers: rows | {error}, kitchen_orders: rows, food_club_release_seals: rows,
//           kitchen_payments: { [orderId]: rows } }; rpc: { name: obj | fn(params) | {throw} }
function fakeAdmin({ tables = {}, rpc = {} } = {}) {
  const queries = [];
  const rpcCalls = [];
  const from = (table) => {
    const q = { table, filters: [] };
    queries.push(q);
    const b = {
      select: (s) => { q.select = s; return b; },
      eq: (c, v) => { q.filters.push(['eq', c, v]); return b; },
      not: (c, o, v) => { q.filters.push(['not', c, o, v]); return b; },
      in: (c, v) => { q.filters.push(['in', c, v]); return b; },
      lt: (c, v) => { q.filters.push(['lt', c, v]); return b; },
      order: (c, o) => { q.order = [c, o]; return b; },
      limit: (n) => { q.limit = n; return b; },
      then: (resolve, reject) => {
        try {
          const t = tables[table];
          if (t && t.error) return resolve({ data: null, error: t.error });
          if (t && t.throw) throw new Error(t.throw);
          if (table === 'kitchen_payments') {
            const orderId = q.filters.find((f) => f[1] === 'order_id')?.[2];
            return resolve({ data: (t || {})[orderId] ?? [], error: null });
          }
          return resolve({ data: t ?? [], error: null });
        } catch (e) { return reject(e); }
      },
    };
    return b;
  };
  return {
    from,
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      const h = rpc[name];
      if (h && h.throw) throw new Error(h.throw);
      const r = typeof h === 'function' ? h(params) : h;
      return r ?? { data: null, error: { message: `unexpected rpc ${name}` } };
    },
    queries, rpcCalls,
  };
}

// --- SumUp finto: solo GET; registra metodo/opzioni -------------------------------------------------------------
function fakeSumup(routes = {}) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    const r = routes[url];
    if (!r) throw new Error(`unexpected ${url}`);
    const v = typeof r === 'function' ? r() : r;
    if (v instanceof Error) throw v;
    return { status: v.status, text: async () => (v.textThrows ? Promise.reject(new Error('body')) : v.text ?? JSON.stringify(v.body)) };
  };
  return { fetchImpl, calls };
}
const LIST = (a) => `https://api.sumup.com/v0.1/checkouts?checkout_reference=${encodeURIComponent(a)}`;
const GET = (id) => `https://api.sumup.com/v0.1/checkouts/${encodeURIComponent(id)}`;

const ORDER = { id: 'ord-1', created_at: iso(NOW - 30 * MIN), status: 'payment_abandoned' };
const SEAL_OLD = { data: { ok: true, already_sealed: true, sealed_at: iso(NOW - 2 * MIN) }, error: null };
const RELEASED = { data: { ok: true, released: true, result: 'released' }, error: null };
const NOT_RELEASED = { data: { ok: true, released: false, result: 'not_released', reason: 'uncertain:no_intent' }, error: null };
const EV_OK = { data: 1, error: null };
const coBody = (over = {}) => ({ id: 'co-1', checkout_reference: 'att-1', amount: 10, currency: 'EUR', status: 'PENDING', merchant_code: 'M1', valid_until: '2026-11-08T20:45:00Z', ...over });

function baseTables(over = {}) {
  return {
    food_club_vouchers: [{ reserved_order_id: 'ord-1' }],
    kitchen_orders: [ORDER],
    food_club_release_seals: [],
    kitchen_payments: { 'ord-1': [{ id: 'att-1', provider: 'sumup', provider_ref: 'co-1', checkout_claim_at: iso(NOW - 29 * MIN), amount: 10, status: 'pending' }] },
    ...over,
  };
}
const evCalls = (admin) => admin.rpcCalls.filter((c) => c.name === 'food_club_record_checkout_evidence');

async function phase({ tables = baseTables(), rpc = {}, routes = {}, now = () => NOW, budgetMs, maxOrders } = {}) {
  const admin = fakeAdmin({
    tables,
    rpc: {
      food_club_seal_order_for_release: SEAL_OLD,
      food_club_record_checkout_evidence: EV_OK,
      food_club_release_voucher_after_evidence: NOT_RELEASED,
      ...rpc,
    },
  });
  const sumup = fakeSumup(routes);
  const origErr = console.error;
  console.error = () => {};
  try {
    const summary = await runFoodClubReleasePhase({ supabaseAdmin: admin, sumupApiKey: 'k', now, fetchImpl: sumup.fetchImpl, budgetMs, maxOrders });
    return { summary, admin, sumup };
  } finally {
    console.error = origErr;
  }
}

// --- flag ---------------------------------------------------------------------------------------------------------
test('flag: acceso solo con la stringa esatta "true"', () => {
  assert.equal(isFoodClubReleaseEnabled({}), false);
  for (const v of ['1', 'TRUE', 'True', 'yes', ' true', 'true ', '', undefined]) {
    assert.equal(isFoodClubReleaseEnabled({ FOOD_CLUB_RELEASE_ENABLED: v }), false, String(v));
  }
  assert.equal(isFoodClubReleaseEnabled({ FOOD_CLUB_RELEASE_ENABLED: 'true' }), true);
  assert.equal(isFoodClubReleaseEnabled(undefined), false);
});

// --- wrapper sola lettura -------------------------------------------------------------------------------------------
test('wrapper: POST/DELETE/PUT/PATCH rifiutati prima della rete; GET con redirect error e timeout', async () => {
  const calls = [];
  const f = makeReadOnlySumupFetch(async (url, opts) => { calls.push({ url, opts }); return { status: 200, text: async () => '[]' }; }, 'key');
  for (const method of ['POST', 'DELETE', 'put', 'PATCH']) {
    await assert.rejects(() => f(GET('co-1'), { method }), /vietato/);
  }
  await assert.rejects(() => f('https://evil.example/v0.1/checkouts'), /URL non ammesso/);
  await assert.rejects(() => f(GET('co-1'), { body: 'x' }), /corpo vietato/);
  assert.equal(calls.length, 0);
  await f(GET('co-1'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].opts.redirect, 'error');
  assert.ok(calls[0].opts.signal instanceof AbortSignal);
  assert.ok(SUMUP_READ_TIMEOUT_MS <= 4000);
  assert.equal(calls[0].opts.body, undefined);
});

// --- normalizzazione pura -------------------------------------------------------------------------------------------
test('normalizzazione: campi di tipo sbagliato omessi, il resto (incluso PAID) resta', () => {
  const f = checkoutFields({
    id: 'co-1', checkout_reference: 'att-1', status: 'PAID', amount: '10.00', currency: 42, merchant_code: 'x'.repeat(201),
    valid_until: 'domani', transactions: [{ card: { last_4_digits: '1234' } }], customer_id: 'c',
  });
  assert.deepEqual(f, { checkout_id: 'co-1', checkout_reference: 'att-1', sumup_status: 'PAID' });
  assert.deepEqual(Object.keys(checkoutFields({ amount: 10.123 })), [], 'amount con 3 decimali omesso');
  assert.deepEqual(checkoutFields({ amount: 10.5 }), { amount: 10.5 });
  assert.deepEqual(checkoutFields({ amount: -1 }), {});
  assert.deepEqual(checkoutFields({ amount: 1e21 }), {});
  assert.deepEqual(checkoutFields({ valid_until: '2026-11-08T20:45:00+00:00' }), { valid_until: '2026-11-08T20:45:00+00:00' });
  assert.deepEqual(checkoutFields(null), {});
  assert.deepEqual(checkoutFields([coBody()]), {});
});

test('List: 0 / 1 / 2 risultati, elementi di altri attempt ignorati, body non array, non-2xx', () => {
  const r = (status, body, text) => {
    const t = text ?? JSON.stringify(body);
    let json = null; let jsonOk = true;
    try { json = JSON.parse(t); } catch { jsonOk = false; }
    return { status, sha256: sha(t), json, jsonOk };
  };
  assert.deepEqual(listEvidenceFields(r(200, []), 'att-1'), { http_status: 200, body_sha256: sha('[]'), list_count: 0 });
  const one = listEvidenceFields(r(200, [coBody(), coBody({ id: 'x', checkout_reference: 'att-2' })]), 'att-1');
  assert.equal(one.list_count, 1); assert.equal(one.checkout_id, 'co-1'); assert.equal(one.sumup_status, 'PENDING');
  const two = listEvidenceFields(r(200, [coBody(), coBody({ id: 'co-2' })]), 'att-1');
  assert.equal(two.list_count, 2); assert.equal(two.checkout_id, undefined, 'con 2 risultati nessun campo del singolo');
  const obj = listEvidenceFields(r(200, { items: [] }), 'att-1');
  assert.equal(obj.list_count, undefined); assert.equal(obj.http_status, 200);
  const broken = listEvidenceFields(r(200, null, '[{"id":'), 'att-1');
  assert.deepEqual(Object.keys(broken).sort(), ['body_sha256', 'http_status']);
  const e5 = listEvidenceFields(r(503, [coBody()]), 'att-1');
  assert.deepEqual(Object.keys(e5).sort(), ['body_sha256', 'http_status'], 'non-2xx: nessun campo del corpo');
  assert.equal(e5.http_status, 503);
});

test('GET: 2xx con campi, non-2xx e JSON malformato solo http_status + hash', () => {
  const t = JSON.stringify(coBody({ status: 'PAID' }));
  const ok = getEvidenceFields({ status: 200, sha256: sha(t), json: JSON.parse(t), jsonOk: true });
  assert.equal(ok.sumup_status, 'PAID'); assert.equal(ok.body_sha256, sha(t)); assert.equal(ok.amount, 10);
  const e = getEvidenceFields({ status: 500, sha256: sha('x'), json: { status: 'PAID' }, jsonOk: true });
  assert.deepEqual(e, { http_status: 500, body_sha256: sha('x') });
  const m = getEvidenceFields({ status: 200, sha256: sha('{'), json: null, jsonOk: false });
  assert.deepEqual(m, { http_status: 200, body_sha256: sha('{') });
});

// --- fase ---------------------------------------------------------------------------------------------------------
test('fase: P-B List + GET registrate (hash del testo grezzo), poi rilascio chiesto all SQL', async () => {
  const listText = JSON.stringify([coBody()]);
  const getText = JSON.stringify(coBody());
  const { summary, admin, sumup } = await phase({
    routes: { [LIST('att-1')]: { status: 200, text: listText }, [GET('co-1')]: { status: 200, text: getText } },
  });
  assert.deepEqual(sumup.calls.map((c) => c.url), [LIST('att-1'), GET('co-1')]);
  assert.ok(sumup.calls.every((c) => c.opts.method === 'GET' && c.opts.redirect === 'error' && c.opts.body === undefined));
  const ev = evCalls(admin);
  assert.equal(ev.length, 2);
  assert.equal(ev[0].params.p_kind, 'list'); assert.equal(ev[0].params.p_fields.list_count, 1); assert.equal(ev[0].params.p_fields.body_sha256, sha(listText));
  assert.equal(ev[1].params.p_kind, 'get'); assert.equal(ev[1].params.p_fields.checkout_id, 'co-1'); assert.equal(ev[1].params.p_fields.body_sha256, sha(getText));
  assert.equal(ev[1].params.p_attempt_id, 'att-1');
  assert.deepEqual(admin.rpcCalls.map((c) => c.name), [
    'food_club_seal_order_for_release', 'food_club_record_checkout_evidence', 'food_club_record_checkout_evidence', 'food_club_release_voucher_after_evidence',
  ]);
  assert.equal(summary.evidence_recorded, 2);
  assert.deepEqual(summary.not_released, [{ order_id: 'ord-1', reason: 'uncertain:no_intent' }]);
});

test('fase: P-A (claim e provider_ref null) -> nessuna chiamata SumUp, rilascio dall SQL', async () => {
  const tables = baseTables({ kitchen_payments: { 'ord-1': [{ id: 'att-1', provider: 'sumup', provider_ref: null, checkout_claim_at: null, amount: 10, status: 'cancelled' }] } });
  const { summary, sumup, admin } = await phase({ tables, rpc: { food_club_release_voucher_after_evidence: RELEASED } });
  assert.equal(sumup.calls.length, 0);
  assert.equal(evCalls(admin).length, 0);
  assert.deepEqual(summary.released, ['ord-1']);
});

test('fase: attempt al banco (cash) -> nessuna chiamata SumUp', async () => {
  const tables = baseTables({ kitchen_payments: { 'ord-1': [{ id: 'att-c', provider: 'cash', provider_ref: null, checkout_claim_at: null, amount: 10, status: 'failed' }] } });
  const { sumup } = await phase({ tables });
  assert.equal(sumup.calls.length, 0);
});

test('fase: P-C (claim, nessun provider_ref) List con 1 risultato -> GET sull id trovato; List vuota o 2 -> nessuna GET', async () => {
  const pc = baseTables({ kitchen_payments: { 'ord-1': [{ id: 'att-1', provider: 'sumup', provider_ref: null, checkout_claim_at: iso(NOW - 29 * MIN), amount: 10, status: 'initiated' }] } });
  const one = await phase({ tables: pc, routes: { [LIST('att-1')]: { status: 200, body: [coBody({ id: 'co-9' })] }, [GET('co-9')]: { status: 200, body: coBody({ id: 'co-9' }) } } });
  assert.deepEqual(one.sumup.calls.map((c) => c.url), [LIST('att-1'), GET('co-9')]);
  const zero = await phase({ tables: pc, routes: { [LIST('att-1')]: { status: 200, body: [] } } });
  assert.deepEqual(zero.sumup.calls.map((c) => c.url), [LIST('att-1')]);
  assert.equal(evCalls(zero.admin)[0].params.p_fields.list_count, 0);
  const two = await phase({ tables: pc, routes: { [LIST('att-1')]: { status: 200, body: [coBody(), coBody({ id: 'co-2' })] } } });
  assert.deepEqual(two.sumup.calls.map((c) => c.url), [LIST('att-1')]);
  assert.equal(evCalls(two.admin)[0].params.p_fields.list_count, 2);
  // id con forma non ammessa: nessuna GET costruita da un campo strano
  const weird = await phase({ tables: pc, routes: { [LIST('att-1')]: { status: 200, body: [coBody({ id: '../x?y' })] } } });
  assert.deepEqual(weird.sumup.calls.map((c) => c.url), [LIST('att-1')]);
});

test('fase: List con id diverso dal provider_ref -> evidenza registrata cosi com e (l SQL decide list_mismatch)', async () => {
  const { admin } = await phase({ routes: { [LIST('att-1')]: { status: 200, body: [coBody({ id: 'co-ALTRO' })] }, [GET('co-1')]: { status: 200, body: coBody() } } });
  assert.equal(evCalls(admin)[0].params.p_fields.checkout_id, 'co-ALTRO');
  assert.equal(evCalls(admin)[1].params.p_fields.checkout_id, 'co-1', 'la GET resta sul provider_ref');
});

test('fase: timeout / rete giu -> nessuna evidenza per quella lettura, buono non rilasciato dal JS', async () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const { admin, summary } = await phase({ routes: { [LIST('att-1')]: timeout, [GET('co-1')]: new Error('ECONNRESET') } });
  assert.equal(evCalls(admin).length, 0);
  assert.equal(summary.evidence_recorded, 0);
  assert.equal(summary.released.length, 0);
  // corpo illeggibile (errore lettura stream) = come la rete
  const body = await phase({ routes: { [LIST('att-1')]: { status: 200, textThrows: true }, [GET('co-1')]: { status: 200, textThrows: true } } });
  assert.equal(evCalls(body.admin).length, 0);
});

test('fase: 5xx e JSON malformato -> solo http_status + hash (mai un evidenza "pulita")', async () => {
  const { admin } = await phase({ routes: { [LIST('att-1')]: { status: 503, body: [coBody()] }, [GET('co-1')]: { status: 200, text: '{"id":"co-1",' } } });
  const ev = evCalls(admin);
  assert.deepEqual(Object.keys(ev[0].params.p_fields).sort(), ['body_sha256', 'http_status']);
  assert.equal(ev[0].params.p_fields.http_status, 503);
  assert.deepEqual(Object.keys(ev[1].params.p_fields).sort(), ['body_sha256', 'http_status']);
});

test('fase: PAID registrato anche se un altro campo e strano; evidence_bad_field -> un retry senza il campo', async () => {
  const seen = [];
  const { admin } = await phase({
    routes: { [LIST('att-1')]: { status: 200, body: [] }, [GET('co-1')]: { status: 200, body: coBody({ status: 'PAID', amount: 'dieci', valid_until: 'x' }) } },
    rpc: {
      food_club_record_checkout_evidence: (p) => {
        seen.push(p.p_fields);
        if (p.p_kind === 'get' && 'merchant_code' in p.p_fields) return { data: null, error: { message: 'evidence_bad_field: merchant_code' } };
        return EV_OK;
      },
    },
  });
  const gets = seen.filter((f) => f.sumup_status === 'PAID');
  assert.equal(gets.length, 2, 'primo tentativo + retry');
  assert.equal(gets[1].merchant_code, undefined);
  assert.equal(gets[1].sumup_status, 'PAID');
  assert.equal(gets[0].amount, undefined, 'amount stringa omesso');
  assert.ok(admin.rpcCalls.some((c) => c.name === 'food_club_release_voucher_after_evidence'));
});

test('fase: sigillo < 60 s -> waiting, nessuna lettura SumUp, nessun rilascio', async () => {
  const { summary, sumup, admin } = await phase({
    rpc: { food_club_seal_order_for_release: { data: { ok: true, already_sealed: false, sealed_at: iso(NOW - 30 * 1000) }, error: null } },
  });
  assert.equal(summary.sealed, 1);
  assert.deepEqual(summary.waiting, [{ order_id: 'ord-1', reason: 'sealed_recently' }]);
  assert.equal(sumup.calls.length, 0);
  assert.ok(!admin.rpcCalls.some((c) => c.name === 'food_club_release_voucher_after_evidence'));
});

test('fase: evidence_too_early dall SQL -> waiting, nessun rilascio', async () => {
  const { summary, admin } = await phase({
    routes: { [LIST('att-1')]: { status: 200, body: [] }, [GET('co-1')]: { status: 200, body: coBody() } },
    rpc: { food_club_record_checkout_evidence: { data: null, error: { message: 'evidence_too_early' } } },
  });
  assert.deepEqual(summary.waiting, [{ order_id: 'ord-1', reason: 'evidence_too_early' }]);
  assert.ok(!admin.rpcCalls.some((c) => c.name === 'food_club_release_voucher_after_evidence'));
});

test('fase: sigillo rifiutato (ok:false) -> not_released con motivo, nessuna lettura', async () => {
  const { summary, sumup } = await phase({ rpc: { food_club_seal_order_for_release: { data: { ok: false, reason: 'claim_in_progress' }, error: null } } });
  assert.deepEqual(summary.not_released, [{ order_id: 'ord-1', reason: 'seal_claim_in_progress' }]);
  assert.equal(sumup.calls.length, 0);
});

test('fase: errori isolati per ordine (RPC che lancia, errore evidenza, errore lettura pagamenti)', async () => {
  const tables = baseTables({
    food_club_vouchers: [{ reserved_order_id: 'o1' }, { reserved_order_id: 'o2' }, { reserved_order_id: 'o3' }, { reserved_order_id: 'o4' }],
    kitchen_orders: ['o1', 'o2', 'o3', 'o4'].map((id, i) => ({ id, created_at: iso(NOW - (40 - i) * MIN), status: 'cancelled' })),
    kitchen_payments: { o1: [], o2: [{ id: 'a2', provider: 'sumup', provider_ref: 'c2', checkout_claim_at: iso(NOW), amount: 1 }], o4: [] },
  });
  const { summary } = await phase({
    tables,
    routes: { [LIST('a2')]: { status: 200, body: [] }, [GET('c2')]: { status: 200, body: {} } },
    rpc: {
      food_club_seal_order_for_release: (p) => (p.p_order_id === 'o1' ? (() => { throw new Error('socket hang up'); })() : SEAL_OLD),
      food_club_record_checkout_evidence: { data: null, error: { message: 'permission denied' } },
      food_club_release_voucher_after_evidence: RELEASED,
    },
  });
  assert.deepEqual(summary.errors.map((e) => e.order_id), ['o1', 'o2']);
  assert.deepEqual(summary.released, ['o3', 'o4']);
});

test('fase: errore sulla lista candidati -> nessuna eccezione, errore registrato', async () => {
  const { summary } = await phase({ tables: baseTables({ food_club_vouchers: { error: { message: 'db down' } } }) });
  assert.deepEqual(summary.errors, [{ order_id: null, reason: 'phase_exception' }]);
  const t = await phase({ tables: baseTables({ food_club_vouchers: { throw: 'boom' } }) });
  assert.equal(t.summary.errors.length, 1);
  // supabaseAdmin assente: comunque nessuna eccezione
  const s = await runFoodClubReleasePhase({ supabaseAdmin: null, sumupApiKey: 'k' }).catch(() => 'threw');
  assert.notEqual(s, 'threw');
});

test('candidati: filtri giusti (reserved, ordini chiusi, oltre 17 min), nessun voucher -> nessuna altra query', async () => {
  const { admin } = await phase({ routes: { [LIST('att-1')]: { status: 200, body: [] }, [GET('co-1')]: { status: 200, body: coBody() } } });
  const v = admin.queries.find((q) => q.table === 'food_club_vouchers');
  assert.deepEqual(v.filters, [['eq', 'status', 'reserved'], ['not', 'reserved_order_id', 'is', null]]);
  const o = admin.queries.find((q) => q.table === 'kitchen_orders');
  assert.deepEqual(o.filters, [['in', 'id', ['ord-1']], ['in', 'status', ['cancelled', 'payment_abandoned']], ['lt', 'created_at', iso(NOW - 17 * MIN)]]);
  assert.deepEqual(o.order, ['created_at', { ascending: true }]);
  const empty = await phase({ tables: baseTables({ food_club_vouchers: [] }) });
  assert.deepEqual(empty.admin.queries.map((q) => q.table), ['food_club_vouchers']);
  assert.equal(empty.admin.rpcCalls.length, 0);
});

test('candidati: maxOrders e rotazione (non sigillati prima, poi sigillati meno controllati)', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const tables = baseTables({
    food_club_vouchers: ids.map((id) => ({ reserved_order_id: id })),
    kitchen_orders: ids.map((id, i) => ({ id, created_at: iso(NOW - (60 - i) * MIN), status: 'cancelled' })),
    food_club_release_seals: [
      { order_id: 'a', sealed_at: iso(NOW - 50 * MIN), last_check_at: iso(NOW - 1 * MIN) },
      { order_id: 'b', sealed_at: iso(NOW - 50 * MIN), last_check_at: iso(NOW - 5 * MIN) },
      { order_id: 'c', sealed_at: iso(NOW - 50 * MIN), last_check_at: null },
    ],
    kitchen_payments: {},
  });
  const seen = [];
  const { summary } = await phase({ tables, maxOrders: 5, rpc: { food_club_seal_order_for_release: (p) => { seen.push(p.p_order_id); return SEAL_OLD; } } });
  assert.equal(summary.scanned, 5);
  assert.deepEqual(seen, ['d', 'e', 'f', 'g', 'c']);
});

test('budget: oltre il budget gli ordini restanti sono deferred, nessuna lettura iniziata oltre il limite', async () => {
  const ids = ['o1', 'o2', 'o3'];
  const tables = baseTables({
    food_club_vouchers: ids.map((id) => ({ reserved_order_id: id })),
    kitchen_orders: ids.map((id, i) => ({ id, created_at: iso(NOW - (40 - i) * MIN), status: 'cancelled' })),
    kitchen_payments: { o1: [], o2: [], o3: [] },
  });
  let t = NOW;
  const { summary, admin } = await phase({
    tables, budgetMs: 10000, now: () => t,
    rpc: { food_club_release_voucher_after_evidence: () => { t += 11000; return RELEASED; } },
  });
  assert.deepEqual(summary.released, ['o1']);
  assert.equal(summary.deferred, 2);
  assert.equal(admin.rpcCalls.filter((c) => c.name === 'food_club_seal_order_for_release').length, 1);
});

test('budget: superato a meta ordine -> nessuna nuova lettura SumUp, ordine deferred, nessun rilascio', async () => {
  let t = NOW;
  const { summary, sumup, admin } = await phase({
    budgetMs: 10000, now: () => t,
    routes: { [LIST('att-1')]: () => { t += 11000; return { status: 200, body: [] }; } },
  });
  assert.deepEqual(sumup.calls.map((c) => c.url), [LIST('att-1')]);
  assert.equal(summary.deferred, 1);
  assert.ok(!admin.rpcCalls.some((c) => c.name === 'food_club_release_voucher_after_evidence'));
});

test('sorgente: nessun POST/DELETE/PUT/PATCH e nessuna scrittura diretta su tabelle', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./foodClubVoucherRelease.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /method:\s*'(POST|DELETE|PUT|PATCH)'/);
  assert.doesNotMatch(src.replace(/createHash\('sha256'\)\.update\(/g, ''), /\.(insert|update|upsert|delete)\(/);
  assert.match(src, /redirect: 'error'/);
});
