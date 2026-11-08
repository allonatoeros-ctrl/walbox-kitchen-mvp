// Test Food Club Passo 2b: evidenza dei checkout SumUp. Rete SEMPRE finta, nessuna chiamata reale.
// Esecuzione: node --test api/_lib/foodClubCheckoutEvidence.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readFoodClubCheckoutEvidence,
  classifyOrderEvidence,
  TERMINAL_STATES_SANDBOX_VERIFIED,
} from './foodClubCheckoutEvidence.js';

const MIN = 60 * 1000;
const CREATED = new Date('2026-11-08T20:00:00.000Z');
const VALID_UNTIL = new Date(CREATED.getTime() + 15 * MIN).toISOString();
const at = (min, sec = 0) => new Date(CREATED.getTime() + min * MIN + sec * 1000);
const ORDER = { id: 'ord-1', created_at: CREATED.toISOString() };

const att = (id, extra = {}) => ({ id, status: 'failed', provider_ref: `co-${id}`, checkout_claim_at: '2026-11-08T20:00:05.000Z', ...extra });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const co = (id, status, extra = {}) => ({ id: `co-${id}`, checkout_reference: id, status, valid_until: VALID_UNTIL, ...extra });

// fetch finta: mappa url -> risposta (oggetto, funzione o Error). Registra le chiamate.
function makeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method });
    const r = routes[String(url)];
    if (r === undefined) throw new Error(`fetch non previsto: ${url}`);
    const v = typeof r === 'function' ? r() : r;
    if (v instanceof Error) throw v;
    return v;
  };
  impl.calls = calls;
  return impl;
}
const getUrl = (id) => `https://api.sumup.com/v0.1/checkouts/co-${id}`;
const listUrl = (id) => `https://api.sumup.com/v0.1/checkouts?checkout_reference=${id}`;
const read = (attempts, fetchImpl, now, flag) => readFoodClubCheckoutEvidence({
  order: ORDER, attempts, now, sumupApiKey: 'k', fetchImpl, ...(flag === undefined ? {} : { terminalStatesVerified: flag }),
});

test('costante di default: false', () => {
  assert.equal(TERMINAL_STATES_SANDBOX_VERIFIED, false);
});

// E-1
test('E-1 PAID su un checkout, altri incerti/terminali -> paid (anche attempt cancelled / customer_switched_to_counter)', async () => {
  const f = makeFetch({
    [getUrl('a')]: json(200, co('a', 'EXPIRED')),
    [getUrl('b')]: json(200, co('b', 'PAID')),
    [getUrl('c')]: json(500, {}),
  });
  const r = await read([att('a'), att('b', { status: 'customer_switched_to_counter' }), att('c', { status: 'cancelled' })], f, at(6));
  assert.equal(r.verdict, 'paid');
  assert.deepEqual(r.checkouts.map((c) => c.state), ['expired', 'paid', 'unknown']);
  assert.equal(r.read_at, at(6).toISOString());
});

// E-2
test('E-2 default (flag false): soli EXPIRED/CANCELLED -> uncertain anche dopo +17', async () => {
  const f = makeFetch({ [getUrl('a')]: json(200, co('a', 'EXPIRED')), [getUrl('b')]: json(200, co('b', 'CANCELLED')) });
  const r = await read([att('a'), att('b')], f, at(30));
  assert.equal(r.verdict, 'uncertain');
  assert.deepEqual(r.checkouts.map((c) => c.state), ['expired', 'cancelled']);
});

test('E-2 flag true: EXPIRED/CANCELLED -> not_payable dopo +17, uncertain a +17 esatti e prima', async () => {
  const mk = () => makeFetch({ [getUrl('a')]: json(200, co('a', 'EXPIRED')), [getUrl('b')]: json(200, co('b', 'CANCELLED')) });
  assert.equal((await read([att('a'), att('b')], mk(), at(17, 1), true)).verdict, 'not_payable');
  assert.equal((await read([att('a'), att('b')], mk(), at(17), true)).verdict, 'uncertain');
  assert.equal((await read([att('a'), att('b')], mk(), at(16), true)).verdict, 'uncertain');
});

// E-3
test('E-3 FAILED: flag false -> uncertain; flag true dopo valid_until e +17 -> not_payable; prima di valid_until -> uncertain', async () => {
  const mk = () => makeFetch({ [getUrl('a')]: json(200, co('a', 'FAILED')) });
  assert.equal((await read([att('a')], mk(), at(18), false)).verdict, 'uncertain');
  assert.equal((await read([att('a')], mk(), at(18), true)).verdict, 'not_payable');
  // classify puro: now > created+17 ma valid_until letto nel futuro (checkout con valid_until piu lontano) -> uncertain
  const future = new Date(at(20)).toISOString();
  assert.equal(classifyOrderEvidence({
    order: ORDER, now: at(18), terminalStatesVerified: true,
    checkouts: [{ state: 'failed', valid_until: future }],
  }), 'uncertain');
  // FAILED prima di +17 con flag true -> uncertain
  assert.equal((await read([att('a')], mk(), at(10), true)).verdict, 'uncertain');
});

// E-4
test('E-4 PENDING (anche dopo la scadenza) -> uncertain, con flag true e false', async () => {
  const mk = () => makeFetch({ [getUrl('a')]: json(200, co('a', 'PENDING')) });
  for (const flag of [false, true]) {
    const r = await read([att('a')], mk(), at(40), flag);
    assert.equal(r.verdict, 'uncertain');
    assert.equal(r.checkouts[0].state, 'pending');
  }
});

// E-5
test('E-5 risposte non affidabili -> uncertain (flag true, dopo +17)', async () => {
  const cases = {
    timeout: () => Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    rete: () => new TypeError('fetch failed'),
    http500: () => json(500, { message: 'x' }),
    http401: () => json(401, {}),
    http403: () => json(403, {}),
    http429: () => json(429, {}),
    jsonRotto: () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }),
    idDiverso: () => json(200, { ...co('a', 'EXPIRED'), id: 'co-altro' }),
    refDiversa: () => json(200, { ...co('a', 'EXPIRED'), checkout_reference: 'altro' }),
    validUntilAssente: () => json(200, { ...co('a', 'EXPIRED'), valid_until: undefined }),
    validUntilDiverso: () => json(200, co('a', 'EXPIRED', { valid_until: at(14).toISOString() })),
    validUntilIllegibile: () => json(200, co('a', 'EXPIRED', { valid_until: 'boh' })),
    statoSconosciuto: () => json(200, co('a', 'WEIRD')),
  };
  const origErr = console.error; console.error = () => {};
  try {
    for (const [name, make] of Object.entries(cases)) {
      const f = makeFetch({ [getUrl('a')]: make });
      const r = await read([att('a')], f, at(40), true);
      assert.equal(r.verdict, 'uncertain', name);
      assert.equal(r.checkouts[0].state, 'unknown', name);
    }
  } finally { console.error = origErr; }
});

test('E-5 valid_until entro 1 s dall\'atteso e accettato', async () => {
  const f = makeFetch({ [getUrl('a')]: json(200, co('a', 'EXPIRED', { valid_until: new Date(CREATED.getTime() + 15 * MIN + 900).toISOString() })) });
  const r = await read([att('a')], f, at(40), true);
  assert.equal(r.verdict, 'not_payable');
});

test('E-5 provider_ref diverso dall\'id restituito -> uncertain', async () => {
  const f = makeFetch({ [getUrl('a')]: json(200, { ...co('a', 'EXPIRED'), id: 'co-b' }) });
  const origErr = console.error; console.error = () => {};
  try {
    const r = await read([att('a')], f, at(40), true);
    assert.equal(r.checkouts[0].reason, 'checkout_id_mismatch');
    assert.equal(r.verdict, 'uncertain');
  } finally { console.error = origErr; }
});

// E-6
test('E-6 senza provider_ref: List not_found con claim presente -> uncertain (anche tardi, flag true)', async () => {
  const a = att('a', { provider_ref: null, checkout_claim_at: '2026-11-08T20:01:00.000Z' });
  const f = makeFetch({ [listUrl('a')]: json(200, []) });
  const r = await read([a], f, at(60), true);
  assert.equal(r.verdict, 'uncertain');
  assert.equal(r.checkouts[0].state, 'unknown');
  assert.equal(r.checkouts[0].reason, 'list_not_found_claim_present');
});

test('E-6 senza provider_ref e senza claim: never_created solo dopo created+4:30+60s', async () => {
  const a = att('a', { provider_ref: null, checkout_claim_at: null });
  const mk = () => makeFetch({ [listUrl('a')]: json(200, []) });
  const early = await read([a], mk(), at(5, 29));
  assert.equal(early.checkouts[0].state, 'unknown');
  assert.equal(early.checkouts[0].reason, 'list_not_found_window_open');
  const edge = await read([a], mk(), at(5, 30));
  assert.equal(edge.checkouts[0].state, 'unknown', 'a +5:30 esatti non ancora provato');
  const late = await read([a], mk(), at(5, 31));
  assert.equal(late.checkouts[0].state, 'never_created');
  // verdetto d'ordine: serve anche +17 min
  assert.equal(late.verdict, 'uncertain');
  assert.equal((await read([a], mk(), at(18))).verdict, 'not_payable');
});

test('E-6 senza provider_ref: List ambiguous / lookup_failed -> uncertain', async () => {
  const a = att('a', { provider_ref: null, checkout_claim_at: null });
  const dup = [{ id: 'x1', checkout_reference: 'a' }, { id: 'x2', checkout_reference: 'a' }];
  const r1 = await read([a], makeFetch({ [listUrl('a')]: json(200, dup) }), at(30), true);
  assert.equal(r1.verdict, 'uncertain');
  assert.equal(r1.checkouts[0].reason, 'list_ambiguous');
  const r2 = await read([a], makeFetch({ [listUrl('a')]: json(503, {}) }), at(30), true);
  assert.equal(r2.verdict, 'uncertain');
  assert.equal(r2.checkouts[0].reason, 'list_lookup_failed');
});

test('E-6 senza provider_ref ma List con match unico -> GET verificato di quell\'id', async () => {
  const a = att('a', { provider_ref: null });
  const f = makeFetch({
    [listUrl('a')]: json(200, [{ id: 'co-a', checkout_reference: 'a' }]),
    [getUrl('a')]: json(200, co('a', 'PAID')),
  });
  const r = await read([a], f, at(6));
  assert.equal(r.verdict, 'paid');
  assert.equal(r.checkouts[0].provider_ref, 'co-a');
  assert.deepEqual(f.calls.map((c) => c.url), [listUrl('a'), getUrl('a')]);
});

// E-7
test('E-7 tre checkout misti (EXPIRED, FAILED, irraggiungibile) -> uncertain; PAID tardivo -> paid', async () => {
  const origErr = console.error; console.error = () => {};
  try {
    const f1 = makeFetch({
      [getUrl('a')]: json(200, co('a', 'EXPIRED')),
      [getUrl('b')]: json(200, co('b', 'FAILED')),
      [getUrl('c')]: new TypeError('fetch failed'),
    });
    const r1 = await read([att('a'), att('b'), att('c')], f1, at(30), true);
    assert.equal(r1.verdict, 'uncertain');
    assert.deepEqual(r1.checkouts.map((c) => c.state), ['expired', 'failed', 'unknown']);
    const f2 = makeFetch({
      [getUrl('a')]: json(200, co('a', 'EXPIRED')),
      [getUrl('b')]: json(200, co('b', 'FAILED')),
      [getUrl('c')]: json(200, co('c', 'PAID')),
    });
    const r2 = await read([att('a'), att('b'), att('c')], f2, at(60), true);
    assert.equal(r2.verdict, 'paid');
  } finally { console.error = origErr; }
});

// E-8
test('E-8 doppio giro: stesso risultato, solo GET, nessuna scrittura', async () => {
  const mk = () => makeFetch({
    [getUrl('a')]: json(200, co('a', 'EXPIRED')),
    [listUrl('b')]: json(200, []),
  });
  const attempts = [att('a'), att('b', { provider_ref: null, checkout_claim_at: null })];
  const f = mk();
  const r1 = await read(attempts, f, at(20), true);
  const r2 = await read(attempts, f, at(20), true);
  assert.deepEqual(r1, r2);
  assert.equal(r1.verdict, 'not_payable');
  assert.equal(f.calls.length, 4);
  for (const c of f.calls) assert.ok(c.method === undefined || c.method === 'GET', `metodo non-GET: ${c.method}`);
});

test('sola lettura: la lettura di un PAID usa solo chiamate senza metodo esplicito (GET)', async () => {
  const f = makeFetch({ [getUrl('a')]: json(200, co('a', 'PAID')) });
  const r = await read([att('a')], f, at(6));
  assert.ok(f.calls.every((c) => c.method === undefined));
  assert.equal(r.verdict, 'paid');
});

// E-9
test('E-9 attempt cancelled / customer_switched_to_counter con PAID -> paid', async () => {
  for (const status of ['cancelled', 'customer_switched_to_counter']) {
    const f = makeFetch({ [getUrl('a')]: json(200, co('a', 'PAID')) });
    const r = await read([att('a', { status })], f, at(3));
    assert.equal(r.verdict, 'paid', status);
  }
});

test('zero attempt -> uncertain, nessuna fetch', async () => {
  const f = makeFetch({});
  const r = await read([], f, at(60), true);
  assert.equal(r.verdict, 'uncertain');
  assert.equal(f.calls.length, 0);
});

test('evidenza senza dati carta: solo campi id/stato/valid_until/reason', async () => {
  const f = makeFetch({ [getUrl('a')]: json(200, co('a', 'EXPIRED', { transactions: [{ card: { last_4_digits: '4242' } }] })) });
  const r = await read([att('a')], f, at(30), true);
  assert.deepEqual(Object.keys(r.checkouts[0]).sort(), ['attempt_id', 'provider_ref', 'reason', 'state', 'valid_until']);
  assert.ok(!JSON.stringify(r).includes('4242'));
});

test('created_at o now non validi -> uncertain', async () => {
  const f = makeFetch({});
  const r = await readFoodClubCheckoutEvidence({ order: { id: 'o', created_at: null }, attempts: [att('a')], now: at(30), sumupApiKey: 'k', fetchImpl: f, terminalStatesVerified: true });
  assert.equal(r.verdict, 'uncertain');
  assert.equal(f.calls.length, 0);
});

test('classifyOrderEvidence: never_created + expired con flag false -> uncertain', () => {
  assert.equal(classifyOrderEvidence({
    order: ORDER, now: at(30), terminalStatesVerified: false,
    checkouts: [{ state: 'never_created' }, { state: 'expired', valid_until: VALID_UNTIL }],
  }), 'uncertain');
});

// Fix B: claim e provider_ref "assenti" solo se presenti nella riga ed esplicitamente null.
test('E-B1 campi mancanti o undefined -> mai never_created, verdetto uncertain (anche tardi, flag true e false)', async () => {
  const variants = [
    { id: 'a', status: 'failed' }, // nessuno dei due campi
    { id: 'a', status: 'failed', provider_ref: null }, // manca checkout_claim_at
    { id: 'a', status: 'failed', checkout_claim_at: null }, // manca provider_ref
    { id: 'a', status: 'failed', provider_ref: null, checkout_claim_at: undefined },
    { id: 'a', status: 'failed', provider_ref: undefined, checkout_claim_at: null },
    { id: 'a', status: 'failed', provider_ref: undefined, checkout_claim_at: undefined },
    Object.assign(Object.create({ provider_ref: null, checkout_claim_at: null }), { id: 'a', status: 'failed' }), // solo ereditati
  ];
  for (const [i, a] of variants.entries()) {
    for (const flag of [false, true]) {
      const f = makeFetch({ [listUrl('a')]: json(200, []) });
      const r = await read([a], f, at(60), flag);
      assert.equal(r.verdict, 'uncertain', `variante ${i}, flag ${flag}`);
      assert.equal(r.checkouts[0].state, 'unknown', `variante ${i}, flag ${flag}`);
      assert.equal(r.checkouts[0].reason, 'list_not_found_fields_missing', `variante ${i}, flag ${flag}`);
      assert.ok(f.calls.every((c) => (c.method ?? 'GET') === 'GET'), 'solo letture');
    }
  }
});

test('E-B2 entrambi i campi presenti e null -> never_created resta possibile (stesse soglie di prima)', async () => {
  const a = { id: 'a', status: 'failed', provider_ref: null, checkout_claim_at: null };
  const mk = () => makeFetch({ [listUrl('a')]: json(200, []) });
  assert.equal((await read([a], mk(), at(5, 30))).checkouts[0].reason, 'list_not_found_window_open');
  const late = await read([a], mk(), at(18));
  assert.equal(late.checkouts[0].state, 'never_created');
  assert.equal(late.verdict, 'not_payable');
});

test('E-B3 un solo tentativo con campi mancanti rende uncertain tutto l\'ordine', async () => {
  const ok = { id: 'a', status: 'failed', provider_ref: null, checkout_claim_at: null };
  const missing = { id: 'b', status: 'failed', provider_ref: null };
  const f = makeFetch({ [listUrl('a')]: json(200, []), [listUrl('b')]: json(200, []) });
  const r = await read([ok, missing], f, at(60), true);
  assert.equal(r.verdict, 'uncertain');
  assert.deepEqual(r.checkouts.map((c) => c.state), ['never_created', 'unknown']);
});

test('E-B4 flag sandbox invariato', () => {
  assert.equal(TERMINAL_STATES_SANDBOX_VERIFIED, false);
});
