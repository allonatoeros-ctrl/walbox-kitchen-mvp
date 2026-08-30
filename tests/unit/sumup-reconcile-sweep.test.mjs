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
import { runReconcileSweep } from '../../api/_lib/sumupReconcileSweep.js';

function jsonFetchResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Mock minimale: kitchen_payments.select().eq()...in()...order()...limit() ritorna la lista fissa
// passata; rpc() registra le chiamate e applica gli override forniti.
function makeAdmin({ attempts = [], rpc = {} } = {}) {
  const rpcCalls = [];
  const from = (table) => {
    assert.equal(table, 'kitchen_payments');
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      or: () => builder,
      order: () => builder,
      limit: async () => ({ data: attempts, error: null }),
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

console.log('sumup-reconcile-sweep.test.mjs: definiti tutti i test.');
