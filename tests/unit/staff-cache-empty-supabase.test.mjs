// Test mirato (fix: src/hooks/useKitchenOrders.js — fetchSupabaseOrders/loadOrders).
// Bug: dopo un DB cleanup (kitchen_orders -> 0 righe reali), una risposta Supabase valida con
// 0 ordini veniva trattata come un fetch fallito (`if (!data?.length) return;`), quindi lo
// staff continuava a vedere gli ordini vecchi in state E in cache (LS_VENUE_KEY). In piu',
// se la cache locale era vuota, lo scope staff faceva fallback a `demoKitchenOrders` — ordini
// finti di altri clienti mostrati su una superficie staff reale.
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/staff-cache-empty-supabase.test.mjs
//
// Stesso approccio dei test P0-A/Sprint3B: Vite in middleware mode per caricare l'hook con la
// sua risoluzione reale; qui non serve mockare il client Supabase (le funzioni sotto test sono
// pure/localStorage), ma serve un `localStorage` globale in Node (assente di default).
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Fake localStorage minimale (stesso contratto usato da readOrdersFromKey/writeOrdersToKey).
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}
globalThis.localStorage = makeFakeLocalStorage();

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { loadOrders, saveOrders, mergeFetchedOrders } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenOrders.js')
);

const LS_VENUE_KEY = 'walbox_kitchen_orders_demo';
const staleOrders = [
  { id: 'order-old-1', orderCode: 'A01', nickname: 'Eros', status: 'delivered', total: 10, items: [] },
  { id: 'order-old-2', orderCode: 'A02', nickname: 'Marco', status: 'received', total: 5, items: [] },
];

// --- Obiettivo 2/3: cache staff vuota in produzione -> [] (mai demoKitchenOrders) ---
globalThis.localStorage.removeItem(LS_VENUE_KEY);
const emptyCacheResult = loadOrders('staff');
assert.deepEqual(emptyCacheResult, [], 'staff scope con cache vuota deve dare [], mai i demo order');
console.log('PASS 1: loadOrders(staff) con localStorage vuoto -> [] (no fallback demoKitchenOrders)');

// --- Obiettivo 1 (nucleo): merge di una risposta Supabase valida con 0 righe, senza pending
//     writes da proteggere -> lista vuota (non "nessun cambiamento") ---
const mergedEmpty = mergeFetchedOrders(staleOrders, [], new Map());
assert.deepEqual(mergedEmpty, [], 'data=[] senza pending writes deve svuotare la lista, non lasciarla stale');
console.log('PASS 2: mergeFetchedOrders(prev pieno, data=[], no pending) -> []');

// --- Obiettivo 1: un ordine con un write pending resta protetto anche se il fetch e' vuoto ---
const pending = new Map([['order-old-1', { status: 'ready' }]]);
const mergedProtected = mergeFetchedOrders(staleOrders, [], pending);
assert.equal(mergedProtected.length, 1, 'un ordine con write pending deve sopravvivere a un fetch vuoto');
assert.equal(mergedProtected[0].id, 'order-old-1');
console.log('PASS 3: mergeFetchedOrders con pending write protegge solo quell\'ordine, il resto sparisce');

// --- Scenario end-to-end del task: cache staff NON vuota + Supabase [] -> state/cache diventano [] ---
saveOrders('staff', staleOrders);
assert.deepEqual(loadOrders('staff'), staleOrders, 'setup: la cache staff parte non vuota');

// Stesso identico passo che fa fetchSupabaseOrders dentro l'hook: merge, poi persist se !isCustomer.
const nextAfterEmptyFetch = mergeFetchedOrders(loadOrders('staff'), [], new Map());
saveOrders('staff', nextAfterEmptyFetch);

assert.deepEqual(nextAfterEmptyFetch, [], 'lo "state" risultante dal merge deve essere []');
assert.deepEqual(loadOrders('staff'), [], 'la cache staff (LS_VENUE_KEY) deve essere stata ripulita a []');
console.log('PASS 4: cache staff non vuota + Supabase [] -> state e cache diventano [] (bug risolto)');

// --- Non regressione: risposta Supabase con ordini reali continua a rimpiazzare correttamente ---
const freshRow = {
  id: 'order-new-1', order_code: 'B01', nickname: 'Sara', status: 'received', total: 12,
  created_at: '2026-09-18T20:00:00Z', kitchen_order_items: [],
};
const mergedFresh = mergeFetchedOrders([], [freshRow], new Map());
assert.equal(mergedFresh.length, 1, 'una risposta non vuota deve popolare la lista con gli ordini reali');
assert.equal(mergedFresh[0].id, 'order-new-1');
console.log('PASS 5: mergeFetchedOrders con dati reali (non-empty) invariato');

await server.close();
console.log('\nStaff cache empty-Supabase: tutti i controlli mirati superati.');
