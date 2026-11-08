// Test mirati SumUp Online — Autonomous Reconciliation Sweep (LONG SESSION B, FASE 1/6).
// Copre: sweep multi-attempt (PAID/FAILED/PENDING/lookup-failure/unknown), provider_ref recovery
// dentro lo sweep, mai un nuovo payment attempt creato, e limite/ordinamento.
//
// Import diretto (nessun '@supabase/supabase-js' importato da api/_lib/sumupReconcileSweep.js — il
// client viene iniettato dal chiamante), quindi non serve il trucco Vite ssrLoadModule usato dalle
// altre suite SumUp per gli handler api/*.js.
// Eseguire a mano con: node --test tests/unit/sumup-reconcile-sweep.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runReconcileSweep, readSweepConfig, SWEEP_DEFAULTS } from '../../api/_lib/sumupReconcileSweep.js';

function jsonFetchResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Mock minimale: kitchen_payments.select().eq()...in()...order()...limit() ritorna la lista fissa
// passata; rpc() registra le chiamate e applica gli override forniti.
// R3: la sweep fa due query; quella della finestra tardiva si riconosce da .in('status', [... 'cancelled' ...])
// e restituisce `lateAttempts` (default vuota), l'altra `attempts`. Le chiamate sono registrate in __queries.
function makeAdmin({ attempts = [], lateAttempts = [], rpc = {}, actionLog = [], actionLogFail = null } = {}) {
  const rpcCalls = [];
  const queries = [];
  // K6-b: kitchen_action_log in memoria (lettura per attempt_id + insert).
  const logRows = [...actionLog];
  const fromLog = () => {
    const filters = {};
    const b = {
      select: () => b,
      eq: (col, val) => { filters[col] = val; return b; },
      limit: async () => {
        if (actionLogFail === 'read') return { data: null, error: { message: 'read boom' } };
        const rows = logRows.filter((r) => (!filters.action || r.action === filters.action)
          && (!filters.order_id || r.order_id === filters.order_id)
          && (!filters['metadata->>attempt_id'] || r.metadata?.attempt_id === filters['metadata->>attempt_id']));
        return { data: rows, error: null };
      },
      insert: async (row) => {
        if (actionLogFail === 'insert') return { data: null, error: { message: 'insert boom' } };
        logRows.push(row);
        return { data: null, error: null };
      },
    };
    return b;
  };
  const from = (table) => {
    if (table === 'kitchen_action_log') return fromLog();
    assert.equal(table, 'kitchen_payments');
    const q = { calls: [] };
    queries.push(q);
    const rec = (name) => (...args) => { q.calls.push([name, ...args]); return builder; };
    const builder = {
      select: rec('select'),
      eq: rec('eq'),
      in: (col, vals) => { q.calls.push(['in', col, vals]); if (vals.includes('cancelled')) q.late = true; return builder; },
      or: rec('or'),
      not: rec('not'),
      gte: rec('gte'),
      order: rec('order'),
      limit: async (n) => { q.calls.push(['limit', n]); return { data: q.late ? lateAttempts : attempts, error: null }; },
    };
    return builder;
  };
  return {
    from,
    __queries: queries,
    rpc: async (name, params) => {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      if (typeof handler === 'function') return handler(params);
      return handler ?? { data: null, error: null };
    },
    __rpcCalls: rpcCalls,
    __logRows: logRows,
  };
}

function attempt(overrides = {}) {
  return { id: 'att-x', order_id: 'ord-x', amount: 10, provider: 'sumup', method: 'sumup_online', status: 'initiated', provider_ref: null, ...overrides };
}

test('sweep: nessun attempt live -> summary vuoto, nessuna chiamata SumUp, nessuna RPC', async () => {
  const admin = makeAdmin({ attempts: [] });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async () => { throw new Error('non deve mai essere chiamato'); },
  });
  assert.deepEqual(summary.checked, 0);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('sweep: un attempt PAID con provider_ref -> confirm applicato, mai un nuovo payment attempt creato', async () => {
  const a = attempt({ id: 'att-1', order_id: 'ord-1', provider_ref: 'co-1' });
  const admin = makeAdmin({
    attempts: [a],
    rpc: { kitchen_payment_confirm: { data: { ...a, status: 'succeeded' }, error: null } },
  });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async (url) => {
      assert.match(String(url), /checkouts\/co-1$/);
      return jsonFetchResponse(200, { id: 'co-1', status: 'PAID', amount: 10, checkout_reference: 'att-1' });
    },
  });

  assert.equal(summary.confirmed, 1);
  assert.equal(summary.failed, 0);
  const rpcNames = admin.__rpcCalls.map((c) => c.name);
  assert.ok(rpcNames.includes('kitchen_payment_confirm'));
  assert.ok(!rpcNames.includes('kitchen_payment_attempt_start'), 'lo sweep non deve mai creare un nuovo payment attempt');
});

test('sweep: FAILED/EXPIRED applicano fail, PENDING resta bloccante, lookup failure resta unknown — tutto in un solo giro', async () => {
  const attempts = [
    attempt({ id: 'att-f', order_id: 'ord-f', provider_ref: 'co-f' }),
    attempt({ id: 'att-e', order_id: 'ord-e', provider_ref: 'co-e' }),
    attempt({ id: 'att-p', order_id: 'ord-p', provider_ref: 'co-p' }),
    attempt({ id: 'att-l', order_id: 'ord-l', provider_ref: 'co-l' }),
  ];
  const admin = makeAdmin({
    attempts,
    rpc: { kitchen_payment_fail: { data: {}, error: null } },
  });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('co-f')) return jsonFetchResponse(200, { id: 'co-f', status: 'FAILED', amount: 10, checkout_reference: 'att-f' });
      if (u.includes('co-e')) return jsonFetchResponse(200, { id: 'co-e', status: 'EXPIRED', amount: 10, checkout_reference: 'att-e' });
      if (u.includes('co-p')) return jsonFetchResponse(200, { id: 'co-p', status: 'PENDING', amount: 10, checkout_reference: 'att-p' });
      if (u.includes('co-l')) throw new Error('network down');
      throw new Error('url inatteso: ' + u);
    },
  });

  assert.equal(summary.checked, 4);
  assert.equal(summary.failed, 2);
  assert.equal(summary.pending, 1);
  assert.equal(summary.unknown, 1);
  assert.equal(summary.confirmed, 0);
});

// LONG SESSION F — same-checkout retry: la batch ora include anche i 'failed' (sumup_failed).
// Il mock qui sotto (come gli altri mock di questa suite) non applica davvero i filtri WHERE — le
// righe restituite da limit() sono quelle passate a makeAdmin({attempts}) indipendentemente da
// in()/or(). Il test sotto verifica quindi solo il comportamento PER RIGA (una volta che una riga
// failed/sumup_failed e nel batch, viene ricontrollata e puo essere promossa) — la clausola WHERE
// che la rende eleggibile in primo luogo e verificata staticamente sul sorgente subito dopo.
test('sweep: un attempt FAILED (sumup_failed) con provider_ref, checkout ora PAID -> confirm applicato (promozione)', async () => {
  const a = attempt({ id: 'att-sf', order_id: 'ord-sf', provider_ref: 'co-sf', status: 'failed', failure_reason: 'sumup_failed' });
  const admin = makeAdmin({
    attempts: [a],
    rpc: { kitchen_payment_confirm: { data: { ...a, status: 'succeeded' }, error: null } },
  });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async (url) => {
      assert.match(String(url), /checkouts\/co-sf$/);
      return jsonFetchResponse(200, { id: 'co-sf', status: 'PAID', amount: 10, checkout_reference: 'att-sf' });
    },
  });

  assert.equal(summary.confirmed, 1);
  const confirmCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_confirm');
  assert.ok(confirmCall, 'la sweep deve poter promuovere un attempt gia failed (sumup_failed)');
  assert.equal(confirmCall.params.p_attempt_id, 'att-sf');
});

test('sweep: un attempt FAILED (sumup_failed) rimane FAILED se SumUp riconferma FAILED -> nessuna promozione, mai un errore', async () => {
  const a = attempt({ id: 'att-sf2', order_id: 'ord-sf2', provider_ref: 'co-sf2', status: 'failed', failure_reason: 'sumup_failed' });
  const admin = makeAdmin({
    attempts: [a],
    rpc: { kitchen_payment_fail: { data: { ...a, status: 'failed' }, error: null } },
  });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-sf2', status: 'FAILED', amount: 10, checkout_reference: 'att-sf2' }),
  });

  assert.equal(summary.confirmed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.errors.length, 0, 're-check di un failed gia failed non deve mai propagare un errore (kitchen_payment_fail idempotente)');
});

test('sweep: la query esclude i failed non-sumup_failed (verifica statica sul sorgente, il mock non filtra davvero)', async () => {
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const src = readFileSync(path.join(ROOT, 'api/_lib/sumupReconcileSweep.js'), 'utf8');
  assert.match(src, /\.in\('status', \['initiated', 'pending', 'failed'\]\)/);
  assert.match(src, /\.or\('status\.neq\.failed,failure_reason\.eq\.sumup_failed'\)/);
});

test('sweep: attempt senza provider_ref -> tenta recovery via checkout_reference prima di arrendersi', async () => {
  const a = attempt({ id: 'att-r', order_id: 'ord-r', provider_ref: null });
  const admin = makeAdmin({
    attempts: [a],
    rpc: {
      kitchen_payment_attempt_set_provider_ref: { data: {}, error: null },
      kitchen_payment_confirm: { data: { ...a, status: 'succeeded' }, error: null },
    },
  });

  const calls = [];
  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes('checkout_reference=')) {
        return jsonFetchResponse(200, [{ id: 'co-r', checkout_reference: 'att-r', status: 'PAID', amount: 10 }]);
      }
      return jsonFetchResponse(200, { id: 'co-r', status: 'PAID', amount: 10, checkout_reference: 'att-r' });
    },
  });

  assert.equal(calls.length, 2, 'recovery lookup + verifica by-id');
  assert.equal(summary.confirmed, 1);
  const refCall = admin.__rpcCalls.find((c) => c.name === 'kitchen_payment_attempt_set_provider_ref');
  assert.ok(refCall);
  assert.equal(refCall.params.p_provider_ref, 'co-r');
});

test('sweep: recovery non trova nulla -> unknown, mai una GET by-id, mai un confirm/fail', async () => {
  const a = attempt({ id: 'att-nf', order_id: 'ord-nf', provider_ref: null });
  const admin = makeAdmin({ attempts: [a] });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async () => jsonFetchResponse(200, []),
  });

  assert.equal(summary.unknown, 1);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('sweep: checkout_reference non corrisponde -> unknown + needsManualReconciliation, mai confermato', async () => {
  const a = attempt({ id: 'att-mm', order_id: 'ord-mm', provider_ref: 'co-mm' });
  const admin = makeAdmin({ attempts: [a] });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-mm', status: 'PAID', amount: 10, checkout_reference: 'someone-else' }),
  });

  assert.equal(summary.unknown, 1);
  assert.deepEqual(summary.needsManualReconciliation, ['att-mm']);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('sweep: errore imprevisto su un attempt non blocca gli altri (isolamento per-attempt)', async () => {
  const attempts = [
    attempt({ id: 'att-bad', order_id: 'ord-bad', provider_ref: 'co-bad' }),
    attempt({ id: 'att-good', order_id: 'ord-good', provider_ref: 'co-good' }),
  ];
  const admin = makeAdmin({
    attempts,
    rpc: {
      kitchen_payment_confirm: (params) => {
        if (params.p_attempt_id === 'att-bad') throw new Error('rpc boom');
        return { data: { ...attempts[1], status: 'succeeded' }, error: null };
      },
    },
  });

  const summary = await runReconcileSweep({
    supabaseAdmin: admin,
    sumupApiKey: 'k',
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('co-bad')) return jsonFetchResponse(200, { id: 'co-bad', status: 'PAID', amount: 10, checkout_reference: 'att-bad' });
      return jsonFetchResponse(200, { id: 'co-good', status: 'PAID', amount: 10, checkout_reference: 'att-good' });
    },
  });

  assert.equal(summary.checked, 2);
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.errors.length, 1);
  assert.equal(summary.errors[0].attemptId, 'att-bad');
});

// ---------------------------------------------------------------------------------------------------------
// R3 (ai-ops/current/KITCHEN_R3_PIANO.md) — finestra tardiva sugli attempt chiusi, solo PAID verificato.
// ---------------------------------------------------------------------------------------------------------
function closed(overrides = {}) {
  return attempt({ status: 'failed', failure_reason: 'customer_switched_to_counter', provider_ref: 'co-x', updated_at: '2026-11-08T10:00:00Z', ...overrides });
}
const paid = (id, ref, extra = {}) => ({ id: ref, status: 'PAID', amount: 10, checkout_reference: id, ...extra });

test('R3 T2: PAID su attempt cancelled (annullo) -> confirm con prova provider, contato come paidOnCancelled', async () => {
  const a = closed({ id: 'att-c', order_id: 'ord-c', status: 'cancelled', failure_reason: null, provider_ref: 'co-c' });
  const admin = makeAdmin({ lateAttempts: [a], rpc: { kitchen_payment_confirm: { data: { ...a, status: 'succeeded' }, error: null } } });
  const summary = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async () => jsonFetchResponse(200, paid('att-c', 'co-c')) });
  assert.equal(summary.late.paidRecorded, 1);
  assert.equal(summary.late.paidOnCancelled, 1);
  const c = admin.__rpcCalls.find((x) => x.name === 'kitchen_payment_confirm');
  assert.equal(c.params.p_attempt_id, 'att-c');
  assert.equal(c.params.p_provider_ref, 'co-c');
  assert.deepEqual(summary.needsManualReconciliation, ['att-c']);
});

test('R3 T3a/T3c: PAID dopo "Paga al banco" e dopo abbandono -> confirm (stesso resolver)', async () => {
  const sw = closed({ id: 'att-sw', order_id: 'ord-sw', provider_ref: 'co-sw' });
  const ab = closed({ id: 'att-ab', order_id: 'ord-ab', provider_ref: 'co-ab', failure_reason: 'abandoned_timeout' });
  const admin = makeAdmin({
    lateAttempts: [sw, ab],
    rpc: { kitchen_payment_confirm: (p) => ({ data: { id: p.p_attempt_id, status: 'succeeded' }, error: null }) },
  });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url) => (String(url).endsWith('co-sw') ? jsonFetchResponse(200, paid('att-sw', 'co-sw')) : jsonFetchResponse(200, paid('att-ab', 'co-ab'))),
  });
  assert.equal(summary.late.paidRecorded, 2);
  assert.equal(admin.__rpcCalls.filter((x) => x.name === 'kitchen_payment_confirm').length, 2);
  assert.equal(admin.__rpcCalls.filter((x) => x.name === 'kitchen_payment_fail').length, 0);
});

test('R3 T3b: PAID dopo chiusura staff con banco gia incassato -> lost_race segnalato, mai "confirmed"', async () => {
  const a = closed({ id: 'att-lr', order_id: 'ord-lr', failure_reason: 'staff_closed_for_counter', provider_ref: 'co-lr' });
  const admin = makeAdmin({ lateAttempts: [a], rpc: { kitchen_payment_confirm: { data: { id: 'counter-pay', status: 'succeeded' }, error: null } } });
  const summary = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async () => jsonFetchResponse(200, paid('att-lr', 'co-lr')) });
  assert.equal(summary.late.lostRace, 1);
  assert.equal(summary.late.paidRecorded, 0);
  assert.equal(summary.confirmed, 0);
  assert.deepEqual(summary.needsManualReconciliation, ['att-lr']);
});

test('R3 T8: FAILED/EXPIRED/CANCELLED/PENDING su attempt chiusi -> 0 RPC (mai fail su abandoned_timeout)', async () => {
  const states = ['FAILED', 'EXPIRED', 'CANCELLED', 'PENDING'];
  const late = states.map((st, i) => closed({ id: `att-n${i}`, provider_ref: `co-n${i}`, failure_reason: 'abandoned_timeout' }));
  late.push(closed({ id: 'att-n9', provider_ref: 'co-n9', status: 'cancelled', failure_reason: null }));
  const admin = makeAdmin({ lateAttempts: late });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url) => {
      const i = Number(String(url).slice(-1));
      return jsonFetchResponse(200, { id: `co-n${i}`, status: states[i] ?? 'FAILED', amount: 10, checkout_reference: `att-n${i}` });
    },
  });
  assert.equal(summary.late.checked, 5);
  assert.equal(summary.late.notPaid, 5);
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(summary.errors.length, 0);
});

test('R3 T6: SumUp irraggiungibile (rete, 5xx, JSON illeggibile, timeout) -> unverified, 0 RPC, nessun errore che fermi il giro', async () => {
  const late = ['net', '5xx', 'json', 'slow'].map((k) => closed({ id: `att-${k}`, provider_ref: `co-${k}` }));
  const admin = makeAdmin({ lateAttempts: late });
  const started = Date.now();
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k', sumupTimeoutMs: 40,
    fetchImpl: (url, opts) => {
      const u = String(url);
      assert.ok(opts.signal, 'ogni chiamata SumUp deve avere un timeout');
      if (u.endsWith('co-net')) return Promise.reject(new TypeError('fetch failed'));
      if (u.endsWith('co-5xx')) return Promise.resolve(jsonFetchResponse(503, { message: 'down' }));
      if (u.endsWith('co-json')) return Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } });
      return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));
    },
  });
  assert.equal(summary.late.unverified, 4);
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(summary.errors.length, 0);
  assert.ok(Date.now() - started < 2000, 'il timeout deve interrompere la chiamata lenta');
});

test('R3 T7: checkout senza identificativo verificabile -> unverified + needsManual, 0 RPC', async () => {
  const cases = {
    'att-noid': { status: 'PAID', amount: 10, checkout_reference: 'att-noid' },
    'att-otherid': { id: 'co-altro', status: 'PAID', amount: 10, checkout_reference: 'att-otherid' },
    'att-otherref': { id: 'co-att-otherref', status: 'PAID', amount: 10, checkout_reference: 'qualcun-altro' },
    'att-noref': { id: 'co-att-noref', status: 'PAID', amount: 10 },
  };
  const late = Object.keys(cases).map((id) => closed({ id, provider_ref: `co-${id}` }));
  const admin = makeAdmin({ lateAttempts: late });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url) => jsonFetchResponse(200, cases[String(url).split('/co-')[1]]),
  });
  assert.equal(summary.late.unverified, 4);
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(summary.needsManualReconciliation.length, 4);
});

test('R3 T10: PAID con importo diverso su attempt chiuso -> errore segnalato, 0 RPC (mai fail)', async () => {
  const late = [
    closed({ id: 'att-mc', provider_ref: 'co-mc', status: 'cancelled', failure_reason: null }),
    closed({ id: 'att-mf', provider_ref: 'co-mf', failure_reason: 'abandoned_timeout' }),
  ];
  const admin = makeAdmin({ lateAttempts: late });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url) => {
      const ref = String(url).split('/checkouts/')[1];
      return jsonFetchResponse(200, { id: ref, status: 'PAID', amount: 99, checkout_reference: ref.replace('co-', 'att-') });
    },
  });
  assert.equal(admin.__rpcCalls.length, 0);
  assert.equal(summary.late.errors, 2);
  assert.deepEqual(summary.errors.map((e) => e.error), ['sumup_amount_mismatch_on_closed', 'sumup_amount_mismatch_on_closed']);
});

test('R3 T9: query della finestra tardiva = stati chiusi, provider_ref non nullo, updated_at >= now-finestra, recenti prima, limite', async () => {
  const fixedNow = Date.parse('2026-11-08T12:00:00Z');
  const admin = makeAdmin({});
  await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', now: () => fixedNow, fetchImpl: async () => { throw new Error('nessuna GET attesa'); } });
  const late = admin.__queries.find((q) => q.late);
  assert.ok(late, 'query della finestra tardiva eseguita');
  const has = (...call) => late.calls.some((c) => JSON.stringify(c) === JSON.stringify(call));
  assert.ok(has('eq', 'direction', 'charge'));
  assert.ok(has('eq', 'provider', 'sumup'));
  assert.ok(has('not', 'provider_ref', 'is', null));
  assert.ok(has('in', 'status', ['cancelled', 'failed']));
  assert.ok(has('or', 'status.eq.cancelled,failure_reason.in.(customer_switched_to_counter,staff_closed_for_counter,abandoned_timeout)'));
  assert.ok(has('gte', 'updated_at', '2026-11-05T12:00:00.000Z'), '72 h di default');
  assert.ok(has('order', 'updated_at', { ascending: false }));
  assert.ok(has('limit', 50));

  const admin24 = makeAdmin({});
  await runReconcileSweep({ supabaseAdmin: admin24, sumupApiKey: 'k', now: () => fixedNow, lateWindowHours: 24, lateLimit: 7, fetchImpl: async () => { throw new Error('x'); } });
  const late24 = admin24.__queries.find((q) => q.late);
  assert.ok(late24.calls.some((c) => c[0] === 'gte' && c[2] === '2026-11-07T12:00:00.000Z'));
  assert.ok(late24.calls.some((c) => c[0] === 'limit' && c[1] === 7));
});

test('R3 T9b: attempt chiuso senza provider_ref (difesa in profondita) -> 0 GET, 0 RPC', async () => {
  const admin = makeAdmin({ lateAttempts: [closed({ id: 'att-null', provider_ref: null })] });
  const summary = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async () => { throw new Error('nessuna GET attesa'); } });
  assert.equal(summary.sumupCalls, 0);
  assert.equal(summary.late.unverified, 1);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('R3 T12: budget esaurito -> nessun nuovo attempt iniziato, resto rimandato (tardivi e aperti)', async () => {
  let clock = 0;
  const late = Array.from({ length: 60 }, (_, i) => closed({ id: `att-b${i}`, provider_ref: `co-b${i}` }));
  const open = Array.from({ length: 5 }, (_, i) => attempt({ id: `att-o${i}`, provider_ref: `co-o${i}` }));
  const admin = makeAdmin({ lateAttempts: late, attempts: open });
  const summary = await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k', now: () => clock, runBudgetMs: 25_000,
    fetchImpl: async (url) => {
      clock += 1000; // ogni GET "costa" 1 s
      const ref = String(url).split('/checkouts/')[1];
      return jsonFetchResponse(200, { id: ref, status: 'FAILED', amount: 10, checkout_reference: ref.replace('co-', 'att-') });
    },
  });
  assert.equal(summary.budgetExhausted, true);
  assert.equal(summary.late.checked, 26);
  assert.equal(summary.late.deferred, 34);
  assert.equal(summary.checked, 0);
  assert.equal(summary.deferred, 5);
  assert.equal(summary.sumupCalls, 26);
});

test('R3: la finestra tardiva gira prima della lista attuale; errore sulla lista tardiva non ferma la lista attuale', async () => {
  const order = [];
  const admin = makeAdmin({
    lateAttempts: [closed({ id: 'att-l1', provider_ref: 'co-l1' })],
    attempts: [attempt({ id: 'att-o1', provider_ref: 'co-o1' })],
    rpc: { kitchen_payment_fail: { data: {}, error: null } },
  });
  await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url) => {
      const ref = String(url).split('/checkouts/')[1];
      order.push(ref);
      return jsonFetchResponse(200, { id: ref, status: 'FAILED', amount: 10, checkout_reference: ref.replace('co-', 'att-') });
    },
  });
  assert.deepEqual(order, ['co-l1', 'co-o1']);

  // lista tardiva in errore
  const broken = makeAdmin({ attempts: [attempt({ id: 'att-o2', provider_ref: 'co-o2' })], rpc: { kitchen_payment_fail: { data: {}, error: null } } });
  const origFrom = broken.from;
  broken.from = (t) => {
    const b = origFrom(t);
    const origIn = b.in;
    b.in = (col, vals) => {
      const r = origIn(col, vals);
      if (vals.includes('cancelled')) r.limit = async () => ({ data: null, error: { message: 'db down' } });
      return r;
    };
    return b;
  };
  const s2 = await runReconcileSweep({
    supabaseAdmin: broken, sumupApiKey: 'k',
    fetchImpl: async () => jsonFetchResponse(200, { id: 'co-o2', status: 'FAILED', amount: 10, checkout_reference: 'att-o2' }),
  });
  assert.equal(s2.errors[0].error, 'late_list_failed:db down');
  assert.equal(s2.failed, 1);
});

test('R3 T4/T11: retry su lost_race -> stesso esito ogni giro, nessun fail, nessun nuovo attempt (dedup del log nel DB, vedi test SQL)', async () => {
  const a = closed({ id: 'att-rr', failure_reason: 'staff_closed_for_counter', provider_ref: 'co-rr' });
  const admin = makeAdmin({ lateAttempts: [a], rpc: { kitchen_payment_confirm: { data: { id: 'counter-pay' }, error: null } } });
  const run = () => runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async () => jsonFetchResponse(200, paid('att-rr', 'co-rr')) });
  const s1 = await run();
  const s2 = await run();
  assert.equal(s1.late.lostRace, 1);
  assert.equal(s2.late.lostRace, 1);
  const names = admin.__rpcCalls.map((c) => c.name);
  assert.deepEqual(names, ['kitchen_payment_confirm', 'kitchen_payment_confirm']);
});

test('R3: la lista attuale usa ora un timeout su GET e List (recovery)', async () => {
  const a = attempt({ id: 'att-t', provider_ref: null });
  const admin = makeAdmin({ attempts: [a], rpc: { kitchen_payment_attempt_set_provider_ref: { data: {}, error: null }, kitchen_payment_confirm: { data: { id: 'att-t' }, error: null } } });
  const signals = [];
  await runReconcileSweep({
    supabaseAdmin: admin, sumupApiKey: 'k',
    fetchImpl: async (url, opts) => {
      signals.push(opts?.signal instanceof AbortSignal);
      if (String(url).includes('checkout_reference=')) return jsonFetchResponse(200, [{ id: 'co-t', checkout_reference: 'att-t' }]);
      return jsonFetchResponse(200, paid('att-t', 'co-t'));
    },
  });
  assert.deepEqual(signals, [true, true]);
});

test('R3: readSweepConfig -> default, env validi, valori non validi ignorati, tetti massimi', () => {
  assert.deepEqual(readSweepConfig({}), { ...SWEEP_DEFAULTS });
  assert.deepEqual(readSweepConfig({ SUMUP_SWEEP_LATE_WINDOW_HOURS: '24', SUMUP_SWEEP_LATE_LIMIT: '10', SUMUP_SWEEP_LIMIT: '100', SUMUP_SWEEP_RUN_BUDGET_MS: '10000', SUMUP_SWEEP_TIMEOUT_MS: '3000' }),
    { lateWindowHours: 24, lateLimit: 10, limit: 100, runBudgetMs: 10000, sumupTimeoutMs: 3000 });
  const bad = readSweepConfig({ SUMUP_SWEEP_LATE_WINDOW_HOURS: 'abc', SUMUP_SWEEP_LATE_LIMIT: '-5', SUMUP_SWEEP_LIMIT: '0', SUMUP_SWEEP_RUN_BUDGET_MS: '1.5', SUMUP_SWEEP_TIMEOUT_MS: '' });
  assert.deepEqual(bad, { ...SWEEP_DEFAULTS });
  const capped = readSweepConfig({ SUMUP_SWEEP_LATE_WINDOW_HOURS: '99999', SUMUP_SWEEP_LATE_LIMIT: '99999', SUMUP_SWEEP_LIMIT: '99999', SUMUP_SWEEP_RUN_BUDGET_MS: '99999999', SUMUP_SWEEP_TIMEOUT_MS: '99999' });
  assert.deepEqual(capped, { lateWindowHours: 336, lateLimit: 200, limit: 500, runBudgetMs: 240000, sumupTimeoutMs: 10000 });
});

console.log('sumup-reconcile-sweep.test.mjs: definiti tutti i test.');

// K6-b (ai-ops/current/KITCHEN_K6_PIANO.md §7, §11): i PAID su attempt chiusi non registrabili diventano
// una riga persistente `payment_late_unverified`, una sola per attempt.
const paidFetch = (amount, refOverride) => async (url) => {
  const ref = String(url).split('/checkouts/')[1];
  return jsonFetchResponse(200, { id: refOverride ?? ref, status: 'PAID', amount, checkout_reference: ref.replace('co-', 'att-') });
};

test('K6-b: PAID non verificabile su attempt chiuso -> 1 riga, secondo giro -> 0 righe nuove', async () => {
  const a = closed({ id: 'att-k1', order_id: 'ord-k1', provider_ref: 'co-k1', venue_id: 'walrus-main' });
  const admin = makeAdmin({ lateAttempts: [a] });
  const s1 = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: paidFetch(a.amount, 'co-ALTRO') });
  assert.equal(s1.late.flagged, 1);
  assert.equal(admin.__logRows.length, 1);
  const row = admin.__logRows[0];
  assert.equal(row.action, 'payment_late_unverified');
  assert.equal(row.actor_type, 'system');
  assert.equal(row.metadata.attempt_id, 'att-k1');
  assert.equal(row.metadata.reason, 'reference_mismatch');
  assert.equal(row.metadata.needs_manual_reconciliation, true);
  const s2 = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: paidFetch(a.amount, 'co-ALTRO') });
  assert.equal(s2.late.flagged, 0);
  assert.equal(admin.__logRows.length, 1);
  assert.equal(admin.__rpcCalls.length, 0);
});

test('K6-b: importo diverso su attempt chiuso -> 1 riga con entrambi gli importi, 0 RPC', async () => {
  const a = closed({ id: 'att-k2', order_id: 'ord-k2', provider_ref: 'co-k2', status: 'cancelled', failure_reason: null });
  const admin = makeAdmin({ lateAttempts: [a] });
  const s = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: paidFetch(99) });
  assert.equal(s.late.flagged, 1);
  assert.equal(admin.__logRows[0].metadata.reason, 'amount_mismatch_on_closed');
  assert.equal(admin.__logRows[0].metadata.sumup_amount, 99);
  assert.equal(admin.__logRows[0].metadata.amount, Number(a.amount));
  assert.equal(admin.__rpcCalls.length, 0);
});

test('K6-b: PAID verificato -> nessuna riga K6-b (ci pensa K2 via confirm)', async () => {
  const a = closed({ id: 'att-k3', order_id: 'ord-k3', provider_ref: 'co-k3' });
  const admin = makeAdmin({ lateAttempts: [a], rpc: { kitchen_payment_confirm: { data: { ...a, status: 'succeeded' }, error: null } } });
  const s = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: paidFetch(a.amount) });
  assert.equal(s.late.flagged, 0);
  assert.equal(admin.__logRows.length, 0);
});

test('K6-b: timeout / non PAID -> nessuna riga (incerto, si riprova)', async () => {
  const a = closed({ id: 'att-k4', order_id: 'ord-k4', provider_ref: 'co-k4' });
  const admin = makeAdmin({ lateAttempts: [a] });
  await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async () => { throw new Error('timeout'); } });
  await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: async (url) => jsonFetchResponse(200, { id: 'co-k4', status: 'FAILED', amount: a.amount, checkout_reference: 'att-k4' }) });
  assert.equal(admin.__logRows.length, 0);
});

test('K6-b: errore di scrittura del log non ferma la sweep ne la lista attuale', async () => {
  const a = closed({ id: 'att-k5', order_id: 'ord-k5', provider_ref: 'co-k5' });
  for (const mode of ['read', 'insert']) {
    const admin = makeAdmin({ lateAttempts: [a], attempts: [], actionLogFail: mode });
    const s = await runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'k', fetchImpl: paidFetch(a.amount, 'co-ALTRO') });
    assert.equal(s.late.flagErrors, 1);
    assert.equal(s.late.flagged, 0);
    assert.equal(s.late.unverified, 1);
  }
});
