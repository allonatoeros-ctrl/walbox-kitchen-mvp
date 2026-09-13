// Test mirato F02 — Phantom Order (fix: src/hooks/useKitchenOrders.js — createOrderOnServer /
// addOrder). Verifica che un errore auth/RPC/rete o una risposta malformata non produca mai un
// ordine locale spacciato per un ordine reale (era: fallback silenzioso con id/order_code
// locali generati da nextLocalOperationalCode).
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/f02-phantom-order.test.mjs
//
// Stesso pattern di tests/unit/p0a-kitchen-sync.test.mjs: Vite in middleware mode con un
// modulo virtuale al posto di ../lib/supabaseClient, per controllare sessione/RPC ed esercitare
// il codice reale (createOrderOnServer), non una sua reimplementazione.
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let nextSession = null;
let signInAnonResult = { data: { session: null }, error: null };
let rpcResult = { data: null, error: null };
let rpcCallCount = 0;

const mockSupabasePlugin = {
  name: 'mock-supabase-client-f02',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.includes('lib/supabaseClient')) {
      return '\0virtual:supabaseClient';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseClient') {
      return `
        export const supabase = {
          auth: {
            getSession: async () => globalThis.__F02_NEXT_SESSION__(),
            signInAnonymously: async () => globalThis.__F02_SIGN_IN__(),
          },
          rpc: async (name, args) => globalThis.__F02_RPC__(name, args),
        };
      `;
    }
  },
};

globalThis.__F02_NEXT_SESSION__ = () => ({ data: { session: nextSession } });
globalThis.__F02_SIGN_IN__ = () => signInAnonResult;
globalThis.__F02_RPC__ = () => { rpcCallCount += 1; return rpcResult; };

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  plugins: [mockSupabasePlugin],
  server: { middlewareMode: true },
});

const { createOrderOnServer } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenOrders.js')
);

const order = {
  nickname: 'TestUser',
  items: [{ itemId: 'item-1', name: 'Panino', quantity: 1, price: 8 }],
  total: 8,
  note: null,
  status: 'pending_counter_payment',
  paymentStatus: 'pending_counter_payment',
  paymentMethod: 'counter',
  paidAt: null,
};

// 1. RPC error -> no phantom order
nextSession = { user: { id: 'guest-1', is_anonymous: true } };
rpcResult = { data: null, error: new Error('rpc_unreachable') };
let r = await createOrderOnServer(order);
assert.equal(r.ok, false, 'RPC error deve dare ok:false');
assert.equal(r.order, undefined, 'nessun order locale deve essere ritornato su RPC error');
console.log('PASS 1: RPC error -> ok:false, nessun ordine fantasma');

// 2. auth/network failure (nessuna sessione e signInAnonymously fallisce) -> no success
nextSession = null;
signInAnonResult = { data: { session: null }, error: new Error('network_error') };
r = await createOrderOnServer(order);
assert.equal(r.ok, false, 'fallimento signInAnonymously deve dare ok:false');
console.log('PASS 2: auth/network failure -> ok:false');

// 3. risposta RPC malformata (manca order_code) -> no success
nextSession = { user: { id: 'guest-1', is_anonymous: true } };
signInAnonResult = { data: { session: nextSession }, error: null };
rpcResult = { data: { id: 'srv-1' }, error: null }; // manca order_code
r = await createOrderOnServer(order);
assert.equal(r.ok, false, 'risposta RPC senza order_code deve dare ok:false');
console.log('PASS 3: response malformata -> ok:false');

// 4. success RPC -> success con id/order_code reali (nessun codice locale inventato)
rpcResult = {
  data: {
    id: 'srv-42',
    order_code: 'A07',
    service_day: '2026-09-13',
    service_sequence: 7,
    total: 8,
    created_at: '2026-09-13T20:00:00Z',
  },
  error: null,
};
r = await createOrderOnServer(order);
assert.equal(r.ok, true, 'RPC success deve dare ok:true');
assert.equal(r.order.id, 'srv-42', 'id deve essere quello del server');
assert.equal(r.order.orderCode, 'A07', 'orderCode deve essere quello del server');
console.log('PASS 4: RPC success -> ok:true con id/order_code server reali');

await server.close();
console.log('\nF02: tutti i controlli mirati superati.');
