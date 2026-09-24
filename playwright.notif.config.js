import { defineConfig, devices } from '@playwright/test';

// Config scoped F6 Notification Decision Gate: il gate dell'overlay notifiche esiste solo quando
// la Web Push è configurata (VAPID presente). Il config principale NON imposta
// VITE_WEB_PUSH_VAPID_PUBLIC_KEY, quindi sotto quel config il componente resta `not-configured`
// e l'overlay è invisibile per design (nessuna regressione sulle suite esistenti). Qui iniettiamo
// una chiave pubblica fittizia e limitiamo l'esecuzione al solo spec del gate, con porta dedicata.
const FAKE_VAPID =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/kitchen-notification-gate.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5195',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5195',
    url: 'http://127.0.0.1:5195',
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      VITE_E2E_BYPASS_STAFF_AUTH: 'true',
      VITE_WEB_PUSH_VAPID_PUBLIC_KEY: FAKE_VAPID,
    },
  },
});