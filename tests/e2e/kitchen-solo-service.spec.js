import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

function seedOrders() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60 * 1000).toISOString();
  return [
    // Da pagare al banco
    {
      id: 'solo-1', orderCode: 'W47', table: 'T1', nickname: 'Alice',
      items: [{ itemId: 'item-002', name: 'Panino del Tricheco', quantity: 2, price: 9.0 }],
      total: 18.5, status: 'pending_counter_payment', paymentStatus: 'pending',
      createdAt: ago(2), note: '',
    },
    // In preparazione (focus atteso: il più vecchio dei "da fare")
    {
      id: 'solo-2', orderCode: 'W43', table: 'T3', nickname: 'Bruno',
      items: [{ itemId: 'item-002', name: 'Combo Cavallo', quantity: 2, price: 16.0 }],
      total: 32.0, status: 'preparing', paymentStatus: 'paid',
      createdAt: ago(7), note: '', staffNote: '',
    },
    // Nuovo, pagato
    {
      id: 'solo-3', orderCode: 'W44', table: 'T4', nickname: 'Carla',
      items: [{ itemId: 'item-001', name: 'Smash Burger', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'received', paymentStatus: 'paid',
      createdAt: ago(4), note: 'Senza cipolla', staffNote: 'Allergia dichiarata',
    },
    // Pronto per il ritiro
    {
      id: 'solo-4', orderCode: 'W41', table: 'T1', nickname: 'Dario',
      items: [{ itemId: 'item-002', name: 'Pulled Pork', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'ready', paymentStatus: 'paid',
      createdAt: ago(20), readyAt: ago(1), note: '',
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

test.describe('Kitchen — Solo Service Mode V2', () => {

  test('1. tablet: CODA + ORDINE IN FOCUS con KPI PAGA/DA FARE/PRONTI', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible();
    await expect(page.getByText('CODA ORDINI')).toBeVisible();

    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('2');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');

    // Focus di default = ordine "da fare" più vecchio
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // Gruppi coda
    await expect(page.getByText('DA PAGARE', { exact: true })).toBeVisible();
    await expect(page.getByText('DA FARE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PRONTI', { exact: true }).first()).toBeVisible();
  });

  test('2. una sola next action, coerente con lo stato', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    const next = page.getByTestId('next-action');
    await expect(next).toContainText('PRONTO');
    await next.click();

    // W43 diventa pronto: il focus passa al prossimo da fare (W44)
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await expect(page.getByTestId('next-action')).toContainText('INIZIA');

    await page.getByTestId('next-action').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
  });

  test('3. allergeni prominenti sull\'ordine in focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByText('ALLERGENI')).toBeVisible();
    await expect(page.getByTestId('focus-allergeni')).toContainText('Glutine');
    await expect(page.getByText('ATTENZIONE')).toBeVisible();
  });

  test('4. pagamento rapido: incassa e torna al focus precedente', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    const quickPay = page.getByTestId('quick-pay');
    await expect(quickPay).toContainText('W47');
    await quickPay.click();

    // Il focus resta su W43, la coda "da pagare" si svuota
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('kpi-paga')).toHaveText('0');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('3');
  });

  test('5. deviazione manuale sul banco: dopo l\'incasso torna a W43', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W47');
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');

    await page.getByTestId('next-action').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
  });

  test('6. MENU / STORICO / ALERT restano secondari (overlay)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    // Il focus resta la vista principale, nessuna tab bar
    await expect(page.getByRole('button', { name: /^BANCONE$/ })).toHaveCount(0);

    await page.getByRole('button', { name: /MENU/ }).click();
    await expect(page.locator('.kss-overlay')).toBeVisible();
    await page.getByRole('button', { name: /CHIUDI/ }).click();
    await expect(page.locator('.kss-overlay')).toHaveCount(0);

    await page.getByRole('button', { name: /ALERT/ }).click();
    await expect(page.locator('.kss-overlay')).toBeVisible();
  });

  test('7. phone: Focus Mode, un ordine alla volta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kitchen/solo');

    // Coda nascosta, focus visibile
    await expect(page.locator('.kss-queue-col')).toBeHidden();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // Navigazione fra ordini
    await page.getByRole('button', { name: /SUCC/ }).click();
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await page.getByRole('button', { name: /PREC/ }).click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // La coda si apre a schermo intero e riporta al focus
    await page.getByRole('button', { name: /CODA \(/ }).click();
    await expect(page.locator('.kss-queue-col')).toBeVisible();
    await page.locator('.kss-qcard[data-order="W41"]').click();
    await expect(page.locator('.kss-queue-col')).toBeHidden();
    await expect(page.getByTestId('focus-code')).toHaveText('W41');
    await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
  });

  test('8. RINVIA sposta il focus senza perdere l\'ordine', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await page.getByRole('button', { name: /RINVIA/ }).click();

    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    // W43 resta in coda, solo rinviato
    await expect(page.locator('.kss-qcard[data-order="W43"]')).toBeVisible();
    await expect(page.getByTestId('kpi-dafare')).toHaveText('2');
  });

  // Supabase non è configurato in questo ambiente locale (nessun .env) — ogni write
  // fallisce già oggi, silenziosamente prima di questa patch. Questi test verificano
  // che il fallimento sia ora sempre visibile (mai presentato come successo) e che il
  // polling non "rewindi" silenziosamente lo stato durante/dopo un fallimento.
  test('9. write failure: azione mutativa mostra il tag SYNC ✗ sulla card, mai spacciata per successo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // W43 passa a "pronto" nella UI (ottimistico), ma la sync verso Supabase fallisce
    // (ambiente senza .env): deve comparire un indicatore di errore sulla card, non un
    // successo silenzioso.
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();

    // Il dettaglio in focus (aprendo la card) mostra il banner con motivo e RIPROVA.
    await page.locator('.kss-qcard[data-order="W43"]').click();
    const banner = page.getByTestId('sync-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Salvataggio non riuscito');
    await expect(page.getByRole('button', { name: 'RIPROVA' })).toBeVisible();
  });

  test('10. retry: RIPROVA ritenta la sync senza spacciare il fallimento per successo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.getByTestId('next-action').click();
    await page.locator('.kss-qcard[data-order="W43"]').click();

    const banner = page.getByTestId('sync-error-banner');
    await expect(banner).toBeVisible();

    // Stesso ambiente (Supabase non configurato): il retry fallisce di nuovo,
    // ma il banner/tag devono restare — mai un falso "sincronizzato".
    await page.getByRole('button', { name: 'RIPROVA' }).click();
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();
    await expect(page.getByTestId('focus-code')).toHaveText('W43'); // stato locale coerente, nessun crash
  });

  test('11. poll durante mutation: lo stato aggiornato non viene riavvolto dal polling successivo', async ({ page }) => {
    test.setTimeout(40000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // Ordine passato a "pronto" (ottimistico); la sync verso Supabase fallisce subito
    // (ambiente senza .env) e resta segnalata.
    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();

    // Il poll gira ogni 10s: aspettiamo un ciclo pieno. Prima della fix, il poll
    // avrebbe silenziosamente riportato W43 allo stato precedente ("preparing"),
    // facendolo sparire dai "pronti" e riapparire tra i "da fare" senza alcun avviso.
    await page.waitForTimeout(11000);

    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
    await expect(page.locator('.kss-qcard[data-order="W43"]')).toBeVisible();
  });
});
