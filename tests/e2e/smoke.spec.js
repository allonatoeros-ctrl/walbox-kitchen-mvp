import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

// Cleanup Kitchen-only (2026-09-21): /entry (branding Jukebox "THE WALBOX") non esiste piu'
// (rimosso in 5400b5e). L'entry point nativo cliente e' "/", che reindirizza a /kitchen.
test('smoke: root entry point loads the Kitchen home', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/kitchen$/);
  await expect(page.getByRole('button', { name: /ENTRA NEL MENU/i })).toBeVisible({ timeout: 10000 });
});
