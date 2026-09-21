import { test, expect } from '@playwright/test';

// Kitchen Analytics V1 — Fase 2 (CONTROLLO SERATA/CASSA), CassaControlSection.jsx.
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md.
//
// Superficie: /kitchen/staff-payments-demo — monta il PaymentsView LIVE con fixture locali
// deterministiche (kitchenStaffPaymentsDemoFixtures.js), zero Supabase/network. todaySummary e
// paymentsByMethod sono derivati dalle stesse righe (recentPayments) con le stesse funzioni pure
// del hook reale, quindi i valori qui sotto sono calcolati a mano una volta dalle fixture e
// verificati contro la UI (non il contrario).

const ROUTE = '/kitchen/staff-payments-demo';

test.describe('Kitchen Payments — CONTROLLO SERATA/CASSA', () => {

  test('mostra incasso/rimborsato/netto totali coerenti con la somma per metodo (AC3)', async ({ page }) => {
    await page.goto(ROUTE);
    const section = page.getByTestId('cassa-control-section');
    await expect(section).toBeVisible();

    await expect(page.getByTestId('cassa-total-incasso')).toHaveText('€ 113.50');
    await expect(page.getByTestId('cassa-total-rimborsato')).toHaveText('€ 20.00');
    await expect(page.getByTestId('cassa-total-netto')).toHaveText('€ 93.50');

    // Somma delle righe per metodo deve combaciare esattamente con i totali sopra (AC3).
    const rows = ['cash', 'satispay_app', 'sumup_online', 'sumup_pos'];
    let sumIncasso = 0;
    let sumRimborsato = 0;
    for (const method of rows) {
      const row = page.getByTestId(`cassa-method-row-${method}`);
      await expect(row).toBeVisible();
      const incassoText = await row.locator('span').nth(1).textContent();
      const rimborsatoText = await row.locator('span').nth(2).textContent();
      sumIncasso += parseFloat(incassoText.replace('€', '').trim());
      sumRimborsato += parseFloat(rimborsatoText.replace('€', '').trim());
    }
    expect(Math.round(sumIncasso * 100) / 100).toBe(113.5);
    expect(Math.round(sumRimborsato * 100) / 100).toBe(20.0);
  });

  test('breakdown per metodo mostra contanti/carta banco/SumUp online in chiaro', async ({ page }) => {
    await page.goto(ROUTE);

    await expect(page.getByTestId('cassa-method-row-cash')).toContainText('Contanti');
    await expect(page.getByTestId('cassa-method-row-cash')).toContainText('€ 9.00');

    await expect(page.getByTestId('cassa-method-row-sumup_online')).toContainText('SumUp online');
    await expect(page.getByTestId('cassa-method-row-sumup_online')).toContainText('€ 14.00');

    // card_counter_manual non compare: nessun pagamento con quel metodo in questa fixture demo
    // (gap di copertura gia' a registro in CHECKPOINT.md, non introdotto da questa fase).
    await expect(page.getByTestId('cassa-method-row-card_counter_manual')).toHaveCount(0);
  });

  test('badge SumUp succeeded/pending/failed coerenti con kitchen_payments.status (AC4)', async ({ page }) => {
    await page.goto(ROUTE);

    await expect(page.getByTestId('cassa-sumup-succeeded')).toHaveText('SumUp riusciti: 6');
    await expect(page.getByTestId('cassa-sumup-pending')).toHaveText('In corso: 5');
    await expect(page.getByTestId('cassa-sumup-failed')).toHaveText('Falliti: 1');
  });

  test('badge anomalie identico al conteggio gia mostrato in Attenzione (AC5)', async ({ page }) => {
    await page.goto(ROUTE);

    // Fixture demo: 2 anomalie (refund_stuck_initiated su Tavolo 7 e Tavolo 9).
    await expect(page.getByTestId('cassa-anomaly-badge')).toHaveText('⚠ 2 anomalie da verificare');
  });

  test('nessun input contanti contati in UI (AC13)', async ({ page }) => {
    await page.goto(ROUTE);
    const section = page.getByTestId('cassa-control-section');
    await expect(section.locator('input')).toHaveCount(0);
  });

  test('regressione: la sezione Pagamenti recenti e il rimborso restano invariati', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByTestId('refund-btn-ord-4821-demo')).toBeVisible();
    await expect(page.getByTestId('payment-row-pay-demo-5')).toContainText('Satispay');
  });
});
