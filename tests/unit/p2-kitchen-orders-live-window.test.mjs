// Test mirato P2 — Kitchen Orders Payload Reduction.
//   - useKitchenOrders.js: filtro live (serata corrente + ordini aperti), finestra ricalcolata
//     ad ogni fetch, scope cliente invariato.
//   - useKitchenOrderHistory.js: query storico (solo notte passata, chiusi), loader con cache,
//     dedupe in volo e scarto delle risposte stale.
//
// Non wired a npm/package.json (stesso schema degli altri test unit):
//   node tests/unit/p2-kitchen-orders-live-window.test.mjs
import { createServer } from 'vite';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Client Supabase finto: registra la catena di chiamate e risponde secondo lo scenario.
globalThis.__P2_SCENARIO__ = { session: { user: { id: 's1' } }, rows: [], error: null };
globalThis.__P2_CALLS__ = [];

const mockSupabasePlugin = {
  name: 'mock-supabase-client-p2',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.includes('lib/supabaseClient')) return '\0virtual:supabaseClient';
  },
  load(id) {
    if (id === '\0virtual:supabaseClient') {
      return `
        function builder(table) {
          const chain = { table, ops: [] };
          const proxy = new Proxy({}, {
            get(_, op) {
              if (op === 'then') {
                const s = globalThis.__P2_SCENARIO__;
                globalThis.__P2_CALLS__.push(chain);
                return (res) => res({ data: s.error ? null : s.rows, error: s.error });
              }
              return (...args) => { chain.ops.push([op, ...args]); return proxy; };
            },
          });
          return proxy;
        }
        export const supabase = {
          auth: { getSession: async () => { if (globalThis.__P2_SCENARIO__.sessionThrows) throw new Error('Supabase non configurato'); return { data: { session: globalThis.__P2_SCENARIO__.session } }; } },
          from: (table) => builder(table),
          channel: () => ({ on() { return this; }, subscribe() { return this; } }),
          removeChannel: () => {},
        };`;
    }
  },
};

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  plugins: [mockSupabasePlugin],
});

const orders = await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useKitchenOrders.js'));
const history = await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useKitchenOrderHistory.js'));
const rules = await server.ssrLoadModule(path.join(ROOT, 'src/lib/kitchenServiceRules.js'));

const op = (chain, name) => chain.ops.find((o) => o[0] === name);

// ---------------------------------------------------------------- live window
const w1 = rules.serviceNightWindow(new Date('2026-09-21T20:00:00+02:00'));
const filter = orders.buildLiveOrdersFilter(w1);
assert.equal(
  filter,
  `created_at.gte.${w1.startIso},status.in.(pending_counter_payment,received,preparing,ready)`,
  'filtro live: serata corrente OR stati aperti'
);
assert.ok(!/delivered|cancelled/.test(filter), 'il filtro live non deve nominare gli stati chiusi');
console.log('PASS 1: buildLiveOrdersFilter = created_at >= start OR status in (aperti)');

// La finestra va ricalcolata: a cavallo delle 06:00 la startIso cambia (rollover TV accesa).
const before6 = orders.buildLiveOrdersFilter(rules.serviceNightWindow(new Date('2026-09-22T05:59:00+02:00')));
const after6 = orders.buildLiveOrdersFilter(rules.serviceNightWindow(new Date('2026-09-22T06:01:00+02:00')));
assert.notEqual(before6, after6, '05:59 e 06:01 appartengono a due serate diverse');
assert.ok(before6.includes('2026-09-21T04:00:00.000Z'), 'alle 05:59 la serata e\' ancora quella aperta il 21');
assert.ok(after6.includes('2026-09-22T04:00:00.000Z'), 'alle 06:01 la serata e\' quella aperta il 22');
console.log('PASS 2: la finestra live cambia a cavallo delle 06:00');

// Wiring: finestra calcolata DENTRO fetchSupabaseOrders (ogni fetch), solo scope staff.
const src = fs.readFileSync(path.join(ROOT, 'src/hooks/useKitchenOrders.js'), 'utf8');
const body = src.slice(src.indexOf('const fetchSupabaseOrders = async'), src.indexOf('Sync adattivo: Realtime'));
assert.ok(body.includes('if (!isCustomer) query = query.or(buildLiveOrdersFilter(serviceNightWindow()))'),
  'fetchSupabaseOrders: filtro live ricalcolato ad ogni fetch e solo per lo scope staff');
const codeOnly = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
assert.equal((codeOnly.match(/serviceNightWindow\(\)/g) || []).length, 1, 'serviceNightWindow() usato solo dentro la fetch, mai a livello modulo');
console.log('PASS 3: wiring live (per-fetch, staff-only, customer invariato)');

// Il merge e le pending writes restano quelli di P1: un ordine con write pending fuori finestra sopravvive.
const pending = new Map([['old-1', { status: 'delivered' }]]);
const merged = orders.mergeFetchedOrders(
  [{ id: 'old-1', status: 'delivered', syncStatus: 'pending' }, { id: 'gone', status: 'delivered' }],
  [{ id: 'live-1', order_code: 'A1', status: 'received', kitchen_order_items: [] }],
  pending
);
assert.deepEqual(merged.map((o) => o.id).sort(), ['live-1', 'old-1'], 'fetch=verita\', salvo write pending');
console.log('PASS 4: mergeFetchedOrders invariato (pending write protetta, ordine uscito dalla finestra scartato)');

// ---------------------------------------------------------------- history query
const nightWin = rules.serviceNightWindowFor('2026-09-19');
globalThis.__P2_SCENARIO__ = {
  session: { user: { id: 's1' } },
  rows: [{ id: 'h1', order_code: 'H1', nickname: 'Zoe', status: 'delivered', total: 9, created_at: nightWin.startIso, kitchen_order_items: [{ item_id: 'i', name: 'Pulled', quantity: 1, price: 9 }] }],
  error: null,
};
globalThis.__P2_CALLS__ = [];
const ok = await history.fetchClosedOrdersForNight('2026-09-19');
assert.equal(ok.ok, true);
assert.equal(ok.orders.length, 1);
assert.equal(ok.orders[0].createdAt, nightWin.startIso, 'stesso mapping camelCase della lista live');
assert.equal(ok.orders[0].items[0].name, 'Pulled');
const call = globalThis.__P2_CALLS__[0];
assert.equal(call.table, 'kitchen_orders');
assert.deepEqual(op(call, 'eq').slice(1), ['venue_id', 'walrus-main']);
assert.deepEqual(op(call, 'in').slice(1), ['status', ['delivered', 'cancelled']], 'solo ordini chiusi');
assert.deepEqual(op(call, 'gte').slice(1), ['created_at', nightWin.startIso]);
assert.deepEqual(op(call, 'lt').slice(1), ['created_at', nightWin.endIso]);
assert.deepEqual(op(call, 'limit').slice(1), [history.HISTORY_FETCH_LIMIT]);
console.log('PASS 5: query storico = venue + chiusi + finestra 06:00->06:00 + limit esplicito');

globalThis.__P2_SCENARIO__.session = null;
globalThis.__P2_CALLS__ = [];
const noSession = await history.fetchClosedOrdersForNight('2026-09-19');
assert.equal(noSession.noSession, true);
assert.equal(globalThis.__P2_CALLS__.length, 0, 'senza sessione nessuna query');
console.log('PASS 6: senza sessione staff -> noSession, zero query (fallback locale nel consumer)');

// client non configurato (env mancanti): getSession LANCIA -> stesso ripiego locale, mai 'error'.
globalThis.__P2_SCENARIO__ = { session: null, sessionThrows: true, rows: [], error: null };
globalThis.__P2_CALLS__ = [];
const unconfigured = await history.fetchClosedOrdersForNight('2026-09-19');
assert.equal(unconfigured.noSession, true, 'getSession che lancia = nessuna sessione, non un errore di caricamento');
assert.equal(globalThis.__P2_CALLS__.length, 0);
console.log('PASS 6b: client non configurato (getSession lancia) -> noSession, nessun errore a schermo');

globalThis.__P2_SCENARIO__ = { session: { user: { id: 's1' } }, rows: [], error: new Error('boom') };
const failed = await history.fetchClosedOrdersForNight('2026-09-19');
assert.equal(failed.ok, false, 'errore di rete/RLS -> ok:false, mai dati finti');
console.log('PASS 7: errore -> ok:false');

// ---------------------------------------------------------------- loader
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}
const calls = [];
const pendings = {};
const loader = history.createNightHistoryLoader((night) => {
  calls.push(night);
  pendings[night] = pendings[night] ?? [];
  const d = deferred();
  pendings[night].push(d);
  return d.promise;
});

// cache: una sola fetch per notte
const a1 = loader.load('2026-09-19');
pendings['2026-09-19'][0].resolve({ ok: true, orders: [{ id: 'a' }] });
const r1 = await a1;
assert.deepEqual(r1.orders, [{ id: 'a' }]);
assert.equal(loader.has('2026-09-19'), true);
assert.deepEqual(loader.get('2026-09-19'), [{ id: 'a' }]);
console.log('PASS 8: successo -> in cache');

// stale: A in volo, si passa a B, A risponde dopo -> scartata; B applicata
const sa = loader.load('2026-09-18');
loader.cancel();                       // cambio notte (cleanup dell'effect)
const sb = loader.load('2026-09-17');
pendings['2026-09-17'][0].resolve({ ok: true, orders: [{ id: 'b' }] });
pendings['2026-09-18'][0].resolve({ ok: true, orders: [{ id: 'late-a' }] });
assert.deepEqual((await sa), { stale: true }, 'risposta di A (non piu\' l\'ultima richiesta) scartata');
assert.deepEqual((await sb).orders, [{ id: 'b' }]);
assert.equal(loader.has('2026-09-18'), false, 'una risposta stale non entra in cache');
console.log('PASS 9: risposta stale scartata, ultima richiesta applicata');

// dedupe in volo (StrictMode: load, cancel, load della stessa notte -> una sola fetch)
const before = calls.length;
const d1 = loader.load('2026-09-16');
loader.cancel();
const d2 = loader.load('2026-09-16');
assert.equal(calls.length - before, 1, 'una sola fetch di rete per la stessa notte in volo');
pendings['2026-09-16'][0].resolve({ ok: true, orders: [{ id: 'c' }] });
assert.deepEqual(await d1, { stale: true });
assert.deepEqual((await d2).orders, [{ id: 'c' }]);
console.log('PASS 10: stessa notte in volo -> una sola richiesta (StrictMode safe)');

// errori e noSession non vanno in cache: la rientrata ritenta
const e1 = loader.load('2026-09-15');
pendings['2026-09-15'][0].resolve({ ok: false, error: new Error('x') });
assert.equal((await e1).ok, false);
assert.equal(loader.has('2026-09-15'), false, 'un errore non e\' mai in cache');
const e2 = loader.load('2026-09-15');
assert.equal(pendings['2026-09-15'].length, 2, 'dopo un errore si rifetcha');
pendings['2026-09-15'][1].resolve({ ok: true, noSession: true });
assert.equal((await e2).noSession, true);
assert.equal(loader.has('2026-09-15'), false, 'noSession non e\' mai in cache');
console.log('PASS 11: errore/noSession non cachati, retry alla rientrata');

await server.close();
console.log('\nP2: tutti i controlli mirati superati.');
