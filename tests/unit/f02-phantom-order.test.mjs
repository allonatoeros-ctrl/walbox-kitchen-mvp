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
let lastRpc = null;
globalThis.__F02_RPC__ = (name, args) => { rpcCallCount += 1; lastRpc = { name, args }; return rpcResult; };

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

// ── S5 (Payment Lifecycle V2): createOrderOnServer con paymentLane -> RPC v2 ──────────────────
const baseRow = {
  id: 'srv-v2-1', order_code: 'B01', service_day: '2026-10-13', service_sequence: 1,
  total: 8, created_at: '2026-10-13T20:00:00Z', fulfillment_type: 'eat_here',
  status: 'pending_online_payment', payment_status: null, payment_method: null, paid_at: null,
  online_payment_disabled: false,
};
const orderV2 = { ...order, fulfillmentType: 'eat_here', paymentLane: 'online', clientRequestId: '6f1d2f4e-0000-4000-8000-000000000001' };

// 5. v2: chiama la RPC v2 con corsia e client_request_id; ordine locale dai campi del server
lastRpc = null;
rpcResult = { data: baseRow, error: null };
r = await createOrderOnServer(orderV2);
assert.equal(r.ok, true);
assert.equal(lastRpc.name, 'kitchen_customer_create_order_v2');
assert.equal(lastRpc.args.p_payment_lane, 'online');
assert.equal(lastRpc.args.p_client_request_id, orderV2.clientRequestId);
assert.equal(lastRpc.args.p_fulfillment_type, 'eat_here');
assert.equal(r.order.status, 'pending_online_payment', 'status dal server, non dal client (pending_counter_payment)');
assert.equal(r.order.paymentStatus, null, 'payment_status dal server (NULL per POP)');
assert.equal(r.order.onlinePaymentDisabled, false);
assert.equal(r.order.createdAt, '2026-10-13T20:00:00Z');
assert.equal('paymentLane' in r.order, false);
assert.equal('clientRequestId' in r.order, false);
console.log('PASS 5: v2 online -> RPC v2, ordine locale POP dai campi server');

// 6. v2 idempotenza "vince il primo": scelta banco ma il server restituisce l'ordine POP gia creato
rpcResult = { data: baseRow, error: null };
r = await createOrderOnServer({ ...orderV2, paymentLane: 'counter' });
assert.equal(lastRpc.args.p_payment_lane, 'counter');
assert.equal(r.order.status, 'pending_online_payment', 'vince lo status del server, non la corsia cliccata');
console.log('PASS 6: v2 idempotente -> status del server');

// 7. v2 banco: PCP con online_payment_disabled dal server
rpcResult = { data: { ...baseRow, status: 'pending_counter_payment', payment_status: 'pending_counter_payment', online_payment_disabled: true }, error: null };
r = await createOrderOnServer({ ...orderV2, paymentLane: 'counter' });
assert.equal(r.order.status, 'pending_counter_payment');
assert.equal(r.order.paymentStatus, 'pending_counter_payment');
assert.equal(r.order.onlinePaymentDisabled, true);
console.log('PASS 7: v2 banco -> PCP');

// 8. v2 errore RPC (kitchen_closed) e risposta senza status -> ok:false
rpcResult = { data: null, error: new Error('kitchen_closed') };
r = await createOrderOnServer(orderV2);
assert.equal(r.ok, false);
assert.match(r.error.message, /kitchen_closed/);
rpcResult = { data: { ...baseRow, status: undefined }, error: null };
r = await createOrderOnServer(orderV2);
assert.equal(r.ok, false, 'risposta v2 senza status deve dare ok:false');
console.log('PASS 8: v2 errori -> ok:false');

// 9. senza paymentLane: chiamata v1 identica a prima (cassa)
lastRpc = null;
rpcResult = { data: { id: 'srv-9', order_code: 'A09', total: 8, created_at: '2026-10-13T20:00:00Z' }, error: null };
r = await createOrderOnServer(order);
assert.equal(lastRpc.name, 'kitchen_customer_create_order');
assert.equal('p_payment_lane' in lastRpc.args, false);
assert.equal(r.order.status, 'pending_counter_payment', 'v1: status dal client come prima');
console.log('PASS 9: senza paymentLane -> v1 invariata');

await server.close();
console.log('\nF02: tutti i controlli mirati superati.');
