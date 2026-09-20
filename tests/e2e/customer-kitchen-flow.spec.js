import { test, expect } from '@playwright/test';

// Storage STAFF/CASSA: cache della lista ordini del locale. Usata solo dagli scenari staff
// (/kitchen/staff, /kitchen/solo); nessuna pagina cliente la legge piu'.
const LS_ORDERS = 'walbox_kitchen_orders_demo';
// Storage CLIENTE: solo gli ordini creati da QUESTO dispositivo (privacy client-side,
// 2026-09-16). E' la chiave che alimentano /kitchen, /kitchen/status e la CTA jukebox.
const LS_MY_ORDERS = 'walbox_kitchen_my_orders';
// P0 privacy (2026-09-16): registro degli ordini creati da QUESTO dispositivo — unica prova di
// proprieta' accettata da /kitchen/status (vedi scenari 25-29 in fondo al file).
const LS_OWNED_IDS = 'walbox_kitchen_my_order_ids';

async function seedOwnedOrderIds(page, ids) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_OWNED_IDS, data: ids },
  );
}

// Seed di un ordine gia' "di questo dispositivo": storage cliente + registro di proprieta',
// che e' esattamente cio' che il flusso reale scrive al submit.
async function seedMyOrders(page, orders) {
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_MY_ORDERS, data: orders },
  );
}

async function readMyOrders(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), LS_MY_ORDERS);
}

// Panini V2 esposti al cliente (i panini legacy pre-menu-attuale sono stati rimossi da
// kitchenMockData.js, cleanup 2026-09-15).
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
      items: [{ itemId: 'item-016', name: 'Walrus Smash Burger', quantity: 1, price: 9 }],
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

// Step nome cliente (2026-09-19): "Invia ordine" non crea piu' l'ordine — apre lo step
// "COME TI CHIAMI?". Il codice ordine nasce solo dopo CONTINUA.
async function submitOrder(page, name = 'Marco') {
  await page.getByRole('button', { name: /Invia ordine/i }).click();
  await page.getByTestId('customer-name-input').fill(name);
  await page.getByTestId('customer-name-continue').click();
}

// kitchen_customer_create_order a 5 argomenti (20260913130000_kitchen_checkout_fulfillment_v1.sql)
// è "LOCAL BUILD ONLY — NOT APPLIED TO REMOTE" per decisione esplicita di questo task (NON: apply
// remoto). Questo ambiente E2E punta al progetto Supabase reale via .env.local, dove PostgREST non
// ha ancora la nuova overload in schema cache (PGRST202: "Could not find the function ... with
// parameters ... p_fulfillment_type ..."). La RPC va quindi mockata qui — stesso pattern già in uso
// per kitchen_promo_pass_redeem_for_order (test 18/19) — verificando anche che il client invii
// davvero p_fulfillment_type nel payload, non solo che l'ordine appaia creato lato UI.
// Ogni creazione ordine passa da supabase.auth.signInAnonymously() (createOrderOnServer):
// sul progetto Supabase reale puntato da .env.local quella chiamata ha un rate limit orario per
// IP che una suite intera esaurisce, facendo fallire i test con "Request rate limit reached" per
// motivi ambientali e non di prodotto. La sessione anonima viene quindi mockata insieme al resto
// del data layer gia' mockato in questi test; il client fa comunque la sua richiesta di login.
async function mockAnonymousSession(page) {
  const userId = '11111111-1111-1111-1111-111111111111';
  const expiresIn = 3600;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const accessToken = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: userId, aud: 'authenticated', role: 'authenticated',
      iat: nowSeconds, exp: nowSeconds + expiresIn, is_anonymous: true,
      session_id: '22222222-2222-2222-2222-222222222222',
    }),
    'e2e-not-a-real-signature',
  ].join('.');
  const user = {
    id: userId, aud: 'authenticated', role: 'authenticated', email: '', phone: '',
    is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await page.route('**/auth/v1/signup*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: expiresIn,
        expires_at: nowSeconds + expiresIn,
        refresh_token: 'e2e-refresh-token',
        user,
      }),
    })
  );
}

async function mockCreateOrderRpc(page, { fulfillmentType, orderId = 'order-e2e-checkout-mock', orderCode = 'A01' } = {}) {
  await mockAnonymousSession(page);
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

// Cleanup Kitchen-only (2026-09-21): il ponte Jukebox /entry → /request → CTA "Cibo" non esiste
// piu' (rimosso in 5400b5e, vedi ai-ops/reports/kitchen-clean-baseline-v2-phase-a-cleanup-regression-audit.md).
// La radice "/" e' ora il solo entry point nativo cliente (CustomerKitchenEntry, redirect reale a
// /kitchen) e non richiede nessuna identita' pregressa: nickname/table non vengono piu' preservati
// tra pagine, sono catturati inline dallo step nome nativo al momento dell'ordine (vedi test 3).
test('1. Root entry point (/) redirects to /kitchen and renders the Kitchen home', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/kitchen$/);
  await expect(page.getByRole('button', { name: /ENTRA NEL MENU/i })).toBeVisible({ timeout: 10000 });
});

test('2. /kitchen is reachable directly as the native entry point, no Jukebox bridge needed', async ({ page }) => {
  await page.goto('/kitchen');
  await expect(page.getByRole('button', { name: /ENTRA NEL MENU/i })).toBeVisible();
  await openFullMenu(page);
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i })).toBeVisible();
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

test('3. Full Kitchen order uses customer identity from the native name step', async ({ page }) => {
  await page.goto('/kitchen');

  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A02' });

  // Home → menu completo → primo prodotto ordinabile (Pesi Massimi)
  await openFullMenu(page);
  await addFirstOrderableItem(page);

  // Open cart bottom sheet via the floating pill
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();

  // Il Sacco Pulito (2026-09-13): fulfillment obbligatorio prima dell'invio, il pagamento no.
  await chooseFulfillment(page, 'eat_here');

  // Submit the order — nickname fornito qui, allo step nome nativo (non più precompilato via /entry).
  await submitOrder(page, 'Eros');

  // handleSubmit ora attende addOrder() (sessione anonima + tentativo RPC) prima di redirigere:
  // aspettare /kitchen/payment è il segnale reale che l'ordine è stato scritto (fallback locale
  // incluso), invece di leggere localStorage a tempo fisso subito dopo il click. Follow-up UX
  // (2026-09-18): la destinazione post-ordine è ora la pagina pagamento dedicata, non più
  // /kitchen/status direttamente — CONFERMA ORDINE → PAGINA PAGAMENTO → STATUS.
  await expect(page).toHaveURL(/\/kitchen\/payment/);
  await expect(page.getByTestId('ost-payment-fork')).toBeVisible();
  await page.getByTestId('ost-pay-counter').click();
  await page.getByTestId('opay-go-status').click();

  await expect(page).toHaveURL(/\/kitchen\/status/);
  // 'IN ATTESA DI PAGAMENTO' compare in banner + bottom bar: si ancora al banner di stato,
  // l'unico che rappresenta lo stato dell'ordine mostrato.
  await expect(page.locator('.ost-status-banner-label')).toHaveText('IN ATTESA DI PAGAMENTO');
  // P0 privacy (2026-09-16): /kitchen/status mostra l'ordine appena inviato da QUESTO device,
  // non l'ordine piu' recente del locale (i demo orders Gamba Lunga/IlCapo/... sono in
  // localStorage ma non sono di questo cliente).
  await expect(page.getByText('IlCapo')).toHaveCount(0);
  // Nickname vive nel dettaglio espandibile del riquadro compatto (follow-up UX 2026-09-18).
  await page.locator('.ost-detail-toggle').click();
  await expect(page.locator('.ost-info-value--orange')).toHaveText('Eros');

  // No-tables contract (2026-09-05): Kitchen non ha tavoli/asporto — invariato. Customer Checkout
  // V1 (2026-09-13) aggiunge fulfillment_type (eat_here/takeaway), ma nessun table/numero tavolo.
  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_MY_ORDERS,
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

test('3i. Checkout takeaway: ordine creato con fulfillment_type=takeaway, redirect a /kitchen/payment, resta pending_counter_payment', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'A03' });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'takeaway');
  await submitOrder(page);

  // Follow-up UX (2026-09-18): destinazione post-ordine unica, sempre la pagina pagamento
  // dedicata — nessuna schermata statica di conferma in-page, il pagamento (online o al banco)
  // si sceglie lì.
  await expect(page).toHaveURL(/\/kitchen\/payment/);
  await expect(page.locator('.kitch-confirm')).toHaveCount(0);

  expect(sent.body.p_fulfillment_type).toBe('takeaway');

  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_MY_ORDERS,
  );
  const latest = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  expect(latest.fulfillmentType).toBe('takeaway');
  // Il pagamento (online o al banco) si sceglie solo su /kitchen/status: l'ordine resta
  // pending_counter_payment finché una conferma reale non lo avanza — nessun phantom success.
  expect(latest.status).toBe('pending_counter_payment');
  expect(latest.paymentStatus).toBe('pending_counter_payment');
});

// F02 (Phantom Order) invariato: se la RPC di creazione ordine fallisce, il cliente non deve mai
// essere redirezionato alla pagina pagamento per un ordine che non esiste.
test('3k. RPC di creazione ordine fallita: nessun ordine fantasma, carrello resta intatto per il retry', async ({ page }) => {
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'internal_error' }) })
  );

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await submitOrder(page);

  await expect(page).not.toHaveURL(/\/kitchen\/payment/);
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

// Test 4 storico ("Kitchen status → Jukebox bridge preserves table") rimosso: la card
// Jukebox su /kitchen/status è stata tolta per decisione approvata (follow-up UX 2026-09-18,
// "Rimuovi dal customer order flow la card Jukebox... né nella vista status ordini attivi").
// Il ponte Jukebox non esiste più (cleanup 2026-09-21): il banner nativo "ordine attivo" di
// /kitchen → /kitchen/status resta coperto dal test 6.

test('4b. Back button on /kitchen/status meets 44x44 tap target on mobile viewports', async ({ page }) => {
  const orders = makeSeedOrder();
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_MY_ORDERS, data: orders },
  );
  // Come nel test 4: l'ordine seedato deve risultare di questo dispositivo, altrimenti la
  // pagina mostra (correttamente) l'empty state e non c'e' nessuna card da misurare.
  await seedOwnedOrderIds(page, [orders[0].id]);

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

// Cleanup Kitchen-only (2026-09-21): la CTA "Segui ordine" viveva nell'hub Jukebox
// (CustomerRequest.jsx, rimosso in 5400b5e). L'equivalente nativo e piu' recente e' gia' dentro
// CustomerKitchenMenu.jsx (righe ~607-625, banner sticky "HAI UN ORDINE ATTIVO"), introdotto nel
// cleanup cliente del 2026-09-18 — stessa fonte dati (LS_MY_ORDERS + registro di proprieta'),
// stesso comportamento, scope cliente corretto.
test('6. Kitchen home shows the active order banner when an active kitchen order exists', async ({ page }) => {
  const orders = makeSeedOrder();
  await seedMyOrders(page, orders);
  await seedOwnedOrderIds(page, [orders[0].id]);

  await page.goto('/kitchen');

  await expect(page.getByRole('button', { name: /HAI UN ORDINE ATTIVO/i })).toBeVisible();

  await page.getByRole('button', { name: /HAI UN ORDINE ATTIVO/i }).click();
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
    items: [{ itemId: 'item-058', name: 'Patatine da Banco', quantity: 1, price: 4.0 }],
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

// Come per kitchen_payment_record_counter nel test 7: l'annullamento è RPC-autoritativo
// (`cancelOrder`, useKitchenOrders.js — lo stato locale diventa 'cancelled' solo se il server
// conferma, mai ottimisticamente). Gli ordini di questi test sono fixture seedate in
// localStorage e non esistono nel progetto Supabase reale puntato da .env.local, quindi la RPC
// vera risponde 400 `order_not_found` e il test misurerebbe quello, non la UI di Solo Service.
// Il mock restituisce la riga come farebbe il server, riflettendo il motivo davvero inviato.
async function mockCancelOrderRpc(page) {
  await page.route('**/rest/v1/rpc/kitchen_order_cancel', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: body?.p_order_id,
        status: 'cancelled',
        cancel_reason: body?.p_reason ?? null,
        cancelled_at: new Date().toISOString(),
      }),
    });
  });
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
  await mockCancelOrderRpc(page);
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
  await mockCancelOrderRpc(page);
  await seedOrders(page, [makeQAOrder({ status: 'pending_counter_payment' })]);
  await page.goto('/kitchen/staff');
  await page.waitForURL('**/kitchen/solo');

  await page.locator('.kss-qcard[data-order="W99"]').click();
  page.once('dialog', (dialog) => dialog.accept('Cliente ha cambiato idea'));
  await page.getByRole('button', { name: /ALTRO/i }).click();
  await page.getByRole('button', { name: 'Annulla ordine' }).click();

  // L'annullamento passa dalla RPC (await) prima di toccare lo stato locale: la scomparsa della
  // card e' il segnale che la conferma server e' arrivata. Senza, localStorage viene letto
  // mentre la RPC e' ancora in volo.
  await expect(page.locator('.kss-qcard[data-order="W99"]')).toHaveCount(0);

  const orders = await readOrders(page);
  const order = orders.find((o) => o.id === 'order-qa-001');
  expect(order.status).toBe('cancelled');
  expect(order.cancelReason).toBe('Cliente ha cambiato idea');
});

test('16. Alert overlay mostra ordine urgente e allergeni attivi', async ({ page }) => {
  // item-016 (Wraptor, glutine) + item-025 (Salmon, pesce): nessun item corrente porta
  // glutine+pesce insieme (vedi kitchenMockData.js), servono due righe per riprodurre lo
  // stesso "Glutine, Pesce" atteso dal test.
  const urgentOrder = makeQAOrder({
    status: 'received',
    items: [
      { itemId: 'item-016', name: 'Panino Porcheria Seria', quantity: 1, price: 8.0 },
      { itemId: 'item-025', name: 'Salmon', quantity: 1, price: 12.0 },
    ],
    total: 20.0,
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

  await page.goto('/kitchen');

  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');

  await page.getByRole('button', { name: /HO UN CODICE/i }).click();
  await page.getByTestId('promo-code-input').fill('walrus-ab12c');
  await submitOrder(page);

  await expect(page).toHaveURL(/\/kitchen\/payment/);
  expect(promoSent.body?.p_code).toBe('walrus-ab12c');
});

test('19. Cliente inserisce un codice promo non valido: ordine confermato comunque a prezzo pieno', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A06' });
  const promoSent = { body: null };
  await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', async (route) => {
    promoSent.body = route.request().postDataJSON();
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'promo_already_redeemed' }) });
  });

  await page.goto('/kitchen');

  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');

  await page.getByRole('button', { name: /HO UN CODICE/i }).click();
  await page.getByTestId('promo-code-input').fill('WALRUS-USED1');
  await submitOrder(page);

  // Un codice sbagliato non deve mai bloccare il cliente: l'ordine si conferma comunque.
  await expect(page).toHaveURL(/\/kitchen\/payment/);
  expect(promoSent.body?.p_code).toBe('WALRUS-USED1');
});

test('20. Krombacher (evening_only): CTA "SOLO LA SERA" prima delle 18:00, "LO VOGLIO" a €5,00 dopo', async ({ page }) => {
  // Prima delle 18:00 locali: prezzo confermato (€5, 2026-09-19) ma servizio serale non attivo.
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BIRRE');

  // BIRRA UNICA (2026-09-19): le 6 bottiglie Keiler/Lupulus sono nascoste al menu cliente,
  // resta la sola Krombacher. Se tornano a menu, questo assert va aggiornato insieme a
  // CUSTOMER_HIDDEN_ITEM_IDS.
  await expect(page.locator('.br-card')).toHaveCount(1);
  await expect(page.getByText('KEILER')).toHaveCount(0);

  const krombacherCard = page.locator('.br-card', { hasText: 'KROMBACHER PILS' });
  await expect(krombacherCard.getByText('SOLO LA SERA').first()).toBeVisible();
  // Nessun formato inventato: "ALLA SPINA" resta il solo indicatore al posto del cl.
  await expect(krombacherCard.getByText('ALLA SPINA').first()).toBeVisible();

  // MENU POLISH SPRINT (2026-09-16): le card birra sono accordion. La CTA d'ordine
  // vive nell'EXPANDED, quindi va aperta la card prima di verificarla.
  await krombacherCard.locator('.br-card-closed').click();
  await expect(krombacherCard).toHaveClass(/br-card--open/);
  // Storytelling approvato visibile solo da aperta.
  await expect(krombacherCard.getByText('Una Pils dritta e senza complicazioni', { exact: false })).toBeVisible();
  const lockedCta = krombacherCard.locator('.br-btn-want');
  await expect(lockedCta).toHaveText('SOLO LA SERA');
  await expect(lockedCta).toBeDisabled();

  // Dopo le 18:00 locali: servizio serale attivo, ordinabile a prezzo pieno.
  await page.clock.setFixedTime(new Date('2026-09-14T19:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BIRRE');

  const krombacherCardEvening = page.locator('.br-card', { hasText: 'KROMBACHER PILS' });
  await krombacherCardEvening.locator('.br-card-closed').click();
  await expect(krombacherCardEvening).toHaveClass(/br-card--open/);
  const eveningCta = krombacherCardEvening.locator('.br-btn-want');
  await expect(eveningCta).toHaveText('LO VOGLIO');
  await expect(eveningCta).toBeEnabled();
  await expect(krombacherCardEvening.getByText('€5').first()).toBeVisible();

  await eveningCta.click();
  await expect(page.getByText('1 ROBA NEL SACCO')).toBeVisible();
  await expect(page.getByText('€5,00')).toBeVisible();
});

test('21. FALLO PESANTE (composizione fissa 2026-09-19): niente scelta birra, copy corretta, gate serale, prezzo combo invariato', async ({ page }) => {
  // Prima delle 18:00: il combo include Krombacher, che e' `evening_only` → non ordinabile.
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');
  await page.locator('.pm-card-closed').first().click();

  const openCard = page.locator('.pm-card--open');
  const heavyCta = openCard.locator('.pm-btn-heavy');

  // Copy approvata: titolo + cosa c'e' dentro. Nessun "PANINO + BIRRA" generico.
  await expect(openCard.locator('.pm-upsell-title')).toHaveText('FALLO PESANTE');
  await expect(openCard.locator('.pm-upsell-sub')).toHaveText('Patate al forno + Krombacher Pils');

  // Nessuna selezione birra residua: niente pill, niente dettaglio, niente "SCEGLI QUESTA BIRRA".
  await expect(openCard.locator('.pm-beer-pill')).toHaveCount(0);
  await expect(openCard.locator('.pm-beer-detail')).toHaveCount(0);
  await expect(openCard.locator('.pm-beer-chosen')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'SCEGLI QUESTA BIRRA' })).toHaveCount(0);

  // Gate serale ereditato dalla birra inclusa, con il motivo scritto sulla CTA.
  await expect(heavyCta).toBeDisabled();
  await expect(heavyCta).toHaveText('SOLO LA SERA');
  // Prezzo del combo invariato rispetto a prima del cambio.
  await expect(openCard.locator('.pm-upsell-price')).toHaveText('€19');

  // Dopo le 18:00: ordinabile in un solo tap, stesso prezzo.
  await page.clock.setFixedTime(new Date('2026-09-14T19:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');
  await page.locator('.pm-card-closed').first().click();

  const eveningCard = page.locator('.pm-card--open');
  const eveningHeavyCta = eveningCard.locator('.pm-btn-heavy');
  await expect(eveningHeavyCta).toBeEnabled();
  await expect(eveningHeavyCta).toHaveText('FALLO PESANTE');
  await expect(eveningCard.locator('.pm-upsell-price')).toHaveText('€19');

  await eveningHeavyCta.click();
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  // La riga carrello porta la birra inclusa: e' cio' che finisce sulla comanda (P0-2).
  const krombacherRow = page.locator('.kitch-drawer-row', { hasText: 'PULLED PORK — FALLO PESANTE · KROMBACHER PILS' });
  await expect(krombacherRow.locator('.kitch-drawer-row-name')).toHaveText('PULLED PORK — FALLO PESANTE · KROMBACHER PILS');
  await expect(krombacherRow.locator('.kitch-drawer-row-price')).toHaveText('€19,00');
});

test('21b. CONTORNI (2026-09-19): Patate al Forno ordinabile come item singolo a €5,00', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'CONTORNI');

  const patate = page.locator('.kitch-card', { hasText: 'PATATE AL FORNO' });
  await expect(patate).toHaveCount(1);
  await expect(patate.locator('.kitch-card-price')).toHaveText('€5,00');

  const cta = patate.getByRole('button', { name: 'LO VOGLIO' });
  await expect(cta).toBeEnabled();
  await cta.click();

  await expect(page.getByText('1 ROBA NEL SACCO')).toBeVisible();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('€5,00');
});

// Nota di copertura: l'autorizzazione "cliente redime solo il proprio ordine, non quello di un
// altro" è applicata interamente lato RPC (gate SQL `is_staff_for_venue(...) OR
// v_order.customer_id = auth.uid()`), verificata staticamente in
// supabase/migrations/20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js. Non è
// verificabile via E2E in questo ambiente: manca un progetto Postgres/Supabase locale reale con
// due sessioni cliente distinte (nessun `supabase`/`docker` disponibile in questo sandbox), e la
// UI cliente non espone comunque alcun modo di scegliere un order_id arbitrario — chiama sempre
// e solo l'id dell'ordine appena creato da lei stessa (vedi handleSubmit sopra).

// ─────────────────────────────────────────────────────────────────────────────
// MENU POLISH SPRINT (2026-09-16) — TAGLIERI · BOX · BEVANDE
// ─────────────────────────────────────────────────────────────────────────────

test('22. TAGLIERI (MENU POLISH SPRINT): accordion coerente con Panini — storytelling, ingredienti e allergeni solo da aperta, CTA "VEDI IL TAGLIERE"', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  // Tab label = 'TAGLIERI' (MENU_CATEGORIES), la category key resta 'tagliere'.
  await openCategoryList(page, 'TAGLIERI');

  // Le 3 voci sono nella sezione dedicata, non più nel fallback generico `kitch-menu-list`.
  await expect(page.locator('.tg-card')).toHaveCount(3);
  await expect(page.locator('.kitch-menu-list')).toHaveCount(0);

  const salumi = page.locator('.tg-card', { hasText: 'SALUMI SERISSIMI' });
  // CLOSED: mai "VEDI IL PANINO" — non sono panini.
  await expect(salumi.locator('.tg-card-open-cta')).toHaveText(/VEDI IL TAGLIERE/);
  await expect(salumi.locator('.tg-card-closed-body .tg-card-price')).toHaveText('€8');
  await expect(salumi).not.toHaveClass(/tg-card--open/);

  await salumi.locator('.tg-card-closed').click();
  await expect(salumi).toHaveClass(/tg-card--open/);
  // Storytelling approvato + riga ingredienti tecnica, visibili solo da aperta.
  await expect(salumi.locator('.tg-card-microcopy')).toContainText('Serissimi solo nel nome');
  await expect(salumi.locator('.tg-card-ingredients')).toHaveText('Crudo, lardo, mortadella, speck.');
  await expect(salumi.locator('.tg-btn-want')).toBeEnabled();

  // Una sola card aperta alla volta (stessa regola di Panini/Pesi Massimi).
  const formaggi = page.locator('.tg-card', { hasText: 'FORMAGGI DISCUTIBILI' });
  await formaggi.locator('.tg-card-closed').click();
  await expect(formaggi).toHaveClass(/tg-card--open/);
  await expect(salumi).not.toHaveClass(/tg-card--open/);
  // Gli allergeni del tagliere formaggi restano esposti nell'EXPANDED.
  await expect(formaggi.getByText('LATTE', { exact: false }).first()).toBeVisible();

  // L'ordine finisce nel carrello col nome reale del tagliere.
  await formaggi.locator('.tg-btn-want').click();
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  await expect(page.locator('.kitch-drawer-row-name', { hasText: 'FORMAGGI DISCUTIBILI' })).toBeVisible();
});

test('23. Box Pulled Pork (MENU POLISH SPRINT): copy "VEDI IL BOX" / "SOLO BOX", i panini smoked restano su "VEDI IL PANINO"', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const box = page.locator('.pm-card', { hasText: 'BOX PULLED PORK' });
  await expect(box.locator('.pm-card-open-cta')).toHaveText('VEDI IL BOX');

  await box.locator('.pm-card-closed').click();
  await expect(box.locator('.pm-price-note')).toHaveText('SOLO BOX');
  // Nessun upsell FALLO PESANTE sul box (non ha entry in kitchenPesiMassimiCombos).
  await expect(box.locator('.pm-btn-heavy')).toHaveCount(0);

  // Fallback invariato sugli altri item bbq: nessun id hardcoded nel componente.
  const panino = page.locator('.pm-card', { hasText: 'PULLED PORK' }).filter({ hasNotText: 'BOX' }).first();
  await expect(panino.locator('.pm-card-open-cta')).toHaveText('VEDI IL PANINO');
});

test('24. BEVANDE (MENU POLISH SPRINT): sezione dedicata non-accordion, nessuna foto rotta, nessun formato inventato', async ({ page }) => {
  const missing404 = [];
  page.on('response', (res) => {
    if (res.status() === 404 && res.url().includes('/assets/kitchen/menu/bevande/')) {
      missing404.push(res.url());
    }
  });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BEVANDE');

  // 6 card nella sezione dedicata, nessun fallback `kitch-menu-list`.
  await expect(page.locator('.bv-card')).toHaveCount(6);
  await expect(page.locator('.kitch-menu-list')).toHaveCount(0);

  // Non-accordion: tutta l'anatomia è già visibile, nessuna CTA "VEDI ..." da aprire.
  await expect(page.getByText(/VEDI LA BEVANDA|VEDI IL PANINO/)).toHaveCount(0);

  const acqua = page.locator('.bv-card', { hasText: 'ACQUA' });
  await expect(acqua.locator('.bv-card-format')).toHaveText('0,5 L');
  await expect(acqua.locator('.bv-card-price')).toHaveText('€1');
  await expect(acqua.locator('.bv-btn-want')).toHaveText('LO VOGLIO');

  // Pepsi: il formato sta nella sua riga, non ripetuto nel titolo.
  const pepsi = page.locator('.bv-card', { hasText: 'PEPSI' }).first();
  await expect(pepsi.locator('.bv-card-name')).toHaveText('PEPSI');
  await expect(pepsi.locator('.bv-card-format')).toHaveText('33 CL');

  // Formato non confermato → riga vuota, mai un cl inventato.
  const tonica = page.locator('.bv-card', { hasText: 'SCHWEPPES TONICA' });
  await expect(tonica.locator('.bv-card-format')).toHaveText('');
  await expect(tonica.locator('.bv-card-price')).toHaveText('€4');

  // Batch fotografico importato (2026-09-16): 6 <img> reali, nessun placeholder residuo,
  // nessun 404. `naturalWidth > 0` e' l'unica prova che il file e' stato decodificato
  // davvero: un <img> con src rotto resta nel DOM e passerebbe un toHaveCount().
  await expect(page.locator('.bv-card-photo')).toHaveCount(6);
  await expect(page.locator('.bv-card-photo-placeholder')).toHaveCount(0);

  const photos = await page.locator('.bv-card-photo').evaluateAll((imgs) =>
    imgs.map((img) => ({
      src: new URL(img.getAttribute('src'), location.origin).pathname,
      decoded: img.complete && img.naturalWidth > 0,
    }))
  );
  expect(photos.every((p) => p.decoded)).toBe(true);
  expect(photos.map((p) => p.src)).toEqual([
    '/assets/kitchen/menu/bevande/bevanda_acqua.webp',
    '/assets/kitchen/menu/bevande/bevanda_pepsi.webp',
    '/assets/kitchen/menu/bevande/bevanda_pepsi_zero.webp',
    '/assets/kitchen/menu/bevande/bevanda_seven_up.webp',
    '/assets/kitchen/menu/bevande/bevanda_schweppes_lemon.webp',
    '/assets/kitchen/menu/bevande/bevanda_schweppes_tonica.webp',
  ]);
  expect(missing404).toEqual([]);

  // L'ordine usa il nome reale (`name`), non il `displayName` della card.
  await pepsi.locator('.bv-btn-want').click();
  await page.getByRole('button', { name: "VAI ALL'ORDINE" }).click();
  await expect(page.locator('.kitch-drawer-row-name', { hasText: 'PEPSI 33CL' })).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════
// P0 PRIVACY — ordini cliente su /kitchen/status  (scenari 25–28)
// ═══════════════════════════════════════════════════════════════════
// Regressione coperta (audit ai-ops/reports/final-release-sprint-18-09.md): senza sessione
// valida la pagina cadeva su `orders[0]` / sull'ordine piu' recente del locale / sul match per
// nickname-tavolo, mostrando nickname, piatti, totale e note di un cliente qualunque.
// Regola oggi: e' visibile solo cio' che questo dispositivo ha davvero ordinato
// (`walbox_kitchen_my_order_ids`).

// /kitchen/status monta useKitchenOrders, che legge da Supabase TUTTI gli ordini del locale.
// Nei test di privacy quella select va neutralizzata, altrimenti l'esito dipenderebbe dai dati
// di produzione del momento: la "lista ordini del locale" arriva solo dal seed localStorage.
async function mockVenueOrdersSelect(page) {
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
}

function minutesAgoIso(n) {
  return new Date(Date.now() - n * 60000).toISOString();
}

function makeOtherCustomerOrder(overrides = {}) {
  return {
    id: 'order-altrui-1',
    orderCode: 'Z99',
    nickname: 'Pirata',
    items: [{ itemId: 'item-058', name: 'Patate al Forno', quantity: 1, price: 5.0 }],
    total: 5.0,
    status: 'received',
    createdAt: minutesAgoIso(2),
    note: 'Nota privata di un altro cliente.',
    ...overrides,
  };
}

test('25. P0 privacy: browser pulito su /kitchen/status non mostra nessun ordine altrui', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  // Nessun seed: la hook carica i demo orders (Gamba Lunga / IlCapo / ...) esattamente come
  // caricherebbe gli ordini reali del locale da Supabase. Nessuno e' di questo dispositivo.
  await page.goto('/kitchen/status');
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  await expect(page.getByText('IlCapo')).toHaveCount(0);
  await expect(page.locator('.ost-order-card')).toHaveCount(0);

  // Indovinare l'id nell'URL non e' una prova di proprieta'.
  await page.goto('/kitchen/status?orderId=order-003');
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  await expect(page.getByText('IlCapo')).toHaveCount(0);

  // Nemmeno avere la sessione "giusta": nickname e tavolo sono condivisi fra clienti e non
  // possono piu' sbloccare un ordine (era il fallback rimosso in resolveInitialId).
  await page.evaluate(() =>
    localStorage.setItem('walboxCustomerSession', JSON.stringify({ table: '12', nickname: 'IlCapo' }))
  );
  await page.goto('/kitchen/status');
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  await expect(page.getByText('IlCapo')).toHaveCount(0);
});

test('26. P0 privacy: il dispositivo di un altro cliente non vede il mio ordine, nemmeno col link diretto', async ({ page, browser }) => {
  // Cliente A: ordine creato dal flusso reale, quindi registrato come proprio di questo device.
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderId: 'order-cliente-a', orderCode: 'A07' });
  await page.goto('/');
  await page.evaluate(() =>
    localStorage.setItem('walboxCustomerSession', JSON.stringify({ table: '12', nickname: 'Alice' }))
  );
  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await submitOrder(page);
  // Follow-up UX (2026-09-18): CONFERMA ORDINE → PAGINA PAGAMENTO → STATUS.
  await expect(page).toHaveURL(/\/kitchen\/payment/);
  await page.getByTestId('ost-pay-counter').click();
  await page.getByTestId('opay-go-status').click();
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.locator('.ost-status-banner-label')).toHaveText('IN ATTESA DI PAGAMENTO');
  await expect(page.locator('.ost-order-code-big')).toHaveText('A07');

  const ordersA = await readMyOrders(page);
  expect(ordersA.some((o) => o.id === 'order-cliente-a')).toBe(true);

  // Cliente B: dispositivo diverso (contesto browser separato, storage vuoto). Riceve dal locale
  // la stessa lista ordini, ha lo stesso nickname e lo stesso tavolo di A e prova il link diretto.
  const contextB = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const pageB = await contextB.newPage();
  try {
    await mockVenueOrdersSelect(pageB);
    await pageB.goto('/');
    // Il device di B riceve l'ordine di A da ENTRAMBE le strade possibili: la cache della lista
    // ordini del locale (quella che una sessione staff/cassa lascerebbe sul device) e lo storage
    // cliente. Nessuna delle due e' una prova di proprieta'.
    await pageB.evaluate(({ venueKey, myKey, data }) => {
      localStorage.setItem(venueKey, JSON.stringify(data));
      localStorage.setItem(myKey, JSON.stringify(data));
      localStorage.setItem('walboxCustomerSession', JSON.stringify({ table: '12', nickname: 'Alice' }));
    }, { venueKey: LS_ORDERS, myKey: LS_MY_ORDERS, data: ordersA });

    await pageB.goto('/kitchen/status?orderId=order-cliente-a');
    await expect(pageB.getByTestId('order-status-empty')).toBeVisible();
    await expect(pageB.locator('.ost-order-card')).toHaveCount(0);
    await expect(pageB.getByText('A07')).toHaveCount(0);
  } finally {
    await contextB.close();
  }
});

test('27. P0 privacy: dopo il reload il cliente ritrova il PROPRIO ordine, non l\'ultimo del locale', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderId: 'order-mio-reload', orderCode: 'A08' });
  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'takeaway');
  await submitOrder(page);
  // Follow-up UX (2026-09-18): CONFERMA ORDINE → PAGINA PAGAMENTO → STATUS.
  await expect(page).toHaveURL(/\/kitchen\/payment/);
  await page.getByTestId('ost-pay-counter').click();
  await page.getByTestId('opay-go-status').click();
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.locator('.ost-order-code-big')).toHaveText('A08');

  // Nel frattempo il locale riceve un ordine piu' recente del mio: e' esattamente il caso che
  // prima "rubava" la pagina al cliente (ordine piu' recente del locale).
  const orders = await readMyOrders(page);
  await seedMyOrders(page, [...orders, makeOtherCustomerOrder({ createdAt: new Date().toISOString() })]);

  await page.reload();
  await expect(page.locator('.ost-order-code-big')).toHaveText('A08');
  await expect(page.getByText('Pirata')).toHaveCount(0);

  // Anche senza querystring: l'ordine proprio si ritrova dal registro del dispositivo.
  await page.goto('/kitchen/status');
  await expect(page.locator('.ost-order-code-big')).toHaveText('A08');
  await expect(page.getByText('Pirata')).toHaveCount(0);
});

test('29. Privacy client-side: la cache ordini di staff/cassa non contamina il cliente sullo stesso device', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');

  // Stato lasciato da una sessione staff/cassa sul tablet condiviso: la cache contiene la lista
  // ordini DEL LOCALE (nickname, piatti, totali, note di clienti qualunque).
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    {
      key: LS_ORDERS,
      data: [
        makeOtherCustomerOrder({ id: 'order-staff-1', orderCode: 'S01', nickname: 'Pirata' }),
        makeOtherCustomerOrder({ id: 'order-staff-2', orderCode: 'S02', nickname: 'IlCapo' }),
      ],
    },
  );

  await page.goto('/kitchen/status');

  // 1) niente di quei dati e' visibile al cliente
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  await expect(page.locator('.ost-order-card')).toHaveCount(0);
  await expect(page.getByText('Pirata')).toHaveCount(0);
  await expect(page.getByText('IlCapo')).toHaveCount(0);

  // 2) e non resta nemmeno SCRITTO sul dispositivo: il contesto cliente rimuove la cache del
  //    locale e non la ricrea (lo storage cliente resta vuoto, non c'e' nessun ordine proprio).
  const after = await page.evaluate(
    ({ venueKey, myKey }) => ({
      venue: localStorage.getItem(venueKey),
      mine: JSON.parse(localStorage.getItem(myKey) || '[]'),
    }),
    { venueKey: LS_ORDERS, myKey: LS_MY_ORDERS },
  );
  expect(after.venue).toBeNull();
  expect(after.mine).toEqual([]);

  // 3) anche il banner nativo "ordine attivo" legge solo lo storage cliente: nessuna CTA generata
  //    da un ordine altrui rimasto in cache (ex ponte Jukebox, rimosso — vedi test 6).
  await page.goto('/kitchen');
  await expect(page.getByRole('button', { name: /HAI UN ORDINE ATTIVO/i })).toHaveCount(0);
});

test('28. P0 privacy: la lista ordini attivi impilata mostra solo gli ordini di questo dispositivo', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    // Stesso nickname del cliente: col vecchio raggruppamento per nickname sarebbe finito
    // nella lista come se fosse suo.
    makeOtherCustomerOrder({ id: 'order-altrui-nick', orderCode: 'Z01', nickname: 'Eros', createdAt: minutesAgoIso(3) }),
    makeOtherCustomerOrder({ id: 'order-altrui-2', orderCode: 'Z02', createdAt: minutesAgoIso(1) }),
    makeOtherCustomerOrder({ id: 'order-mio-1', orderCode: 'M01', nickname: 'Eros', createdAt: minutesAgoIso(20), note: '' }),
    makeOtherCustomerOrder({ id: 'order-mio-2', orderCode: 'M02', nickname: 'Eros', createdAt: minutesAgoIso(10), note: '' }),
  ]);
  await seedOwnedOrderIds(page, ['order-mio-2', 'order-mio-1']);

  await page.goto('/kitchen/status');
  await expect(page.locator('.ost-order-block')).toHaveCount(2);
  await expect(page.locator('.ost-order-code-big')).toHaveText(['M02', 'M01']);
  await expect(page.getByText('Pirata')).toHaveCount(0);
  await expect(page.getByText('Z01')).toHaveCount(0);
  await expect(page.getByText('Z02')).toHaveCount(0);
});

// ═══════════════════════════════════════════════════════════════════
// AC4 FIX (2026-09-18) — ordine cancelled con payment_status stale (scenari 30-31)
// ═══════════════════════════════════════════════════════════════════
// Regressione coperta (review ai-ops/reports, finding AC4 FAIL): kitchen_order_cancel aggiorna solo
// status/cancel_reason/cancelled_at, MAI payment_status — un ordine annullato prima di essere pagato
// resta con payment_status='pending_counter_payment' per costruzione. Prima del fix, isPendingPayment
// leggeva quel campo in OR con status, quindi un ordine cancelled veniva comunque trattato come "in
// attesa di pagamento": hero/status banner sbagliati e bivio PAGA IN CASSA/PAGA ONLINE ancora
// cliccabile su un ordine già annullato. Il fix: uno stato chiuso non è mai isPendingPayment,
// qualunque sia payment_status. Con AC7 (vista impilata, 2026-09-18) non esiste più un "ordine
// corrente" da cui allontanarsi con un redirect: un ordine cancelled semplicemente non ha più un
// blocco nella lista attiva al render successivo.

test('30. AC4 fix: ordine cancelled con payment_status ancora pending_counter_payment — niente bivio, nessun ordine attivo', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-cancelled-solo', orderCode: 'C01', nickname: 'Eros',
      status: 'cancelled', paymentStatus: 'pending_counter_payment',
      createdAt: minutesAgoIso(1),
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-cancelled-solo']);

  await page.goto('/kitchen/status?orderId=order-cancelled-solo');

  // L'ordine cancelled non ha un blocco: nessun ordine attivo da mostrare.
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  await expect(page.locator('.ost-order-block')).toHaveCount(0);
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);
  await expect(page.getByText('C01')).toHaveCount(0);
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toHaveCount(0);
});

test('31. AC4 fix: ordine cancelled con payment_status pending — resta visibile solo l\'altro ordine proprio ancora attivo', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-cancelled-multi', orderCode: 'C02', nickname: 'Eros',
      status: 'cancelled', paymentStatus: 'pending_counter_payment',
      createdAt: minutesAgoIso(5),
    }),
    makeOtherCustomerOrder({
      id: 'order-attivo-altro', orderCode: 'M09', nickname: 'Eros',
      status: 'preparing', paymentStatus: 'paid',
      createdAt: minutesAgoIso(1),
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-cancelled-multi', 'order-attivo-altro']);

  await page.goto('/kitchen/status?orderId=order-cancelled-multi');

  // Solo l'ordine attivo ha un blocco: il cancelled non compare mai, non c'è nessun "ordine
  // corrente" da cui passare.
  await expect(page.locator('.ost-order-block')).toHaveCount(1);
  await expect(page.locator('.ost-order-code-big')).toHaveText('M09');
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);
  await expect(page.getByText('C02')).toHaveCount(0);
});

// ═══════════════════════════════════════════════════════════════════
// AC7 — multi-ordine stacked (2026-09-18, scenari 32-36)
// ═══════════════════════════════════════════════════════════════════
// Requisiti bloccati: tutti gli ordini attivi visibili contemporaneamente (nessun cap a 5), uno
// sotto l'altro, ciascuno con codice grande, stato/CTA/pagamento indipendenti; cancelled/delivered
// esclusi; niente switcher orizzontale come UX principale; reconciliation SumUp al ritorno solo per
// l'ordine il cui id combacia con `?orderId=`.

async function seedSupabaseSession(page) {
  const userId = '33333333-3333-3333-3333-333333333333';
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const accessToken = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({
      sub: userId, aud: 'authenticated', role: 'authenticated',
      iat: nowSeconds, exp: nowSeconds + expiresIn, is_anonymous: true,
    }),
    'e2e-not-a-real-signature',
  ].join('.');
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: nowSeconds + expiresIn,
    refresh_token: 'e2e-refresh-token',
    user: {
      id: userId, aud: 'authenticated', role: 'authenticated', email: '', phone: '',
      is_anonymous: true, app_metadata: {}, user_metadata: {}, identities: [],
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    },
  };
  // Stessa storage key che @supabase/supabase-js v2 usa per un client creato con
  // VITE_SUPABASE_URL=https://pcrqfdzipotprqtuemso.supabase.co (.env.local): seedarla qui evita
  // di dover davvero autenticare il browser per esercitare `supabase.auth.getSession()`.
  await page.evaluate((s) => {
    localStorage.setItem('sb-pcrqfdzipotprqtuemso-auth-token', JSON.stringify(s));
  }, session);
}

async function mockReconcile(page, outcome = 'pending') {
  const calls = [];
  await page.route('**/api/kitchen-sumup-reconcile', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outcome }) });
  });
  return calls;
}

test('32. AC7: tutti gli ordini attivi sono visibili contemporaneamente, impilati, senza cap a 5', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  const statuses = ['pending_counter_payment', 'received', 'preparing', 'ready', 'received', 'preparing'];
  const ids = statuses.map((_, i) => `order-stack-${i}`);
  await seedMyOrders(page, statuses.map((status, i) => makeOtherCustomerOrder({
    id: ids[i], orderCode: `S0${i}`, nickname: 'Eros', status,
    paymentStatus: status === 'pending_counter_payment' ? 'pending_counter_payment' : 'paid',
    createdAt: minutesAgoIso(statuses.length - i),
  })));
  await seedOwnedOrderIds(page, ids);

  await page.goto('/kitchen/status');

  // Nessun cap: 6 ordini attivi, 6 blocchi, tutti con codice grande e dominante presente.
  await expect(page.locator('.ost-order-block')).toHaveCount(6);
  await expect(page.locator('.ost-order-code-big')).toHaveCount(6);
  for (let i = 0; i < statuses.length; i++) {
    await expect(page.getByText(`S0${i}`).first()).toBeVisible();
  }
  // Niente switcher orizzontale come UX principale.
  await expect(page.locator('.ost-switcher')).toHaveCount(0);
});

test('33. AC7: due ordini attivi hanno stati indipendenti, ciascuno col proprio codice grande', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-ready', orderCode: 'R01', nickname: 'Eros', status: 'ready', paymentStatus: 'paid', createdAt: minutesAgoIso(5) }),
    makeOtherCustomerOrder({ id: 'order-prep', orderCode: 'P01', nickname: 'Eros', status: 'preparing', paymentStatus: 'paid', createdAt: minutesAgoIso(2) }),
  ]);
  await seedOwnedOrderIds(page, ['order-ready', 'order-prep']);

  await page.goto('/kitchen/status');

  await expect(page.locator('.ost-order-block')).toHaveCount(2);
  await expect(page.locator('.ost-order-code-big')).toHaveText(['P01', 'R01']);
  const blockPrep  = page.getByTestId('ost-order-block-order-prep');
  const blockReady = page.getByTestId('ost-order-block-order-ready');
  await expect(blockPrep.locator('.ost-status-banner-label')).toHaveText('IN PREPARAZIONE');
  await expect(blockReady.locator('.ost-status-banner-label')).toHaveText('PRONTO PER IL RITIRO');
});

test('34. AC7: cancelled e delivered non compaiono mai nella lista attiva anche con altri ordini presenti', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-delivered', orderCode: 'D01', nickname: 'Eros', status: 'delivered', paymentStatus: 'paid', createdAt: minutesAgoIso(30) }),
    makeOtherCustomerOrder({ id: 'order-cancelled', orderCode: 'X01', nickname: 'Eros', status: 'cancelled', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(20) }),
    makeOtherCustomerOrder({ id: 'order-active', orderCode: 'A99', nickname: 'Eros', status: 'received', paymentStatus: 'paid', createdAt: minutesAgoIso(1) }),
  ]);
  await seedOwnedOrderIds(page, ['order-delivered', 'order-cancelled', 'order-active']);

  await page.goto('/kitchen/status');

  await expect(page.locator('.ost-order-block')).toHaveCount(1);
  await expect(page.locator('.ost-order-code-big')).toHaveText('A99');
  await expect(page.getByText('D01')).toHaveCount(0);
  await expect(page.getByText('X01')).toHaveCount(0);
});

test('35. AC7: due ordini in attesa di pagamento hanno bivio e CTA indipendenti, nessuna collisione di stato', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-pay-a', orderCode: 'PA1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(2) }),
    makeOtherCustomerOrder({ id: 'order-pay-b', orderCode: 'PB1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(1) }),
  ]);
  await seedOwnedOrderIds(page, ['order-pay-a', 'order-pay-b']);

  await page.goto('/kitchen/status');

  const blockA = page.getByTestId('ost-order-block-order-pay-a');
  const blockB = page.getByTestId('ost-order-block-order-pay-b');
  await expect(blockA.getByTestId('ost-payment-fork')).toBeVisible();
  await expect(blockB.getByTestId('ost-payment-fork')).toBeVisible();

  // Scegliere PAGA IN CASSA sull'ordine A non deve toccare lo stato dell'ordine B.
  await blockA.getByTestId('ost-pay-counter').click();
  await expect(blockA.getByTestId('ost-payment-fork')).toHaveCount(0);
  await expect(blockA.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  await expect(blockB.getByTestId('ost-payment-fork')).toBeVisible();
  await expect(blockB.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toHaveCount(0);
});

test('36. AC7: al ritorno da SumUp solo l\'ordine corrispondente a ?orderId= esegue reconciliation', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedSupabaseSession(page);
  const reconcileCalls = await mockReconcile(page, 'pending');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-target', orderCode: 'T01', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(2) }),
    makeOtherCustomerOrder({ id: 'order-other', orderCode: 'T02', nickname: 'Eros', status: 'preparing', paymentStatus: 'paid', createdAt: minutesAgoIso(1) }),
  ]);
  await seedOwnedOrderIds(page, ['order-target', 'order-other']);

  await page.goto('/kitchen/status?sumup=return&orderId=order-target');

  await expect.poll(() => reconcileCalls.length).toBeGreaterThan(0);
  await page.waitForTimeout(200); // margine per un'eventuale seconda chiamata indesiderata
  expect(reconcileCalls.every((c) => c.order_id === 'order-target')).toBe(true);
  expect(reconcileCalls.some((c) => c.order_id === 'order-other')).toBe(false);
});

// ═══════════════════════════════════════════════════════════════════
// CustomerOrderPayment — pagina pagamento dedicata (follow-up UX 2026-09-18)
// CONFERMA ORDINE → PAGINA PAGAMENTO DEDICATA → STATUS ORDINI. Riusa useOrderPaymentFlow/
// OrderPaymentActions (AC1/AC3), nessuna logica SumUp duplicata; il ritorno online resta
// cablato lato server su /kitchen/status?sumup=return (AC3/AC7 invariati, vedi test 36).
// ═══════════════════════════════════════════════════════════════════

test('37. Submit ordine → atterra sulla pagina pagamento dedicata con codice e bivio, non su status', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'P01' });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await submitOrder(page);

  await expect(page).toHaveURL(/\/kitchen\/payment\?orderId=/);
  await expect(page).not.toHaveURL(/\/kitchen\/status/);
  await expect(page.getByTestId('opay-order-code-big')).toHaveText('P01');
  await expect(page.getByTestId('ost-payment-fork')).toBeVisible();
  await expect(page.getByText('COME VUOI PAGARE?')).toBeVisible();
});

test('38. Pagina pagamento non mostra jukebox, timeline di stato o lista ordini', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-pay-clean', orderCode: 'CL1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment' }),
  ]);
  await seedOwnedOrderIds(page, ['order-pay-clean']);

  await page.goto('/kitchen/payment?orderId=order-pay-clean');

  await expect(page.getByTestId('opay-order-code-big')).toHaveText('CL1');
  await expect(page.getByTestId('ost-payment-fork')).toBeVisible();
  // Nessun elemento del "dopo" (status ordini): niente jukebox, niente timeline di
  // avanzamento, niente lista/stack di più ordini — solo codice + bivio pagamento.
  await expect(page.getByText(/JUKEBOX/i)).toHaveCount(0);
  await expect(page.locator('.ost-timeline')).toHaveCount(0);
  await expect(page.locator('.ost-orders-stack')).toHaveCount(0);
  await expect(page.locator('.ost-order-card')).toHaveCount(0);
  await expect(page.locator('.ost-codes-strip')).toHaveCount(0);
});

test('39. CASSA: mostra codice + istruzione, poi accesso allo status', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-pay-cash', orderCode: 'CA1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment' }),
  ]);
  await seedOwnedOrderIds(page, ['order-pay-cash']);

  await page.goto('/kitchen/payment?orderId=order-pay-cash');
  await page.getByTestId('ost-pay-counter').click();

  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  await expect(page.getByText('CA1', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('opay-go-status')).toBeVisible();

  await page.getByTestId('opay-go-status').click();
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.locator('.ost-status-banner-label')).toHaveText('IN ATTESA DI PAGAMENTO');
});

test('40. ONLINE: SumUp → reconcile → atterra sullo status con esito confermato', async ({ page }) => {
  await mockAnonymousSession(page);
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-pay-online', orderCode: 'ON1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment' }),
  ]);
  await seedOwnedOrderIds(page, ['order-pay-online']);

  await page.route('**/rest/v1/rpc/kitchen_payment_attempt_start', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'attempt-online-1', status: 'created' }) })
  );
  const baseURL = test.info().project.use.baseURL;
  await page.route('**/api/kitchen-sumup-create-checkout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // In produzione questo punta all'hosted checkout SumUp; qui simuliamo il redirect di
      // ritorno che il backend (api/kitchen-sumup-create-checkout.js, non toccato da questo
      // task) cabla già su /kitchen/status?...&sumup=return, per esercitare il vero round-trip
      // senza dipendere da SumUp reale.
      body: JSON.stringify({ hosted_checkout_url: `${baseURL}/kitchen/status?orderId=order-pay-online&sumup=return` }),
    })
  );
  await page.route('**/api/kitchen-sumup-reconcile', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outcome: 'confirmed' }) })
  );

  await page.goto('/kitchen/payment?orderId=order-pay-online');
  await page.getByTestId('ost-pay-online').click();

  await expect(page).toHaveURL(/\/kitchen\/status\?.*sumup=return/);
  await expect(page.getByText(/Pagamento confermato/i)).toBeVisible();
});

test('41. /kitchen/status con più ordini resta compatto (codici in alto, dettaglio chiuso, CTA e fork indipendenti)', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'order-multi-pay', orderCode: 'MC1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(2) }),
    makeOtherCustomerOrder({ id: 'order-multi-prep', orderCode: 'MC2', nickname: 'Eros', status: 'preparing', paymentStatus: 'paid', createdAt: minutesAgoIso(1) }),
  ]);
  await seedOwnedOrderIds(page, ['order-multi-pay', 'order-multi-prep']);

  await page.goto('/kitchen/status');

  // Striscia codici in alto, sempre visibile, indipendente dai riquadri sotto.
  await expect(page.getByTestId('ost-codes-strip')).toBeVisible();
  await expect(page.locator('.ost-codes-chip')).toHaveCount(2);
  await expect(page.getByTestId('ost-codes-strip').getByText('MC1')).toBeVisible();
  await expect(page.getByTestId('ost-codes-strip').getByText('MC2')).toBeVisible();

  // Dettaglio pesante chiuso di default su entrambi i riquadri: niente timeline/hero visibili.
  await expect(page.locator('.ost-order-detail')).toHaveCount(0);
  await expect(page.locator('.ost-timeline')).toHaveCount(0);

  const blockPay  = page.getByTestId('ost-order-block-order-multi-pay');
  const blockPrep = page.getByTestId('ost-order-block-order-multi-prep');
  await expect(blockPay.getByTestId('ost-payment-fork')).toBeVisible();
  await expect(blockPrep.getByTestId('ost-payment-fork')).toHaveCount(0);

  // Il toggle dettaglio funziona indipendentemente per riquadro.
  await blockPrep.locator('.ost-detail-toggle').click();
  await expect(blockPrep.locator('.ost-timeline')).toBeVisible();
  await expect(blockPay.locator('.ost-timeline')).toHaveCount(0);
});
