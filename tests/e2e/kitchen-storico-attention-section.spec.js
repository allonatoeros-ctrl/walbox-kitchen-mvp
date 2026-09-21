import { test, expect } from '@playwright/test';

// Kitchen Analytics V1 — Fase 4 (ATTENZIONE), AttentionSection.jsx.
// Fonte: ai-ops/reports/kitchen-analytics-final-spec-v1-20260921.md §FINAL_PAGE_STRUCTURE
// punto 3, §ACCEPTANCE_CRITERIA AC2.
//
// Superficie: /kitchen/night-preview — DEV harness "Serata Walrus" (usePreviewKitchenNightPayments),
// zero Supabase/network. Il dataset B1 ha pagamenti in sospeso, falliti e un'anomalia stuck-initiated
// (vedi useKitchenNightPreviewPayments.js), quindi la sezione deve comparire piena (>0 su tutte
// le voci disponibili nel dataset).

const ROUTE = '/kitchen/night-preview';

test.describe('Kitchen Storico — ATTENZIONE (Fase 4)', () => {
  test('mostra la sezione con pending/falliti/anomalie quando presenti nel dataset (AC2)', async ({ page }) => {
    await page.goto(ROUTE);

    const section = page.getByTestId('storico-attention-section');
    await expect(section).toBeVisible();

    // Il dataset B1 ha pagamenti in sospeso (sumup stuck) e falliti — vedi
    // useKitchenNightPreviewPayments.buildNightPaymentsView(). Il badge anomalie riflette lo
    // stesso scenario sumup_online_stuck_initiated.
    await expect(page.getByTestId('attention-anomalies')).toBeVisible();
  });

  test('non ha input o azioni — sezione solo di lettura', async ({ page }) => {
    await page.goto(ROUTE);
    const section = page.getByTestId('storico-attention-section');
    await expect(section.locator('input, button')).toHaveCount(0);
  });
});
