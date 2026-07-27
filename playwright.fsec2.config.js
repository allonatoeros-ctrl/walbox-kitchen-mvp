import { defineConfig, devices } from '@playwright/test';

// Config scoped F-SEC-2: SENZA bypass auth (VITE_E2E_BYPASS_STAFF_AUTH non impostato)
// per testare il guard reale Kitchen. Non modifica il config principale.
export default defineConfig({
  testDir: './tests/e2e',
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
