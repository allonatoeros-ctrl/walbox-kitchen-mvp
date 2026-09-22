import { test, expect } from '@playwright/test';
import { serviceNightWindow, serviceNightWindowFor, shiftServiceNight } from '../../src/lib/kitchenServiceRules.js';

// Kitchen Analytics V1 — selettore service night (Gate 1 approvato da Eros 2026-09-21).
// Copre: (1) storico ordini scoped alla notte selezionata (fix CURRENT_LIMITS #3 dell'audit),
// (2) selettore ‹prec|OGGI|succ› + pulsante OGGI. Vedi
// ai-ops/reports/kitchen-analytics-service-night-selector-audit-20260921.md.
// NOTA (2026-09-22, decommission UI Payment Hub): il test "Apri Cassa →" che copriva
// selectedServiceNight condiviso Storico -> /kitchen/payments è stato rimosso perché quel punto
// di accesso non esiste più (vedi ai-ops/reports/kitchen-payment-hub-decommission-audit-20260922.md).
// useSelectedServiceNight resta condiviso in codice (PaymentsView.jsx non è stato toccato), ma non
// c'è più una UI live che lo eserciti da qui.
const LS_ORDERS = 'walbox_kitchen_orders_demo';

const todayNight = serviceNightWindow().night;
const oldNight = shiftServiceNight(todayNight, -2);
const oldWindow = serviceNightWindowFor(oldNight);
// Un'ora sicuramente dentro la finestra di 2 sere fa (start + 6h), mai vicino ai bordi 06:00.
const oldCreatedAt = new Date(oldWindow.start + 6 * 3600 * 1000).toISOString();

function seedOrders() {
  const now = Date.now();
  const ago = (h) => new Date(now - h * 3600 * 1000).toISOString();
  return [
    // Serata di OGGI: due ordini consegnati.
    {
      id: 'sns-1', orderCode: 'W91', table: 'T1', nickname: 'Alice',
      items: [{ itemId: 'item-032', name: 'Panino del Tricheco', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'delivered', paymentStatus: 'paid', createdAt: ago(2), note: '',
    },
    {
      id: 'sns-2', orderCode: 'W92', table: 'T2', nickname: 'Bruno',
      items: [{ itemId: 'item-016', name: 'Smash Burger', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'delivered', paymentStatus: 'paid', createdAt: ago(1), note: '',
    },
    // Serata di 2 sere fa: un solo ordine consegnato, nickname distinguibile.
    {
      id: 'sns-3', orderCode: 'W99', table: 'T5', nickname: 'Zoe',
      items: [{ itemId: 'item-032', name: 'Pulled Pork', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'delivered', paymentStatus: 'paid', createdAt: oldCreatedAt, note: '',
    },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: seedOrders() }
  );
});

test.describe('Kitchen Analytics — selettore service night', () => {
  test('Storico: OGGI mostra solo gli ordini di oggi, la navigazione indietro mostra quelli storici', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.getByRole('button', { name: /ALTRO/ }).click();
    await page.getByRole('button', { name: /Storico ordini/ }).click();

    const selector = page.getByTestId('service-night-selector');
    const badge = selector.locator('.ksn-selector-badge');
    await expect(selector).toBeVisible();
    await expect(page.getByTestId('service-night-current')).toBeVisible();
    // OGGI: badge visibile, nessun pulsante "torna a OGGI" (siamo già su OGGI).
    await expect(badge).toBeVisible();
    await expect(page.getByTestId('service-night-today-btn')).toHaveCount(0);

    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Bruno')).toBeVisible();
    await expect(page.getByText('Zoe')).toHaveCount(0);

    const todayLabel = await page.getByTestId('service-night-current').textContent();

    // Due passi indietro: dalla serata di oggi a quella di 2 sere fa (dove vive l'ordine di Zoe).
    await page.getByTestId('service-night-prev').click();
    await page.getByTestId('service-night-prev').click();

    await expect(page.getByTestId('service-night-current')).not.toHaveText(todayLabel);
    await expect(badge).toHaveCount(0);
    await expect(page.getByTestId('service-night-today-btn')).toBeVisible();

    await expect(page.getByText('Zoe')).toBeVisible();
    await expect(page.getByText('Alice')).toHaveCount(0);
    await expect(page.getByText('Bruno')).toHaveCount(0);

    // OGGI riporta alla serata corrente.
    await page.getByTestId('service-night-today-btn').click();
    await expect(page.getByTestId('service-night-current')).toHaveText(todayLabel);
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Zoe')).toHaveCount(0);
  });
});
