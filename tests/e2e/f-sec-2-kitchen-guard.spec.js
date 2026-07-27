import { test, expect } from '@playwright/test';

// F-SEC-2 Runtime QA — Kitchen staff guard (commit bc242b8)
// Verifica che /kitchen/staff NON consideri "authenticated" == "staff".
// NOTA: lo storageState reale (sessione Supabase) va fornito via env FSEC2_STORAGE_STATE
// (file JSON fuori repo, non committato). Se assente, i test auth-dependent sono skip
// (non falliscono) per non esporre credenziali ne' richiedere auth reale in sandbox.
const STORAGE_STATE = process.env.FSEC2_STORAGE_STATE || '';

test.describe('F-SEC-2 Kitchen staff guard', () => {
  test('T1: anonimo -> redirect /kitchen/login', async ({ page }) => {
    await page.goto('/kitchen/staff');
    // nessuna sessione: il guard deve rimandare al login
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  test('T2: authenticated NON-staff -> accesso negato / redirect login', async ({ page }) => {
    test.skip(!STORAGE_STATE, 'storageState non-staff non fornito (FSEC2_STORAGE_STATE)');
    await page.goto('/');
    await page.context().clearCookies();
    await page.addInitScript((state) => {
      // inietta la sessione Supabase non-staff dal storageState fornito
      const parsed = JSON.parse(state);
      for (const { name, value } of parsed.cookies || []) {
        document.cookie = `${name}=${value}; path=/`;
      }
      for (const { name, value } of parsed.localStorage || []) {
        localStorage.setItem(name, value);
      }
    }, STORAGE_STATE);
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  test('T3: staff autorizzato staff87 -> dashboard visibile', async ({ page }) => {
    test.skip(!STORAGE_STATE, 'storageState staff non fornito (FSEC2_STORAGE_STATE)');
    await page.goto('/');
    await page.addInitScript((state) => {
      const parsed = JSON.parse(state);
      for (const { name, value } of parsed.cookies || []) {
        document.cookie = `${name}=${value}; path=/`;
      }
      for (const { name, value } of parsed.localStorage || []) {
        localStorage.setItem(name, value);
      }
    }, STORAGE_STATE);
    await page.goto('/kitchen/staff');
    // la dashboard mostra i tab (BANCONE/CUCINA/MENU/STORICO/ALERT)
    await expect(page.getByRole('button', { name: /BANCONE/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /CUCINA/i })).toBeVisible();
  });

  test('T4: logout -> ritorno al login', async ({ page }) => {
    test.skip(!STORAGE_STATE, 'storageState staff non fornito (FSEC2_STORAGE_STATE)');
    await page.goto('/');
    await page.addInitScript((state) => {
      const parsed = JSON.parse(state);
      for (const { name, value } of parsed.cookies || []) {
        document.cookie = `${name}=${value}; path=/`;
      }
      for (const { name, value } of parsed.localStorage || []) {
        localStorage.setItem(name, value);
      }
    }, STORAGE_STATE);
    await page.goto('/kitchen/staff');
    await expect(page.getByRole('button', { name: /BANCONE/i })).toBeVisible({ timeout: 10000 });
    // click logout (btn-secondary con testo LOGOUT)
    await page.getByRole('button', { name: /LOGOUT/i }).click();
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  // T5 (non-staff non puo' aggiornare kitchen_orders) e' coperto dal backstop DB (P0-2-R6):
  // la policy RLS kitchen_orders UPDATE richiede is_staff_for_venue. Verifica a livello DB, non E2E UI.
  // Qui si assume verificato via MCP in P0-2-R6 (kitchen_orders UPDATE/SELECT staff = is_staff_for_venue).
});
