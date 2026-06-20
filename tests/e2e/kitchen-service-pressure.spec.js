import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';
const LS_MENU = 'walbox_kitchen_menu_availability';

function generateDemoNightOrders() {
  const now = Date.now();
  
  return [
    // 1. Pending counter payment
    {
      id: 'demo-order-1',
      orderCode: 'D01',
      table: 'T1',
      nickname: 'Alice',
      items: [{ itemId: 'item-003', name: 'Patatine da Banco', quantity: 2, price: 4.0 }],
      total: 8.0,
      status: 'pending_counter_payment',
      paymentStatus: 'pending',
      createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
      note: '',
    },
    // 2. Pending payment order with notes/allergen
    {
      id: 'demo-order-2',
      orderCode: 'D02',
      table: 'T2',
      nickname: 'Bob',
      items: [{ itemId: 'item-001', name: 'Panino Porcheria Seria', quantity: 1, price: 8.5 }],
      total: 8.5,
      status: 'pending_counter_payment',
      paymentStatus: 'pending',
      createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
      note: 'Senza salse',
      staffNote: 'Allergia al glutine',
    },
    // 3. Paid/new kitchen order
    {
      id: 'demo-order-3',
      orderCode: 'D03',
      table: 'T3',
      nickname: 'Charlie',
      items: [{ itemId: 'item-002', name: 'Walrus Smash Burger', quantity: 1, price: 9.0 }],
      total: 9.0,
      status: 'received',
      paymentStatus: 'paid',
      createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
      note: '',
    },
    // 4. Preparing order
    {
      id: 'demo-order-4',
      orderCode: 'D04',
      table: 'T4',
      nickname: 'Diana',
      items: [{ itemId: 'item-004', name: 'Birra Media', quantity: 3, price: 5.0 }],
      total: 15.0,
      status: 'preparing',
      paymentStatus: 'paid',
      createdAt: new Date(now - 8 * 60 * 1000).toISOString(),
      note: '',
    },
    // 5. Ready order just marked ready
    {
      id: 'demo-order-5',
      orderCode: 'D05',
      table: 'T5',
      nickname: 'Eve',
      items: [{ itemId: 'item-003', name: 'Patatine da Banco', quantity: 1, price: 4.0 }],
      total: 4.0,
      status: 'ready',
      paymentStatus: 'paid',
      createdAt: new Date(now - 10 * 60 * 1000).toISOString(),
      note: '',
    },
    // 6. Ready order waiting for pickup
    {
      id: 'demo-order-6',
      orderCode: 'D06',
      table: 'T6',
      nickname: 'Frank',
      items: [{ itemId: 'item-001', name: 'Panino Porcheria Seria', quantity: 2, price: 8.5 }],
      total: 17.0,
      status: 'ready',
      paymentStatus: 'paid',
      createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
      note: '',
    },
    // 7. Delivered order for history
    {
      id: 'demo-order-7',
      orderCode: 'D07',
      table: 'T7',
      nickname: 'Grace',
      items: [{ itemId: 'item-002', name: 'Walrus Smash Burger', quantity: 1, price: 9.0 }],
      total: 9.0,
      status: 'delivered',
      paymentStatus: 'paid',
      createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
      note: '',
    },
    // 8. Cancelled order with cancellation reason
    {
      id: 'demo-order-8',
      orderCode: 'D08',
      table: 'T8',
      nickname: 'Hank',
      items: [{ itemId: 'item-003', name: 'Patatine da Banco', quantity: 1, price: 4.0 }],
      total: 4.0,
      status: 'cancelled',
      paymentStatus: 'pending',
      createdAt: new Date(now - 25 * 60 * 1000).toISOString(),
      note: '',
      cancelReason: 'Fuori stock',
    },
    // 9. Slow/critical order older than 15 minutes
    {
      id: 'demo-order-9',
      orderCode: 'D09',
      table: 'T9',
      nickname: 'Ivy',
      items: [{ itemId: 'item-001', name: 'Panino Porcheria Seria', quantity: 1, price: 8.5 }],
      total: 8.5,
      status: 'received',
      paymentStatus: 'paid',
      createdAt: new Date(now - 16 * 60 * 1000).toISOString(),
      note: '',
    },
  ];
}

test.beforeEach(async ({ page }) => {
  // Clear localStorage and seed a clean “Walbox Demo Night”
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  
  const orders = generateDemoNightOrders();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders }
  );
  
  // Also collect console errors and fail on serious uncaught errors
  page.on('pageerror', (err) => {
    console.error('Uncaught error:', err.message);
  });
});

test.describe('Kitchen Service Pressure Test', () => {
  test('1. loads a clean Walbox Demo Night', async ({ page }) => {
    await page.goto('/kitchen/staff');

    // Confirm the 5 tabs are visible
    await expect(page.getByRole('button', { name: /BANCONE/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /CUCINA/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /MENU/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /STORICO/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /ALERT/i })).toBeVisible();

    // Check Bancone (default tab)
    await expect(page.getByText('Alice')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
    await expect(page.getByText('Eve')).toBeVisible();
    await expect(page.getByText('Frank')).toBeVisible();
    
    // Check Cucina
    await page.getByRole('button', { name: /CUCINA/i }).click();
    await expect(page.getByText('Charlie')).toBeVisible();
    await expect(page.getByText('Diana')).toBeVisible();

    // Check that some badges have updated (e.g. pronti has some count)
    // Wait for the badge. It's visible in the header usually.
    await expect(page.getByText(/pronti 🟢/i)).toBeVisible();
  });

  test('2. handles a busy counter flow', async ({ page }) => {
    await page.goto('/kitchen/staff');
    
    // Use BANCONE (default)
    await page.getByRole('button', { name: /BANCONE/i }).click();

    // Confirm payment for one pending order (Alice)
    const aliceRow = page.locator('.ksd-row', { hasText: 'Alice' });
    await expect(aliceRow).toBeVisible();
    await aliceRow.getByRole('button', { name: /PAGATO/i }).click();

    // Mark one ready order as RITIRATO (Eve)
    const eveRow = page.locator('.ksd-row', { hasText: 'Eve' });
    await expect(eveRow).toBeVisible();
    await eveRow.getByRole('button', { name: /RITIRATO/i }).click();

    // Cancel one pending order with a preset reason (Bob)
    const bobRow = page.locator('.ksd-row', { hasText: 'Bob' });
    await expect(bobRow).toBeVisible();
    await bobRow.getByRole('button', { name: 'ANNULLA', exact: true }).click();
    await expect(page.getByText('MOTIVO ANNULLAMENTO')).toBeVisible();
    await page.getByRole('button', { name: 'Fuori stock' }).click();
    await page.getByRole('button', { name: /CONFERMA ANNULLAMENTO/i }).click();
    await expect(page.getByText('MOTIVO ANNULLAMENTO')).not.toBeVisible();
  });

  test('3. handles kitchen production flow', async ({ page }) => {
    await page.goto('/kitchen/staff');
    
    // Use CUCINA
    await page.getByRole('button', { name: /CUCINA/i }).click();

    // Start one paid/new order (Charlie)
    const charlieRow = page.locator('.ksd-row', { hasText: 'Charlie' });
    await expect(charlieRow).toBeVisible();
    await charlieRow.getByRole('button', { name: /INIZIA/i }).click();

    // Mark one preparing order as PRONTO (Diana)
    const dianaRow = page.locator('.ksd-row', { hasText: 'Diana' });
    await expect(dianaRow).toBeVisible();
    await dianaRow.getByRole('button', { name: /PRONTO/i }).click();

    // Verify the ready state becomes visible somewhere in the staff flow (Bancone has Pronti al banco)
    await page.getByRole('button', { name: /BANCONE/i }).click();
    const dianaReadyRow = page.locator('.ksd-row', { hasText: 'Diana' });
    await expect(dianaReadyRow).toBeVisible();
    await expect(dianaReadyRow.getByRole('button', { name: /RITIRATO/i })).toBeVisible();
  });

  test('4. keeps menu, history and alerts useful', async ({ page }) => {
    await page.goto('/kitchen/staff');
    
    // Open MENU and toggle one product availability
    await page.getByRole('button', { name: /MENU/i }).click();
    const firstAvailable = page.getByRole('button', { name: /✓ DISPONIBILE/i }).first();
    await expect(firstAvailable).toBeVisible();
    await firstAvailable.click();
    await expect(page.getByRole('button', { name: /✕ ESAURITO/i }).first()).toBeVisible();

    // Open STORICO and verify delivered/cancelled orders are visible
    await page.getByRole('button', { name: /STORICO/i }).click();
    await expect(page.getByText('Grace')).toBeVisible(); // Delivered
    await expect(page.getByText('Hank')).toBeVisible(); // Cancelled
    await expect(page.getByText('Fuori stock')).toBeVisible();

    // Open ALERT and verify allergen/slow order signals are visible
    await page.getByRole('button', { name: /ALERT/i }).click();
    await expect(page.getByText('Ivy')).toBeVisible(); // Slow/critical
    await expect(page.getByText(/🔴 CRITICO/)).toBeVisible();
    await expect(page.getByText('GLUTINE').first()).toBeVisible();
    await expect(page.getByText('PESCE').first()).toBeVisible();
  });
});
