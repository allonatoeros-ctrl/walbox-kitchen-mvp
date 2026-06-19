import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

function makeSeedOrder() {
  return [
    {
      id: 'order-seed-t12',
      table: 'T12',
      nickname: 'Eros',
      items: [{ itemId: 'item-001', name: 'Walrus Smash Burger', quantity: 1, price: 9 }],
      total: 9,
      status: 'received',
      createdAt: new Date().toISOString(),
      note: '',
    },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('1. Entry → Request preserves table and nickname', async ({ page }) => {
  await page.goto('/entry');
  await page.getByPlaceholder('Es. 12').fill('12');
  await page.getByPlaceholder('Es. Marco').fill('Eros');
  await page.getByRole('button', { name: /ENTRA NEL WALBOX/i }).click();
  await expect(page).toHaveURL(/\/request/);
  await expect(page).toHaveURL(/table=12/);
  await expect(page).toHaveURL(/nickname=Eros/);
});

test('2. Request → Kitchen CTA navigates to /kitchen', async ({ page }) => {
  await page.goto('/request?table=12&nickname=Eros');
  await page.getByRole('button', { name: /Cibo/i }).click();
  await expect(page).toHaveURL(/\/kitchen/);
});

test('3. Full Kitchen order uses customer identity from entry', async ({ page }) => {
  await page.goto('/entry');
  await page.getByPlaceholder('Es. 12').fill('12');
  await page.getByPlaceholder('Es. Marco').fill('Eros');
  await page.getByRole('button', { name: /ENTRA NEL WALBOX/i }).click();
  await expect(page).toHaveURL(/\/request/);

  await page.getByRole('button', { name: /Cibo/i }).click();
  await expect(page).toHaveURL(/\/kitchen/);

  // Add first menu item in the default combo category
  await page.getByRole('button', { name: 'LO VOGLIO' }).first().click();

  // Open cart bottom sheet via the floating pill
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();

  // Submit the order
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  // Verify localStorage: latest order must have T12 and Eros
  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_ORDERS,
  );
  const latest = [...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )[0];
  expect(latest).toBeDefined();
  expect(latest.table).toBe('T12');
  expect(latest.nickname).toBe('Eros');
});

test('4. Kitchen status → Jukebox bridge preserves table', async ({ page }) => {
  // Seed a received order for T12 / Eros
  const orders = makeSeedOrder();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );

  await page.goto('/kitchen/status');

  // Jukebox bridge is visible when order is received or preparing
  await page.getByRole('button', { name: /Vai al jukebox/i }).click();

  await expect(page).toHaveURL(/\/request/);
  await expect(page).toHaveURL(/table=12/);
  await expect(page).not.toHaveURL(/\/entry/);
});

test('5. Staff dashboard shows T12 and Eros', async ({ page }) => {
  const orders = makeSeedOrder();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );

  await page.goto('/kitchen/staff');

  await expect(page.getByText('T12')).toBeVisible();
  await expect(page.getByText('Eros')).toBeVisible();
});

test('6. Jukebox shows Segui ordine CTA when active kitchen order exists', async ({ page }) => {
  const orders = makeSeedOrder();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );

  await page.goto('/request?table=12&nickname=Eros');

  await expect(page.getByRole('button', { name: /Segui ordine/i })).toBeVisible();

  await page.getByRole('button', { name: /Segui ordine/i }).click();
  await expect(page).toHaveURL(/\/kitchen\/status/);
});

// ═══════════════════════════════════════════════════════════════════
// Staff OS — QA Suite V1  (scenari 7–17)
// ═══════════════════════════════════════════════════════════════════

const LS_MENU = 'walbox_kitchen_menu_availability';

function makeQAOrder(overrides = {}) {
  return {
    id: 'order-qa-001',
    orderCode: 'W99',
    table: 'T5',
    nickname: 'QATester',
    items: [{ itemId: 'item-003', name: 'Patatine da Banco', quantity: 1, price: 4.0 }],
    total: 4.0,
    status: 'pending_counter_payment',
    createdAt: new Date().toISOString(),
    note: '',
    ...overrides,
  };
}

async function seedOrders(page, orders) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );
}

async function readOrders(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), LS_ORDERS);
}

// ── QA-1: Happy Path ───────────────────────────────────────────────

test('7. Bancone confirma pagamento → status received', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');

  await expect(page.getByText('IN ATTESA PAGAMENTO')).toBeVisible();
  await page.getByRole('button', { name: /PAGATO/i }).click();
  await expect(page.getByText('IN ATTESA PAGAMENTO')).not.toBeVisible();

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.paymentStatus).toBe('paid');
  expect(order.status).toBe('received');
});

test('8. Cucina prende in carico → status preparing', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'received' })]);
  await page.goto('/kitchen/staff');

  await expect(page.getByText('NUOVI')).toBeVisible();
  await page.getByRole('button', { name: /INIZIA/i }).click();
  await expect(page.getByText('IN PREPARAZIONE')).toBeVisible();

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('preparing');
});

test('9. Cucina marca pronto → status ready + badge header', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'preparing' })]);
  await page.goto('/kitchen/staff');

  await expect(page.getByText('IN PREPARAZIONE')).toBeVisible();
  await page.getByRole('button', { name: /PRONTO/i }).click();
  await expect(page.locator('.ksd-section-label', { hasText: 'PRONTI' })).toBeVisible();
  await expect(page.getByText(/pronti 🟢/)).toBeVisible();

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('ready');
});

test('10. Bancone marca ritirato → status delivered', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'ready' })]);
  await page.goto('/kitchen/staff');

  await expect(page.getByText('PRONTI AL BANCO')).toBeVisible();
  await page.getByRole('button', { name: /RITIRATO/i }).click();
  await expect(page.getByText('PRONTI AL BANCO')).not.toBeVisible();

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('delivered');
});

test('11. Storico mostra ordine delivered con metriche', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'delivered', total: 4.0 })]);
  await page.goto('/kitchen/staff');

  await page.getByRole('button', { name: /STORICO/i }).click();
  await expect(page.getByText('QATester')).toBeVisible();
  await expect(page.getByText('RITIRATO')).toBeVisible();
  await expect(
    page.locator('.ksd-history-row', { hasText: 'QATester' }).getByText('€ 4.00'),
  ).toBeVisible();
});

// ── QA-2: Menu, Note, Cancel, Alert ───────────────────────────────

test('12. Menu toggle disponibile ↔ esaurito', async ({ page }) => {
  await page.goto('/kitchen/staff');
  await page.getByRole('button', { name: /MENU/i }).click();

  const firstAvailable = page.getByRole('button', { name: /✓ DISPONIBILE/i }).first();
  await expect(firstAvailable).toBeVisible();
  await firstAvailable.click();

  await expect(page.getByRole('button', { name: /✕ ESAURITO/i }).first()).toBeVisible();
  await expect(page.getByText(/esaurit/i).first()).toBeVisible();

  const savedMap = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}'),
    LS_MENU,
  );
  expect(Object.values(savedMap).some((v) => v === false)).toBe(true);

  await page.getByRole('button', { name: /✕ ESAURITO/i }).first().click();
  await expect(page.getByRole('button', { name: /✓ DISPONIBILE/i }).first()).toBeVisible();
});

test('13. Nota interna staff su ordine bancone', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');

  await page.getByRole('button', { name: /nota interna/i }).click();
  const noteInput = page.getByPlaceholder('Nota interna per cucina...');
  await expect(noteInput).toBeVisible();
  await noteInput.fill('Allergia al glutine');
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Allergia al glutine')).toBeVisible();

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').staffNote).toBe('Allergia al glutine');
});

test('14. Annulla ordine con motivo preset', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');

  await page.getByRole('button', { name: 'ANNULLA', exact: true }).click();
  await expect(page.getByText('MOTIVO ANNULLAMENTO')).toBeVisible();

  const confirmBtn = page.getByRole('button', { name: /CONFERMA ANNULLAMENTO/i });
  await expect(confirmBtn).toBeDisabled();

  await page.getByRole('button', { name: 'Fuori stock' }).click();
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  await expect(page.getByText('MOTIVO ANNULLAMENTO')).not.toBeVisible();

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.status).toBe('cancelled');
  expect(order.cancelReason).toBe('Fuori stock');
});

test('15. Annulla con motivo Altro richiede testo personalizzato', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');

  await page.getByRole('button', { name: 'ANNULLA', exact: true }).click();
  await page.getByRole('button', { name: 'Altro' }).click();

  const confirmBtn = page.getByRole('button', { name: /CONFERMA ANNULLAMENTO/i });
  await expect(confirmBtn).toBeDisabled();

  await page.getByPlaceholder('Specifica il motivo...').fill('Cliente ha cambiato idea');
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.status).toBe('cancelled');
  expect(order.cancelReason).toBe('Cliente ha cambiato idea');
});

test('16. Alert tab mostra ordine urgente e allergeni attivi', async ({ page }) => {
  const urgentOrder = makeQAOrder({
    status: 'received',
    items: [{ itemId: 'item-001', name: 'Panino Porcheria Seria', quantity: 1, price: 8.5 }],
    total: 8.5,
    createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  });
  await seedOrders(page, [urgentOrder]);
  await page.goto('/kitchen/staff');

  await expect(page.getByText(/alert ⚠/)).toBeVisible();
  await page.getByRole('button', { name: /ALERT/i }).click();

  await expect(page.getByText('URGENZA TEMPI')).toBeVisible();
  await expect(page.getByText(/🟠 LENTO/)).toBeVisible();
  await expect(page.getByText('ALLERGENI ATTIVI')).toBeVisible();
  await expect(page.getByText('GLUTINE')).toBeVisible();
  await expect(page.getByText('PESCE')).toBeVisible();
});

test('17. Alert critico dopo 15 minuti', async ({ page }) => {
  const criticalOrder = makeQAOrder({
    status: 'received',
    createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
  });
  await seedOrders(page, [criticalOrder]);
  await page.goto('/kitchen/staff');

  await page.getByRole('button', { name: /ALERT/i }).click();
  await expect(page.getByText(/🔴 CRITICO/)).toBeVisible();
});
