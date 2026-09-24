import { test, expect } from '@playwright/test';

// F6 Notification Decision Gate — E2E (2026-09-24).
// Harness dedicato: playwright.notif.config.js inietta VITE_WEB_PUSH_VAPID_PUBLIC_KEY, quindi il
// gate dell'overlay è attivo. Qui si verifica: comparsa al primo ingresso, permesso richiesto SOLO
// al click sulla CTA primaria, persistenza di "CONTINUA SENZA NOTIFICHE" per ordine, soppressione
// quando il permesso è già concesso o negato. Screenshot mobile in ai-ops/reports/.
//
// Eseguire: npx playwright test --config=playwright.notif.config.js

const LS_MY_ORDERS = 'walbox_kitchen_my_orders';
const LS_OWNED_IDS = 'walbox_kitchen_my_order_ids';
const LS_DISMISSED = 'walbox_kitchen_notification_dismissed_orders';

function makeOrder({ id, orderCode }) {
  return {
    id,
    orderCode,
    nickname: 'Eros',
    items: [{ itemId: 'item-016', name: 'Walrus Smash Burger', quantity: 1, price: 9 }],
    total: 9,
    status: 'received',
    createdAt: new Date().toISOString(),
    note: '',
  };
}

async function mockVenueOrdersSelect(page) {
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

async function seedOrder(page, order) {
  await page.evaluate(
    ({ myKey, ownedKey, data, id }) => {
      localStorage.setItem(myKey, JSON.stringify([data]));
      localStorage.setItem(ownedKey, JSON.stringify([id]));
    },
    { myKey: LS_MY_ORDERS, ownedKey: LS_OWNED_IDS, data: order, id: order.id }
  );
}

async function seedDismissed(page, ids) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_DISMISSED, data: ids }
  );
}

// Chromium headless di Playwright parte con Notification.permission = 'denied', non 'default':
// l'app non prompta mai da sola e quindi quella è la condizione ambientale, non quella del cliente.
// Il gate va quindi testato fissando esplicitamente il permesso iniziale.
async function stubPermission(page, value) {
  await page.addInitScript((perm) => {
    Object.defineProperty(Notification, 'permission', { get: () => perm, configurable: true });
  }, value);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('1. Gate mostrato al primo ingresso su /kitchen/status, con il codice ordine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubPermission(page, 'default');
  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-1', orderCode: 'A42' }));

  await page.goto('/kitchen/status');

  const gate = page.getByTestId('notification-gate');
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('TI AVVISIAMO NOI');
  await expect(gate).toContainText('Ti avvisiamo appena');
  await expect(gate).toContainText('A42');
  await expect(page.getByTestId('notification-gate-activate')).toHaveText('ATTIVA NOTIFICHE');
  await expect(page.getByTestId('notification-gate-continue')).toHaveText('CONTINUA SENZA NOTIFICHE');

  // La pagina sottostante resta montata (Status page source of truth), solo oscurata.
  await expect(page.locator('.ost-page')).toBeVisible();

  await page.screenshot({ path: 'ai-ops/reports/f6-notification-gate-idle.png' });
});

test('2. Il permesso browser NON viene richiesto al mount, solo dopo il click sulla CTA primaria', async ({ page }) => {
  await page.addInitScript(() => {
    window.__notifRequestPermissionCalls = 0;
    const original = Notification.requestPermission.bind(Notification);
    try {
      Notification.requestPermission = (...args) => {
        window.__notifRequestPermissionCalls += 1;
        return original(...args);
      };
    } catch {
      Object.defineProperty(Notification, 'requestPermission', {
        value: (...args) => {
          window.__notifRequestPermissionCalls += 1;
          return original(...args);
        },
      });
    }
  });
  await stubPermission(page, 'default');

  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-2', orderCode: 'B07' }));
  await page.goto('/kitchen/status');

  await expect(page.getByTestId('notification-gate')).toBeVisible();
  expect(await page.evaluate(() => window.__notifRequestPermissionCalls)).toBe(0);

  await page.getByTestId('notification-gate-activate').click();
  await expect
    .poll(() => page.evaluate(() => window.__notifRequestPermissionCalls))
    .toBeGreaterThan(0);
});

test('3. "CONTINUA SENZA NOTIFICHE" chiude il gate e resta persistito per quell\'ordine', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubPermission(page, 'default');
  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-3', orderCode: 'C11' }));
  await page.goto('/kitchen/status');

  await expect(page.getByTestId('notification-gate')).toBeVisible();
  await page.getByTestId('notification-gate-continue').click();
  await expect(page.getByTestId('notification-gate')).toHaveCount(0);

  await page.screenshot({ path: 'ai-ops/reports/f6-notification-gate-dismissed.png' });

  // Persistenza: al reload il gate non ricompare per lo stesso ordine.
  await page.reload();
  await expect(page.locator('.ost-page')).toBeVisible();
  await expect(page.getByTestId('notification-gate')).toHaveCount(0);

  const dismissed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), LS_DISMISSED);
  expect(dismissed).toContain('order-gate-3');
});

test('4. La scelta vale per l\'ordine, non globalmente: un nuovo ordine fa ricomparire il gate', async ({ page }) => {
  await stubPermission(page, 'default');
  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-4a', orderCode: 'D01' }));
  await seedDismissed(page, ['order-gate-4a']);

  await page.goto('/kitchen/status');
  await expect(page.getByTestId('notification-gate')).toHaveCount(0);

  // Nuovo ordine (nuovo id) sullo stesso dispositivo: il gate torna.
  await seedOrder(page, makeOrder({ id: 'order-gate-4b', orderCode: 'D02' }));
  await page.reload();
  await expect(page.getByTestId('notification-gate')).toBeVisible();
  await expect(page.getByTestId('notification-gate')).toContainText('D02');
});

test('5. Permesso già concesso -> nessun overlay, stato visibile "NOTIFICHE ATTIVE"', async ({ page }) => {
  await stubPermission(page, 'granted');
  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-5', orderCode: 'E05' }));

  await page.goto('/kitchen/status');

  await expect(page.getByTestId('notification-gate')).toHaveCount(0);
  await expect(page.getByTestId('notification-active')).toContainText('NOTIFICHE ATTIVE');
  expect(await page.evaluate(() => Notification.permission)).toBe('granted');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'ai-ops/reports/f6-notification-gate-active.png' });
});

test('6. Permesso negato -> nessun overlay (niente loop) e nessun prompt automatico', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true });
  });
  await mockVenueOrdersSelect(page);
  await seedOrder(page, makeOrder({ id: 'order-gate-6', orderCode: 'F09' }));

  await page.goto('/kitchen/status');

  await expect(page.locator('.ost-page')).toBeVisible();
  await expect(page.getByTestId('notification-gate')).toHaveCount(0);
  await expect(page.getByTestId('notification-denied')).toBeVisible();
});

// F6 final UX patch: su iPhone Safari NON installato come PWA la Web Push non esiste
// (Notification/PushManager assenti) -> il cliente deve comunque vedere il gate informativo.
const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

test.describe('iOS Safari non installato come PWA', () => {
  test.use({ userAgent: IPHONE_SAFARI_UA });

  test('7. Gate informativo "aggiungi a Home", nessun overlay classico e CTA CONTINUA', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      // iOS Safari non-PWA: Notification non esiste; non standalone.
      Object.defineProperty(window, 'Notification', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
    });
    await mockVenueOrdersSelect(page);
    await seedOrder(page, makeOrder({ id: 'order-gate-ios', orderCode: 'G22' }));

    await page.goto('/kitchen/status');

    expect(await page.evaluate(() => typeof Notification)).toBe('undefined');

    const iosGate = page.getByTestId('notification-gate-ios');
    await expect(iosGate).toBeVisible();
    await expect(iosGate).toContainText('TI AVVISIAMO NOI');
    await expect(iosGate).toContainText('aggiungi Walbox alla schermata Home');
    await expect(page.getByTestId('notification-gate-ios-continue')).toHaveText('CONTINUA');
    // Mai l'overlay classico con "ATTIVA NOTIFICHE" in questo stato.
    await expect(page.getByTestId('notification-gate')).toHaveCount(0);

    await page.screenshot({ path: 'ai-ops/reports/f6-notification-gate-ios.png' });

    // "CONTINUA" chiude e persiste per l'ordine.
    await page.getByTestId('notification-gate-ios-continue').click();
    await expect(page.getByTestId('notification-gate-ios')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('notification-gate-ios')).toHaveCount(0);
  });
});