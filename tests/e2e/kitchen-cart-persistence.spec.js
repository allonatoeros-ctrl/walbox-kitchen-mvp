// kitchen-cart-persistence.spec.js — IL SACCO sopravvive a refresh, back/forward e riapertura.
// (fix UX 1 del 2026-09-16)
import { test, expect } from '@playwright/test';

const CART_KEY = 'walbox_kitchen_cart_v1';

// FALLO PESANTE include sempre Krombacher Pils (2026-09-19), che e' `evening_only`: prima
// delle 18:00 il combo non e' ordinabile per regola di servizio. Questi test riguardano la
// persistenza del sacco, non quel gate, quindi l'orologio e' fissato a serata aperta.
const EVENING = new Date('2026-09-14T19:00:00');
const INCLUDED_BEER = 'Krombacher Pils';

async function gotoMenu(page) {
  await page.clock.setFixedTime(EVENING);
  await page.goto('/kitchen?nickname=Eros');
  await page.getByRole('button', { name: /ENTRA NEL MENU/i }).click();
}

/** Aggiunge un FALLO PESANTE: e' la riga carrello piu' fragile da ripristinare (id composito
 *  `combo::birra` + `includesBeerId`). La birra non si sceglie piu': e' fissa nel combo. */
async function addFalloPesante(page) {
  await page.getByRole('button', { name: /PESI MASSIMI/i }).first().click();
  await page.locator('.pm-card-closed').first().click();
  const card = page.locator('.pm-card--open').first();
  await expect(card.locator('.pm-btn-heavy')).toBeEnabled();
  await card.locator('.pm-btn-heavy').click();
  return INCLUDED_BEER;
}

async function openCart(page) {
  await page.locator('.kitch-bottom-bar').getByText(/VAI ALL'ORDINE/i).click();
  await expect(page.locator('.kitch-drawer')).toBeVisible();
}

test('refresh: item, quantita e birra del FALLO PESANTE restano nel sacco', async ({ page }) => {
  await gotoMenu(page);
  const beer = await addFalloPesante(page);
  await expect(page.locator('.kitch-bottom-bar')).toContainText('€19,00');

  await page.reload();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('€19,00');
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
  await expect(page.getByTestId('fulfillment-takeaway')).toHaveClass(/--selected/);
  await expect(page.getByTestId('submit-order-btn')).toBeEnabled();
});

test('back/forward fuori e dentro /kitchen: il sacco resta', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await expect(page.locator('.kitch-bottom-bar')).toContainText('€19,00');

  await page.goto('/kitchen/status');
  await page.goBack();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('€19,00');
});

test('riapertura della pagina in una nuova navigazione: il sacco e ancora li', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await page.goto('about:blank');
  await page.goto('/kitchen');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('€19,00');
});

test('quantita: il + persiste e il totale e ricalcolato', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.locator('.kitch-drawer').getByRole('button', { name: '+' }).first().click();
  await expect(page.locator('.kitch-drawer')).toContainText('€38,00');

  await page.reload();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('€38,00');
});

test('svuotamento esplicito col cestino: sacco vuoto, e resta vuoto dopo il refresh', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.locator('.kitch-drawer').getByRole('button', { name: '🗑️' }).first().click();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('0 ROBE NEL SACCO');
  await page.reload();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('0 ROBE NEL SACCO');

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
  await page.getByTestId('submit-order-btn').click();
  // Step nome cliente (2026-09-19): l'ordine parte solo dopo CONTINUA.
  await page.getByTestId('customer-name-input').fill('Marco');
  await page.getByTestId('customer-name-continue').click();

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
