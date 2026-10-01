// Test mirato P1 Supabase Sync Optimization (src/hooks/useKitchenOrders.js —
// createOrdersSyncScheduler / subscribeToKitchenOrdersRealtime status callback).
// Eseguire a mano: node tests/unit/p1-kitchen-sync-scheduler.test.mjs
// Vite middleware mode + client Supabase mockato; timer/clock/visibilita' finti (deterministico).
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-p1',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.includes('lib/supabaseClient')) return '\0virtual:supabaseClient';
  },
  load(id) {
    if (id === '\0virtual:supabaseClient') {
      return `export const supabase = {
        auth: { getSession: async () => ({ data: { session: null } }) },
        channel: () => globalThis.__P1_CHANNEL__(),
        removeChannel: () => {},
      };`;
    }
  },
};

let statusCb = null;
globalThis.__P1_CHANNEL__ = () => {
  const c = { on: () => c, subscribe: (cb) => { statusCb = cb; return c; } };
  return c;
};

const server = await createServer({
  root: ROOT, configFile: false, logLevel: 'error',
  plugins: [mockSupabasePlugin], server: { middlewareMode: true },
});
const { createOrdersSyncScheduler, SYNC_TIMING, subscribeToKitchenOrdersRealtime } =
  await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useKitchenOrders.js'));

// --- harness: clock + timer finti ---
function harness({ role = 'staff', fetchImpl } = {}) {
  let t = 0; let hidden = false; let nextId = 1;
  const pending = new Map();
  const timers = {
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, at: t + ms }); return id; },
    clearTimeout: (id) => pending.delete(id),
  };
  const h = { calls: 0, results: [] };
  h.fetchFn = async () => { h.calls += 1; return fetchImpl ? fetchImpl(h.calls) : true; };
  h.setHidden = (v) => { hidden = v; };
  h.sched = createOrdersSyncScheduler({
    fetchFn: h.fetchFn, role, isHidden: () => hidden, now: () => t, timers, random: () => 0.5,
  });
  h.advance = async (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...pending.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]); t = due[1].at; due[1].fn();
      await flush();
    }
    t = end; await flush();
  };
  h.pendingCount = () => pending.size;
  return h;
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const MIN = 60000;

// 1. staff, Realtime sano: ~4 fetch/min max -> 1 al mount + safety poll 45s
{
  const h = harness(); h.sched.start(); await flush();
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush(); // catch-up iniziale coalescato
  const base = h.calls;
  await h.advance(10 * MIN);
  const perMin = (h.calls - base) / 10;
  assert.ok(perMin <= 1.5, `healthy staff: ${perMin}/min`);
  assert.equal(SYNC_TIMING.safetyPollMs.staff, 45000);
}

// 2. Realtime non sano: fallback rapido 10s (staff) / 15s (customer)
{
  const h = harness(); h.sched.start(); await flush();
  const b = h.calls; await h.advance(60000);
  assert.equal(h.calls - b, 6, 'staff fallback 10s');
  const c = harness({ role: 'customer' }); c.sched.start(); await flush();
  const cb = c.calls; await c.advance(60000);
  assert.equal(c.calls - cb, 4, 'customer fallback 15s');
}

// 3. Realtime cade (SUBSCRIBED -> CHANNEL_ERROR): torna al poll rapido
{
  const h = harness(); h.sched.start(); await flush();
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush();
  h.sched.setRealtimeStatus('CHANNEL_ERROR'); await flush();
  const b = h.calls; await h.advance(30000);
  assert.ok(h.calls - b >= 2, 'fallback dopo CHANNEL_ERROR');
}

// 4. hidden: zero fetch; resume (>=5s) = 1 catch-up immediato
{
  const h = harness(); h.sched.start(); await flush();
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush();
  h.setHidden(true); h.sched.onVisibilityChange();
  assert.equal(h.pendingCount(), 0, 'nessun timer con tab hidden');
  const b = h.calls; await h.advance(5 * MIN);
  assert.equal(h.calls, b, 'A2: 0 fetch con tab hidden 5 min');
  h.sched.notifyRealtimeEvent(); await h.advance(1000);
  assert.equal(h.calls, b, 'evento Realtime da hidden non fetcha');
  h.setHidden(false); h.sched.onVisibilityChange(); await flush();
  assert.equal(h.calls, b + 1, 'resume = 1 catch-up immediato');
  assert.equal(h.pendingCount(), 1, 'timer riavviato dopo resume');
}

// 5. hidden breve (<5s) senza eventi: nessun refetch extra
{
  const h = harness(); h.sched.start(); await flush();
  h.setHidden(true); h.sched.onVisibilityChange(); await h.advance(2000);
  const b = h.calls; h.setHidden(false); h.sched.onVisibilityChange(); await flush();
  assert.equal(h.calls, b, 'hidden < soglia = niente refetch');
}

// 6. online = catch-up immediato; reconnect (non-SUBSCRIBED -> SUBSCRIBED) = catch-up
{
  const h = harness(); h.sched.start(); await flush();
  const b = h.calls; h.sched.onOnline(); await flush();
  assert.equal(h.calls, b + 1, 'online catch-up');
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush();
  h.sched.setRealtimeStatus('CLOSED'); await flush();
  const c = h.calls; h.sched.setRealtimeStatus('SUBSCRIBED'); await flush();
  assert.equal(h.calls, c + 1, 'reconnect catch-up');
}

// 7. debounce: raffica di eventi = 1 fetch dopo 400ms
{
  const h = harness(); h.sched.start(); await flush();
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush();
  const b = h.calls;
  for (let i = 0; i < 10; i++) { h.sched.notifyRealtimeEvent(); await h.advance(50); }
  assert.equal(h.calls, b, 'nessuna fetch prima della fine del debounce');
  await h.advance(SYNC_TIMING.debounceMs);
  assert.equal(h.calls, b + 1, 'raffica = 1 fetch');
}

// 8. in-flight coalescing: evento durante fetch lenta = 1 sola fetch di coda
{
  let release; let n = 0;
  const h = harness({ fetchImpl: () => { n += 1; return n === 2 ? new Promise((r) => { release = () => r(true); }) : true; } });
  h.sched.start(); await flush();
  h.sched.setRealtimeStatus('SUBSCRIBED'); await flush(); // 2a fetch (lenta) in volo
  const b = h.calls;
  h.sched.notifyRealtimeEvent(); await h.advance(500);
  h.sched.notifyRealtimeEvent(); await h.advance(500);
  assert.equal(h.calls, b, 'nessuna fetch parallela mentre una e in volo');
  release(); await flush();
  assert.equal(h.calls, b + 1, 'una sola fetch di coda');
}

// 9. backoff sugli errori, reset al primo successo
{
  const h = harness({ fetchImpl: (n) => n > 4 ? true : false });
  h.sched.start(); await flush();            // call1 fail
  const stamps = [];
  let last = h.calls;
  for (let s = 0; s < 200; s++) {            // step da 1s
    await h.advance(1000);
    if (h.calls !== last) { stamps.push(s + 1); last = h.calls; }
  }
  assert.deepEqual(stamps.slice(0, 3), [10, 30, 70], 'backoff 10/20/40s'); // 4a call a 70s fallisce, poi 60s
  assert.ok(h.calls >= 5);
}

// 10. fetchFn che lancia / ritorna false non rompe lo scheduler
{
  const h = harness({ fetchImpl: () => { throw new Error('boom'); } });
  h.sched.start(); await flush(); await h.advance(15000);
  assert.ok(h.calls >= 2, 'continua a ritentare dopo throw');
  h.sched.stop(); const b = h.calls; await h.advance(5 * MIN);
  assert.equal(h.calls, b, 'stop ferma tutto');
  assert.equal(h.pendingCount(), 0);
}

// 11. subscribeToKitchenOrdersRealtime: status callback + retrocompatibile senza callback
{
  const seen = [];
  subscribeToKitchenOrdersRealtime(() => {}, (s) => seen.push(s));
  statusCb('SUBSCRIBED', null); statusCb('CLOSED', null);
  assert.deepEqual(seen, ['SUBSCRIBED', 'CLOSED']);
  subscribeToKitchenOrdersRealtime(() => {});
  statusCb('SUBSCRIBED', null); // non deve lanciare
}

await server.close();
console.log('p1-kitchen-sync-scheduler: ALL PASS');
