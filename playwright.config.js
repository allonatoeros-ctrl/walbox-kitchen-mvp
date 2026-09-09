import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // F-SEC-2 (Kitchen staff guard) ha il proprio harness dedicato in playwright.fsec2.config.js,
  // che gira SENZA VITE_E2E_BYPASS_STAFF_AUTH per testare il guard reale. Escluso qui perche'
  // questo config inietta il bypass sotto (vedi webServer.env) e farebbe fallire per costruzione
  // i test che assumono guard attivo (T1, P1). Vedi docs/sprint3b-f-sec-2-storage-state-contract.md.
  testIgnore: ['**/f-sec-2-kitchen-guard.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: { VITE_E2E_BYPASS_STAFF_AUTH: 'true' },
  },
});
