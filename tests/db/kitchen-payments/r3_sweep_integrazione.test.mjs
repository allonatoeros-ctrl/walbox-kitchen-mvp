// R3 (ai-ops/current/KITCHEN_R3_PIANO.md) — integrazione: la sweep VERA (api/_lib/sumupReconcileSweep.js) contro un
// Postgres 17 LOCALE gia' migrato (tests/db/apply-migrations.sh + 00_fc_test_base.sql + 00_kp_helpers.sql), con le RPC
// reali K1/K2/K4 e SumUp SIMULATO (fetch finta: nessuna chiamata di rete).
// Il client Supabase e' sostituito da un adattatore minimo che traduce in SQL solo i filtri usati dalla sweep
// (select/eq/in/or/not/gte/order/limit) e le RPC (con il claim service_role dello shim), via psql.
// Mai remoto: rifiuta PGHOST diverso da socket locale/127.0.0.1/localhost.
// Uso: PGHOST=/socket PGPORT=54329 KP_DB=walbox_kp_test node --test tests/db/kitchen-payments/r3_sweep_integrazione.test.mjs
// I dati creati restano nel DB (committati): usare un DB di test dedicato.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runReconcileSweep } from '../../../api/_lib/sumupReconcileSweep.js';
import { applySumupCheckoutResult } from '../../../api/_lib/sumupPaymentResolution.js';

const run = promisify(execFile);
const PGHOST = process.env.PGHOST;
const DB = process.env.KP_DB;
const LOCAL = PGHOST && (PGHOST.startsWith('/') || ['127.0.0.1', 'localhost'].includes(PGHOST));
const skip = !DB || !LOCAL ? 'serve KP_DB e PGHOST locale (socket o 127.0.0.1)' : false;

const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const ident = (c) => { assert.match(c, /^[a-z_]+$/); return c; };

async function psql(sqlText) {
  const { stdout } = await run('psql', ['-qAtX', '-v', 'ON_ERROR_STOP=1', '-U', process.env.PGUSER || 'postgres', '-d', DB, '-c', sqlText],
    { env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
  return stdout.trim();
}
async function q1(sqlText) { const out = await psql(sqlText); return out === '' ? null : JSON.parse(out.split('\n').pop()); }

// PostgREST `or`: termini col.op.val separati da virgole fuori dalle parentesi; op eq | neq | in.(a,b)
function orToSql(expr) {
  const terms = []; let depth = 0; let cur = '';
  for (const ch of expr) {
    if (ch === '(') depth += 1; if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { terms.push(cur); cur = ''; } else cur += ch;
  }
  terms.push(cur);
  return '(' + terms.map((t) => {
    const [col, op, ...rest] = t.split('.');
    const val = rest.join('.');
    if (op === 'eq') return `${ident(col)} = ${lit(val)}`;
    if (op === 'neq') return `${ident(col)} <> ${lit(val)}`; // come PostgREST: neq esclude i NULL
    if (op === 'in') return `${ident(col)} IN (${val.slice(1, -1).split(',').map(lit).join(',')})`;
    throw new Error('op or non supportato: ' + op);
  }).join(' OR ') + ')';
}

function makePgAdmin() {
  const rpcCalls = [];
  return {
    __rpcCalls: rpcCalls,
    from(table) {
      assert.equal(table, 'kitchen_payments');
      const where = []; let cols = '*'; let orderBy = '';
      const b = {
        select: (c) => { cols = c.split(',').map((x) => ident(x.trim())).join(', '); return b; },
        eq: (c, v) => { where.push(`${ident(c)} = ${lit(v)}`); return b; },
        in: (c, vs) => { where.push(`${ident(c)} IN (${vs.map(lit).join(',')})`); return b; },
        or: (e) => { where.push(orToSql(e)); return b; },
        not: (c, op, v) => { assert.equal(op, 'is'); assert.equal(v, null); where.push(`${ident(c)} IS NOT NULL`); return b; },
        gte: (c, v) => { where.push(`${ident(c)} >= ${lit(v)}`); return b; },
        order: (c, { ascending }) => { orderBy = `ORDER BY ${ident(c)} ${ascending ? 'ASC' : 'DESC'}`; return b; },
        limit: async (n) => {
          try {
            const data = await q1(`SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (SELECT ${cols} FROM public.kitchen_payments
              WHERE ${where.join(' AND ') || 'true'} ${orderBy} LIMIT ${Number(n)}) t`);
            return { data, error: null };
          } catch (err) { return { data: null, error: { message: String(err.stderr || err.message) } }; }
        },
      };
      return b;
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      const args = Object.entries(params).map(([k, v]) => `${ident(k)} => ${typeof v === 'object' && v !== null ? `${lit(JSON.stringify(v))}::jsonb` : lit(v)}`);
      try {
        const out = await psql(`SELECT fc_test.as_service(); SELECT to_jsonb(public.${ident(name)}(${args.join(', ')}));`);
        const last = out.split('\n').pop();
        return { data: last ? JSON.parse(last) : null, error: null };
      } catch (err) {
        return { data: null, error: { message: String(err.stderr || err.message).trim() } };
      }
    },
  };
}

// SumUp simulato: provider_ref -> risposta. Rif. non registrati: FAILED (non pagato). Registra ogni GET.
function fakeSumup(responses) {
  const gets = [];
  const fetchImpl = async (url, opts) => {
    assert.ok(opts?.signal, 'timeout obbligatorio');
    const ref = decodeURIComponent(String(url).split('/checkouts/')[1] || '');
    gets.push(ref);
    const r = responses[ref];
    if (r === 'timeout') throw new DOMException('timeout', 'TimeoutError');
    if (r === '503') return { ok: false, status: 503, json: async () => ({ message: 'down' }) };
    return { ok: true, status: 200, json: async () => r ?? { id: ref, status: 'FAILED', amount: 0, checkout_reference: null } };
  };
  return { fetchImpl, gets };
}

// Fixture: ordine online + attempt SumUp con provider_ref, poi chiusura nel modo richiesto.
async function fixture(close) {
  const lane = close.startsWith('staff_close') ? 'counter' : 'online'; // "PASSA AL BANCO" staff: ordine corsia banco (p6c-2, 7c1)
  const user = await psql('SELECT fc_test.new_user()');
  const staff = await psql('SELECT fc_test.new_staff()');
  const ord = await q1(`SELECT to_jsonb(kp_test.new_order(${lit(user)}, ${lit(lane)}))`);
  const row = { order_id: ord.id, staff };
  const a = await q1(`SELECT to_jsonb(fc_test.start_online(${lit(row.order_id)}))`);
  const ref = `co-${a.id}`;
  await psql(`UPDATE public.kitchen_payments SET provider_ref = ${lit(ref)} WHERE id = ${lit(a.id)}`);
  const o = lit(row.order_id); const s = lit(row.staff);
  if (close === 'cancel') await psql(`SELECT fc_test.cancel(${o}, ${s})`);
  if (close === 'switch') await psql(`SELECT kp_test.switch_to_counter(${o})`);
  if (close === 'staff_close') await psql(`SELECT kp_test.close_unpaid(${lit(a.id)}, ${s})`);
  if (close === 'staff_close_paid_counter') { await psql(`SELECT kp_test.close_unpaid(${lit(a.id)}, ${s})`); await psql(`SELECT fc_test.pay_counter(${o}, ${s})`); }
  if (close === 'abandon') await psql(`SELECT kp_test.abandon(${o})`);
  const att = await attemptRow(a.id);
  return { orderId: row.order_id, staff: row.staff, attemptId: a.id, ref, amount: Number(a.amount), att };
}
const attemptRow = (id) => q1(`SELECT to_jsonb(p) FROM public.kitchen_payments p WHERE id = ${lit(id)}`);
const orderRow = (id) => q1(`SELECT to_jsonb(o) FROM public.kitchen_orders o WHERE id = ${lit(id)}`);
const charges = async (orderId) => Number(await psql(`SELECT kp_test.succeeded_charges(${lit(orderId)})`));
const logs = async (orderId, action) => Number(await psql(`SELECT kp_test.log_count(${lit(orderId)}, ${lit(action)})`));
const paidResp = (f, extra = {}) => ({ id: f.ref, status: 'PAID', amount: f.amount, checkout_reference: f.attemptId, ...extra });
const sweep = (admin, fetchImpl, extra = {}) => runReconcileSweep({ supabaseAdmin: admin, sumupApiKey: 'test', fetchImpl, ...extra });

test('R3-I precondizione: DB locale migrato con K2', { skip }, async () => {
  const n = Number(await psql(`SELECT count(*) FROM pg_proc WHERE proname = 'kitchen_payment_confirm'`));
  assert.equal(n, 1);
});

test('R3-I casi obbligatori su DB reale: annullo, banco non incassato, banco incassato, abbandono, non pagati, finestra, idempotenza', { skip }, async () => {
  const cancel = await fixture('cancel');
  const sw = await fixture('switch');
  const dbl = await fixture('staff_close_paid_counter');
  const ab = await fixture('abandon');
  const abFailed = await fixture('abandon');
  const notFound = await fixture('switch');
  const down = await fixture('staff_close');
  const noId = await fixture('cancel');
  const old = await fixture('cancel');
  await psql(`UPDATE public.kitchen_payments SET updated_at = now() - interval '73 hours' WHERE id = ${lit(old.attemptId)}`);
  const nullRef = await fixture('cancel');
  await psql(`UPDATE public.kitchen_payments SET provider_ref = NULL WHERE id = ${lit(nullRef.attemptId)}`);

  assert.equal(cancel.att.status, 'cancelled');
  assert.equal(sw.att.failure_reason, 'customer_switched_to_counter');
  assert.equal(dbl.att.failure_reason, 'staff_closed_for_counter');
  assert.equal(ab.att.failure_reason, 'abandoned_timeout');
  assert.equal(await charges(dbl.orderId), 1, 'banco gia incassato prima del PAID');

  const responses = {
    [cancel.ref]: paidResp(cancel),
    [sw.ref]: paidResp(sw),
    [dbl.ref]: paidResp(dbl),
    [ab.ref]: paidResp(ab),
    [abFailed.ref]: { id: abFailed.ref, status: 'FAILED', amount: abFailed.amount, checkout_reference: abFailed.attemptId },
    [notFound.ref]: '503',
    [down.ref]: 'timeout',
    [noId.ref]: paidResp(noId, { id: undefined }),
    [old.ref]: paidResp(old),
  };
  const sumup = fakeSumup(responses);
  const admin = makePgAdmin();
  const s1 = await sweep(admin, sumup.fetchImpl, { lateLimit: 200 });

  // Pagamento riuscito dopo annullo
  assert.equal((await attemptRow(cancel.attemptId)).status, 'succeeded');
  assert.equal((await orderRow(cancel.orderId)).status, 'cancelled');
  assert.equal(await logs(cancel.orderId, 'payment_confirmed_after_cancel'), 1);
  // Pagamento riuscito dopo passaggio al banco (non ancora incassato) -> ordine pagato online; il banco poi non incassa di nuovo
  assert.equal((await orderRow(sw.orderId)).payment_status, 'paid');
  const counter = await q1(`SELECT to_jsonb(fc_test.pay_counter(${lit(sw.orderId)}, ${lit(sw.staff)}))`);
  assert.equal(counter.id, sw.attemptId, 'D1: il banco restituisce il charge SumUp');
  assert.equal(await charges(sw.orderId), 1);
  // Doppio incasso banco + SumUp -> 1 charge, lost_race double_charge
  assert.equal(await charges(dbl.orderId), 1);
  assert.equal(await logs(dbl.orderId, 'payment_confirm_lost_race'), 1);
  const cls = await psql(`SELECT metadata->>'classification' FROM public.kitchen_action_log WHERE order_id = ${lit(dbl.orderId)} AND action = 'payment_confirm_lost_race'`);
  assert.equal(cls, 'double_charge');
  // Pagamento dopo abbandono
  assert.equal((await attemptRow(ab.attemptId)).status, 'succeeded');
  assert.equal(await logs(ab.orderId, 'payment_confirmed_after_abandon'), 1);
  // FAILED su abbandonato: attempt invariato (nessun fail che riscriva il motivo)
  const abf = await attemptRow(abFailed.attemptId);
  assert.equal(abf.failure_reason, 'abandoned_timeout');
  assert.equal(abf.updated_at, abFailed.att.updated_at);
  // SumUp non raggiungibile (503 / timeout) e checkout senza id: invariati
  for (const f of [notFound, down, noId]) {
    const r = await attemptRow(f.attemptId);
    assert.equal(r.status, f.att.status); assert.equal(r.failure_reason, f.att.failure_reason); assert.equal(r.updated_at, f.att.updated_at);
  }
  // Fuori finestra e provider_ref NULL: mai letti
  assert.ok(!sumup.gets.includes(old.ref), 'attempt oltre 72 h non letto');
  assert.equal((await attemptRow(old.attemptId)).status, 'cancelled');
  assert.ok(!sumup.gets.includes(''), 'nessuna GET senza riferimento');
  assert.ok(s1.late.paidRecorded >= 3 && s1.late.lostRace >= 1 && s1.late.unverified >= 3, JSON.stringify(s1.late));
  assert.equal(admin.__rpcCalls.filter((c) => c.name === 'kitchen_payment_fail').length, 0, 'mai fail su attempt chiusi');

  // Retry senza doppie registrazioni: secondo giro identico
  const logsBefore = Number(await psql('SELECT count(*) FROM public.kitchen_action_log'));
  const chargesBefore = Number(await psql(`SELECT count(*) FROM public.kitchen_payments WHERE status = 'succeeded'`));
  const admin2 = makePgAdmin();
  const s2 = await sweep(admin2, fakeSumup(responses).fetchImpl, { lateLimit: 200 });
  assert.equal(Number(await psql('SELECT count(*) FROM public.kitchen_action_log')), logsBefore, 'nessun nuovo log al secondo giro');
  assert.equal(Number(await psql(`SELECT count(*) FROM public.kitchen_payments WHERE status = 'succeeded'`)), chargesBefore);
  assert.equal(s2.late.paidRecorded, 0, 'gli attempt gia succeeded escono dalla finestra');
  assert.equal(admin2.__rpcCalls.filter((c) => c.name === 'kitchen_payment_fail').length, 0);
});

test('R3-I webhook duplicato/concorrente con la sweep sullo stesso PAID -> 1 charge, 1 log', { skip }, async () => {
  for (let i = 0; i < 5; i += 1) {
    const f = await fixture('cancel');
    const resp = paidResp(f);
    const admin = makePgAdmin();
    const webhook = () => applySumupCheckoutResult(makePgAdmin(), f.att, resp); // come api/kitchen-sumup-webhook.js dopo la GET
    const results = await Promise.allSettled([
      sweep(admin, fakeSumup({ [f.ref]: resp }).fetchImpl, { lateLimit: 200 }),
      webhook(),
      webhook(), // consegna duplicata
    ]);
    assert.ok(results.every((r) => r.status === 'fulfilled'), JSON.stringify(results.map((r) => r.reason?.message)));
    assert.equal(await charges(f.orderId), 1);
    assert.equal(await logs(f.orderId, 'payment_confirmed_after_cancel'), 1, `ripetizione ${i}`);
    assert.equal((await attemptRow(f.attemptId)).status, 'succeeded');
  }
});

test('R3-I lost_race ripetuto (webhook dopo sweep) -> log lost_race una sola volta', { skip }, async () => {
  const f = await fixture('staff_close_paid_counter');
  const resp = paidResp(f);
  await sweep(makePgAdmin(), fakeSumup({ [f.ref]: resp }).fetchImpl, { lateLimit: 200 });
  const out = await applySumupCheckoutResult(makePgAdmin(), f.att, resp);
  assert.equal(out.outcome, 'lost_race');
  await sweep(makePgAdmin(), fakeSumup({ [f.ref]: resp }).fetchImpl, { lateLimit: 200 });
  assert.equal(await logs(f.orderId, 'payment_confirm_lost_race'), 1);
  assert.equal(await charges(f.orderId), 1);
});

test('R3-I budget esaurito su DB reale -> resto rimandato, nessuna scrittura sugli attempt non letti', { skip }, async () => {
  const fs = [];
  for (let i = 0; i < 4; i += 1) fs.push(await fixture('cancel'));
  let clock = 0;
  const responses = Object.fromEntries(fs.map((f) => [f.ref, paidResp(f)]));
  const inner = fakeSumup(responses);
  const s = await sweep(makePgAdmin(), async (u, o) => { clock += 10_000; return inner.fetchImpl(u, o); }, { lateLimit: 200, runBudgetMs: 15_000, now: () => clock });
  assert.equal(s.budgetExhausted, true, JSON.stringify(s));
  assert.equal(s.late.checked, 2, 'solo 2 GET entro 15 s simulati (10 s ciascuna)');
  assert.ok(s.late.deferred >= 2);
  // i piu' recenti per primi: gli ultimi due creati sono stati letti
  assert.equal((await attemptRow(fs[3].attemptId)).status, 'succeeded');
  assert.equal((await attemptRow(fs[0].attemptId)).status, 'cancelled');
});
