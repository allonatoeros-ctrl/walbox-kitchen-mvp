// kitchen-cart-persistence.spec.js — IL SACCO sopravvive a refresh, back/forward e riapertura.
// (fix UX 1 del 2026-09-16)
import { test, expect } from '@playwright/test';

const CART_KEY = 'walbox_kitchen_cart_v1';

// FALLO PESANTE include sempre 1 birra a scelta tra le 6 rimaste (Krombacher rimossa dal
// catalogo, correzione Eros 2026-09-22).
const EVENING = new Date('2026-09-14T19:00:00');
const INCLUDED_BEER = 'Keiler Helles';
// MENU OTTOBRE (2026-10-28): il panino Pulled Pork non ha piu il MENU (ora sta sul Box). Si usa il
// Pastrami: MENU con birra 17,90, con bibita 16,90.
const MENU_CARD = 'Pastrami';

async function gotoMenu(page) {
  await page.clock.setFixedTime(EVENING);
  await page.goto('/kitchen?nickname=Eros');
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i }).first()).toBeVisible();
}

/** Aggiunge un FALLO PESANTE: e' la riga carrello piu' fragile da ripristinare (id composito
 *  `combo::birra` + `includesBeerId`). Sceglie sempre la stessa birra per determinismo. */
async function addFalloPesante(page) {
  await page.getByRole('button', { name: /PESI MASSIMI/i }).first().click();
  const card = page.locator('.pm-list .pc-card', { hasText: MENU_CARD });
  // SCEGLI COME LO VUOI (2026-09-24): il selettore birra appare solo scegliendo MENU.
  await card.getByTestId('choose-menu').click();
  await card.getByTestId('fallo-pesante-group-beers').click();
  await card.locator('.pm-beer-pill', { hasText: INCLUDED_BEER.replace(/^keiler\s+/i, '') }).click();
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
  await expect(page.locator('.kitch-bottom-bar')).toContainText('17,90 €');

  await page.reload();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('17,90 €');
  await openCart(page);
  await expect(page.locator('.kitch-drawer')).toContainText('FALLO PESANTE');
  await expect(page.locator('.kitch-drawer')).toContainText(beer.toUpperCase().slice(0, 6));
});

test('refresh: il MENU con BIBITA resta nel sacco sulla sua variante, a prezzo bibita', async ({ page }) => {
  await gotoMenu(page);
  await page.getByRole('button', { name: /PESI MASSIMI/i }).first().click();
  const card = page.locator('.pm-list .pc-card', { hasText: MENU_CARD });
  await card.getByTestId('choose-menu').click();
  await card.getByTestId('fallo-pesante-group-drinks').click();
  await card.locator('.pm-drink-pill', { hasText: 'Pepsi Zero' }).click();
  await card.getByTestId('fallo-pesante-cta').click();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('16,90 €');

  await page.reload();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('16,90 €');
  await openCart(page);
  await expect(page.locator('.kitch-drawer')).toContainText('PASTRAMI — FALLO PESANTE');
  await expect(page.locator('.kitch-drawer')).toContainText('PEPSI ZERO');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), CART_KEY);
  expect(saved.items[0].baseId).toBe('item-061');
});

test('carrello vecchio (MENU a 19 sul panino Pulled Pork, Schweppes): riprezzato o scartato, mai incoerente', async ({ page }) => {
  await page.clock.setFixedTime(EVENING);
  await page.addInitScript((k) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(k, JSON.stringify({ v: 1, note: '', fulfillmentType: null, items: [
      { id: 'item-040::item-051', baseId: 'item-040', qty: 1, includesBeerId: 'item-051' },
      { id: 'item-041::item-049', baseId: 'item-041', qty: 1, includesBeerId: 'item-049' },
      { id: 'item-050', baseId: 'item-050', qty: 2 },
    ] }));
  }, CART_KEY);
  await page.goto('/kitchen?nickname=Eros');
  // Resta solo il MENU item-040, ora MENU del Box a 15,90; Schweppes (sola o nel menu) scartate.
  await expect(page.locator('.kitch-bottom-bar')).toContainText('15,90 €');
  await openCart(page);
  await expect(page.locator('.kitch-drawer')).toContainText('BOX PULLED PORK — FALLO PESANTE');
  await expect(page.locator('.kitch-drawer')).not.toContainText('SCHWEPPES');
});

test('refresh: nota e scelta di ritiro restano, e la nota e subito visibile', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  // 2026-10-28: note sempre aperte, nessun toggle da toccare.
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
  await expect(page.locator('.kitch-bottom-bar')).toContainText('17,90 €');

  await page.goto('/kitchen/status');
  await page.goBack();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('17,90 €');
});

test('riapertura della pagina in una nuova navigazione: il sacco e ancora li', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await page.goto('about:blank');
  await page.goto('/kitchen');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('17,90 €');
});

test('quantita: il + persiste e il totale e ricalcolato', async ({ page }) => {
  await gotoMenu(page);
  await addFalloPesante(page);
  await openCart(page);
  await page.locator('.kitch-drawer').getByRole('button', { name: /Aggiungi uno/i }).first().click();
  await expect(page.locator('.kitch-drawer')).toContainText('35,80 €');

  await page.reload();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('35,80 €');
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
  await expect(page.locator('.kitch-drawer')).toContainText('17,90 €');
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
