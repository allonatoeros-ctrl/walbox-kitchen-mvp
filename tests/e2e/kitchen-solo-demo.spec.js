import { test, expect } from '@playwright/test';

/**
 * Live Demo Harness (/kitchen/solo-demo): fixture locali deterministiche, zero Supabase,
 * zero polling, isolamento rete completo. Nessuna dipendenza da localStorage/auth reale.
 */

test.describe('Kitchen — Solo Service Live Demo Harness', () => {

  test('1. banner DEMO evidente + 4 stati coperti dalle 6 fixture', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo-demo');

    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByTestId('demo-banner')).toContainText('DEMO');
    await expect(page.getByTestId('demo-banner')).toContainText('NO LIVE DATA');

    await expect(page.getByTestId('kpi-paga')).toHaveText('2');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('3');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');
  });

  test('2. allergene reale visibile su un ordine in coda', async ({ page }) => {
    await page.goto('/kitchen/solo-demo');
    await page.locator('[data-order="D095"]').click();
    await expect(page.getByTestId('focus-allergeni')).toContainText(/glutine|uova|senape/i);
  });

  test('3. zero chiamate di rete verso il backend Supabase durante l\'intero lifecycle', async ({ page }) => {
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));

    await page.goto('/kitchen/solo-demo');
    await page.locator('[data-order="D101"]').click();
    await page.getByTestId('next-action').click(); // paga D101
    await page.waitForTimeout(300);

    // In dev mode il bundler serve il grafo dei moduli JS dallo stesso host (incl. file
    // che si chiamano "supabase*.js") e la pagina carica i Google Fonts globali: nessuna
    // delle due è una chiamata al backend Supabase. L'isolamento reale si verifica
    // controllando che nessuna richiesta raggiunga un host *.supabase.co.
    const supabaseBackendCalls = requests.filter((u) => /\.supabase\.co/i.test(u));
    expect(supabaseBackendCalls).toEqual([]);
  });

  test('4. SYNC ✗ simulabile: badge in coda + banner in focus + retry lo risolve', async ({ page }) => {
    await page.goto('/kitchen/solo-demo');

    await page.getByTestId('demo-simulate-sync-error').click();
    await expect(page.getByTestId('sync-error-tag-D085')).toBeVisible();

    await page.locator('[data-order="D085"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D085');
    await expect(page.getByTestId('sync-error-banner')).toBeVisible();

    await page.locator('.kss-sync-error-retry').click();
    await expect(page.getByTestId('sync-error-banner')).not.toBeVisible();
    await expect(page.getByTestId('sync-error-tag-D085')).not.toBeVisible();
  });

  test('5. RESET DEMO riporta fixture e stato UI locale al punto di partenza', async ({ page }) => {
    await page.goto('/kitchen/solo-demo');

    // altero stato: pago un ordine e apro la ricerca
    await page.locator('[data-order="D101"]').click();
    await page.getByTestId('next-action').click();
    await page.getByRole('button', { name: 'TUTTI ⌄' }).click();

    await page.getByTestId('demo-reset').click();

    await expect(page.getByTestId('kpi-paga')).toHaveText('2');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('3');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');
    await expect(page.getByText('CHIUDI')).not.toBeVisible(); // ricerca richiusa dal remount
  });

  test('6. /kitchen/solo (live) non è impattato: nessun banner demo presente', async ({ page }) => {
    await page.goto('/kitchen/solo');
    await expect(page.locator('[data-testid="demo-banner"]')).toHaveCount(0);
  });
});
