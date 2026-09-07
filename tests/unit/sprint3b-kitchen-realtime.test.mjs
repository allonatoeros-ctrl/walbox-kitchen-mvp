// Test mirato Sprint 3B (src/hooks/useKitchenOrders.js — subscribeToKitchenOrdersRealtime).
// Verifica che la subscription Realtime sia cablata sulla tabella/venue corretti e che un
// evento postgres_changes lanci il refresh canonico (fetchSupabaseOrders), senza inventare
// mapping paralleli.
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/sprint3b-kitchen-realtime.test.mjs
//
// Stesso approccio del test P0-A: Vite in middleware mode + modulo virtuale al posto del
// client Supabase reale, qui con un mock di .channel()/.on()/.subscribe()/.removeChannel().
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let capturedEvent = null;
let capturedHandler = null;
let subscribeCallCount = 0;
let removeChannelCallCount = 0;
const CHANNEL_TOKEN = { marker: 'fake-channel' };

const mockSupabasePlugin = {
  name: 'mock-supabase-client-realtime',
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
          auth: { getSession: async () => ({ data: { session: null } }) },
          channel: (name) => globalThis.__S3B_CHANNEL__(name),
          removeChannel: (ch) => globalThis.__S3B_REMOVE_CHANNEL__(ch),
        };
      `;
    }
  },
};

globalThis.__S3B_CHANNEL__ = () => {
  const chainable = {
    on: (event, config, handler) => {
      capturedEvent = { event, config };
      capturedHandler = handler;
      return chainable;
    },
    subscribe: (cb) => {
      subscribeCallCount += 1;
      if (cb) cb('SUBSCRIBED', null);
      return CHANNEL_TOKEN;
    },
  };
  return chainable;
};
globalThis.__S3B_REMOVE_CHANNEL__ = () => { removeChannelCallCount += 1; };

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  plugins: [mockSupabasePlugin],
  server: { middlewareMode: true },
});

const { subscribeToKitchenOrdersRealtime } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenOrders.js')
);

// 1. la subscription usa il canale/tabella/venue attesi
let onChangeCallCount = 0;
const returnedChannel = subscribeToKitchenOrdersRealtime(() => { onChangeCallCount += 1; });

assert.equal(subscribeCallCount, 1, 'subscribe deve essere chiamato esattamente una volta');
assert.equal(returnedChannel, CHANNEL_TOKEN, 'deve ritornare il canale per permettere il cleanup');
assert.equal(capturedEvent.event, 'postgres_changes', 'deve ascoltare postgres_changes');
assert.deepEqual(
  capturedEvent.config,
  { event: '*', schema: 'public', table: 'kitchen_orders', filter: 'venue_id=eq.walrus-main' },
  'config subscription deve puntare a kitchen_orders / venue walrus-main, tutti gli eventi'
);
console.log('PASS 1: subscription cablata su kitchen_orders / venue_id=eq.walrus-main');

// 2. un evento realtime richiama l'onChange (nella hook: fetchSupabaseOrders canonico) — zero
//    mapping parallelo qui, la callback e' opaca al modulo di subscribe.
assert.equal(onChangeCallCount, 0, 'onChange non deve partire prima di un evento reale');
capturedHandler({ eventType: 'UPDATE', new: { id: 'order-1' }, old: { id: 'order-1' } });
assert.equal(onChangeCallCount, 1, 'un evento postgres_changes deve invocare onChange una volta');
capturedHandler({ eventType: 'INSERT', new: { id: 'order-2' } });
assert.equal(onChangeCallCount, 2, 'ogni evento invoca onChange una volta, nessun dedup implicito qui');
console.log('PASS 2: evento realtime -> onChange (refresh canonico) invocato');

await server.close();
console.log('\nSprint 3B: tutti i controlli mirati superati.');
