import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

// Panini V2 esposti al cliente (item-001 / item-002 legacy sono nascosti nella UI cliente).
const PANINI_IDS = [
  'item-012', 'item-013', 'item-014',
  'item-015', 'item-016', 'item-017', 'item-032',
];

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

// La Home Kitchen (Figma Page 4) è la landing di /kitchen: il menu completo
// (tabs PANINI / PESI MASSIMI / CICCHETTI / INSALATONE / TARTARE) si apre
// con la CTA `ENTRA NEL MENU →`.
async function openFullMenu(page) {
  await page.getByRole('button', { name: /ENTRA NEL MENU/i }).click();
  await expect(page.getByRole('button', { name: /PANINI/i }).first()).toBeVisible();
}

// ENTRA NEL MENU porta alla schermata CATEGORIE (tile picker): gli assert a
// livello di prodotto (ESAURITO, banner esauriti, card) vivono nella LISTA,
// che si apre solo cliccando la tile della categoria.
async function openCategoryList(page, categoryName) {
  await openFullMenu(page);
  await page.getByRole('button', { name: new RegExp(categoryName, 'i') }).first().click();
}

// Gli 8 panini V2 hanno `price: null` (PREZZO IN ARRIVO, CTA disabilitata): l'unica
// categoria con prodotti ordinabili è PESI MASSIMI.
async function addFirstOrderableItem(page) {
  await page.getByRole('button', { name: /PESI MASSIMI/i }).click();
  await page.locator('.pm-card-closed').first().click();
  await page.getByRole('button', { name: 'LO VOGLIO' }).first().click();
}

// Il Sacco Pulito (2026-09-13): unica scelta obbligatoria nel drawer prima che "Invia ordine"
// sia cliccabile — il pagamento non si sceglie più qui, vive su /kitchen/status.
async function chooseFulfillment(page, fulfillment) {
  await page.getByTestId(`fulfillment-${fulfillment}`).click();
}

// kitchen_customer_create_order a 5 argomenti (20260913130000_kitchen_checkout_fulfillment_v1.sql)
// è "LOCAL BUILD ONLY — NOT APPLIED TO REMOTE" per decisione esplicita di questo task (NON: apply
// remoto). Questo ambiente E2E punta al progetto Supabase reale via .env.local, dove PostgREST non
// ha ancora la nuova overload in schema cache (PGRST202: "Could not find the function ... with
// parameters ... p_fulfillment_type ..."). La RPC va quindi mockata qui — stesso pattern già in uso
// per kitchen_promo_pass_redeem_for_order (test 18/19) — verificando anche che il client invii
// davvero p_fulfillment_type nel payload, non solo che l'ordine appaia creato lato UI.
async function mockCreateOrderRpc(page, { fulfillmentType, orderId = 'order-e2e-checkout-mock', orderCode = 'A01' } = {}) {
  const sent = { body: null };
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order', async (route) => {
    sent.body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: orderId,
        order_code: orderCode,
        venue_id: 'walrus-main',
        table_id: null,
        nickname: sent.body?.p_nickname ?? 'Eros',
        status: 'pending_counter_payment',
        total: 13.9,
        payment_status: 'pending_counter_payment',
        payment_method: null,
        fulfillment_type: fulfillmentType,
        service_day: new Date().toISOString().slice(0, 10),
        service_sequence: 1,
        created_at: new Date().toISOString(),
      }),
    });
  });
  // Il Sacco Pulito (2026-09-13) reindirizza sempre a /kitchen/status subito dopo la creazione,
  // il cui mount rilancia fetchSupabaseOrders() (useKitchenOrders.js:203-235) verso il progetto
  // Supabase reale: senza questo mock la select reale (dati di produzione, non legati a questo
  // test) sovrascriverebbe l'intero stato locale (`if (!data?.length) return` — un risultato
  // vuoto lascia invece invariato l'ordine appena creato via mock RPC, vedi riga 217-227).
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  return sent;
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

// SOLO SERVICE CONSOLIDATION GAP FIX (2026-09-07): /kitchen/entry (CustomerKitchenEntry.jsx) è un
// redirect di sola compatibilità verso /kitchen (Kitchen non ha più tavoli/asporto). Prima usava
// history.replaceState + un evento popstate sintetico, soggetto alla stessa race di blank-page già
// trovata e corretta su KitchenStaffRedirect.jsx: l'effect del redirect (figlio) può girare prima
// dell'effect di App.jsx che registra il listener "popstate" (genitore, montato dopo per via
// dell'ordine bottom-up degli effect React), lasciando l'evento senza ascoltatori e la pagina bianca
// sull'URL nuovo. Il fix (window.location.replace, navigazione reale) non dipende da quel listener.
// Questo test verifica il rendering reale della Home Kitchen dopo il redirect, non solo l'URL.
test('2b. /kitchen/entry redirects to /kitchen and renders the real Kitchen home', async ({ page }) => {
  await page.goto('/kitchen/entry');
  await expect(page).toHaveURL(/\/kitchen$/);
  await expect(page.getByRole('button', { name: /ENTRA NEL MENU/i })).toBeVisible({ timeout: 10000 });
});

test('3. Full Kitchen order uses customer identity from entry', async ({ page }) => {
  await page.goto('/entry');
  await page.getByPlaceholder('Es. 12').fill('12');
  await page.getByPlaceholder('Es. Marco').fill('Eros');
  await page.getByRole('button', { name: /ENTRA NEL WALBOX/i }).click();
  await expect(page).toHaveURL(/\/request/);

  await page.getByRole('button', { name: /Cibo/i }).click();
  await expect(page).toHaveURL(/\/kitchen/);

  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A02' });

  // Home → menu completo → primo prodotto ordinabile (Pesi Massimi)
  await openFullMenu(page);
  await addFirstOrderableItem(page);

  // Open cart bottom sheet via the floating pill
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();

  // Il Sacco Pulito (2026-09-13): fulfillment obbligatorio prima dell'invio, il pagamento no.
  await chooseFulfillment(page, 'eat_here');

  // Submit the order
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  // handleSubmit ora attende addOrder() (sessione anonima + tentativo RPC) prima di redirigere:
  // aspettare /kitchen/status è il segnale reale che l'ordine è stato scritto (fallback locale
  // incluso), invece di leggere localStorage a tempo fisso subito dopo il click.
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.getByText('IN ATTESA DI PAGAMENTO')).toBeVisible();

  // No-tables contract (2026-09-05): Kitchen non ha tavoli/asporto — invariato. Customer Checkout
  // V1 (2026-09-13) aggiunge fulfillment_type (eat_here/takeaway), ma nessun table/numero tavolo.
  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_ORDERS,
  );
  const latest = [...orders].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  )[0];
  expect(latest).toBeDefined();
  expect(latest.nickname).toBe('Eros');
  expect(latest.orderCode).toMatch(/^[A-Z]+\d{2}$/);
  expect(latest.table).toBeUndefined();
  expect(latest.fulfillmentType).toBe('eat_here');

  // Verifica diretta del payload inviato alla RPC (5 argomenti, no table_id/tavolo).
  expect(sent.body.p_fulfillment_type).toBe('eat_here');
  expect(sent.body.p_venue_id).toBe('walrus-main');
  expect('p_table_id' in sent.body).toBe(false);
});

test('3h. Invio ordine disabilitato finché "dove lo mangi" non è scelto', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();

  const submitBtn = page.getByTestId('submit-order-btn');
  await expect(submitBtn).toBeDisabled();

  await page.getByTestId('fulfillment-takeaway').click();
  await expect(submitBtn).toBeEnabled();
});

test('3i. Checkout takeaway: ordine creato con fulfillment_type=takeaway, redirect a /kitchen/status, resta pending_counter_payment', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'A03' });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'takeaway');
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  // Il Sacco Pulito (2026-09-13): destinazione post-ordine unica, sempre /kitchen/status —
  // nessuna schermata statica di conferma in-page, il pagamento (online o al banco) si sceglie lì.
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.locator('.kitch-confirm')).toHaveCount(0);

  expect(sent.body.p_fulfillment_type).toBe('takeaway');

  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_ORDERS,
  );
  const latest = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  expect(latest.fulfillmentType).toBe('takeaway');
  // Il pagamento (online o al banco) si sceglie solo su /kitchen/status: l'ordine resta
  // pending_counter_payment finché una conferma reale non lo avanza — nessun phantom success.
  expect(latest.status).toBe('pending_counter_payment');
  expect(latest.paymentStatus).toBe('pending_counter_payment');
});

// F02 (Phantom Order) invariato: se la RPC di creazione ordine fallisce, il cliente non deve mai
// essere redirezionato a /kitchen/status per un ordine che non esiste.
test('3k. RPC di creazione ordine fallita: nessun ordine fantasma, carrello resta intatto per il retry', async ({ page }) => {
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'internal_error' }) })
  );

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  await expect(page).not.toHaveURL(/\/kitchen\/status/);
  await expect(page.getByTestId('order-submit-error')).toBeVisible();
  // Il carrello resta intatto per il retry: il pulsante di invio è di nuovo cliccabile.
  await expect(page.getByRole('button', { name: /Invia ordine/i })).toBeEnabled();
});

test('3b. Sold-out item shows ESAURITO overlay and disabled ESAURITO CTA', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ 'item-014': false })),
    LS_MENU,
  );
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PANINI');

  await expect(page.getByText('ESAURITO').first()).toBeVisible();

  // La CTA disabilitata vive nella card EXPANDED (stesso pattern accordion di
  // Pesi Massimi): va aperta la card del panino esaurito per raggiungerla.
  await page.locator('.pn-card--soldout .pn-card-closed').click();
  const soldOutButton = page.locator('.pn-card--soldout .pn-btn-want');
  await expect(soldOutButton).toBeVisible();
  await expect(soldOutButton).toHaveText('ESAURITO');
  await expect(soldOutButton).toBeDisabled();
});

test('3c. Empty cart bar persists, disabled CTA, no drawer; refills after last item removed', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);

  // Empty state: bar visible with 0 count, €0,00 total, disabled CTA
  const addCta = page.getByRole('button', { name: 'AGGIUNGI QUALCOSA' });
  await expect(addCta).toBeVisible();
  await expect(addCta).toBeDisabled();
  await expect(page.getByText('0 ROBE NEL SACCO')).toBeVisible();
  await expect(page.getByText('€0,00')).toBeVisible();

  // Clicking the empty bar must not open the drawer
  await page.locator('.kitch-bottom-left').click();
  await expect(page.locator('.kitch-drawer')).toHaveCount(0);

  // Add a product: normal behavior
  await addFirstOrderableItem(page);
  await expect(page.getByRole('button', { name: "VAI ALL'ORDINE" })).toBeEnabled();

  // Remove the last product from the drawer
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  await expect(page.locator('.kitch-drawer')).toBeVisible();
  await page.getByRole('button', { name: '🗑️' }).first().click();

  // Back to persistent empty state, drawer closed
  await expect(page.locator('.kitch-drawer')).toHaveCount(0);
  const addCtaAfter = page.getByRole('button', { name: 'AGGIUNGI QUALCOSA' });
  await expect(addCtaAfter).toBeVisible();
  await expect(addCtaAfter).toBeDisabled();
  await expect(page.getByText('0 ROBE NEL SACCO')).toBeVisible();
  await expect(page.getByText('€0,00')).toBeVisible();
});

test('3e. All panini sold out: every CTA disabled, category still browsable, nothing addable to cart', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  // Tutti i panini (categoria attiva di default nel menu) impostati non disponibili
  await page.evaluate(
    ({ key, ids }) => localStorage.setItem(key, JSON.stringify(Object.fromEntries(ids.map((id) => [id, false])))),
    { key: LS_MENU, ids: PANINI_IDS },
  );
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PANINI');

  // Contratto visuale corrente (PaniniSection, no banner aggregato pre-Figma): ogni
  // card resta visibile e mostra il proprio badge ESAURITO sulla faccia chiusa.
  await expect(page.locator('.pn-card--soldout')).toHaveCount(PANINI_IDS.length);
  await expect(page.locator('.pn-card-closed .pn-card-open-cta', { hasText: 'ESAURITO' })).toHaveCount(PANINI_IDS.length);
  await expect(page.getByText('NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA')).not.toBeVisible();
  await expect(page.getByText('AL MOMENTO È TUTTO ESAURITO')).not.toBeVisible();

  // Requisito funzionale (di sicurezza, non solo visuale): la CTA add-to-cart di ogni
  // panino esaurito è disabilitata nel markup, non solo nascosta dall'accordion chiuso.
  await expect(page.locator('.pn-card--soldout .pn-btn-want:disabled')).toHaveCount(PANINI_IDS.length);

  // Aprendo ciascuna card esaurita e forzando il click sulla CTA disabilitata, nessun
  // panino deve finire nel carrello: un browser blocca il click nativo su un elemento
  // disabled, quindi questo verifica il comportamento reale, non solo l'attributo.
  const soldOutCards = await page.locator('.pn-card--soldout .pn-card-closed').all();
  for (const closedCard of soldOutCards) {
    await closedCard.click();
    const wantBtn = page.locator('.pn-card--open .pn-btn-want');
    await expect(wantBtn).toBeDisabled();
    await wantBtn.click({ force: true }).catch(() => {});
  }

  const addCta = page.getByRole('button', { name: 'AGGIUNGI QUALCOSA' });
  await expect(addCta).toBeVisible();
  await expect(addCta).toBeDisabled();
  await expect(page.getByText('0 ROBE NEL SACCO')).toBeVisible();
});

test('3f. Category with zero items shows "NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA"', async ({ page }) => {
  // Remap cicchetti items into birre so the CICCHETTI tab has zero items
  await page.route('**/src/data/kitchenMockData.js*', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const patched = body.replace(/category: "cicchetti"/g, 'category: "birre"');
    await route.fulfill({ response, body: patched, contentType: 'application/javascript' });
  });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await page.getByRole('button', { name: /CICCHETTI/i }).click();

  await expect(page.getByText('NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA')).toBeVisible();
  await expect(page.locator('.kitch-card')).toHaveCount(0);
  await expect(page.getByText('AL MOMENTO È TUTTO ESAURITO')).not.toBeVisible();
});

test('3g. Regression: normal category with available items shows no empty/sold-out messages', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PANINI');

  await expect(page.getByText('NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA')).not.toBeVisible();
  await expect(page.getByText('AL MOMENTO È TUTTO ESAURITO')).not.toBeVisible();
  // PANINI usa PaniniSection (.pn-card), non più la lista generica .kitch-card
  await expect(page.locator('.pn-card').first()).toBeVisible();
});

// ── Touch target sizes (mobile) ────────────────────────────────────

const TOUCH_TARGET_VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
];

for (const viewport of TOUCH_TARGET_VIEWPORTS) {
  test(`3d. Touch targets meet minimum hitbox at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/kitchen?table=12&nickname=Eros');
    await openFullMenu(page);
    await page.getByRole('button', { name: /PESI MASSIMI/i }).click();
    await page.locator('.pm-card-closed').first().click();

    // CTA `LO VOGLIO`: min-height 40
    const loVoglioBox = await page.getByRole('button', { name: 'LO VOGLIO' }).first().boundingBox();
    expect(loVoglioBox.height).toBeGreaterThanOrEqual(40);

    // Add item, then CTA `VAI ALL'ORDINE`: min-height 40
    await page.getByRole('button', { name: 'LO VOGLIO' }).first().click();
    const vaiBox = await page.getByRole('button', { name: "VAI ALL'ORDINE" }).boundingBox();
    expect(vaiBox.height).toBeGreaterThanOrEqual(40);

    // Open drawer
    await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
    await expect(page.locator('.kitch-drawer')).toBeVisible();

    // Drawer close: min 44x44
    const closeBox = await page.locator('.kitch-drawer-close').boundingBox();
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);

    // Qty buttons: min 36x36
    const qtyBoxes = await page.locator('.kitch-qty-btn').all();
    for (const btn of qtyBoxes) {
      const box = await btn.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(36);
      expect(box.height).toBeGreaterThanOrEqual(36);
    }

    // Trash button: min 40x40
    const trashBox = await page.locator('.kitch-trash-btn').first().boundingBox();
    expect(trashBox.width).toBeGreaterThanOrEqual(40);
    expect(trashBox.height).toBeGreaterThanOrEqual(40);
  });
}

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

test('4b. Back button on /kitchen/status meets 44x44 tap target on mobile viewports', async ({ page }) => {
  const orders = makeSeedOrder();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: orders },
  );

  const viewports = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/kitchen/status');

    const backBtn = page.locator('.ost-topbar-back').first();
    await expect(backBtn).toHaveAttribute('aria-label', 'Torna al menu');

    const box = await backBtn.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test('5. Staff dashboard shows Eros', async ({ page }) => {
  // GAP NOTO (STAFF UX CONSOLIDATION FASE 1, 2026-09-07): /kitchen/staff ora reindirizza a
  // /kitchen/solo, l'unica UI operativa. La coda live di Solo Service (KitchenSoloService.jsx)
  // mostra pero' solo orderCode + articoli nelle card (.kss-qcard-line1/-line2) e nel focus —
  // il nickname del cliente non e' mai renderizzato li' (verificato: `.nickname` compare in
  // KitchenSoloService.jsx solo dentro matchesSearch, mai in JSX). Il nickname resta visibile
  // solo negli overlay condivisi invariati (StoricoView/AlertView, es. test 11/16). Questo test
  // verificava specificamente la visibilita' del nickname nella vista live: non ha un
  // equivalente onesto oggi in Solo Service. Non e' un problema di selettori: e' informazione
  // che la UI non mostra piu' li'. Serve una decisione di prodotto (mostrare il nickname anche
  // in coda/focus, o confermare che l'orderCode basta per il banco) prima di poter migrare
  // questo test.
  test.skip(true, 'Solo Service non mostra il nickname nella coda/focus live — gap noto, serve decisione di prodotto');
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
// STAFF UX CONSOLIDATION FASE 1 (2026-09-07): /kitchen/staff ora reindirizza a /kitchen/solo,
// l'unica UI operativa. I test 7-17 sono stati riportati sul modello reale di Solo Service:
// un ordine alla volta in focus (selezionato via `.kss-qcard[data-order]`, l'orderCode del seed
// — il nickname non e' piu' mostrato in coda live, vedi test 5), azione consigliata via
// `next-action`, azioni secondarie (RITIRATO manuale, nota staff, annulla) nel menu ALTRO...
// (window.prompt nativo al posto dei modali CounterOrdersView), overlay MENU/STORICO/ALERT via
// i bottoni header (stessi componenti MenuView/StoricoView/AlertView, invariati).

test('7. Bancone confirma pagamento → status received', async ({ page }) => {
  // Il bottone principale next-action resta CONTANTI di default (invariato per compatibilità);
  // il percorso CARTA/POS (next-action-card) è coperto separatamente in
  // kitchen-service-pressure.spec.js test 2c/2d. Questo test copre solo CONTANTI: resta portabile 1:1.
  await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await page.locator('.kss-qcard[data-order="W99"]').click();
  await expect(page.getByTestId('focus-code')).toHaveText('W99');
  await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');
  await page.getByTestId('next-action').click();

  await expect(page.getByTestId('kpi-paga')).toHaveText('0');

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.paymentStatus).toBe('paid');
  expect(order.status).toBe('received');
});

test('8. Cucina prende in carico → status preparing', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'received' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await expect(page.getByTestId('focus-code')).toHaveText('W99');
  await expect(page.getByTestId('next-action')).toContainText('INIZIA');
  await page.getByTestId('next-action').click();
  await expect(page.locator('.kss-qcard[data-order="W99"]')).toContainText('IN PREPARAZIONE');

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('preparing');
});

test('9. Cucina marca pronto → status ready + KPI pronti', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'preparing' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await expect(page.getByTestId('next-action')).toContainText('PRONTO');
  await page.getByTestId('next-action').click();
  await expect(page.getByTestId('kpi-pronti')).toHaveText('1');

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('ready');
});

test('10. Bancone marca ritirato → status delivered', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'ready' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await expect(page.getByTestId('focus-code')).toHaveText('W99');
  await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
  await page.getByTestId('next-action').click();
  await expect(page.getByTestId('kpi-pronti')).toHaveText('0');
  await expect(page.locator('.kss-qcard[data-order="W99"]')).toHaveCount(0);

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').status).toBe('delivered');
});

test('11. Storico mostra ordine delivered con metriche', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'delivered', total: 4.0 })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  // Overlay STORICO: stesso StoricoView.jsx invariato, riusato identico da Team dashboard.
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
  await page.waitForURL('**/kitchen/solo');
  // Overlay MENU: stesso MenuView.jsx invariato, riusato identico da Team dashboard.
  await page.getByRole('button', { name: /^MENU$/ }).click();

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
  await page.waitForURL('**/kitchen/solo');

  // Solo Service non ha il modale con input + OK di CounterOrdersView: usa window.prompt
  // (askStaffNote, KitchenSoloService.jsx:361-365). Stessa capacita', meccanismo diverso.
  await page.locator('.kss-qcard[data-order="W99"]').click();
  page.once('dialog', (dialog) => dialog.accept('Allergia al glutine'));
  await page.getByRole('button', { name: /ALTRO/i }).click();
  await page.getByRole('button', { name: 'Aggiungi nota staff' }).click();

  await expect(page.getByText('Allergia al glutine')).toBeVisible();

  const orders = await readOrders(page);
  expect(orders.find((o) => o.id === 'order-qa-001').staffNote).toBe('Allergia al glutine');
});

test('14. Annulla ordine con motivo preset', async ({ page }) => {
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  // Solo Service non ha il modale MOTIVO ANNULLAMENTO (Fuori stock / Altro): usa window.prompt
  // con default 'Fuori stock' (askCancel, KitchenSoloService.jsx:354-359). dialog.accept() senza
  // argomento restituirebbe stringa vuota (falsy per askCancel): va passato esplicitamente il
  // default per confermarlo davvero.
  await page.locator('.kss-qcard[data-order="W99"]').click();
  let dialogDefault = '';
  page.once('dialog', (dialog) => { dialogDefault = dialog.defaultValue(); dialog.accept(dialogDefault); });
  await page.getByRole('button', { name: /ALTRO/i }).click();
  await page.getByRole('button', { name: 'Annulla ordine' }).click();

  expect(dialogDefault).toBe('Fuori stock');
  await expect(page.locator('.kss-qcard[data-order="W99"]')).toHaveCount(0);

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.status).toBe('cancelled');
  expect(order.cancelReason).toBe('Fuori stock');
});

test('15. Annulla con motivo personalizzato', async ({ page }) => {
  // Solo Service non distingue un motivo preset ("Fuori stock") da uno libero ("Altro" + testo):
  // il prompt e' sempre testo libero con quel default. Copre comunque la stessa capacita' reale
  // del test originale (annullare con un motivo diverso dal default).
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await page.locator('.kss-qcard[data-order="W99"]').click();
  page.once('dialog', (dialog) => dialog.accept('Cliente ha cambiato idea'));
  await page.getByRole('button', { name: /ALTRO/i }).click();
  await page.getByRole('button', { name: 'Annulla ordine' }).click();

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.status).toBe('cancelled');
  expect(order.cancelReason).toBe('Cliente ha cambiato idea');
});

test('16. Alert overlay mostra ordine urgente e allergeni attivi', async ({ page }) => {
  const urgentOrder = makeQAOrder({
    status: 'received',
    items: [{ itemId: 'item-001', name: 'Panino Porcheria Seria', quantity: 1, price: 8.5 }],
    total: 8.5,
    createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  });
  await seedOrders(page, [urgentOrder]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  // Overlay ALERT: stesso AlertView.jsx invariato, riusato identico da Team dashboard.
  await page.getByRole('button', { name: /ALERT/i }).click();

  await expect(page.getByText('URGENZA TEMPI')).toBeVisible();
  await expect(page.getByText(/🟠 LENTO/)).toBeVisible();
  await expect(page.getByText('ALLERGENI ATTIVI')).toBeVisible();
  // Scoped alla sezione overlay: lo stesso ordine e' anche in focus dietro l'overlay, il cui
  // pannello "ALLERGENI" (focus-allergeni) mostra lo stesso testo "Glutine, Pesce".
  const allergenSection = page.locator('.ksd-section', { hasText: 'ALLERGENI ATTIVI' });
  await expect(allergenSection.getByText('GLUTINE', { exact: true })).toBeVisible();
  await expect(allergenSection.getByText('PESCE', { exact: true })).toBeVisible();
});

test('17. Alert critico dopo 15 minuti', async ({ page }) => {
  const criticalOrder = makeQAOrder({
    status: 'received',
    createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
  });
  await seedOrders(page, [criticalOrder]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await page.getByRole('button', { name: /ALERT/i }).click();
  await expect(page.getByText(/🔴 CRITICO/)).toBeVisible();
});

// Personalità Discutibile Pass — Redemption V2, Opzione 2 (2026-09-10): il cliente inserisce il
// codice nel drawer carrello, non lo staff. `redeemPromo` chiama la stessa RPC già coperta da
// supabase/migrations/20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js — qui si
// verifica solo il wiring client (input → addOrder → redeemPromo → esito visibile), mockata via
// route come già fatto per i test staff-side rimossi da kitchen-solo-service.spec.js.
// Il Sacco Pulito (2026-09-13): il codice promo resta un campo collassato ("HO UN CODICE") nel
// drawer, invariato lato redeem (RPC chiamata dopo addOrder, mai prima). L'esito non è più
// mostrato da nessuna parte in questo task — la Promo Redemption UI su /kitchen/status è
// esplicitamente fuori scope (vedi ai-ops/reports/kitchen-customer-journey-ux-deep-dive.md P0-1) —
// quindi qui si verifica solo che il redeem parta con il codice giusto e che l'ordine si confermi
// comunque, non più un banner di successo/errore.
test('18. Cliente inserisce un codice promo valido: il redeem parte con il codice giusto, ordine confermato', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A05' });
  const promoSent = { body: null };
  await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', async (route) => {
    promoSent.body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promo_code: 'WALRUS-AB12C', discount_amount: 1.5, total: 13.5 }),
    });
  });

  await page.goto('/entry');
  await page.getByPlaceholder('Es. 12').fill('12');
  await page.getByPlaceholder('Es. Marco').fill('Eros');
  await page.getByRole('button', { name: /ENTRA NEL WALBOX/i }).click();
  await page.getByRole('button', { name: /Cibo/i }).click();
  await expect(page).toHaveURL(/\/kitchen/);

  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');

  await page.getByRole('button', { name: /HO UN CODICE/i }).click();
  await page.getByTestId('promo-code-input').fill('walrus-ab12c');
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(promoSent.body?.p_code).toBe('walrus-ab12c');
});

test('19. Cliente inserisce un codice promo non valido: ordine confermato comunque a prezzo pieno', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A06' });
  const promoSent = { body: null };
  await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', async (route) => {
    promoSent.body = route.request().postDataJSON();
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'promo_already_redeemed' }) });
  });

  await page.goto('/entry');
  await page.getByPlaceholder('Es. 12').fill('12');
  await page.getByPlaceholder('Es. Marco').fill('Eros');
  await page.getByRole('button', { name: /ENTRA NEL WALBOX/i }).click();
  await page.getByRole('button', { name: /Cibo/i }).click();
  await expect(page).toHaveURL(/\/kitchen/);

  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');

  await page.getByRole('button', { name: /HO UN CODICE/i }).click();
  await page.getByTestId('promo-code-input').fill('WALRUS-USED1');
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  // Un codice sbagliato non deve mai bloccare il cliente: l'ordine si conferma comunque.
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(promoSent.body?.p_code).toBe('WALRUS-USED1');
});

test('20. Krombacher (evening_only, BEER SPRINT V1 Fase E): CTA "SOLO LA SERA" prima delle 18:00, "LO VOGLIO" ordinabile dopo', async ({ page }) => {
  // Prima delle 18:00 locali: prezzo confermato (€6) ma servizio serale non attivo.
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BIRRE');

  const krombacherCard = page.locator('.br-card', { hasText: 'KROMBACHER PILS' });
  await expect(krombacherCard.getByText('SOLO LA SERA').first()).toBeVisible();
  const lockedCta = krombacherCard.locator('.br-btn-want');
  await expect(lockedCta).toHaveText('SOLO LA SERA');
  await expect(lockedCta).toBeDisabled();
  // Nessun formato inventato: "ALLA SPINA" resta il solo indicatore al posto del cl.
  await expect(krombacherCard.getByText('ALLA SPINA').first()).toBeVisible();

  // Dopo le 18:00 locali: servizio serale attivo, ordinabile a prezzo pieno.
  await page.clock.setFixedTime(new Date('2026-09-14T19:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BIRRE');

  const krombacherCardEvening = page.locator('.br-card', { hasText: 'KROMBACHER PILS' });
  const eveningCta = krombacherCardEvening.locator('.br-btn-want');
  await expect(eveningCta).toHaveText('LO VOGLIO');
  await expect(eveningCta).toBeEnabled();
  await expect(krombacherCardEvening.getByText('€6').first()).toBeVisible();

  await eveningCta.click();
  await expect(page.getByText('1 ROBA NEL SACCO')).toBeVisible();
  await expect(page.getByText('€6,00')).toBeVisible();
});

test('21. FALLO PESANTE (BEER SPRINT V1 Fase E): birra inclusa obbligatoria, prezzo combo invariato, Krombacher segue evening_only', async ({ page }) => {
  // Prima delle 18:00: le 6 bottiglie sono scegliibili, Krombacher è bloccata.
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');
  await page.locator('.pm-card-closed').first().click();

  const openCard = page.locator('.pm-card--open');
  const heavyCta = openCard.locator('.pm-btn-heavy');
  // Nessuna birra scelta: FALLO PESANTE resta disabilitato, nessun add silenzioso.
  await expect(heavyCta).toBeDisabled();
  await expect(heavyCta).toHaveText('FALLO PESANTE');
  // Prezzo del combo mostrato invariato prima ancora di scegliere la birra.
  await expect(openCard.locator('.pm-upsell-price')).toHaveText('€19');

  const krombacherPill = openCard.locator('.pm-beer-pill', { hasText: 'Krombacher Pils' });
  await expect(krombacherPill).toBeDisabled();
  await expect(krombacherPill).toContainText('SOLO LA SERA');

  await openCard.locator('.pm-beer-pill', { hasText: 'Keiler Helles' }).click();
  await expect(heavyCta).toBeEnabled();
  // Scegliere la birra non cambia il prezzo del combo.
  await expect(openCard.locator('.pm-upsell-price')).toHaveText('€19');

  await heavyCta.click();
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  await expect(page.locator('.kitch-drawer-row-name', { hasText: 'PULLED PORK — FALLO PESANTE · KEILER HELLES' })).toBeVisible();
  await expect(page.locator('.kitch-drawer-row-price', { hasText: '€19,00' })).toBeVisible();
  await page.getByRole('button', { name: '×' }).click();

  // Dopo le 18:00: Krombacher diventa selezionabile come le altre, stesso prezzo combo.
  await page.clock.setFixedTime(new Date('2026-09-14T19:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');
  await page.locator('.pm-card-closed').first().click();

  const eveningCard = page.locator('.pm-card--open');
  const eveningKrombacherPill = eveningCard.locator('.pm-beer-pill', { hasText: 'Krombacher Pils' });
  await expect(eveningKrombacherPill).toBeEnabled();
  await eveningKrombacherPill.click();
  const eveningHeavyCta = eveningCard.locator('.pm-btn-heavy');
  await expect(eveningHeavyCta).toBeEnabled();
  await expect(eveningCard.locator('.pm-upsell-price')).toHaveText('€19');

  await eveningHeavyCta.click();
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  await expect(page.locator('.kitch-drawer-row-name', { hasText: 'PULLED PORK — FALLO PESANTE · KROMBACHER PILS' })).toBeVisible();
  await expect(page.locator('.kitch-drawer-row-price', { hasText: '€19,00' })).toBeVisible();
});

// Nota di copertura: l'autorizzazione "cliente redime solo il proprio ordine, non quello di un
// altro" è applicata interamente lato RPC (gate SQL `is_staff_for_venue(...) OR
// v_order.customer_id = auth.uid()`), verificata staticamente in
// supabase/migrations/20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js. Non è
// verificabile via E2E in questo ambiente: manca un progetto Postgres/Supabase locale reale con
// due sessioni cliente distinte (nessun `supabase`/`docker` disponibile in questo sandbox), e la
// UI cliente non espone comunque alcun modo di scegliere un order_id arbitrario — chiama sempre
// e solo l'id dell'ordine appena creato da lei stessa (vedi handleSubmit sopra).
