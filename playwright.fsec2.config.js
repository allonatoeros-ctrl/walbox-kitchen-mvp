import { defineConfig, devices } from '@playwright/test';

// Config scoped F-SEC-2: SENZA bypass auth (VITE_E2E_BYPASS_STAFF_AUTH non impostato)
// per testare il guard reale Kitchen. Non modifica il config principale.
// Unico harness F-SEC-2: testMatch limita l'esecuzione al solo spec del guard staff, cosi'
// nessun'altra suite gira per errore senza bypass (baseURL/porta dedicate 5194).
// Contratto storageState: docs/sprint3b-f-sec-2-storage-state-contract.md
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/f-sec-2-kitchen-guard.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5194',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5194',
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    // NOTA: nessun VITE_E2E_BYPASS_STAFF_AUTH -> il guard e' attivo
  },
});
