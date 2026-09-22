// kitchen-p0-closure.spec.js — GO-LIVE P0 CLOSURE SPRINT (18/09).
//
// Copre i due percorsi che nessuna suite esistente attraversava e che il failure-mode sweep del
// 2026-09-16 ha trovato rotti:
//   P0-2  la birra scelta in FALLO PESANTE deve arrivare alla comanda (customer_note).
//   P0-3  un combo deve mostrare allo staff l'unione degli allergeni dei componenti, e un item
//         fuori catalogo NON deve essere presentato come "nessun allergene dichiarato".
//
// Stesso harness della suite Solo Service: ordini seminati su localStorage (chiave staff), guard
// bypassato da playwright.config.js. Nessun Supabase reale richiesto.
import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

async function seed(page, orders) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

test.describe('P0-3 — allergeni combo e item non verificati sulla focus card staff', () => {

  test('ordine FALLO PESANTE: unione allergeni panino + birra, non piu "nessun allergene"', async ({ page }) => {
    // item-040 = combo su item-009 (uova, latte); la birra inclusa porta glutine.
    await seed(page, [{
      id: 'p0-combo', orderCode: 'A90', nickname: 'Combo',
      items: [{ itemId: 'item-040', name: 'Pulled Pork — Fallo Pesante', quantity: 1, price: 19 }],
      total: 19, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(3), note: '🍺 BIRRA INCLUSA: KEILER WEISSE',
    }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('A90');
    const allergeni = page.getByTestId('focus-allergeni');
    await expect(allergeni).toContainText('Uova');
    await expect(allergeni).toContainText('Latte');
    await expect(allergeni).toContainText('Glutine');   // <- arriva dalla birra inclusa
    await expect(page.getByText('ATTENZIONE')).toBeVisible();
    await expect(page.getByText('Nessun allergene dichiarato')).toHaveCount(0);
  });

  test('P0-2: la birra scelta e leggibile dalla cucina sulla comanda in focus', async ({ page }) => {
    await seed(page, [{
      id: 'p0-note', orderCode: 'A91', nickname: 'Combo',
      items: [{ itemId: 'item-040', name: 'Pulled Pork — Fallo Pesante', quantity: 1, price: 19 }],
      total: 19, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(3), note: '🍺 BIRRA INCLUSA: KEILER WEISSE · senza cipolla',
    }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByText('MODIFICHE / NOTE')).toBeVisible();
    await expect(page.getByText('BIRRA INCLUSA: KEILER WEISSE')).toBeVisible();
    // La nota del cliente non viene mangiata dal marker.
    await expect(page.getByText('senza cipolla')).toBeVisible();
  });

  test('item fuori catalogo: "ALLERGENI NON VERIFICATI" con la riga colpevole, mai "nessun allergene"', async ({ page }) => {
    await seed(page, [{
      id: 'p0-unknown', orderCode: 'A92', nickname: 'Ignoto',
      items: [{ itemId: 'item-999', name: 'Piatto Fuori Catalogo', quantity: 1, price: 7 }],
      total: 7, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(3), note: '',
    }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('A92');
    const unverified = page.getByTestId('focus-allergeni-unverified');
    await expect(unverified).toContainText('ALLERGENI NON VERIFICATI');
    await expect(unverified).toContainText('Piatto Fuori Catalogo');
    await expect(page.getByText('ATTENZIONE')).toBeVisible();
    await expect(page.getByText('Nessun allergene dichiarato')).toHaveCount(0);
  });

  // Fix prudenziale 2026-09-16: item-018 (salsa cheddar + maionese) e item-043 (mortadella)
  // dichiaravano allergens: [] in contrasto coi propri ingredienti. Non si inventano allergeni:
  // la cucina li vede come NON VERIFICATI finche' Eros non conferma ricetta/etichetta.
  for (const { id, name } of [
    { id: 'item-018', name: 'Box Pulled Pork' },
    { id: 'item-043', name: 'Salumi Serissimi' },
  ]) {
    test(`fix prudenziale: ${id} ${name} esce come NON VERIFICATI, non come "nessun allergene"`, async ({ page }) => {
      await seed(page, [{
        id: `p0-unv-${id}`, orderCode: 'A95', nickname: 'Prudenza',
        items: [{ itemId: id, name, quantity: 1, price: 8 }],
        total: 8, status: 'received', paymentStatus: 'paid',
        createdAt: minutesAgo(3), note: '',
      }]);
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto('/kitchen/solo');

      await expect(page.getByTestId('focus-code')).toHaveText('A95');
      const unverified = page.getByTestId('focus-allergeni-unverified');
      await expect(unverified).toContainText('ALLERGENI NON VERIFICATI');
      await expect(unverified).toContainText(name);
      await expect(page.getByText('ATTENZIONE')).toBeVisible();
      await expect(page.getByText('Nessun allergene dichiarato')).toHaveCount(0);
      // Nessun allergene inventato: la card non deve stampare una lista.
      await expect(page.getByTestId('focus-allergeni')).toHaveCount(0);
    });
  }

  test('ordine senza allergeni e tutto in catalogo: resta "nessun allergene dichiarato", nessun falso allarme', async ({ page }) => {
    await seed(page, [{
      id: 'p0-clean', orderCode: 'A93', nickname: 'Pulito',
      items: [{ itemId: 'item-058', name: 'Patate al Forno', quantity: 1, price: 5 }],
      total: 5, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(3), note: '',
    }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('A93');
    await expect(page.getByText('Nessun allergene dichiarato')).toBeVisible();
    await expect(page.getByTestId('focus-allergeni')).toHaveCount(0);
    await expect(page.getByTestId('focus-allergeni-unverified')).toHaveCount(0);
  });

  test('ALERT: un ordine con sola riga fuori catalogo entra in ALLERGENI ATTIVI invece di sparire', async ({ page }) => {
    await seed(page, [{
      id: 'p0-alert', orderCode: 'A94', nickname: 'Ignoto',
      items: [{ itemId: 'item-999', name: 'Piatto Fuori Catalogo', quantity: 1, price: 7 }],
      total: 7, status: 'received', paymentStatus: 'paid',
      createdAt: minutesAgo(3), note: '',
    }]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');
    await page.getByRole('button', { name: /ALERT/i }).first().click();

    await expect(page.getByText('ALLERGENI ATTIVI')).toBeVisible();
    await expect(page.getByTestId('alert-allergeni-unverified')).toContainText('NON VERIFICATI');
    await expect(page.getByTestId('alert-allergeni-unverified')).toContainText('PIATTO FUORI CATALOGO');
  });
});

test.describe('P0-2 — la birra sopravvive dal catalogo reale alla nota, per tutte le birre', () => {

  test('tutte le birre selezionabili producono la nota giusta nel bundle servito al browser', async ({ page }) => {
    await page.goto('/kitchen');
    // Import dei moduli reali serviti da Vite: si verifica il codice che gira davvero in pagina,
    // non una copia node-side.
    const result = await page.evaluate(async () => {
      const rules = await import('/src/lib/kitchenServiceRules.js');
      const data  = await import('/src/data/kitchenMockData.js');
      const beers = data.kitchenMenuItems.filter(
        (i) => i.category === 'birre' && i.tags?.includes('birre-v1'),
      );
      const combo = data.kitchenPesiMassimiCombos['item-009'];
      return beers.map((beer) => ({
        beerName: beer.name,
        note: rules.buildIncludedBeersNote(
          [{
            id: `${combo.id}::${beer.id}`,
            baseId: combo.id,
            name: `${combo.name} · ${beer.name}`,
            price: combo.price,
            qty: 1,
            includesBeerId: beer.id,
          }],
          data.kitchenMenuItems,
        ),
      }));
    });

    expect(result.length).toBeGreaterThanOrEqual(6);
    for (const { beerName, note } of result) {
      expect(note).toContain('BIRRA INCLUSA');
      expect(note).toContain(beerName.toUpperCase());
    }
  });

  test('UI reale: FALLO PESANTE porta la birra scelta in carrello, Krombacher non e selezionabile (rimossa dal catalogo)', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-14T19:00:00'));
    await page.goto('/kitchen?nickname=Eros');
    // HOME -> CATEGORIE -> PESI MASSIMI (stessa navigazione di openCategoryList in
    // customer-kitchen-flow.spec.js: la lista si apre solo dalla tile della categoria).
    await page.getByRole('button', { name: /ENTRA NEL MENU/i }).click();
    await page.getByRole('button', { name: /PESI MASSIMI/i }).first().click();

    // Apre la prima card (accordion): l'upsell FALLO PESANTE e' interattivo solo da aperta.
    await page.locator('.pm-card-closed').first().click();
    const card = page.locator('.pm-card--open').first();
    const heavy = card.locator('.pm-btn-heavy');
    await expect(heavy).toBeVisible();

    // Krombacher rimossa dal catalogo (2026-09-22): non compare tra le pillole selezionabili.
    await expect(card.locator('.pm-beer-pill', { hasText: 'Krombacher' })).toHaveCount(0);

    // Nessuna birra scelta: il combo resta disabilitato.
    await expect(heavy).toBeDisabled();

    await card.locator('.pm-beer-pill', { hasText: 'Keiler Helles' }).click();
    await card.locator('.pm-beer-detail').getByRole('button', { name: 'SCEGLI QUESTA BIRRA' }).click();

    await expect(heavy).toBeEnabled();
    await expect(heavy).toHaveText('FALLO PESANTE');
    await heavy.scrollIntoViewIfNeeded();
    await heavy.click();

    // La riga carrello porta la birra inclusa: e' l'input di buildIncludedBeersNote.
    await page.locator('.kitch-bottom-card, .kitch-cart-bar').first().click();
    await expect(page.locator('.kitch-drawer')).toBeVisible();
    await expect(page.locator('.kitch-drawer')).toContainText('KEILER HELLES');
  });
});
