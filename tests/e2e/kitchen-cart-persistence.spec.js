// kitchen-cart-persistence.spec.js — IL SACCO sopravvive a refresh, back/forward e riapertura.
// (fix UX 1 del 2026-09-16)
import { test, expect } from '@playwright/test';

const CART_KEY = 'walbox_kitchen_cart_v1';

// FALLO PESANTE include sempre 1 birra a scelta tra le 6 rimaste (Krombacher rimossa dal
// catalogo, correzione Eros 2026-09-22).
const EVENING = new Date('2026-09-14T19:00:00');
const INCLUDED_BEER = 'Keiler Helles';

async function gotoMenu(page) {
  await page.clock.setFixedTime(EVENING);
  await page.goto('/kitchen?nickname=Eros');
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i }).first()).toBeVisible();
}

/** Aggiunge un FALLO PESANTE: e' la riga carrello piu' fragile da ripristinare (id composito
 *  `combo::birra` + `includesBeerId`). Sceglie sempre la stessa birra per determinismo. */
async function addFalloPesante(page) {
  await page.getByRole('button', { name: /PESI MASSIMI/i }).first().click();
  const card = page.locator('.pm-list .pc-card').first();
  // SCEGLI COME LO VUOI (2026-09-24): il selettore birra appare solo scegliendo MENU.
  await card.getByTestId('choose-menu').click();
  await card.locator('.pm-beer-pill', { hasText: INCLUDED_BEER }).click();
  await card.locator('.pm-beer-detail').getByRole('button', { name: 'SCEGLI QUESTA BIRRA' }).click();
  await expect(card.getByTestId('fallo-pesante-cta')).toBeEnabled();
  await card.getByTestId('fallo-pesante-cta').click();
  return INCLUDED_BEER;
}

async function openCart(page) {
  await page.locator('.kitch-bottom-bar').getByText(/VAI ALLA CASSA/i).click();
  await expect(page.locator('.kitch-drawer')).toBeVisible();
}

test('refresh: item, quantita e birra del FALLO PESANTE restano nel sacco', async ({ page }) => {
  await gotoMenu(page);
  const beer = await addFalloPesante(page);
  await expect(page.locator('.kitch-bottom-bar')).toContainText('19,00 €');

  await page.reload();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('19,00 €');
  await openCart(page);
  await expect(page.locator('.kitch-drawer')).toContainText('FALLO PESANTE');
  await expect(page.locator('.kitch-drawer')).toContainText(beer.toUpperCase().slice(0, 6));
});

test('refresh: nota e scelta di ritiro restano, e la nota e subito visibile', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.getByRole('button', { name: /NOTE PER LA CUCINA/i }).click();
  await page.locator('.kitch-drawer textarea').fill('senza cipolla, grazie');
  await page.getByTestId('fulfillment-takeaway').click();

  await page.reload();
  await openCart(page);

  // niente accordion da riaprire: se la nota c'e', il pannello parte aperto
  await expect(page.locator('.kitch-drawer textarea')).toHaveValue('senza cipolla, grazie');
  await expect(page.getByTestId('fulfillment-takeaway')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pay-lane-counter')).toBeEnabled();
});

test('back/forward fuori e dentro /kitchen: il sacco resta', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await expect(page.locator('.kitch-bottom-bar')).toContainText('19,00 €');

  await page.goto('/kitchen/status');
  await page.goBack();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('19,00 €');
});

test('riapertura della pagina in una nuova navigazione: il sacco e ancora li', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await page.goto('about:blank');
  await page.goto('/kitchen');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('19,00 €');
});

test('quantita: il + persiste e il totale e ricalcolato', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.locator('.kitch-drawer').getByRole('button', { name: /Aggiungi uno/i }).first().click();
  await expect(page.locator('.kitch-drawer')).toContainText('€38,00');

  await page.reload();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('38,00 €');
});

test('svuotamento esplicito col cestino: sacco vuoto, e resta vuoto dopo il refresh', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.locator('.kitch-drawer').getByRole('button', { name: /Rimuovi dal sacco/i }).first().click();

  await expect(page.locator('.kitch-bottom-bar')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.kitch-bottom-bar')).toHaveCount(0);

  // nota e scelta di ritiro non sopravvivono a un sacco buttato: finirebbero su un altro ordine
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), CART_KEY);
  expect(saved.items).toEqual([]);
  expect(saved.note).toBe('');
  expect(saved.fulfillmentType).toBeNull();
});

test('il sacco NON viene svuotato quando l invio fallisce', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.getByTestId('fulfillment-eat_here').click();
  // Checkout V2: nome + corsia sullo stesso schermo, l'ordine parte al tap sulla corsia.
  await page.getByTestId('customer-name-input').fill('Marco');
  await page.getByTestId('pay-lane-counter').click();

  // senza Supabase configurato la creazione ordine fallisce: il carrello deve restare intatto
  await expect(page.getByTestId('order-submit-error')).toBeVisible();
  await expect(page.locator('.kitch-drawer')).toContainText('€19,00');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), CART_KEY);
  expect(saved.items.length).toBe(1);
});

test('carrello cliente e carrello cassa non condividono storage', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).toContain(CART_KEY);
  // nessuna chiave staff/cassa scritta dal percorso cliente
  expect(keys).not.toContain('walbox_kitchen_orders_demo');
});
