import { test, expect } from '@playwright/test';

// Sprint 3B — contratto RIMBORSA del Payments Hub, bloccato a test.
//
// Perche' esiste: durante l'integrazione Sprint 3B era stato proposto di restringere la CTA
// RIMBORSA ai soli pagamenti con provider 'sumup'. La decisione e' stata di NON introdurre quel
// requisito: api/kitchen-sumup-refund.js gestisce esplicitamente i provider non-SumUp come
// rimborso ledger-only (nessuna chiamata al provider, solo kitchen_payment_refund_confirm), e
// da Sprint 3B l'incasso al banco produce provider 'cash'/'manual' — restringere a SumUp
// avrebbe reso non rimborsabile dalla UI proprio il flusso di pagamento principale.
// Questo spec fissa il comportamento corrente cosi' che non venga cambiato per errore.
//
// Superficie: /kitchen/staff-payments-demo (preview harness). Monta il PaymentsView LIVE con
// fixture locali deterministiche e refundAction/reconcileAction simulate: nessun rimborso reale,
// nessuna chiamata a SumUp, Supabase o /api.

const ROUTE = '/kitchen/staff-payments-demo';

test.describe('Kitchen Payments — contratto RIMBORSA', () => {

  test('la CTA RIMBORSA non dipende dal provider: attiva anche per non-SumUp', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByTestId('demo-banner')).toBeVisible();

    // SumUp, charge riuscito, mai rimborsato -> CTA attiva.
    await expect(page.getByTestId('refund-btn-ord-4821-demo')).toBeVisible();

    // Satispay, charge riuscito, mai rimborsato -> CTA attiva (rimborso ledger-only lato server).
    await expect(page.getByTestId('refund-btn-ord-2005-demo')).toBeVisible();

    // Contanti al banco, charge riuscito, mai rimborsato -> CTA attiva.
    // E' il caso che una restrizione a provider === 'sumup' spegnerebbe.
    await expect(page.getByTestId('refund-btn-ord-5501-demo')).toBeVisible();

    await expect(page.getByTestId('refund-btn-ord-4821-demo')).toHaveText('RIMBORSA');
    await expect(page.getByTestId('refund-btn-ord-2005-demo')).toHaveText('RIMBORSA');
    await expect(page.getByTestId('refund-btn-ord-5501-demo')).toHaveText('RIMBORSA');
  });

  test('la CTA RIMBORSA resta esclusa dove non c-e nulla da rimborsare', async ({ page }) => {
    await page.goto(ROUTE);

    // Charge FALLITO -> niente da rimborsare (e nessun bottone refund sulla riga).
    await expect(page.getByTestId('payment-row-pay-demo-4')).toContainText('RIFIUTATO');
    await expect(page.getByTestId('refund-btn-ord-1290-demo')).toHaveCount(0);

    // Ordine con un rimborso gia' aperto (pay-demo-2, refund initiated su ord-7734-demo):
    // la CTA non deve ricomparire sulla charge riuscita dello stesso ordine.
    await expect(page.getByTestId('refund-btn-ord-7734-demo')).toHaveCount(0);
  });

  test('il metodo di pagamento e mostrato in chiaro, non come provider tecnico', async ({ page }) => {
    await page.goto(ROUTE);

    // METHOD_LABELS deve tradurre il metodo; senza mappatura getMethodLabel cadrebbe sul
    // provider grezzo ('satispay', 'cash', 'manual').
    await expect(page.getByTestId('payment-row-pay-demo-5')).toContainText('Satispay');
    await expect(page.getByTestId('payment-row-pay-demo-6')).toContainText('Contanti');
    await expect(page.getByTestId('payment-row-pay-demo-3')).toContainText('Carta (POS)');
  });

  test('rimborso di un incasso in contanti: esito mostrato, zero backend reale', async ({ page }) => {
    const backendCalls = [];
    page.on('request', (request) => {
      if (/\.supabase\.co|api\.sumup\.com|\/api\/kitchen-sumup-refund|\/api\/kitchen-staff-sumup-reconcile/i.test(request.url())) {
        backendCalls.push(request.url());
      }
    });
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto(ROUTE);

    const cashRefund = page.getByTestId('refund-btn-ord-5501-demo');
    await expect(cashRefund).toBeVisible();
    await cashRefund.click();

    await expect(page.getByTestId('payment-row-pay-demo-6')).toContainText('Rimborso completato.');
    await expect(cashRefund).toHaveText('RIMBORSATO');
    await expect(cashRefund).toBeDisabled();

    expect(backendCalls).toEqual([]);
  });
});
