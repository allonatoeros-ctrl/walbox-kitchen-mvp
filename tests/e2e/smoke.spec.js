import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('smoke: entry page loads', async ({ page }) => {
  await page.goto('/entry');
  await expect(page.getByText('THE WALBOX')).toBeVisible();
});
