// E2E REAL SUPABASE LOCAL HARNESS V1 — nessun mock della RPC kitchen_customer_create_order.
// Gira SOLO contro lo stack Supabase locale (vedi scripts/e2e-real-supabase-local.sh e
// playwright.real-local.config.js). I test mockati restano in tests/e2e/.
import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

test('REAL local order: create via UI, scrive kitchen_orders + kitchen_order_items', async ({ page }) => {
  expect(SUPABASE_URL, 'VITE_SUPABASE_URL deve essere locale').toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  expect(SERVICE_KEY, 'E2E_LOCAL_SERVICE_ROLE_KEY mancante').toBeTruthy();

  const nick = `E2E${Date.now().toString(36)}`;

  let rpcCalled = false;
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/rpc/kitchen_customer_create_order')) rpcCalled = true;
  });

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/kitchen?table=12&nickname=${nick}`);
  await page.getByRole('button', { name: /ENTRA NEL MENU/i }).click();
  await page.getByRole('button', { name: /PESI MASSIMI/i }).click();
  await page.locator('.pm-card-closed').first().click();
  await page.getByRole('button', { name: /AGGIUNGI SOLO PANINO/i }).first().click();
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await page.getByTestId('fulfillment-takeaway').click();
  await page.getByRole('button', { name: /Invia ordine/i }).click();
  await page.getByTestId('customer-name-input').fill(nick);
  await page.getByTestId('customer-name-continue').click();
  await expect(page).toHaveURL(/\/kitchen\/payment/, { timeout: 15000 });

  expect(rpcCalled, 'la RPC reale deve essere stata chiamata (nessun mock)').toBe(true);

  const orders = await rest(`kitchen_orders?nickname=eq.${encodeURIComponent(nick)}&select=*`);
  expect(orders).toHaveLength(1);
  const [order] = orders;
  expect(order.table_id, 'takeaway: nessun tavolo').toBeNull();
  expect(order.customer_id, 'ordine legato all\'utente anonimo').toBeTruthy();
  expect(Number(order.total)).toBeGreaterThan(0);

  const items = await rest(`kitchen_order_items?order_id=eq.${encodeURIComponent(order.id)}&select=*`);
  expect(items.length).toBeGreaterThan(0);
  const sum = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  expect(sum).toBeCloseTo(Number(order.total), 2);
  console.log(`[evidence] order=${order.id} code=${order.order_code} status=${order.status} total=${order.total} items=${items.length}`);
});
