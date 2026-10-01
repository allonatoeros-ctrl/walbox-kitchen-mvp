// E2E REAL SUPABASE LOCAL HARNESS V1.
// Config dedicata: NON usata da `npm run test:e2e` (testDir diverso da tests/e2e).
// Richiede lo stack locale avviato da scripts/e2e-real-supabase-local.sh, che esporta
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / E2E_LOCAL_SERVICE_ROLE_KEY.
import { defineConfig, devices } from '@playwright/test';

const url = process.env.VITE_SUPABASE_URL || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(url)) {
  throw new Error(`REAL_LOCAL_HARNESS_REFUSED: VITE_SUPABASE_URL non locale (${url || 'vuota'})`);
}

export default defineConfig({
  testDir: './tests/e2e-real',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5176', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      VITE_E2E_BYPASS_STAFF_AUTH: 'true',
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
    },
  },
});
