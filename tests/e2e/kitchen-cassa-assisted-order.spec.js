import { test, expect } from '@playwright/test';

// MODALITÀ CASSA — ordine assistito staff (/kitchen/cassa).
//
// Gira sul config principale (VITE_E2E_BYPASS_STAFF_AUTH=true, vedi playwright.config.js): qui si
// verifica il FLUSSO, non il guard. Il guard reale (anonimo → /kitchen/login) è testato in
// f-sec-2-kitchen-guard.spec.js, che gira senza bypass.
//
// Le due RPC server sono mockate con lo stesso pattern già in uso in customer-kitchen-flow.spec.js
// (kitchen_customer_create_order non è ancora in schema cache sul progetto Supabase reale, e un
// incasso reale non va scritto da un test): si verifica anche il PAYLOAD inviato, non solo l'esito
// a schermo, così un cambio di contratto lato client fallisce qui invece che in serata.

const ORDER_ID = 'order-e2e-cassa-mock';
const ORDER_CODE = 'A07';

// Con VITE_E2E_BYPASS_STAFF_AUTH non esiste una sessione reale, quindi createOrderOnServer()
// (useKitchenOrders.js) apre una sessione con signInAnonymously() — una chiamata vera a
// /auth/v1/signup sul progetto Supabase reale, che sotto suite ripetute risponde
// "Request rate limit reached" e rende il test rosso per motivi di ambiente, non di prodotto
// (stesso flake già visibile su customer-kitchen-flow.spec.js). Qui la sessione viene mockata
// così il test resta deterministico e non consuma quota auth.
function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'e2e-anon-user', role: 'anon', is_anonymous: true, exp })}.sig`;
}

async function mockAnonymousAuth(page) {
  const token = fakeJwt();
  const body = JSON.stringify({
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: 'e2e-anon-user',
      aud: 'authenticated',
      role: 'authenticated',
      is_anonymous: true,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  });
  await page.route('**/auth/v1/signup*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body })
  );
  await page.route('**/auth/v1/token*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body })
  );
}

async function mockKitchenRpcs(page, { fulfillmentType = 'eat_here', total = 17.0 } = {}) {
  const sent = { create: null, payment: null };
  await mockAnonymousAuth(page);

  await page.route('**/rest/v1/rpc/kitchen_customer_create_order', async (route) => {
    sent.create = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: ORDER_ID,
        order_code: ORDER_CODE,
        venue_id: 'walrus-main',
        table_id: null,
        nickname: sent.create?.p_nickname ?? 'BANCO',
        status: 'pending_counter_payment',
        customer_note: sent.create?.p_customer_note ?? null,
        total,
        payment_status: 'pending_counter_payment',
        payment_method: null,
        fulfillment_type: sent.create?.p_fulfillment_type ?? fulfillmentType,
        service_day: new Date().toISOString().slice(0, 10),
        service_sequence: 7,
        created_at: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', async (route) => {
    sent.payment = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'pay-e2e-cassa-mock',
        order_id: ORDER_ID,
        venue_id: 'walrus-main',
        channel: 'counter',
        provider: sent.payment?.p_method === 'cash' ? 'cash' : 'manual',
        method: sent.payment?.p_method,
        direction: 'charge',
        status: 'succeeded',
        amount: total,
      }),
    });
  });

  // Il poll/realtime di useKitchenOrders legge kitchen_orders dal progetto reale: una risposta
  // vuota lascia intatto l'ordine appena creato via mock (useKitchenOrders.js, `if (!data?.length)
  // return`), evitando che dati di produzione sovrascrivano lo stato del test.
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );

  return sent;
}

// PESI MASSIMI: categoria con prezzi confermati e nessun gate orario (le birre `evening_only`
// dipendono dall'ora del device e non sono un buon soggetto per un test deterministico).
async function addTwoDifferentItems(page) {
  await page.getByTestId('cassa-tab-bbq').click();
  const items = page.locator('.kca-item:not(.kca-item--blocked)');
  await expect(items.first()).toBeVisible();
  await items.nth(0).click();
  await items.nth(0).click(); // stesso prodotto → quantità 2, non una seconda riga
  await items.nth(1).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('C1. La cassa monta con lo staff bypass e mostra il catalogo reale', async ({ page }) => {
  await page.goto('/kitchen/cassa');
  await expect(page.getByTestId('cassa-page')).toBeVisible();
  await expect(page.getByText('MODALITÀ CASSA')).toBeVisible();
  await expect(page.getByTestId('cassa-tab-panini')).toBeVisible();
  await expect(page.getByTestId('cassa-tab-birre')).toBeVisible();
});

test('C2. Composizione multi-item: quantità e totale coerenti con i prezzi del menu', async ({ page }) => {
  await page.goto('/kitchen/cassa');
  await addTwoDifferentItems(page);

  await expect(page.getByTestId('cassa-count')).toHaveText('3');

  // Il totale a schermo deve essere esattamente la somma prezzo × quantità delle righe mostrate.
  const expected = await page.evaluate(() =>
    [...document.querySelectorAll('.kca-line-price')]
      .reduce((sum, el) => sum + parseFloat(el.textContent.replace('€', '').trim()), 0)
  );
  await expect(page.getByTestId('cassa-total')).toHaveText(`€ ${expected.toFixed(2)}`);
});

test('C3. Meno/più sulla riga aggiornano quantità e totale', async ({ page }) => {
  await page.goto('/kitchen/cassa');
  await page.getByTestId('cassa-tab-bbq').click();
  const items = page.locator('.kca-item:not(.kca-item--blocked)');
  await items.first().click();
  const line = page.locator('[data-testid^="cassa-line-"]').first();
  const id = (await line.getAttribute('data-testid')).replace('cassa-line-', '');

  await page.getByTestId(`cassa-plus-${id}`).click();
  await expect(page.getByTestId(`cassa-qty-${id}`)).toHaveText('2');
  await page.getByTestId(`cassa-minus-${id}`).click();
  await expect(page.getByTestId(`cassa-qty-${id}`)).toHaveText('1');
  await page.getByTestId(`cassa-minus-${id}`).click();
  await expect(page.getByTestId('cassa-count')).toHaveText('0');
});

test('C4. CREA ORDINE resta bloccato finché QUI / PORTO VIA non è scelto', async ({ page }) => {
  await page.goto('/kitchen/cassa');
  await expect(page.getByTestId('cassa-create')).toBeDisabled(); // carrello vuoto

  await page.getByTestId('cassa-tab-bbq').click();
  await page.locator('.kca-item:not(.kca-item--blocked)').first().click();
  await expect(page.getByTestId('cassa-create')).toBeDisabled(); // nessun fulfillment scelto

  await page.getByTestId('cassa-fulfillment-eat_here').click();
  await expect(page.getByTestId('cassa-create')).toBeEnabled();
});

test('C5. CONTANTI: payload RPC corretto, ordine assistito marcato, codice mostrato allo staff', async ({ page }) => {
  const sent = await mockKitchenRpcs(page, { fulfillmentType: 'eat_here' });
  await page.goto('/kitchen/cassa');
  await addTwoDifferentItems(page);
  await page.getByTestId('cassa-note').fill('senza cipolla');
  await page.getByTestId('cassa-fulfillment-eat_here').click();
  await page.getByTestId('cassa-create').click();

  // Step incasso: l'ordine esiste già lato server, con il suo codice Axx.
  await expect(page.getByTestId('cassa-pay')).toBeVisible();
  await expect(page.getByTestId('cassa-code')).toHaveText(ORDER_CODE);

  // Creazione: nickname BANCO, marcatore assistito nella nota, fulfillment esplicito, 2 righe.
  expect(sent.create.p_venue_id).toBe('walrus-main');
  expect(sent.create.p_nickname).toBe('BANCO');
  expect(sent.create.p_customer_note).toContain('ORDINE ASSISTITO — SENZA APP');
  expect(sent.create.p_customer_note).toContain('senza cipolla');
  expect(sent.create.p_fulfillment_type).toBe('eat_here');
  expect(sent.create.p_items).toHaveLength(2);
  expect(sent.create.p_items[0].quantity).toBe(2);

  await page.getByTestId('cassa-pay-cash').click();

  await expect(page.getByTestId('cassa-done')).toBeVisible();
  await expect(page.getByTestId('cassa-code')).toHaveText(ORDER_CODE);
  await expect(page.getByText(/CONTANTI/)).toBeVisible();
  expect(sent.payment).toEqual({ p_order_id: ORDER_ID, p_method: 'cash' });
});

test('C6. POS: conferma esplicita obbligatoria e metodo card_counter_manual', async ({ page }) => {
  const sent = await mockKitchenRpcs(page, { fulfillmentType: 'takeaway' });
  await page.goto('/kitchen/cassa');
  await page.getByTestId('cassa-tab-bbq').click();
  await page.locator('.kca-item:not(.kca-item--blocked)').first().click();
  await page.getByTestId('cassa-fulfillment-takeaway').click();
  await page.getByTestId('cassa-create').click();
  await expect(page.getByTestId('cassa-pay')).toBeVisible();
  expect(sent.create.p_fulfillment_type).toBe('takeaway');

  // Dismiss: l'incasso NON deve essere registrato.
  page.once('dialog', (d) => d.dismiss());
  await page.getByTestId('cassa-pay-pos').click();
  await expect(page.getByTestId('cassa-pay')).toBeVisible();
  expect(sent.payment).toBeNull();

  // Accept: incasso registrato come carta/POS al banco.
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('cassa-pay-pos').click();
  await expect(page.getByTestId('cassa-done')).toBeVisible();
  expect(sent.payment).toEqual({ p_order_id: ORDER_ID, p_method: 'card_counter_manual' });
});

test('C7. Ordine pagato al banco entra nella coda di /kitchen/solo come DA PREPARARE', async ({ page }) => {
  await mockKitchenRpcs(page);
  await page.goto('/kitchen/cassa');
  await page.getByTestId('cassa-tab-bbq').click();
  await page.locator('.kca-item:not(.kca-item--blocked)').first().click();
  await page.getByTestId('cassa-fulfillment-eat_here').click();
  await page.getByTestId('cassa-create').click();
  await page.getByTestId('cassa-pay-cash').click();
  await expect(page.getByTestId('cassa-done')).toBeVisible();

  // Stessa coda, stesso lifecycle: nessuna seconda Kitchen.
  await page.getByRole('button', { name: /VAI ALLA CODA/i }).click();
  await expect(page).toHaveURL(/\/kitchen\/solo/);

  const card = page.locator(`[data-order="${ORDER_CODE}"]`);
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByTestId('focus-code')).toHaveText(ORDER_CODE);
  // Stato iniziale dopo l'incasso: pagato → DA PREPARARE (non più DA INCASSARE).
  await expect(page.getByText('DA PREPARARE').first()).toBeVisible();
  await expect(page.getByTestId('focus-fulfillment')).toHaveText('QUI');
  // Marcatore ordine assistito visibile allo staff nella card NOTE.
  await expect(page.getByText('ORDINE ASSISTITO — SENZA APP')).toBeVisible();
});

test('C8. Creazione fallita: nessun ordine fantasma, il carrello resta intatto', async ({ page }) => {
  await mockAnonymousAuth(page);
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) })
  );
  await page.goto('/kitchen/cassa');
  await page.getByTestId('cassa-tab-bbq').click();
  await page.locator('.kca-item:not(.kca-item--blocked)').first().click();
  await page.getByTestId('cassa-fulfillment-eat_here').click();
  await page.getByTestId('cassa-create').click();

  await expect(page.getByTestId('cassa-error')).toContainText('Ordine non creato');
  await expect(page.getByTestId('cassa-pay')).toHaveCount(0);
  await expect(page.getByTestId('cassa-count')).toHaveText('1');
});

test('C9. Tablet verticale 820×1180: catalogo e carrello usabili, nessuno scroll orizzontale', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await mockKitchenRpcs(page);
  await page.goto('/kitchen/cassa');
  await page.getByTestId('cassa-tab-bbq').click();
  await page.locator('.kca-item:not(.kca-item--blocked)').first().click();
  await expect(page.getByTestId('cassa-fulfillment-eat_here')).toBeVisible();
  await expect(page.getByTestId('cassa-create')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('C10. Da /kitchen/solo si raggiunge la cassa con un tocco', async ({ page }) => {
  await page.goto('/kitchen/solo');
  await page.getByTestId('go-cassa').click();
  await expect(page).toHaveURL(/\/kitchen\/cassa/);
  await expect(page.getByTestId('cassa-page')).toBeVisible();
});
