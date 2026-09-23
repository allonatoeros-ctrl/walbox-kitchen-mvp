// Test mirato — "PASSA AL BANCO" in /kitchen/solo (Gate 1 approvato da Eros 2026-09-23).
//
// Verifica isCloseForCounterEligible (src/lib/kitchenCloseForCounter.js): il predicato puro che
// decide se un attempt kitchen_payments e' idoneo a "PASSA AL BANCO" — stessa regola gia'
// validata nel Payment Hub (PaymentsView.jsx) e stesso predicato server-side di
// api/kitchen-staff-sumup-close-for-counter.js. Un checkout SumUp ancora aperto
// (initiated/pending), oppure gia' 'failed' ma ancora nella same-checkout retry window di F03
// (failure_reason='sumup_failed'). Un 'failed' con un altro motivo, un provider diverso o una
// direction diversa da 'charge' NON e' eleggibile.
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/kitchen-close-for-counter-eligibility.test.mjs
//
// Stesso pattern di tests/unit/kitchen-analytics-service-night-selector.test.mjs: Vite in
// middleware mode per caricare il modulo con la sua risoluzione reale (import estensionless),
// senza mockare supabaseClient — supabaseClient.js non fallisce a caricamento senza env (Proxy
// lazy in quel file) e la funzione testata qui non lo tocca.
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});

const { isCloseForCounterEligible } = await server.ssrLoadModule(
  path.join(ROOT, 'src/lib/kitchenCloseForCounter.js')
);

const base = { direction: 'charge', provider: 'sumup' };

assert.equal(isCloseForCounterEligible(null), false, 'nessun attempt -> non eleggibile');
console.log('PASS 1: attempt assente -> non eleggibile');

assert.equal(isCloseForCounterEligible({ ...base, status: 'initiated' }), true, 'initiated deve essere eleggibile');
console.log('PASS 2: status initiated -> eleggibile');

assert.equal(isCloseForCounterEligible({ ...base, status: 'pending' }), true, 'pending deve essere eleggibile');
console.log('PASS 3: status pending -> eleggibile');

assert.equal(
  isCloseForCounterEligible({ ...base, status: 'failed', failure_reason: 'sumup_failed' }),
  true,
  'failed/sumup_failed (retry window F03) deve essere eleggibile'
);
console.log('PASS 4: status failed + failure_reason sumup_failed -> eleggibile');

assert.equal(
  isCloseForCounterEligible({ ...base, status: 'failed', failure_reason: 'checkout_expired' }),
  false,
  'failed con un motivo diverso da sumup_failed NON deve essere eleggibile'
);
console.log('PASS 5: status failed + altro failure_reason -> non eleggibile');

assert.equal(
  isCloseForCounterEligible({ ...base, status: 'initiated', provider: 'cash' }),
  false,
  'provider diverso da sumup NON deve essere eleggibile'
);
console.log('PASS 6: provider != sumup -> non eleggibile');

assert.equal(
  isCloseForCounterEligible({ ...base, status: 'initiated', direction: 'refund' }),
  false,
  'direction diversa da charge NON deve essere eleggibile'
);
console.log('PASS 7: direction != charge -> non eleggibile');

assert.equal(
  isCloseForCounterEligible({ ...base, status: 'succeeded' }),
  false,
  'status succeeded (gia\' pagato) NON deve essere eleggibile'
);
console.log('PASS 8: status succeeded -> non eleggibile');

console.log('\nAll kitchen-close-for-counter-eligibility tests passed.');
await server.close();
