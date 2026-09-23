// Test mirato BUG B (fix: src/hooks/useKitchenOrders.js — refundOrder + isOrderStillPaid).
// Verifica il mapping completo del contratto di /api/kitchen-sumup-refund (invariato) sul lato
// client, e in particolare la condizione Gate 1 di Eros (2026-09-23): dopo un esito
// 'refunded'/'already_refunded', ANNULLA si sblocca (readyToCancel:true) SOLO se una rilettura
// server-side di kitchen_orders.payment_status conferma che non è più 'paid'. Se resta 'paid', o
// se la verifica stessa fallisce, readyToCancel deve restare false (fail-closed, mai un successo
// presunto).
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/refund-order-flow.test.mjs
//
// Stesso pattern di tests/unit/p0a-kitchen-sync.test.mjs: Vite in middleware mode con un modulo
// virtuale al posto del client Supabase reale, più un mock di fetch globale per controllare la
// risposta di /api/kitchen-sumup-refund senza rete/env reali.
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let sessionQueue = [];
let paymentStatusQueue = []; // each item: { data: {...} | null, error: {...} | null }

const mockSupabasePlugin = {
  name: 'mock-supabase-client-refund',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer && source.includes('lib/supabaseClient')) {
      return '\0virtual:supabaseClient-refund';
    }
  },
  load(id) {
    if (id === '\0virtual:supabaseClient-refund') {
      return `
        export const supabase = {
          auth: {
            getSession: async () => globalThis.__REFUND_NEXT_SESSION__(),
          },
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => globalThis.__REFUND_NEXT_PAYMENT_STATUS__(),
              }),
            }),
          }),
        };
      `;
    }
  },
};

globalThis.__REFUND_NEXT_SESSION__ = () => ({ data: { session: sessionQueue.shift() } });
globalThis.__REFUND_NEXT_PAYMENT_STATUS__ = () => paymentStatusQueue.shift() ?? { data: null, error: null };

const originalFetch = globalThis.fetch;
let fetchQueue = []; // each item: { status, body } | 'throw'
globalThis.fetch = async () => {
  const next = fetchQueue.shift();
  if (next === 'throw') throw new Error('network error');
  return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
};

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  plugins: [mockSupabasePlugin],
  server: { middlewareMode: true },
});

const { refundOrder } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenOrders.js')
);

const STAFF_SESSION = { user: { id: 'staff-1', is_anonymous: false }, access_token: 'tok' };

// 1. no session -> mai una chiamata all'endpoint, ok:false, readyToCancel:false
sessionQueue = [null];
fetchQueue = [];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_session');
  assert.equal(r.readyToCancel, false);
}
console.log('PASS 1: no session -> ok:false, readyToCancel:false');

// 2. errore RPC-start generico (es. order_not_found) -> retryable, readyToCancel:false
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 404, body: { error: 'order_not_found' } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.outcome, 'order_not_found');
  assert.equal(r.canRetry, true);
  assert.equal(r.readyToCancel, false);
}
console.log('PASS 2: order_not_found -> canRetry:true, readyToCancel:false');

// 3. sumup_transaction_id_missing -> terminale, mai retry, mai ANNULLA
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 502, body: { error: 'sumup_transaction_id_missing' } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.canRetry, false);
  assert.equal(r.readyToCancel, false);
}
console.log('PASS 3: sumup_transaction_id_missing -> canRetry:false, readyToCancel:false');

// 4. outcome 'unknown' -> mai ANNULLA, mai retry (allineato al contratto retryable:false dell'API)
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'unknown', retryable: false } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.canRetry, false);
  assert.equal(r.readyToCancel, false);
}
console.log("PASS 4: outcome 'unknown' -> canRetry:false, readyToCancel:false");

// 5. outcome 'in_progress' -> blocco temporaneo, retry ammesso, mai ANNULLA
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'in_progress', retryable: false } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.canRetry, true);
  assert.equal(r.readyToCancel, false);
}
console.log("PASS 5: outcome 'in_progress' -> canRetry:true, readyToCancel:false");

// 6. outcome 'failed' (retryable) -> retry ammesso, mai ANNULLA
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 409, body: { outcome: 'failed', retryable: true } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.canRetry, true);
  assert.equal(r.readyToCancel, false);
}
console.log("PASS 6: outcome 'failed' -> canRetry:true, readyToCancel:false");

// 7. GATE 1: outcome 'refunded' MA la rilettura server-side conferma payment_status ANCORA 'paid'
//    -> mai ANNULLA, mostrato come stato di sincronizzazione/errore (syncMismatch), non un successo pieno.
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'refunded' } }];
paymentStatusQueue = [{ data: { payment_status: 'paid' }, error: null }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, true); // il refund stesso è riuscito lato provider...
  assert.equal(r.readyToCancel, false); // ...ma ANNULLA resta bloccato finché il DB non riflette il refund
  assert.equal(r.syncMismatch, true);
}
console.log("PASS 7 (GATE 1): refunded ma payment_status ancora 'paid' -> readyToCancel:false, syncMismatch:true");

// 8. GATE 1: la verifica stessa fallisce (errore di rete/RLS sulla select) -> fail-closed, mai ANNULLA
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'refunded' } }];
paymentStatusQueue = [{ data: null, error: { message: 'network error' } }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, true);
  assert.equal(r.readyToCancel, false);
  assert.equal(r.syncMismatch, true);
}
console.log('PASS 8 (GATE 1): verifica payment_status fallita -> fail-closed, readyToCancel:false');

// 9. Happy path completo: outcome 'refunded' E la rilettura conferma payment_status non più 'paid'
//    -> SOLO ora ANNULLA si sblocca.
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'refunded' } }];
paymentStatusQueue = [{ data: { payment_status: 'refunded' }, error: null }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, true);
  assert.equal(r.readyToCancel, true);
  assert.notEqual(r.syncMismatch, true);
}
console.log("PASS 9: refunded + payment_status verificato non più 'paid' -> readyToCancel:true");

// 10. already_refunded (idempotente) + verifica OK -> stesso sblocco di 'refunded'
sessionQueue = [STAFF_SESSION];
fetchQueue = [{ status: 200, body: { outcome: 'already_refunded' } }];
paymentStatusQueue = [{ data: { payment_status: 'refunded' }, error: null }];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, true);
  assert.equal(r.readyToCancel, true);
}
console.log('PASS 10: already_refunded + payment_status verificato -> readyToCancel:true');

// 11. fetch di rete fallisce del tutto (es. offline) -> ok:false, retryable, mai ANNULLA
sessionQueue = [STAFF_SESSION];
fetchQueue = ['throw'];
{
  const r = await refundOrder('order-1', 'test');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'network_error');
  assert.equal(r.canRetry, true);
  assert.equal(r.readyToCancel, false);
}
console.log('PASS 11: fetch error -> ok:false, canRetry:true, readyToCancel:false');

await server.close();
globalThis.fetch = originalFetch;
console.log('\nBUG B refund flow: tutti i controlli mirati superati (incluso Gate 1 payment_status re-check).');
