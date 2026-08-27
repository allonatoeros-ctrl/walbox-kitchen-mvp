// Test mirato P0-A (fix: src/hooks/useKitchenOrders.js — supabaseUpdateOrder).
// Verifica che una mutation staff LIVE senza sessione valida non risulti mai in un
// falso successo (era: { ok: true, skipped: true } -> runOrderSync marcava 'synced').
//
// Non wired a npm/package.json (nessuna modifica ad aree protette): eseguire a mano con
//   node tests/unit/p0a-kitchen-sync.test.mjs
//
// Usa Vite (già devDependency del progetto) in middleware mode per caricare l'hook con
// la sua risoluzione reale (import estensionless di ../lib/supabaseClient e
// ../data/kitchenMockData, incompatibili con la risoluzione ESM nativa di Node), iniettando
// al posto del client Supabase reale un modulo virtuale che permette di controllare la
// sessione restituita nei tre scenari del gate.
import { createServer } from 'vite';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let sessionQueue = [];
let updateCallCount = 0;

const mockSupabasePlugin = {
  name: 'mock-supabase-client',
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
            getSession: async () => globalThis.__P0A_NEXT_SESSION__(),
          },
          from: () => ({
            update: () => ({ eq: async () => { globalThis.__P0A_UPDATE_CALL__(); return { error: null }; } }),
          }),
        };
      `;
    }
  },
};

globalThis.__P0A_NEXT_SESSION__ = () => ({ data: { session: sessionQueue.shift() } });
globalThis.__P0A_UPDATE_CALL__ = () => { updateCallCount += 1; };

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  plugins: [mockSupabasePlugin],
  server: { middlewareMode: true },
});

const { supabaseUpdateOrder } = await server.ssrLoadModule(
  path.join(ROOT, 'src/hooks/useKitchenOrders.js')
);

// 1. staff mutation senza sessione -> mai successo silenzioso
sessionQueue = [null];
const r1 = await supabaseUpdateOrder('order-1', { status: 'ready' });
assert.equal(r1.ok, false, 'no-session deve dare ok:false');
assert.notEqual(r1.skipped, true, 'skipped:true (falso successo) non deve più esistere');
console.log('PASS 1: staff, no-session -> ok:false (mai synced)');

// 2. sessione anonima -> stesso fail-closed (fail-safe, non trattata come guest legittimo qui:
//    supabaseUpdateOrder è chiamata solo da mutation staff)
sessionQueue = [{ user: { is_anonymous: true } }];
const r2 = await supabaseUpdateOrder('order-1', { status: 'ready' });
assert.equal(r2.ok, false, 'sessione anonima in una mutation staff deve dare ok:false');
console.log('PASS 2: sessione anonima -> ok:false');

// 3. retry dopo sessione staff valida -> successo reale (synced)
sessionQueue = [{ user: { id: 'staff-1', is_anonymous: false } }];
const r3 = await supabaseUpdateOrder('order-1', { status: 'ready' });
assert.equal(r3.ok, true, 'sessione staff valida deve dare ok:true');
assert.equal(updateCallCount, 1, 'il write reale deve partire solo con sessione valida');
console.log('PASS 3: retry con sessione valida -> ok:true (synced)');

await server.close();
console.log('\nP0-A: tutti i controlli mirati superati.');
