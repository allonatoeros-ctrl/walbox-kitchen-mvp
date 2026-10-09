// Test mirato S1 — Staff Hardening + Realtime (Kitchen Order/Payment Lifecycle V2).
// Eseguire a mano con: node tests/unit/s1-staff-hardening.test.mjs
// Stesso approccio di sprint3b-kitchen-realtime.test.mjs (Vite middleware + client Supabase finto).
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const mockSupabasePlugin = {
  name: 'mock-supabase-client-s1',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.includes('lib/supabaseClient')) return '\0virtual:supabaseClient';
  },
  load(id) {
    if (id === '\0virtual:supabaseClient') {
      return `export const supabase = {
        auth: { getSession: async () => ({ data: { session: null } }) },
        channel: () => { throw new Error('unexpected'); },
        removeChannel: () => {},
      };`;
    }
  },
};

const server = await createServer({
  root: ROOT, configFile: false, logLevel: 'error',
  plugins: [mockSupabasePlugin], server: { middlewareMode: true },
  oxc: { jsx: { runtime: 'automatic' } }, esbuild: { jsx: 'automatic' },
});

const rules = await server.ssrLoadModule(path.join(ROOT, 'src/lib/kitchenServiceRules.js'));
const hook = await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useKitchenOrders.js'));
const { renderToStaticMarkup } = await import('react-dom/server');
const React = await import('react');
const { default: AlertView } = await server.ssrLoadModule(path.join(ROOT, 'src/pages/AlertView.jsx'));

// ---- 1. allow-list stati operativi
for (const st of ['pending_counter_payment', 'received', 'preparing', 'ready']) {
  assert.equal(rules.isStaffOperationalOrder({ status: st }), true, `${st} deve essere operativo`);
}
for (const st of ['pending_online_payment', 'payment_abandoned', 'delivered', 'cancelled', 'boh', undefined, null]) {
  assert.equal(rules.isStaffOperationalOrder({ status: st }), false, `${String(st)} NON deve essere operativo`);
}
assert.equal(rules.isStaffOperationalOrder(null), false);
assert.deepEqual(hook.OPEN_ORDER_STATUSES, [...rules.STAFF_OPERATIONAL_STATUSES], 'live filter e allow-list coincidono');
console.log('PASS 1: allow-list stati operativi (incl. futuri stati online esclusi)');

// ---- 2. AlertView: esclude stati online non pagati, mantiene counter/paid operativi
const old = new Date(Date.now() - 20 * 60000).toISOString();
const mk = (id, status) => ({ id, orderCode: `Z${id}`, nickname: `nick${id}`, status, createdAt: old, items: [] });
const html = renderToStaticMarkup(React.createElement(AlertView, { orders: [
  mk('1', 'received'), mk('2', 'preparing'), mk('3', 'ready'),
  mk('4', 'pending_counter_payment'), mk('5', 'pending_online_payment'), mk('6', 'payment_abandoned'),
  mk('7', 'delivered'), mk('8', 'cancelled'),
] }));
for (const code of ['Z1', 'Z2', 'Z3']) assert.ok(html.includes(code), `${code} (operativo) deve comparire in Alert`);
for (const code of ['Z4', 'Z5', 'Z6', 'Z7', 'Z8']) assert.ok(!html.includes(code), `${code} non deve comparire in Alert`);
console.log('PASS 2: AlertView filtra con allow-list (regressione stati attuali ok)');

// ---- 3. selectTvOrders
const now = new Date();
const fresh = { id: 'f', status: 'ready', createdAt: new Date(now.getTime() - 60000).toISOString() };
const stale = { id: 's', status: 'ready', createdAt: '2020-01-01T10:00:00.000Z' };
const online = { id: 'o', status: 'pending_online_payment', createdAt: fresh.createdAt };
assert.equal(rules.selectTvOrders({ orders: [fresh], sessionStatus: 'checking', hasSynced: false }).state, 'checking');
const none = rules.selectTvOrders({ orders: [fresh], sessionStatus: 'none', hasSynced: true });
assert.deepEqual([none.state, none.orders.length], ['no-session', 0], 'senza sessione nessun dato staff');
const cacheOnly = rules.selectTvOrders({ orders: [fresh, stale, online], sessionStatus: 'authenticated', hasSynced: false, now });
assert.deepEqual(cacheOnly.orders.map((o) => o.id), ['f'], 'cache non sincronizzata: solo serata corrente e stati operativi');
const synced = rules.selectTvOrders({ orders: [fresh, stale, online], sessionStatus: 'authenticated', hasSynced: true, now });
assert.deepEqual(synced.orders.map((o) => o.id), ['f', 's'], 'dopo sync il server e\' la fonte (ordine aperto vecchio incluso), online escluso');
assert.deepEqual(rules.selectTvOrders({ orders: 'x', sessionStatus: 'authenticated', hasSynced: true }).orders, []);
console.log('PASS 3: selectTvOrders (sessione assente, cache obsoleta, stati online)');

// ---- 4. channel manager (subscription dopo login, ricovero dopo chiusura/errore, no-session)
function harness() {
  const h = { subs: [], removed: [], statuses: [], changes: 0, timers: [], seq: 0 };
  const timers = {
    setTimeout: (fn, ms) => { const t = { id: ++h.seq, fn, ms, live: true }; h.timers.push(t); return t.id; },
    clearTimeout: (id) => { const t = h.timers.find((x) => x.id === id); if (t) t.live = false; },
  };
  h.fire = () => { const t = h.timers.find((x) => x.live); if (!t) return false; t.live = false; t.fn(); return true; };
  h.liveTimers = () => h.timers.filter((t) => t.live).length;
  const mgr = hook.createRealtimeChannelManager({
    subscribe: (onChange, onStatus) => { const ch = { n: h.subs.length + 1, onChange, onStatus }; h.subs.push(ch); return ch; },
    removeChannel: (ch) => h.removed.push(ch.n),
    onChange: () => { h.changes += 1; },
    onStatus: (s) => h.statuses.push(s),
    timers,
  });
  return { h, mgr };
}

{ // 4a: nessuna sessione -> nessuna subscription; login dopo il mount -> subscribe una volta (idempotente)
  const { h, mgr } = harness();
  mgr.ensure(null);
  assert.equal(h.subs.length, 0, 'senza sessione nessuna subscription');
  assert.equal(mgr.hasChannel(), false);
  mgr.ensure({ user: { id: 'u' } });
  mgr.ensure({ user: { id: 'u' } }); // TOKEN_REFRESHED
  assert.equal(h.subs.length, 1, 'login dopo mount => una sola subscription, ensure idempotente');
  h.subs[0].onChange();
  assert.equal(h.changes, 1, 'evento realtime inoltrato');
  console.log('PASS 4a: subscription dopo login successivo al mount');
}
{ // 4b: CLOSED / CHANNEL_ERROR -> resubscribe con canale vecchio rimosso; SUBSCRIBED annulla il retry
  const { h, mgr } = harness();
  mgr.ensure({ user: {} });
  h.subs[0].onStatus('SUBSCRIBED');
  h.subs[0].onStatus('CLOSED');
  assert.equal(h.liveTimers(), 1, 'CLOSED pianifica il re-subscribe');
  h.fire();
  assert.deepEqual(h.removed, [1], 'canale vecchio rimosso');
  assert.equal(h.subs.length, 2, 'nuovo canale creato dopo chiusura');
  h.subs[0].onStatus('CLOSED'); // callback tardiva del vecchio canale: ignorata
  h.subs[0].onChange();
  assert.equal(h.changes, 0, 'evento del vecchio canale ignorato');
  assert.equal(h.liveTimers(), 0, 'nessun retry da callback tardiva');
  h.subs[1].onStatus('CHANNEL_ERROR');
  assert.equal(h.liveTimers(), 1);
  h.subs[1].onStatus('SUBSCRIBED'); // il client si e' riconnesso da solo
  assert.equal(h.liveTimers(), 0, 'SUBSCRIBED annulla il retry pendente');
  console.log('PASS 4b: recupero dopo chiusura/errore canale, callback tardive ignorate');
}
{ // 4c: backoff crescente su errori ripetuti
  const { h, mgr } = harness();
  mgr.ensure({ user: {} });
  const delays = [];
  for (let i = 0; i < 5; i += 1) {
    h.subs[h.subs.length - 1].onStatus('TIMED_OUT');
    delays.push(h.timers.filter((t) => t.live)[0].ms);
    h.fire();
  }
  assert.deepEqual(delays, [2000, 5000, 15000, 30000, 30000], 'backoff cap a 30s');
  console.log('PASS 4c: backoff re-subscribe');
}
{ // 4d: logout -> canale rimosso, stato CLOSED notificato, nessun retry; nuovo login -> nuovo canale
  const { h, mgr } = harness();
  mgr.ensure({ user: {} });
  h.subs[0].onStatus('CLOSED'); // retry pendente
  mgr.ensure(null);
  assert.equal(mgr.hasChannel(), false);
  assert.deepEqual(h.removed, [1]);
  assert.equal(h.liveTimers(), 0, 'logout annulla i retry');
  mgr.ensure({ user: {} });
  assert.equal(h.subs.length, 2, 'rilogin => nuova subscription');
  mgr.stop();
  assert.deepEqual(h.removed, [1, 2], 'stop (unmount) rimuove il canale');
  mgr.ensure({ user: {} });
  assert.equal(h.subs.length, 2, 'dopo stop nessuna nuova subscription');
  console.log('PASS 4d: logout/relogin/unmount');
}

await server.close();
console.log('\nS1: tutti i controlli mirati superati.');
