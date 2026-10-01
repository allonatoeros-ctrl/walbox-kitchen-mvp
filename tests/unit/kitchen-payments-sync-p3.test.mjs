// Test mirato — P3a (poll visibility-aware) + P3b (includeRecent) di useKitchenPayments.
// Non wired a npm: node tests/unit/kitchen-payments-sync-p3.test.mjs
// Vite SSR con moduli virtuali: 'react' = shim minimale (state/effect catturati) e il client
// supabase = recorder di query. Nessuna rete, nessun DOM, prodotto non modificato.
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const calls = [];
const effects = [];
globalThis.__p3 = { calls, effects };

const V = (id) => '\0virtual:' + id;
const virtual = {
  name: 'p3-virtual',
  enforce: 'pre',
  resolveId(id) {
    if (id === 'react') return V('react');
    if (/lib\/supabaseClient$/.test(id)) return V('supabase');
  },
  load(id) {
    if (id === V('react')) return `
      export const useState = (i) => [typeof i === 'function' ? i() : i, () => {}];
      export const useEffect = (fn, deps) => { globalThis.__p3.effects.push({ fn, deps }); };`;
    if (id === V('supabase')) return `
      const mk = (table) => { const q = { table, data: [], error: null };
        const chain = new Proxy(q, { get(t, k) { if (k === 'then') return (res) => res({ data: [], error: null });
          return () => chain; } });
        globalThis.__p3.calls.push(table); return chain; };
      export const supabase = { auth: { getSession: async () => ({ data: { session: { ok: 1 } } }) },
        from: mk };`;
  },
};
const server = await createServer({ root: ROOT, configFile: false, logLevel: 'error',
  server: { middlewareMode: true }, ssr: { noExternal: ['react'] }, plugins: [virtual] });
const mod = await server.ssrLoadModule(path.join(ROOT, 'src/hooks/useKitchenPayments.js'));
const { useKitchenPayments, startVisibilityAwarePoll } = mod;

// ---- P3b: includeRecent -----------------------------------------------------------------
async function runRefresh(opts) {
  calls.length = 0; effects.length = 0;
  const r = useKitchenPayments(opts);
  await r.refresh();
  return [...calls];
}
const def = await runRefresh({});
assert.deepEqual(def, ['kitchen_payments', 'kitchen_payments_provider_drift_candidates', 'kitchen_payments'],
  'default: Q1+Q2+Q3 (Q4 solo se ci sono order_id)');
console.log('PASS P3b-1: default (includeRecent=true) -> Q1+Q2+Q3, invariato');
const off = await runRefresh({ includeRecent: false });
assert.deepEqual(off, ['kitchen_payments', 'kitchen_payments_provider_drift_candidates'],
  'includeRecent:false: solo Q1+Q2');
assert.ok(!off.includes('kitchen_orders'), 'niente Q4');
console.log('PASS P3b-2: includeRecent:false -> solo Q1+Q2, niente Q3/Q4');

// ---- P3a: poll visibility-aware ---------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeDoc(hidden) {
  const l = new Set();
  return { hidden, addEventListener: (_, f) => l.add(f), removeEventListener: (_, f) => l.delete(f),
    set(h) { this.hidden = h; [...l].forEach((f) => f()); }, get n() { return l.size; } };
}
{ // hidden -> zero polling
  const doc = fakeDoc(true); let n = 0;
  const stop = startVisibilityAwarePoll(() => n++, () => true, { doc, intervalMs: 10 });
  await sleep(60); assert.equal(n, 0, 'hidden: zero refresh'); stop();
  console.log('PASS P3a-1: tab hidden -> zero polling');
}
{ // visibile -> poll; hidden -> stop; ritorno visibile -> UN refresh immediato, poi poll riparte
  const doc = fakeDoc(false); let n = 0;
  const stop = startVisibilityAwarePoll(() => n++, () => true, { doc, intervalMs: 20 });
  assert.equal(n, 0, 'nessun refresh in setup (lo fa l\'effect di mount)');
  await sleep(50); assert.ok(n >= 1, 'poll attivo da visibile');
  doc.set(true); const frozen = n; await sleep(80); assert.equal(n, frozen, 'hidden: poll fermo');
  doc.set(false); assert.equal(n, frozen + 1, 'ritorno visibile: esattamente un refresh immediato');
  await sleep(50); assert.ok(n >= frozen + 2, 'poll riparte');
  stop(); assert.equal(doc.n, 0, 'cleanup rimuove il listener');
  console.log('PASS P3a-2: visible -> un solo refresh immediato, poi poll riparte; cleanup ok');
}
{ // notte storica -> nessun poll (l'effect non registra nulla)
  effects.length = 0; useKitchenPayments({ night: '2020-01-01' });
  const pollEffect = effects[1];
  assert.equal(pollEffect.fn(), undefined, 'notte storica: nessun poll/listener');
  console.log('PASS P3a-3: notte storica -> nessun poll');
}
{ // non-live al tick -> nessun refresh anche con tab visibile
  const doc = fakeDoc(false); let n = 0;
  const stop = startVisibilityAwarePoll(() => n++, () => false, { doc, intervalMs: 10 });
  await sleep(50); doc.set(true); doc.set(false); assert.equal(n, 0); stop();
  console.log('PASS P3a-4: isLive=false (rollover) -> nessun refresh nemmeno al ritorno visibile');
}
await server.close();
console.log('ALL PASS');
