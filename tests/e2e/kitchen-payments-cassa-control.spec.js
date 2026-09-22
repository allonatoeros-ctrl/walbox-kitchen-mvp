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

// Sprint Cassa V2 — continuazione (2026-09-22): filtri METODO x STATO combinabili, corregge il
// filtro a scelta esclusiva della sessione precedente (non copriva POS, non permetteva di
// incrociare metodo+stato). `/kitchen/staff-payments-demo` usa TUTTE le righe di
// kitchenStaffPaymentsDemoFixtures.js (pay-demo-1..6 + le 8 pay-training-*, stessa
// usePreviewKitchenPayments) — 14 righe totali, coerente con "SumUp riusciti: 6 / In corso: 5 /
// Falliti: 1" gia' verificato da AC4 sopra (12 righe sumup + 2 non-sumup = 14). pay-demo-4
// (sumup_pos/charge/failed) resta l'unica riga fallita su qualsiasi metodo; pay-demo-6
// (cash/charge/succeeded) l'unica in contanti.
test.describe('Kitchen Payments — filtri METODO/STATO combinabili', () => {

  test('i due gruppi di filtro esistono con tutte le opzioni richieste', async ({ page }) => {
    await page.goto(ROUTE);
    for (const id of ['cassa-filter-method-all', 'cassa-filter-method-cash', 'cassa-filter-method-sumup_online', 'cassa-filter-method-pos']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    for (const id of ['cassa-filter-status-all', 'cassa-filter-status-succeeded', 'cassa-filter-status-pending', 'cassa-filter-status-failed']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('METODO=Contanti mostra solo la riga cash (pay-demo-6)', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByTestId('cassa-filter-method-cash').click();
    await expect(page.getByTestId('payment-row-pay-demo-6')).toBeVisible();
    await expect(page.locator('.kpd-payment-row')).toHaveCount(1);
  });

  test('METODO=Contanti + STATO=Riusciti restano combinati (AND), non si escludono a vicenda', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByTestId('cassa-filter-method-cash').click();
    await page.getByTestId('cassa-filter-status-succeeded').click();
    await expect(page.getByTestId('payment-row-pay-demo-6')).toBeVisible();
    await expect(page.locator('.kpd-payment-row')).toHaveCount(1);
    await expect(page.getByTestId('cassa-filter-method-cash')).toHaveClass(/kpd-sumup-badge--active/);
    await expect(page.getByTestId('cassa-filter-status-succeeded')).toHaveClass(/kpd-sumup-badge--active/);
  });

  test('STATO=Falliti da solo filtra su tutti i metodi, non solo SumUp (pay-demo-4)', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByTestId('cassa-filter-status-failed').click();
    await expect(page.getByTestId('payment-row-pay-demo-4')).toBeVisible();
    await expect(page.locator('.kpd-payment-row')).toHaveCount(1);
  });

  test('METODO=Tutti + STATO=Tutti torna a mostrare tutte le 14 righe', async ({ page }) => {
    await page.goto(ROUTE);
    await page.getByTestId('cassa-filter-method-cash').click();
    await page.getByTestId('cassa-filter-method-all').click();
    await expect(page.locator('.kpd-payment-row')).toHaveCount(14);
  });

  test('i badge informativi SumUp riusciti/in corso/falliti restano di sola lettura (AC4 invariato)', async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByTestId('cassa-sumup-succeeded')).toHaveText('SumUp riusciti: 6');
    // Non piu' cliccabili per filtrare: un click non deve cambiare la lista.
    await page.getByTestId('cassa-sumup-succeeded').click({ force: true });
    await expect(page.locator('.kpd-payment-row')).toHaveCount(14);
  });
});
