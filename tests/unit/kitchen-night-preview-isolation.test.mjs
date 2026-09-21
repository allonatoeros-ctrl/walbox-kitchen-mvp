// Kitchen V2 — Fase 2 / micro-fase B3 — test di isolamento dell'harness DEV temporaneo.
//
// Verifica automatica (non a mano) che l'harness "Serata Walrus" (dataset B1 + adapter B2 +
// pagina B3 KitchenNightPreview) non sia importato da nessun file production-facing, e che la
// route in App.jsx sia gated da import.meta.env.DEV (mai caricata in build production).
//
// TEMPORANEO: rimuovere insieme al resto dei TEMP_FILES_TO_REMOVE prima del cutover V2 —
// vedi ai-ops/reports/kitchen-v2-fase2-b3-dev-harness-result.md.
//
// Eseguire a mano (non wired a npm/package.json, nessuna area protetta toccata):
//   node tests/unit/kitchen-night-preview-isolation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const FORBIDDEN_PATTERNS = [
  /KitchenNightPreview/,
  /useKitchenNightPreviewOrders/,
  /useKitchenNightPreviewPayments/,
  /kitchenNightMockData/,
];

// Ogni file production-facing reale del runtime Kitchen (customer + staff), esclusi gli stessi
// file dell'harness B1/B2/B3 e le pagine *Demo.jsx/*Preview* già isolate per design.
const PRODUCTION_FACING_FILES = [
  'src/pages/CustomerKitchenEntry.jsx',
  'src/pages/CustomerKitchenMenu.jsx',
  'src/pages/CustomerOrderStatus.jsx',
  'src/pages/CustomerOrderPayment.jsx',
  'src/pages/KitchenLogin.jsx',
  'src/pages/KitchenStaffRedirect.jsx',
  'src/pages/KitchenSoloService.jsx',
  'src/pages/KitchenPayments.jsx',
  'src/pages/CounterAssistedOrder.jsx',
  'src/pages/KitchenTvScreen.jsx',
  'src/pages/KitchenPrepBoard.jsx',
  'src/hooks/useKitchenOrders.js',
  'src/hooks/useKitchenPayments.js',
  'src/data/kitchenMockData.js',
];

test('nessun file production-facing importa l\'harness DEV Serata Walrus (B1/B2/B3)', () => {
  for (const relPath of PRODUCTION_FACING_FILES) {
    const abs = path.join(ROOT, relPath);
    assert.ok(fs.existsSync(abs), `file atteso mancante: ${relPath}`);
    const source = fs.readFileSync(abs, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relPath} non deve referenziare l'harness DEV (${pattern}) — collegamento al runtime reale vietato`,
      );
    }
  }
});

test('la route App.jsx per /kitchen/night-preview è gated da import.meta.env.DEV', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

  assert.match(appSource, /\/kitchen\/night-preview/, 'route /kitchen/night-preview assente da App.jsx');

  // L'import del modulo harness deve stare dentro un ramo condizionato da import.meta.env.DEV,
  // non un import statico incondizionato (che finirebbe comunque nel bundle production).
  const lazyImportMatch = appSource.match(
    /const KitchenNightPreview = import\.meta\.env\.DEV\s*\?\s*lazy\(\(\) => import\(["']\.\/pages\/KitchenNightPreview["']\)\)\s*:\s*null;/,
  );
  assert.ok(lazyImportMatch, 'KitchenNightPreview deve essere caricato solo via lazy(), gated da import.meta.env.DEV');

  assert.doesNotMatch(
    appSource,
    /^import KitchenNightPreview from/m,
    'KitchenNightPreview non deve avere un import statico incondizionato in App.jsx',
  );
});

test('i file harness B1/B2/B3 esistono e sono isolati (nessun import reciproco da runtime)', () => {
  const harnessFiles = [
    'src/data/kitchenNightMockData.js',
    'src/hooks/useKitchenNightPreviewOrders.js',
    'src/hooks/useKitchenNightPreviewPayments.js',
    'src/pages/KitchenNightPreview.jsx',
  ];
  for (const relPath of harnessFiles) {
    assert.ok(fs.existsSync(path.join(ROOT, relPath)), `file harness atteso mancante: ${relPath}`);
  }
});
