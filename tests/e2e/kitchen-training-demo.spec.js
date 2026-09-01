import { test, expect } from '@playwright/test';

async function next(page) { await page.getByTestId('practice-next').click(); }

async function completeGuided(page) {
  await page.getByTestId('training-start').click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.locator('[data-order="D098"]').click(); await page.getByTestId('next-action').click();
  await page.locator('[data-order="D085"]').click();
  await page.getByTestId('next-action').click(); await page.getByTestId('next-action').click(); await page.getByTestId('next-action').click();
  await page.getByTestId('quick-pay').click();
  await page.locator('[data-order="D095"]').click(); await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByRole('button', { name: 'Vai a Pagamenti' }).click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByTestId('reconcile-btn-ord-training-confirmed').click();
  await page.getByTestId('reconcile-btn-ord-training-pending').click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByTestId('refund-btn-ord-4821-demo').click();
  await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
  await page.getByTestId('reconcile-btn-ord-training-unknown').click();
}

test.describe('Kitchen — Training Demo finale', () => {
  test('guided flow: 13 scenari, stati non sovrapposti', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/kitchen/training');
    await expect(page.getByTestId('training-start')).toBeVisible();
    await completeGuided(page);
    await expect(page.getByTestId('training-banner')).toContainText('Completato');
    await expect(page.getByTestId('training-checklist').locator('li')).toHaveCount(13);
  });

  test('rifiutato non diventa confermato e i reconcile hanno esiti distinti', async ({ page }) => {
    await page.goto('/kitchen/training'); await page.getByTestId('training-start').click();
    for (let i = 0; i < 13; i += 1) {
      if (i < 3) await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
      else if (i === 3) { await page.locator('[data-order="D098"]').click(); await page.getByTestId('next-action').click(); }
      else if (i >= 4 && i <= 6) { if (i === 4) await page.locator('[data-order="D085"]').click(); await page.getByTestId('next-action').click(); }
      else break;
    }
    await expect(page.getByTestId('training-banner')).toContainText('Scenario 4/13');
    await page.getByTestId('quick-pay').click(); await page.locator('[data-order="D095"]').click(); await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
    await page.getByRole('button', { name: 'Vai a Pagamenti' }).click();
    await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
    await expect(page.getByTestId('payment-row-pay-demo-4')).toContainText('RIFIUTATO');
    await expect(page.getByTestId('payment-row-pay-demo-4').getByRole('button')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ho capito, avanti' }).click();
    await page.getByTestId('reconcile-btn-ord-training-confirmed').click();
    await page.getByTestId('reconcile-btn-ord-training-pending').click();
  });

  test('zero backend reale durante guided flow', async ({ page }) => {
    const requests = []; page.on('request', (request) => requests.push(request.url())); page.on('dialog', (dialog) => dialog.accept());
    await page.goto('/kitchen/training'); await completeGuided(page);
    expect(requests.filter((url) => /\.supabase\.co|\/api\/kitchen-sumup-refund|\/api\/kitchen-staff-sumup-reconcile/i.test(url))).toEqual([]);
  });

  test('prova libera: caso corrente isolato e retry', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept());
    await page.addInitScript(() => window.sessionStorage.setItem('kss-training-step', '21'));
    await page.goto('/kitchen/training'); await page.getByTestId('training-start-practice').click();
    await expect(page.getByTestId('practice-panel')).toContainText('Incasso al banco');
    await page.locator('[data-order="D098"]').click(); await page.getByTestId('next-action').click(); await next(page);
    await page.locator('[data-order="D085"]').click(); await page.getByTestId('next-action').click(); await page.getByTestId('next-action').click(); await page.getByTestId('next-action').click(); await next(page);
    await page.getByTestId('quick-pay').click(); await next(page);
    await page.locator('[data-order="D095"]').click(); await page.getByTestId('practice-ack').click(); await next(page);
    await page.getByTestId('practice-ack').click(); await next(page);
    await page.getByTestId('practice-ack').click(); await next(page);
    await page.getByTestId('reconcile-btn-ord-training-confirmed').click(); await expect(page.getByText('Pagamento confermato. L’ordine può proseguire.')).toBeVisible(); await next(page);
    await page.getByTestId('reconcile-btn-ord-training-pending').click(); await expect(page.getByText('Ancora in corso — riprova tra poco.')).toBeVisible(); await next(page);
    await page.getByTestId('practice-ack').click(); await next(page);
    await page.getByTestId('refund-btn-ord-4821-demo').click(); await next(page);
    await page.getByTestId('practice-ack').click(); await next(page);
    await page.getByTestId('reconcile-btn-ord-training-unknown').click(); await next(page);
    await page.getByTestId('practice-ack').click();
    await expect(page.getByTestId('practice-checklist')).toBeVisible();
    await page.getByTestId('practice-retry').click();
    await expect(page.getByTestId('practice-panel')).toContainText('Incasso al banco');
  });
});
