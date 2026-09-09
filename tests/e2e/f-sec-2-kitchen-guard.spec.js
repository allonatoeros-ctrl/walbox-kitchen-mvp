import { test, expect } from '@playwright/test';

// F-SEC-2 Runtime QA — Kitchen staff guard (commit bc242b8)
// STAFF UX CONSOLIDATION FASE 1 (2026-09-07): /kitchen/staff non monta piu' una UI propria,
// e' solo un redirect di compatibilita' verso /kitchen/solo (KitchenStaffRedirect.jsx), che e'
// l'unica UI operativa staff e applica il proprio guard identico (getStaffSession/isKitchenStaff).
// I test qui verificano quindi anche il redirect stesso, non solo il guard a valle.
// NOTA: le storageState reali (sessioni Supabase, file JSON fuori repo, mai committati) vanno
// fornite via env. Il file viene passato al meccanismo nativo Playwright `storageState` in
// `browser.newContext(...)` (che legge e applica cookie+localStorage per origine da solo,
// PRIMA del primo load pagina) — non va mai fatto un JSON.parse manuale del path in
// addInitScript, che tratterebbe il path stesso come contenuto JSON. Se una var e' assente, il
// test che dipende da quella sessione e' skip (non fallisce), indipendentemente dalle altre.
const STAFF_STORAGE_STATE = process.env.FSEC2_STORAGE_STATE || '';
const NONSTAFF_STORAGE_STATE = process.env.FSEC2_NONSTAFF_STORAGE_STATE || '';

test.describe('F-SEC-2 Kitchen staff guard', () => {
  test('T1: /kitchen/staff (redirect compat) anonimo -> /kitchen/solo -> guard -> /kitchen/login', async ({ page }) => {
    await page.goto('/kitchen/staff');
    // Redirect (navigazione reale, vedi KitchenStaffRedirect.jsx) + guard di Solo Service:
    // troppo rapidi da osservare separatamente in modo affidabile, si verifica solo l'esito
    // finale (nessuna sessione -> login).
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  test('T2: authenticated NON-staff -> accesso negato / redirect login', async ({ browser }) => {
    test.skip(!NONSTAFF_STORAGE_STATE, 'storageState non-staff non fornito (FSEC2_NONSTAFF_STORAGE_STATE)');
    const context = await browser.newContext({ storageState: NONSTAFF_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
    await context.close();
  });

  test('T3: staff autorizzato staff87 -> Solo Service visibile', async ({ browser }) => {
    test.skip(!STAFF_STORAGE_STATE, 'storageState staff non fornito (FSEC2_STORAGE_STATE)');
    const context = await browser.newContext({ storageState: STAFF_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo', { timeout: 10000 });
    // Solo Service e' l'unica UI operativa: nessuna tab BANCONE/CUCINA, header "SOLO SERVICE MODE"
    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /MENU/i })).toBeVisible();
    await context.close();
  });

  test('T4: logout -> ritorno al login', async ({ browser }) => {
    // Solo Service espone LOGOUT nel menu secondario ALTRO... (non nell'header), usando lo stesso
    // auth/logout flow esistente (supabaseAuth.signOut) — vedi KitchenSoloService.jsx handleLogout.
    test.skip(!STAFF_STORAGE_STATE, 'storageState staff non fornito (FSEC2_STORAGE_STATE)');
    const context = await browser.newContext({ storageState: STAFF_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto('/kitchen/staff');
    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /ALTRO/i }).click();
    await page.getByRole('button', { name: /LOGOUT/i }).click();
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
    await context.close();
  });

  // T5 (non-staff non puo' aggiornare kitchen_orders) e' coperto dal backstop DB (P0-2-R6):
  // la policy RLS kitchen_orders UPDATE richiede is_staff_for_venue. Verifica a livello DB, non E2E UI.
  // Qui si assume verificato via MCP in P0-2-R6 (kitchen_orders UPDATE/SELECT staff = is_staff_for_venue).
});

// Kitchen Solo Service — DEV Preview Mode (/kitchen/solo?preview=1).
// Eseguito su questo config (SENZA VITE_E2E_BYPASS_STAFF_AUTH) per verificare il vero
// comportamento: guard reale intatto senza ?preview=1, bypass DEV-only funzionante con esso.
test.describe('Kitchen Solo Service — DEV Preview Mode', () => {
  test('P1: /kitchen/solo senza preview -> guard reale attivo, redirect /kitchen/login', async ({ page }) => {
    await page.goto('/kitchen/solo');
    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  test('P2: /kitchen/solo?preview=1 -> accesso senza login, dati fixture, zero chiamate Supabase', async ({ page }) => {
    const supabaseRequests = [];
    page.on('request', (req) => {
      if (req.url().includes('.supabase.co')) supabaseRequests.push(req.url());
    });

    await page.goto('/kitchen/solo?preview=1');

    // Nessun redirect al login: la preview bypassa il guard senza env var.
    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible();
    await expect(page).not.toHaveURL(/\/kitchen\/login/);

    // Dati fixture locali (non demo/live), lifecycle completo rappresentato.
    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('2');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');
    await expect(page.getByTestId('focus-code')).toHaveText('P43');

    // Zero rete verso Supabase durante caricamento + interazione minima.
    await page.getByTestId('next-action').click();
    expect(supabaseRequests).toEqual([]);
  });
});
