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
// KITCHEN_OPEN_CLOSE_V1 (2026-09-23): cache locale dello stato APERTA/CHIUSA della cucina, letta
// da useKitchenServiceState come default veloce/resiliente prima dell'override Supabase.
const LS_SERVICE_STATE = 'walbox_kitchen_service_state';

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
// Dalla Fase 3.4 la home è stata tolta: il menu è già aperto, il pulsante resta solo per le schermate che lo avessero.
async function openFullMenu(page) {
  const enter = page.getByRole('button', { name: /ENTRA NEL MENU/i });
  if (await enter.count()) await enter.click();
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
  // Restyling hero: le schede sono sempre aperte; con SOLO PANINO (default) la CTA e' il "+" giallo
  // della scheda compatta (aria-label "Aggiungi <nome>").
  await page.locator('.pm-list .pc-cta:not(.pmx-menu-cta)').first().click();
}

// Il Sacco Pulito (2026-09-13): unica scelta obbligatoria nel drawer prima che "Invia ordine"
// sia cliccabile — il pagamento non si sceglie più qui, vive su /kitchen/status.
async function chooseFulfillment(page, fulfillment) {
  await page.getByTestId(`fulfillment-${fulfillment}`).click();
}

// Customer Experience V2: nome, "dove lo mangi", note e corsia di pagamento stanno in un solo
// schermo del drawer. `submitOrder` scrive il nome (obbligatorio); l'ordine nasce al tap su
// PAGO ORA / PAGO AL BANCO ('online' | 'counter'), mai prima.
async function submitOrder(page, name = 'Marco') {
  await page.getByTestId('customer-name-input').fill(name);
}

async function choosePayLane(page, lane) {
  await page.getByTestId(`pay-lane-${lane}`).click();
}

async function submitAndPay(page, lane, name = 'Marco') {
  await submitOrder(page, name);
  await choosePayLane(page, lane);
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

async function mockCreateOrderRpc(page, { fulfillmentType, orderId = 'order-e2e-checkout-mock', orderCode = 'A01', forceStatus = null, total = 13.9 } = {}) {
  await mockAnonymousSession(page);
  const sent = { body: null, calls: [] };
  // S5: il cliente crea sempre con la v2. Il mock replica il server: online -> POP con
  // payment_status NULL; banco -> PCP (online_payment_disabled resta false alla creazione).
  // `forceStatus` simula l'idempotenza "vince il primo" (status diverso dalla corsia cliccata).
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order_v2', async (route) => {
    sent.body = route.request().postDataJSON();
    sent.calls.push(sent.body);
    const lane = sent.body?.p_payment_lane;
    const status = forceStatus ?? (lane === 'online' ? 'pending_online_payment' : 'pending_counter_payment');
    // "Vince il primo": una seconda chiamata restituisce la riga già creata.
    sent.createdRow = sent.createdRow ?? {
      id: orderId,
      order_code: orderCode,
      venue_id: 'walrus-main',
      table_id: null,
      nickname: sent.body?.p_nickname ?? 'Eros',
      status,
      total,
      payment_status: status === 'pending_counter_payment' ? 'pending_counter_payment' : null,
      payment_method: null,
      online_payment_disabled: false,
      fulfillment_type: fulfillmentType,
      customer_note: sent.body?.p_customer_note ?? null,
      service_day: new Date().toISOString().slice(0, 10),
      service_sequence: 1,
      created_at: new Date().toISOString(),
      kitchen_order_items: (sent.body?.p_items ?? []).map((i) => ({ item_id: i.item_id, name: i.name, quantity: i.quantity, price: i.price })),
    };
    const rpcRow = { ...sent.createdRow };
    delete rpcRow.kitchen_order_items; // la RPC restituisce la riga kitchen_orders senza embed
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rpcRow),
    });
  });
  // Dopo la creazione si va su /kitchen/status, il cui mount rilancia fetchSupabaseOrders(): la
  // risposta del server SOSTITUISCE la lista locale (mergeFetchedOrders), quindi il mock deve
  // restituire l'ordine appena "creato" come farebbe il DB (RLS customer_select_own_orders), non
  // una lista vuota che lo cancellerebbe dallo stato.
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sent.createdRow ? [sent.createdRow] : []),
    })
  );
  return sent;
}

// S5: mock della catena di pagamento online (attempt_start + create-checkout + reconcile).
// `checkout` può essere cambiato a runtime (es. prima fallisce, poi riesce).
async function mockOnlinePayment(page, { orderId, reconcileOutcome = 'confirmed', checkoutOk = true } = {}) {
  const baseURL = test.info().project.use.baseURL;
  const state = { checkoutOk, attempts: [], checkouts: [], reconciles: [] };
  await page.route('**/rest/v1/rpc/kitchen_payment_attempt_start', (route) => {
    state.attempts.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'attempt-e2e-1', status: 'created' }) });
  });
  await page.route('**/api/kitchen-sumup-create-checkout', (route) => {
    state.checkouts.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    if (!state.checkoutOk) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'checkout_creation_failed' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hosted_checkout_url: `${baseURL}/kitchen/status?orderId=${orderId}&sumup=return` }),
    });
  });
  await page.route('**/api/kitchen-sumup-reconcile', (route) => {
    state.reconciles.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outcome: reconcileOutcome }) });
  });
  return state;
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
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i }).first()).toBeVisible({ timeout: 10000 });
});

test('2. /kitchen is reachable directly as the native entry point, no Jukebox bridge needed', async ({ page }) => {
  await page.goto('/kitchen');
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i }).first()).toBeVisible();
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
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i }).first()).toBeVisible({ timeout: 10000 });
});

test('3. Full Kitchen order uses customer identity from the native name step', async ({ page }) => {
  await page.goto('/kitchen');

  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A02' });

  // Home → menu completo → primo prodotto ordinabile (Pesi Massimi)
  await openFullMenu(page);
  await addFirstOrderableItem(page);

  // Open cart bottom sheet via the floating pill
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();

  // Il Sacco Pulito (2026-09-13): fulfillment obbligatorio prima dell'invio, il pagamento no.
  await chooseFulfillment(page, 'eat_here');

  // Submit the order — nickname fornito qui, allo step nome nativo (non più precompilato via /entry).
  await submitAndPay(page, 'counter', 'Eros');

  // S5: dopo il nome si sceglie COME PAGARE (AL BANCO) e l'ordine nasce con la v2; la destinazione
  // è direttamente /kitchen/status (niente più /kitchen/payment). Aspettare l'URL è il segnale
  // reale che l'ordine è stato scritto.
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
  // S5: corsia e client_request_id viaggiano nella v2.
  expect(sent.body.p_payment_lane).toBe('counter');
  expect(sent.body.p_client_request_id).toMatch(/^[0-9a-f-]{36}$/);
});

test('3h. Corsia di pagamento senza "dove lo mangi": nessun ordine, campo segnalato, poi si procede', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'A09' });
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();

  await submitOrder(page);
  await choosePayLane(page, 'counter');
  await expect(page.getByTestId('fulfillment-error')).toBeVisible();
  expect(sent.calls.length).toBe(0);

  await page.getByTestId('fulfillment-takeaway').click();
  await expect(page.getByTestId('fulfillment-takeaway')).toHaveAttribute('aria-pressed', 'true');
  await choosePayLane(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(sent.calls.length).toBe(1);
});

test('3i. Checkout takeaway: ordine creato con fulfillment_type=takeaway, redirect a /kitchen/status, resta pending_counter_payment', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'A03' });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'takeaway');
  await submitAndPay(page, 'counter');

  // S5: destinazione post-ordine = /kitchen/status — nessuna schermata statica di conferma in-page.
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.locator('.kitch-confirm')).toHaveCount(0);

  expect(sent.body.p_fulfillment_type).toBe('takeaway');

  const orders = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    LS_MY_ORDERS,
  );
  const latest = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  expect(latest.fulfillmentType).toBe('takeaway');
  // L'ordine resta pending_counter_payment finché una conferma reale non lo avanza — nessun
  // phantom success.
  expect(latest.status).toBe('pending_counter_payment');
  expect(latest.paymentStatus).toBe('pending_counter_payment');
});

// KITCHEN_OPEN_CLOSE_V1 (2026-09-23): il menu resta sempre navigabile, solo l'invio è bloccato.
// Stesso pattern double-goto di 3b (seed localStorage, poi reload) per far leggere l'hook al
// primo mount con lo stato già chiuso in cache.
test('3j. Cucina chiusa: banner visibile, menu navigabile, invio ordine bloccato lato cliente', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await page.evaluate(
    ({ key }) => localStorage.setItem(key, JSON.stringify({ isOpen: false })),
    { key: LS_SERVICE_STATE },
  );
  await page.goto('/kitchen?table=12&nickname=Eros');

  await expect(page.getByTestId('kitchen-closed-banner')).toBeVisible();
  await expect(page.getByTestId('kitchen-closed-banner')).toContainText('LA CUCINA È CHIUSA');

  // Il menu resta navigabile: si può entrare nel menu completo e vedere le categorie, il banner
  // resta visibile (sticky, su tutte le view — non solo sulla Home).
  await openFullMenu(page);
  await expect(page.getByRole('button', { name: /PESI MASSIMI/i })).toBeVisible();
  await expect(page.getByTestId('kitchen-closed-banner')).toBeVisible();

  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');

  const submitBtn = page.getByTestId('submit-order-btn');
  await expect(submitBtn).toBeDisabled();
  await expect(submitBtn).toContainText('CUCINA CHIUSA');
});

// Difesa in profondità: anche se lo stato client dice "aperta" (client stale, tab aperta prima
// della chiusura), il server rifiuta comunque con 'kitchen_closed' — nessun ordine fantasma,
// messaggio specifico invece del generico "riprova".
test('3m. RPC kitchen_closed (client stale): nessun ordine creato, messaggio specifico', async ({ page }) => {
  await mockAnonymousSession(page);
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order_v2', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: 'kitchen_closed', details: null, hint: null }),
    })
  );

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await submitAndPay(page, 'counter');

  await expect(page).not.toHaveURL(/\/kitchen\/payment/);
  await expect(page).not.toHaveURL(/\/kitchen\/status/);
  await expect(page.getByTestId('order-submit-error')).toContainText(/CUCINA È CHIUSA/i);
  // Cucina chiusa tra NOME e scelta: lo step resta aperto, nessun ordine, carrello intatto.
  await expect(page.getByTestId('pay-lane-step')).toBeVisible();
  await expect(page.getByTestId('pay-lane-counter')).toBeEnabled();
});

// F02 (Phantom Order) invariato: se la RPC di creazione ordine fallisce, il cliente non deve mai
// essere redirezionato alla pagina pagamento per un ordine che non esiste.
test('3k. RPC di creazione ordine fallita: nessun ordine fantasma, carrello resta intatto per il retry', async ({ page }) => {
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order_v2', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'internal_error' }) })
  );

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');
  await submitAndPay(page, 'online');

  await expect(page).not.toHaveURL(/\/kitchen\/payment/);
  await expect(page).not.toHaveURL(/\/kitchen\/status/);
  await expect(page.getByTestId('order-submit-error')).toBeVisible();
  // Il carrello resta intatto per il retry: i bottoni dello step sono di nuovo cliccabili.
  await expect(page.getByTestId('pay-lane-online')).toBeEnabled();
  await expect(page.getByTestId('pay-lane-counter')).toBeEnabled();
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

  // Fase 3.2: la locandina (PosterCard) è sempre aperta, la CTA spenta è già visibile.
  const soldOutButton = page.locator('.pc-card--soldout .pc-cta');
  await expect(soldOutButton).toBeVisible();
  // Scheda compatta: la CTA e' un "+" tondo, il motivo ("ESAURITO") sta nell'aria-label e nel timbro sulla foto.
  await expect(soldOutButton).toHaveAttribute('aria-label', /^ESAURITO: /);
  await expect(page.locator('.pc-card--soldout .pc-soldout-stamp').first()).toHaveText('ESAURITO');
  await expect(soldOutButton).toBeDisabled();
});

test('3c. Empty cart hides the bottom bar entirely; appears on first item, disappears after last removed', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);

  // Empty state: no bottom bar in the DOM, no disabled CTA, nothing to open
  await expect(page.locator('.kitch-bottom-bar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AGGIUNGI QUALCOSA' })).toHaveCount(0);
  await expect(page.getByText('Nessun articolo')).toHaveCount(0);

  // Add a product: the compact sticky cart appears
  await addFirstOrderableItem(page);
  const bar = page.locator('.kitch-bottom-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: /VAI ALLA CASSA/i })).toBeEnabled();

  // Remove the last product from the drawer
  await bar.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await expect(page.locator('.kitch-drawer')).toBeVisible();
  await page.getByRole('button', { name: /Rimuovi dal sacco/i }).first().click();

  // Back to zero items: bar hidden again, drawer closed
  await expect(page.locator('.kitch-drawer')).toHaveCount(0);
  await expect(page.locator('.kitch-bottom-bar')).toHaveCount(0);
  await expect(page.getByText('Nessun articolo')).toHaveCount(0);
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
  // Alcuni id del catalogo sono nascosti al cliente (CUSTOMER_HIDDEN_ITEM_IDS): si contano le schede davvero visibili.
  const visibleCards = await page.locator('.pn-list .pc-card').count();
  expect(visibleCards).toBeGreaterThan(0);
  expect(visibleCards).toBeLessThanOrEqual(PANINI_IDS.length);
  await expect(page.locator('.pc-card--soldout')).toHaveCount(visibleCards);
  await expect(page.locator('.pc-card--soldout .pc-cta[aria-label^="ESAURITO: "]')).toHaveCount(visibleCards);
  await expect(page.getByText('NESSUN PRODOTTO DISPONIBILE IN QUESTA CATEGORIA')).not.toBeVisible();
  await expect(page.getByText('AL MOMENTO È TUTTO ESAURITO')).not.toBeVisible();

  // Requisito funzionale (di sicurezza, non solo visuale): la CTA add-to-cart di ogni
  // panino esaurito è disabilitata nel markup.
  await expect(page.locator('.pc-card--soldout .pc-cta:disabled')).toHaveCount(visibleCards);

  // Forzando il click sulle CTA disabilitate nessun panino deve finire nel carrello: un
  // browser blocca il click nativo su un elemento disabled, quindi questo verifica il
  // comportamento reale, non solo l'attributo.
  const soldOutCtas = await page.locator('.pc-card--soldout .pc-cta').all();
  for (const cta of soldOutCtas) {
    await cta.click({ force: true }).catch(() => {});
  }

  const addCta = page.getByRole('button', { name: 'AGGIUNGI QUALCOSA' });
  await expect(addCta).toHaveCount(0);
  await expect(page.locator('.kitch-bottom-bar')).toHaveCount(0);
  await expect(page.getByText('Nessun articolo')).toHaveCount(0);
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
  // PANINI usa PaniniSection (locandine .pc-card), non più la lista generica .kitch-card
  await expect(page.locator('.pc-card').first()).toBeVisible();
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

    // "+" della scheda compatta: tondo almeno 40x40
    const addBtn = page.locator('.pm-list .pc-cta:not(.pmx-menu-cta)').first();
    const loVoglioBox = await addBtn.boundingBox();
    expect(loVoglioBox.height).toBeGreaterThanOrEqual(40);
    expect(loVoglioBox.width).toBeGreaterThanOrEqual(40);

    // Add item, then CTA `VAI ALLA CASSA`: min-height 40
    await addBtn.click();
    const vaiBox = await page.getByRole('button', { name: /VAI ALLA CASSA/i }).boundingBox();
    expect(vaiBox.height).toBeGreaterThanOrEqual(40);

    // Open drawer
    await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
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

// Come per kitchen_payment_record_counter nel test 7: l'annullamento è server-autoritativo
// (`cancelOrder`, useKitchenOrders.js — lo stato locale diventa 'cancelled' solo se il server
// conferma, mai ottimisticamente). Payment Cancel Hardening (2026-09-21): cancelOrder ora chiama
// l'endpoint dedicato api/kitchen-cancel-with-payment-check invece della RPC kitchen_order_cancel
// diretta (serve la SUMUP_API_KEY server-side per verificare un eventuale checkout SumUp ancora
// aperto prima di annullare) — il mock qui intercetta quell'endpoint. Gli ordini di questi test
// sono fixture seedate in localStorage e non esistono nel progetto Supabase reale puntato da
// .env.local, quindi senza mock l'endpoint vero risponderebbe con l'ordine non trovato e il test
// misurerebbe quello, non la UI di Solo Service. Il mock restituisce la risposta come farebbe il
// server (outcome/order), riflettendo il motivo davvero inviato.
async function mockCancelOrderRpc(page) {
  await page.route('**/api/kitchen-cancel-with-payment-check', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        outcome: 'cancelled',
        order: {
          id: body?.order_id,
          status: 'cancelled',
          cancel_reason: body?.reason ?? null,
          cancelled_at: new Date().toISOString(),
        },
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

// Customer Experience V2 (2026-10-13): decisione prodotto — il controllo "HO UN CODICE" non esiste
// più nel carrello cliente. Nessun campo, nessun redeem lato cliente: l'ordine si crea a prezzo
// pieno e la RPC promo non viene mai chiamata dal checkout. (La RPC e l'hook `redeemPromo` restano
// intatti: qui si verifica solo che il cliente non possa più inserire codici.)
test('18. Nessun controllo codice promo nel carrello e nessun redeem durante l\'ordine', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A05' });
  const promoCalls = [];
  await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', async (route) => {
    promoCalls.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 1 }) });
  });

  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();

  await expect(page.getByTestId('customer-checkout')).toBeVisible();
  await expect(page.getByRole('button', { name: /HO UN CODICE/i })).toHaveCount(0);
  await expect(page.getByTestId('promo-code-input')).toHaveCount(0);
  await expect(page.getByPlaceholder(/il tuo codice/i)).toHaveCount(0);
  await expect(page.locator('.kitch-drawer')).not.toContainText(/codice promo|HO UN CODICE|hai un codice/i);

  await chooseFulfillment(page, 'eat_here');
  await submitAndPay(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(promoCalls).toHaveLength(0);
});

// Note cucina (Customer Experience V2): la scorciatoia ALLERGIA e il testo libero arrivano
// sulla comanda (p_customer_note) senza perdere il testo già scritto; la nota resta opzionale.
test('19. Note cucina: scorciatoia ALLERGIA + testo libero arrivano nella comanda; senza note l\'ordine parte uguale', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'A06' });

  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');

  // 2026-10-28: le note sono sempre aperte, niente toggle da toccare.
  await expect(page.getByTestId('kitchen-note-toggle')).toHaveCount(0);
  await expect(page.getByTestId('kitchen-note-input')).toBeVisible();
  await expect(page.getByTestId('note-chip-allergy')).toBeVisible();
  await page.getByTestId('kitchen-note-input').fill('senza cipolla');
  await page.getByTestId('note-chip-allergy').click();
  // Il chip rimette il focus sul campo al frame successivo: si attende prima di digitare.
  await expect(page.getByTestId('kitchen-note-input')).toBeFocused();
  await page.keyboard.type('glutine');
  await expect(page.getByTestId('kitchen-note-input')).toHaveValue('senza cipolla · ALLERGIA: glutine');

  await submitAndPay(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(sent.body.p_customer_note).toContain('senza cipolla · ALLERGIA: glutine');
});

test('20. Birre ripristinate (2026-09-22): le 6 bottiglie visibili, nessun Krombacher, ordinabili tutto il giorno', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BIRRE');

  // Ripristino (2026-09-22, decisione Eros): le 6 bottiglie Keiler/Lupulus tornano visibili,
  // Krombacher (item-057) e' stata rimossa dal catalogo.
  // Restyling hero: le birre sono schede compatte `PosterCard` (sempre aperte, niente accordion).
  await expect(page.locator('.br-list .pc-card--compact')).toHaveCount(6);
  await expect(page.getByText('KROMBACHER')).toHaveCount(0);

  const helles = page.locator('.br-list .pc-card', { hasText: 'Keiler Helles' });
  await expect(helles).toHaveCount(1);

  // Scelta · formato e `story` approvata visibili senza aprire nulla.
  await expect(helles.locator('.pc-meta')).toHaveText('VAI SUL SICURO · 50 cl') /* maiuscolo via CSS */;
  await expect(helles.getByText('La bionda che non deve dimostrare niente', { exact: false })).toBeVisible();
  await expect(helles.locator('.pc-price')).toHaveText(/^6[\d,]*\s?€$/);

  // Tutte `all_day`: nessun gate serale residuo, ordinabile anche nel pomeriggio.
  const add = helles.getByRole('button', { name: 'Aggiungi Keiler Helles' });
  await expect(add).toBeEnabled();
  await add.click();

  // Dopo l'aggiunta la scheda mostra lo stepper e il badge ×1; il sacco ha 1 articolo da €6,00.
  await expect(helles.getByRole('group', { name: /Quantità nel sacco: Keiler Helles/ })).toBeVisible();
  await expect(helles.getByTestId('poster-card-qty')).toContainText('×1');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('1 · Vai alla cassa');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('6,00 €');
});

test('21. FALLO PESANTE (H7 fase 1): SCEGLI COME LO VUOI — un solo prezzo in alto, default SOLO PANINO, bibite poi birre, pulsante unico che segue la scelta', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  // Restyling hero: le schede sono sempre aperte, nessun accordion da aprire.
  // MENU OTTOBRE (2026-10-28): il panino Pulled Pork non ha piu il MENU, si prova sul Pastrami.
  const openCard = page.locator('.pm-list .pc-card', { hasText: 'Pastrami' });

  // Titolo + due opzioni esplicite; default SOLO PANINO selezionato.
  await expect(openCard.locator('.pmx-title')).toHaveText('SCEGLI COME LO VUOI');
  const soloOption = openCard.getByTestId('choose-solo');
  const menuOption = openCard.getByTestId('choose-menu');
  await expect(soloOption).toHaveClass(/pmx-opt--on/);
  await expect(menuOption).not.toHaveClass(/pmx-opt--on/);

  // Un solo prezzo in alto (il panino) e NIENTE "+" che aggiunge prima della scelta.
  await expect(openCard.locator('.pc-buy .pc-price')).toHaveText('14,50 €');
  await expect(openCard.locator('.pc-buy .pc-cta')).toHaveCount(0);
  await expect(openCard.locator('.pc-buy .pc-stepper')).toHaveCount(0);
  // Le due scelte non ripetono il prezzo del panino e la parola COMBO non compare.
  await expect(soloOption).toHaveText('SOLO PANINO');
  await expect(openCard).not.toContainText(/COMBO/i);

  // Default SOLO PANINO: UN solo pulsante d'acquisto in fondo, col prezzo del panino; selettore bevanda nascosto.
  const soloCta = openCard.getByTestId('pmx-solo-cta');
  await expect(soloCta).toBeEnabled();
  await expect(soloCta).toHaveText('AGGIUNGI PANINO · 14,50 €');
  await expect(openCard.getByRole('button', { name: /^Aggiungi Pastrami/i })).toBeEnabled();
  await expect(openCard.locator('.pmx-beer')).toHaveCount(0);
  await expect(openCard.getByTestId('fallo-pesante-cta')).toHaveCount(0);

  // Opzione MENU: nome unico, sottotitolo fisso, supplemento calcolato dai dati (16,90 − 14,50), niente prezzi finali.
  await expect(menuOption).toContainText('FALLO PESANTE');
  await expect(menuOption).not.toContainText('MENU · FALLO PESANTE');
  await expect(openCard.getByTestId('fallo-pesante-includes')).toHaveText('MENU · PANINO + PATATE + DA BERE');
  await expect(openCard.getByTestId('fallo-pesante-price')).toHaveText('+2,40 €');
  await expect(openCard.getByTestId('fallo-pesante-prices')).toHaveCount(0);
  await expect(menuOption).not.toContainText(/16,90|17,90|CON BIRRA|CON BIBITA/);

  // Seleziono MENU: evidenziato, appare "SCEGLI DA BERE", pulsante spento finché non si sceglie.
  await menuOption.click();
  await expect(menuOption).toHaveClass(/pmx-opt--on/);
  await expect(soloOption).not.toHaveClass(/pmx-opt--on/);
  await expect(openCard.getByTestId('fallo-pesante-beer-step')).toHaveText('SCEGLI DA BERE');
  await expect(openCard.locator('.pmx-beer-badge')).toHaveCount(0);
  await expect(openCard.getByTestId('pmx-solo-cta')).toHaveCount(0);
  // Prima le bibite (comprese), poi le birre col loro extra (17,90 − 16,90 = +1 €), calcolato dai dati.
  const drinksLabel = openCard.getByTestId('fallo-pesante-drinks-label');
  const beersLabel = openCard.getByTestId('fallo-pesante-beers-label');
  await expect(drinksLabel).toHaveText('BIBITE · comprese');
  await expect(beersLabel).toHaveText('BIRRE · +1 €');
  const drinksY = (await drinksLabel.boundingBox()).y;
  const beersY = (await beersLabel.boundingBox()).y;
  expect(drinksY).toBeLessThan(beersY);
  const heavyCta = openCard.getByTestId('fallo-pesante-cta');
  // Nessuna bevanda scelta: il pulsante resta spento, nessun add silenzioso.
  await expect(heavyCta).toBeDisabled();
  await expect(heavyCta).toHaveText('SCEGLI DA BERE');

  // Solo le 6 bottiglie rimaste sono selezionabili: Krombacher (rimossa dal catalogo) non c'e'.
  await expect(openCard.locator('.pm-beer-pill')).toHaveCount(6);
  await expect(openCard.locator('.pm-beer-pill', { hasText: 'Krombacher' })).toHaveCount(0);

  // BEER DISCOVERY (FINAL UX POLISH): il tap sulla birra apre il dettaglio, non seleziona.
  await openCard.locator('.pm-beer-pill', { hasText: 'Keiler Helles' }).click();
  const beerDetail = openCard.locator('.pm-beer-detail');
  await expect(beerDetail.locator('.pm-beer-detail-name')).toHaveText('KEILER HELLES');
  await expect(beerDetail.locator('.pm-beer-detail-story')).toContainText('Morbida');
  await expect(beerDetail.locator('.pm-beer-detail-meta')).toContainText('50 CL');
  await expect(beerDetail.locator('.pm-beer-detail-meta')).toContainText('NEL MENU +1 €');
  await expect(beerDetail.locator('.pm-beer-detail-meta')).not.toContainText(/COMBO/i);
  // Finché non si conferma, FALLO PESANTE resta disabilitato.
  await expect(heavyCta).toBeDisabled();

  await beerDetail.getByRole('button', { name: 'SCEGLI QUESTA BIRRA' }).click();
  // Selezione finale esplicita, dettaglio richiuso.
  await expect(openCard.locator('.pm-beer-chosen-name')).toHaveText('DA BERE: KEILER HELLES');
  await expect(openCard.locator('.pm-beer-detail')).toHaveCount(0);
  await expect(heavyCta).toBeEnabled();
  // Con la birra il MENU costa 17,90: il prezzo finale compare SOLO nel pulsante, non nella scelta.
  await expect(heavyCta).toHaveText('AGGIUNGI IL MENU · 17,90 €');
  await expect(menuOption.locator('.pmx-opt-price')).toHaveText('+2,40 €');
  await expect(openCard.locator('.pm-beer-chosen')).toHaveCount(1);

  // Tornando su SOLO PANINO il selettore birra sparisce e la CTA torna sul panino.
  await soloOption.click();
  await expect(openCard.locator('.pmx-beer')).toHaveCount(0);
  await expect(openCard.getByTestId('fallo-pesante-cta')).toHaveCount(0);
  await expect(openCard.getByTestId('pmx-solo-cta')).toHaveText('AGGIUNGI PANINO · 14,50 €');
  await expect(openCard.getByRole('button', { name: /^Aggiungi Pastrami/i })).toBeEnabled();

  // Ripasso a MENU: la birra scelta è ricordata, CTA attiva.
  await menuOption.click();
  await expect(openCard.locator('.pm-beer-chosen-name')).toHaveText('DA BERE: KEILER HELLES');
  await expect(heavyCta).toBeEnabled();
  await heavyCta.click();
  // Dopo l'aggiunta: "AGGIUNTO ✓" e pulsante spento ~1,5 s, poi torna "AGGIUNGI IL MENU · 17,90 €".
  await expect(heavyCta).toHaveText('AGGIUNTO ✓');
  await expect(heavyCta).toBeDisabled();
  await expect(heavyCta).toHaveText('AGGIUNGI IL MENU · 17,90 €', { timeout: 4000 });
  await expect(heavyCta).toBeEnabled();

  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  // La riga carrello porta la birra inclusa: e' cio' che finisce sulla comanda (P0-2).
  const row = page.locator('.kitch-drawer-row', { hasText: 'PASTRAMI — FALLO PESANTE · KEILER HELLES' });
  await expect(row.locator('.kitch-drawer-row-name')).toHaveText('PASTRAMI — FALLO PESANTE · KEILER HELLES');
  await expect(row.locator('.kitch-drawer-row-price')).toHaveText('17,90 €');
});

test('21a. FALLO PESANTE con BIBITA (H4 + MENU OTTOBRE): scelta diretta, prezzo bibita, acqua esclusa, nessuna anteprima', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const openCard = page.locator('.pm-list .pc-card', { hasText: 'Brisket' });
  await openCard.getByTestId('choose-menu').click();
  const heavyCta = openCard.getByTestId('fallo-pesante-cta');
  await expect(heavyCta).toBeDisabled();

  // Birre invariate (6), sotto "BIBITE · comprese" le 7 bibite ammesse: l'acqua non c'e', Schweppes tolte.
  await expect(openCard.locator('.pm-beer-pills .pm-beer-pill')).toHaveCount(6);
  await expect(openCard.getByTestId('fallo-pesante-drinks-label')).toHaveText('BIBITE · comprese');
  await expect(openCard.getByTestId('fallo-pesante-beers-label')).toHaveText('BIRRE · +1 €');
  const drinks = openCard.locator('.pm-drink-pill');
  await expect(drinks).toHaveCount(7);
  // Ogni pillola ha il suo riquadro foto (immagine o segnaposto): Fanta/Sprite/Estathe non hanno ancora il file, niente buco.
  await expect(openCard.locator('.pm-drink-pill .pm-beer-pill-photo')).toHaveCount(7);
  await expect(openCard.locator('.pm-drink-pill .pm-beer-pill-photo--empty')).toHaveCount(4);
  await expect(openCard.locator('.pm-drink-pill', { hasText: 'Schweppes' })).toHaveCount(0);
  await expect(openCard.locator('.pm-drink-pill', { hasText: 'Estathé Limone' })).toHaveCount(1);
  await expect(openCard.locator('.pm-drink-pill', { hasText: 'Acqua' })).toHaveCount(0);
  await expect(openCard.locator('.pm-drink-pill', { hasText: 'Pepsi Zero' })).toHaveCount(1);

  // Tap su una bibita = scelta diretta: nessuna anteprima/"storia", CTA subito attiva, prezzo bibita.
  await openCard.locator('.pm-drink-pill', { hasText: 'Pepsi Zero' }).click();
  await expect(openCard.locator('.pm-beer-detail')).toHaveCount(0);
  await expect(openCard.locator('.pm-beer-chosen-name')).toHaveText('DA BERE: PEPSI ZERO');
  await expect(openCard.locator('.pm-beer-chosen')).toHaveCount(1);
  await expect(heavyCta).toBeEnabled();
  await expect(heavyCta).toHaveText('AGGIUNGI IL MENU · 16,90 €');

  // Scegliere una birra dopo la bibita sostituisce la scelta (mai entrambe) e il prezzo torna 17,90.
  await openCard.locator('.pm-beer-pill', { hasText: 'Keiler Helles' }).click();
  await openCard.locator('.pm-beer-detail').getByRole('button', { name: 'SCEGLI QUESTA BIRRA' }).click();
  await expect(openCard.locator('.pm-beer-chosen-name')).toHaveText('DA BERE: KEILER HELLES');
  await expect(openCard.locator('.pm-drink-pill--on')).toHaveCount(0);
  await expect(heavyCta).toHaveText('AGGIUNGI IL MENU · 17,90 €');

  // Torno sulla bibita e aggiungo: il sacco mostra la variante bibita, a 16,90 EUR.
  await openCard.locator('.pm-drink-pill', { hasText: 'Pepsi Zero' }).click();
  await heavyCta.click();
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  const row = page.locator('.kitch-drawer-row', { hasText: 'BRISKET — MENU BIBITA · PEPSI ZERO' });
  await expect(row.locator('.kitch-drawer-row-name')).toHaveText('BRISKET — MENU BIBITA · PEPSI ZERO');
  await expect(row.locator('.kitch-drawer-row-price')).toHaveText('16,90 €');
});

test('21b. CONTORNI (2026-09-19): Patate al Forno ordinabile come item singolo a €5,00', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'CONTORNI');

  const patate = page.locator('.ct-list .pc-card', { hasText: 'Patate al Forno' });
  await expect(patate).toHaveCount(1);
  await expect(patate.locator('.pc-price')).toHaveText(/^5[\d,]*\s?€$/);

  const cta = patate.getByRole('button', { name: 'Aggiungi Patate al Forno' });
  await expect(cta).toBeEnabled();
  await cta.click();

  await expect(page.locator('.kitch-bottom-bar')).toContainText('1 · Vai alla cassa');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('5,00 €');
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

test('22. TAGLIERI (restyling hero): schede compatte sempre aperte con ingredienti, allergeni e "+" giallo', async ({ page }) => {
  await page.goto('/kitchen?table=12&nickname=Eros');
  // Tab label = 'TAGLIERI' (MENU_CATEGORIES), la category key resta 'tagliere'.
  await openCategoryList(page, 'TAGLIERI');

  // Le 3 voci sono nella sezione dedicata, non nel fallback generico `kitch-menu-list`.
  await expect(page.locator('.tg-list .pc-card--compact')).toHaveCount(3);
  await expect(page.locator('.kitch-menu-list')).toHaveCount(0);

  // Niente accordion: ingredienti e prezzo sono subito visibili, mai "VEDI IL PANINO".
  const salumi = page.locator('.tg-list .pc-card', { hasText: 'Salumi Serissimi' });
  await expect(salumi.locator('.pc-ingredients')).toContainText('Crudo, lardo, mortadella, speck.');
  await expect(salumi.locator('.pc-price')).toHaveText(/^8[\d,]*\s?€$/);
  await expect(salumi.getByRole('button', { name: 'Aggiungi Salumi Serissimi' })).toBeEnabled();
  await expect(page.getByText(/VEDI IL TAGLIERE|VEDI IL PANINO/)).toHaveCount(0);

  // Gli allergeni del tagliere formaggi sono esposti sulla scheda.
  const formaggi = page.locator('.tg-list .pc-card', { hasText: 'Formaggi Discutibili' });
  await expect(formaggi.locator('.pc-allergens')).toContainText(/latte/i);

  // L'ordine finisce nel carrello col nome reale del tagliere.
  await formaggi.getByRole('button', { name: 'Aggiungi Formaggi Discutibili' }).click();
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await expect(page.locator('.kitch-drawer-row-name', { hasText: 'FORMAGGI DISCUTIBILI' })).toBeVisible();
});

test('23. MENU OTTOBRE: il MENU Pulled Pork sta sul Box (niente patate a parte), il panino Pulled Pork non lo ha piu', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const box = page.locator('.pm-list .pc-card', { hasText: 'Box Pulled Pork' });
  await expect(box).toHaveCount(1);
  await expect(box.getByRole('button', { name: /^Aggiungi Box Pulled Pork/i })).toBeEnabled();
  // Scelta SOLO BOX / MENU: la copy non parla di panino ne' di patate a parte.
  await expect(box.getByTestId('fallo-pesante-choose')).toBeVisible();
  await expect(box.getByTestId('choose-solo')).toContainText('SOLO BOX');
  await expect(box.getByTestId('fallo-pesante-includes')).toHaveText('MENU · BOX CON PATATE + DA BERE');
  await expect(box.getByTestId('fallo-pesante-choose')).not.toContainText(/PANINO|PATATE AL FORNO/);
  // Supplemento e extra birra calcolati dai dati: 13,90 − 11,50 = +2,40 €; birra 15,90 − 13,90 = +2 €.
  await expect(box.getByTestId('fallo-pesante-price')).toHaveText('+2,40 €');
  await expect(box.getByTestId('pmx-solo-cta')).toHaveText('AGGIUNGI BOX · 11,50 €');
  // Box: allergeni non verificati → avviso al posto della lista (mai "nessun allergene").
  await expect(box.getByTestId('allergens-unverified')).toHaveText('ALLERGENI DA CONFERMARE · CHIEDI AL BANCO');

  await box.getByTestId('choose-menu').click();
  const cta = box.getByTestId('fallo-pesante-cta');
  await expect(box.getByTestId('fallo-pesante-beers-label')).toHaveText('BIRRE · +2 €');
  await box.locator('.pm-drink-pill', { hasText: 'Fanta' }).click();
  await expect(cta).toHaveText('AGGIUNGI IL MENU · 13,90 €');
  await cta.click();
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  const row = page.locator('.kitch-drawer-row', { hasText: 'BOX PULLED PORK — MENU BIBITA · FANTA' });
  await expect(row.locator('.kitch-drawer-row-price')).toHaveText('13,90 €');

  // Il panino Pulled Pork resta vendibile da solo, senza scelta MENU.
  const panino = page.locator('.pm-list .pc-card', { hasText: 'Pulled Pork' }).filter({ hasNotText: 'Box' }).first();
  await expect(panino.getByRole('button', { name: /^Aggiungi Pulled Pork/i })).toBeEnabled();
  await expect(panino.getByTestId('fallo-pesante-choose')).toHaveCount(0);
});

test('23b. MENU OTTOBRE: patate finite → MENU di Pastrami/Brisket bloccati, MENU del Box ordinabile', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.addInitScript(() => {
    localStorage.setItem('walbox_kitchen_menu_availability', JSON.stringify({ 'item-058': false }));
  });
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const pastrami = page.locator('.pm-list .pc-card', { hasText: 'Pastrami' });
  await expect(pastrami.getByTestId('choose-menu')).toBeDisabled();
  await expect(pastrami.getByTestId('fallo-pesante-includes')).toHaveText('PATATE FINITE: SOLO PANINO');

  const box = page.locator('.pm-list .pc-card', { hasText: 'Box Pulled Pork' });
  await expect(box.getByTestId('choose-menu')).toBeEnabled();
  await box.getByTestId('choose-menu').click();
  await box.locator('.pm-drink-pill', { hasText: 'Sprite' }).click();
  await expect(box.getByTestId('fallo-pesante-cta')).toBeEnabled();
});

test('23c. H7: pulsante unico anche per il solo panino — niente "+" in alto, doppio tap = 1 sola riga, "AGGIUNTO ✓" poi di nuovo attivo', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const pastrami = page.locator('.pm-list .pc-card', { hasText: 'Pastrami' });
  // Nessun "+" / stepper in alto: l'unico modo di aggiungere e' il pulsante in fondo alla scelta.
  await expect(pastrami.locator('.pc-buy .pc-cta')).toHaveCount(0);
  const cta = pastrami.getByTestId('pmx-solo-cta');
  await expect(cta).toHaveText('AGGIUNGI PANINO · 14,50 €');

  // Doppio tap veloce: la seconda pressione trova il pulsante spento → una sola unita' nel sacco.
  await cta.dblclick();
  await expect(cta).toHaveText('AGGIUNTO ✓');
  await expect(cta).toBeDisabled();
  await expect(page.locator('.kitch-bottom-bar')).toContainText('1 · Vai alla cassa');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('14,50 €');
  await expect(pastrami.getByTestId('poster-card-qty')).toContainText('×1');

  // Dopo ~1,5 s torna attivo e un nuovo tap aggiunge la seconda unita'.
  await expect(cta).toHaveText('AGGIUNGI PANINO · 14,50 €', { timeout: 4000 });
  await expect(cta).toBeEnabled();
  await cta.click();
  await expect(pastrami.getByTestId('poster-card-qty')).toContainText('×2');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('29,00 €');
});

test('23d. H7: doppio tap su AGGIUNGI IL MENU aggiunge un solo menu', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-14T15:00:00'));
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'PESI MASSIMI');

  const brisket = page.locator('.pm-list .pc-card', { hasText: 'Brisket' });
  await brisket.getByTestId('choose-menu').click();
  await expect(brisket.getByTestId('fallo-pesante-price')).toHaveText('+1,90 €');
  await brisket.locator('.pm-drink-pill', { hasText: 'Pepsi Zero' }).click();
  const cta = brisket.getByTestId('fallo-pesante-cta');
  await expect(cta).toHaveText('AGGIUNGI IL MENU · 16,90 €');
  await cta.dblclick();
  await expect(cta).toHaveText('AGGIUNTO ✓');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('1 · Vai alla cassa');
  await expect(page.locator('.kitch-bottom-bar')).toContainText('16,90 €');
});

test('24. BEVANDE (restyling hero): schede compatte, nessuna foto rotta, nessun formato inventato', async ({ page }) => {
  const missing404 = [];
  page.on('response', (res) => {
    if (res.status() === 404 && res.url().includes('/assets/kitchen/menu/bevande/')) {
      missing404.push(res.url());
    }
  });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openCategoryList(page, 'BEVANDE');

  // 8 schede compatte, nessun fallback `kitch-menu-list` (né la vecchia lista generica).
  // Ordine MENU OTTOBRE: ACQUA · PEPSI · PEPSI ZERO · SEVEN UP · FANTA · SPRITE · ESTATHÉ PESCA · ESTATHÉ LIMONE.
  const cards = page.locator('.bv-list .pc-card--compact');
  await expect(cards).toHaveCount(8);
  await expect(page.locator('.bv-list .pc-name')).toHaveText([
    'Acqua', 'Pepsi', 'Pepsi Zero', 'Seven Up', 'Fanta', 'Sprite', 'Estathé Pesca', 'Estathé Limone',
  ]);
  await expect(page.locator('.bv-list .pc-card', { hasText: 'Schweppes' })).toHaveCount(0);
  await expect(page.locator('.kitch-menu-list')).toHaveCount(0);

  // Niente accordion: nessuna CTA "VEDI ..." da aprire.
  await expect(page.getByText(/VEDI LA BEVANDA|VEDI IL PANINO/)).toHaveCount(0);

  const acqua = page.locator('.bv-list .pc-card', { hasText: 'Acqua' });
  await expect(acqua.locator('.pc-meta')).toHaveText('0,5 L');
  await expect(acqua.locator('.pc-price')).toHaveText(/^1[\d,]*\s?€$/);
  await expect(acqua.getByRole('button', { name: 'Aggiungi Acqua' })).toBeEnabled();

  // Pepsi: il formato sta nella sua riga, non ripetuto nel titolo.
  const pepsi = page.locator('.bv-list .pc-card', { hasText: 'Pepsi' }).first();
  await expect(pepsi.locator('.pc-name')).toHaveText('Pepsi');
  await expect(pepsi.locator('.pc-meta')).toHaveText('33 CL');

  // Formato non confermato → nessuna riga formato, mai un cl inventato.
  const fanta = page.locator('.bv-list .pc-card', { hasText: 'Fanta' });
  await expect(fanta.locator('.pc-meta')).toHaveCount(0);
  await expect(fanta.locator('.pc-price')).toHaveText(/^4[\d,]*\s?€$/);

  // Foto: 4 <img> reali, nessun 404. Le 4 bibite nuove (Fanta, Sprite, Estathé) non hanno ancora
  // la foto: riquadro "FOTO IN ARRIVO", mai un <img> rotto. Le foto sotto la piega sono `lazy`:
  // si portano in vista una a una e si aspetta che il file sia decodificato (`naturalWidth > 0`).
  await expect(page.locator('.bv-list .pc-photo')).toHaveCount(4);
  await expect(page.locator('.bv-list .pc-photo-missing')).toHaveCount(4);
  for (const name of ['Fanta', 'Sprite', 'Estathé Pesca', 'Estathé Limone']) {
    await expect(page.locator('.bv-list .pc-card', { hasText: name }).locator('.pc-photo-missing')).toHaveText('FOTO IN ARRIVO');
  }

  for (let i = 0; i < 4; i += 1) {
    const img = page.locator('.bv-list .pc-photo').nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  const srcs = await page.locator('.bv-list .pc-photo').evaluateAll((imgs) =>
    imgs.map((img) => new URL(img.getAttribute('src'), location.origin).pathname)
  );
  expect(srcs).toEqual([
    '/assets/kitchen/menu/bevande/bevanda_acqua.webp',
    '/assets/kitchen/menu/bevande/bevanda_pepsi.webp',
    '/assets/kitchen/menu/bevande/bevanda_pepsi_zero.webp',
    '/assets/kitchen/menu/bevande/bevanda_seven_up.webp',
  ]);
  expect(missing404).toEqual([]);

  // L'ordine usa il nome reale (`name`), non il `displayName` del titolo.
  await pepsi.getByRole('button', { name: 'Aggiungi Pepsi 33cl' }).click();
  await page.locator('.kitch-bottom-bar').getByRole('button', { name: /Vai alla cassa/ }).click();
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
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');
  // S5: dopo il nome si sceglie AL BANCO e si atterra direttamente sullo status.
  await submitAndPay(page, 'counter');
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
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'takeaway');
  // S5: dopo il nome si sceglie AL BANCO e si atterra direttamente sullo status.
  await submitAndPay(page, 'counter');
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
  // Stessa storage key che @supabase/supabase-js v2 usa per il client dell'app:
  // `sb-<primo segmento dell'host di VITE_SUPABASE_URL>-auth-token` (es. `sb-127-auth-token` con
  // l'URL locale degli E2E). Seedarla qui evita di dover davvero autenticare il browser per
  // esercitare `supabase.auth.getSession()`.
  // `/` fa redirect a /kitchen: si aspetta la pagina finale, altrimenti l'evaluate può cadere a
  // metà navigazione ("Execution context was destroyed").
  await page.waitForURL(/\/kitchen/);
  await page.evaluate(({ s, key }) => {
    localStorage.setItem(key, JSON.stringify(s));
  }, { s: session, key: SUPABASE_AUTH_STORAGE_KEY });
}

const SUPABASE_AUTH_STORAGE_KEY = `sb-${new URL(globalThis.process?.env?.VITE_SUPABASE_URL || 'https://pcrqfdzipotprqtuemso.supabase.co').hostname.split('.')[0]}-auth-token`;

// Con una sessione presente, /kitchen/status rilegge kitchen_orders e la risposta del server
// SOSTITUISCE la lista locale (mergeFetchedOrders): un mock vuoto cancellerebbe gli ordini
// seedati. Qui la select restituisce gli stessi ordini come righe Supabase.
function toOrderRow(o) {
  return {
    id: o.id,
    order_code: o.orderCode,
    venue_id: 'walrus-main',
    nickname: o.nickname,
    status: o.status,
    total: o.total,
    payment_status: o.paymentStatus ?? null,
    online_payment_disabled: o.onlinePaymentDisabled ?? false,
    fulfillment_type: o.fulfillmentType ?? null,
    created_at: o.createdAt ?? null,
    customer_note: o.note ?? null,
    kitchen_order_items: (o.items ?? []).map((i) => ({ item_id: i.itemId, name: i.name, quantity: i.quantity, price: i.price })),
  };
}

async function mockOwnOrdersSelect(page, orders) {
  await page.route('**/rest/v1/kitchen_orders*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orders.map(toOrderRow)) })
  );
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
  await page.goto('/');
  await seedSupabaseSession(page);
  const reconcileCalls = await mockReconcile(page, 'pending');
  const seeded = [
    makeOtherCustomerOrder({ id: 'order-target', orderCode: 'T01', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment', createdAt: minutesAgoIso(2) }),
    makeOtherCustomerOrder({ id: 'order-other', orderCode: 'T02', nickname: 'Eros', status: 'preparing', paymentStatus: 'paid', createdAt: minutesAgoIso(1) }),
  ];
  await seedMyOrders(page, seeded);
  await mockOwnOrdersSelect(page, seeded);
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

test('37. Checkout V2: nome, dove, note e corsie sono sullo stesso schermo; nessun ordine finché non si tocca una corsia', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'P01' });

  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();

  // Tutto insieme, senza passaggi intermedi (niente CONFERMA → CONTINUA).
  await expect(page.getByTestId('customer-name-input')).toBeVisible();
  await expect(page.getByTestId('fulfillment-eat_here')).toBeVisible();
  await expect(page.getByTestId('kitchen-note-input')).toBeVisible();
  await expect(page.getByTestId('pay-lane-step')).toBeVisible();
  await expect(page.getByTestId('pay-lane-counter')).toBeVisible();
  await expect(page.getByTestId('pay-lane-online')).toBeVisible();
  await expect(page.getByText('COME PAGHI?')).toBeVisible();
  await expect(page).not.toHaveURL(/\/kitchen\/(payment|status)/);

  await chooseFulfillment(page, 'eat_here');
  await submitOrder(page);
  // Compilato tutto, ma nessun ordine esiste finché non si sceglie la corsia.
  expect(sent.calls.length).toBe(0);
});

// Nome obbligatorio senza default silenzioso: il tap su una corsia con nome vuoto non invia,
// spiega cosa manca e porta il focus sul campo nome.
test('37b. Tap su una corsia senza nome: nessun ordine, messaggio e focus sul nome', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'P02' });
  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'eat_here');

  await choosePayLane(page, 'counter');
  await expect(page.getByTestId('customer-name-error')).toBeVisible();
  await expect(page.getByTestId('customer-name-input')).toBeFocused();
  expect(sent.calls.length).toBe(0);
  await expect(page).not.toHaveURL(/\/kitchen\/status/);

  // Un solo carattere non basta (minimo 2), come prima.
  await page.getByTestId('customer-name-input').fill('M');
  await choosePayLane(page, 'online');
  await expect(page.getByTestId('customer-name-error')).toBeVisible();
  expect(sent.calls.length).toBe(0);
});

// Il nome è il protagonista ma resta semplice (niente dado, nomi veloci o saluto): si scrive nel campo
// e quel nome è quello che arriva sulla comanda (p_nickname).
test('37c. Nome: solo il campo (niente dado, chip o saluto); il nome scritto parte nell\'ordine', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'P03' });
  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();

  const input = page.getByTestId('customer-name-input');
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('customer-name-dice')).toHaveCount(0);
  await expect(page.getByTestId('customer-name-chip')).toHaveCount(0);

  await input.fill('Marco');
  await expect(page.getByTestId('customer-name-hello')).toHaveCount(0);

  await chooseFulfillment(page, 'takeaway');
  await expect(page.getByTestId('checkout-status')).toContainText(/Tricheco approva/i);
  await choosePayLane(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(sent.body.p_nickname).toBe('Marco');
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
  await page.goto('/');
  const seeded = [
    makeOtherCustomerOrder({ id: 'order-pay-online', orderCode: 'ON1', nickname: 'Eros', status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment' }),
  ];
  await seedMyOrders(page, seeded);
  // Con la sessione anonima creata al pagamento, lo status rilegge kitchen_orders: la select
  // deve restituire l'ordine (un [] lo cancellerebbe dallo stato, flaky con URL locale).
  await mockOwnOrdersSelect(page, seeded);
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

// ═══════════════════════════════════════════════════════════════════
// BUG A fix — online_payment_disabled (kitchen_orders) come fonte di verità server-side.
// Migration: 20260923120000 (colonna) / 20260923121000 (PASSA AL BANCO la imposta) /
// 20260923122000 (kitchen_payment_attempt_start la rispetta). Qui si verifica solo il lato
// cliente (useOrderPaymentFlow/OrderPaymentActions): `onlinePaymentDisabled: true` sull'ordine
// seedato simula un ordine per cui lo staff ha già eseguito PASSA AL BANCO — esattamente il campo
// che mapSupabaseOrder popolerebbe da row.online_payment_disabled.
// ═══════════════════════════════════════════════════════════════════

test('42. BUG A: online_payment_disabled=true — niente bivio, niente CTA online, solo messaggio + codice banco', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-online-disabled', orderCode: 'OD1', nickname: 'Eros',
      status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment',
      onlinePaymentDisabled: true,
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-online-disabled']);

  await page.goto('/kitchen/payment?orderId=order-online-disabled');

  // Nessun bivio "COME VUOI PAGARE?", nessuna CTA PAGA ONLINE — mai mostrata a prescindere da
  // localStorage: la scelta cliente non può più riaprire l'online per questo ordine.
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);
  await expect(page.getByTestId('ost-pay-online')).toHaveCount(0);
  await expect(page.getByText('💳 PAGA ONLINE')).toHaveCount(0);

  // Messaggio chiaro + codice ordine mostrato direttamente, come per la scelta CASSA esplicita.
  await expect(page.getByTestId('ost-online-payment-disabled-banner')).toBeVisible();
  await expect(page.getByText('Pagamento al banco — comunica il codice ordine alla cassa.')).toBeVisible();
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  await expect(page.getByText('OD1', { exact: true }).first()).toBeVisible();
});

test('43. BUG A: online_payment_disabled=true sopravvive a una scelta ONLINE già salvata in localStorage sullo stesso device', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-online-disabled-2', orderCode: 'OD2', nickname: 'Eros',
      status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment',
      onlinePaymentDisabled: true,
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-online-disabled-2']);
  // Simula un device che aveva scelto ONLINE prima che lo staff chiudesse il checkout (PASSA AL
  // BANCO): il flag server-side deve comunque vincere, mai la scelta stale in localStorage.
  await page.evaluate(() => localStorage.setItem('walbox_kitchen_payment_choice_order-online-disabled-2', 'online'));

  await page.goto('/kitchen/payment?orderId=order-online-disabled-2');

  await expect(page.getByTestId('ost-pay-online')).toHaveCount(0);
  await expect(page.getByText('💳 PAGA ONLINE')).toHaveCount(0);
  await expect(page.getByTestId('ost-online-payment-disabled-banner')).toBeVisible();
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
});

test('44. Regressione: ordine normale (online_payment_disabled assente/false) — bivio e CTA online invariati', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-normal-pay', orderCode: 'NP1', nickname: 'Eros',
      status: 'pending_counter_payment', paymentStatus: 'pending_counter_payment',
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-normal-pay']);

  await page.goto('/kitchen/payment?orderId=order-normal-pay');

  await expect(page.getByTestId('ost-online-payment-disabled-banner')).toHaveCount(0);
  await expect(page.getByTestId('ost-payment-fork')).toBeVisible();
  await expect(page.getByTestId('ost-pay-counter')).toBeVisible();
  await expect(page.getByTestId('ost-pay-online')).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════
// S5 — Payment Lifecycle V2: "COME VUOI PAGARE?" nel menu + corsia online (POP/PA) sullo status.
// Rete sempre mockata (RPC Supabase e /api/*): nessuna chiamata reale.
// ═══════════════════════════════════════════════════════════════════

async function fillCartToPayStep(page, { fulfillment = 'eat_here' } = {}) {
  await page.goto('/kitchen?table=12&nickname=Eros');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, fulfillment);
  await submitOrder(page);
  await expect(page.getByTestId('pay-lane-step')).toBeVisible();
}

test('45. S5 BANCO: v2 con corsia counter, nessun tentativo SumUp, status mostra il codice per la cassa senza bivio', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'B01' });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock' });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'counter');

  await expect(page).toHaveURL(/\/kitchen\/status\?orderId=order-e2e-checkout-mock/);
  expect(sent.calls.length).toBe(1);
  expect(sent.body.p_payment_lane).toBe('counter');
  expect(pay.attempts.length).toBe(0);
  await expect(page.locator('.ost-status-banner-label')).toHaveText('IN ATTESA DI PAGAMENTO');
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);
});

test('46. S5 ONLINE pagato: POP -> attempt_start (importo) -> create-checkout -> ritorno SumUp -> reconcile confirmed', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'O01', total: 13.9 });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock', reconcileOutcome: 'confirmed' });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'online');

  await expect(page).toHaveURL(/\/kitchen\/status\?.*sumup=return/);
  expect(sent.body.p_payment_lane).toBe('online');
  expect(pay.attempts.length).toBe(1);
  expect(pay.attempts[0].p_order_id).toBe('order-e2e-checkout-mock');
  expect(pay.attempts[0].p_amount).toBe(13.9);
  expect(pay.checkouts.length).toBe(1);
  expect(pay.checkouts[0].auth).toMatch(/^Bearer /);
  await expect.poll(() => pay.reconciles.length).toBeGreaterThan(0);
  await expect(page.getByText(/Pagamento confermato/i)).toBeVisible();
});

test('47. S5 ONLINE fallito: avvio SumUp KO -> status con POP, RIPROVA riavvia il pagamento', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'O02' });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock', checkoutOk: false });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'online');

  // L'ordine esiste già: l'avvio fallito porta allo status, non a un errore nel menu.
  await expect(page).toHaveURL(/\/kitchen\/status\?orderId=order-e2e-checkout-mock/);
  await expect(page).not.toHaveURL(/sumup=return/);
  await expect(page.getByTestId('ost-pop-block')).toBeVisible();
  await expect(page.getByTestId('ost-pop-timer')).toContainText('Tempo rimasto');
  await expect(page.getByTestId('ost-pop-retry')).toBeVisible();
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);

  pay.checkoutOk = true;
  await page.getByTestId('ost-pop-retry').click();
  await expect(page).toHaveURL(/\/kitchen\/status\?.*sumup=return/);
  expect(pay.attempts.length).toBe(2);
});

test('48. S5 ONLINE -> PAGA AL BANCO: POST con Bearer e order_id, poi "Fatto" + codice cassa', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'O03' });
  await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock', checkoutOk: false });
  const switchCalls = [];
  await page.route('**/api/kitchen-customer-switch-to-counter', async (route) => {
    switchCalls.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    await new Promise((r) => setTimeout(r, 300)); // finestra in cui i bottoni devono essere spenti
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ outcome: 'switched_to_counter' }) });
  });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'online');
  await expect(page.getByTestId('ost-pop-block')).toBeVisible();

  await page.getByTestId('ost-pop-switch-counter').click();
  await expect(page.getByTestId('ost-pop-switch-counter')).toBeDisabled();
  await expect(page.getByTestId('ost-pop-switch-done')).toBeVisible();
  await expect(page.getByText('Fatto: paga al banco con il codice.')).toBeVisible();
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  expect(switchCalls.length).toBe(1);
  expect(switchCalls[0].body).toEqual({ order_id: 'order-e2e-checkout-mock' });
  expect(switchCalls[0].auth).toMatch(/^Bearer /);
});

test('49. S5 PAGA AL BANCO: ogni 409 mostra il suo messaggio e il bottone si riabilita', async ({ page }) => {
  await page.goto('/');
  await seedSupabaseSession(page);
  const seeded = [
    makeOtherCustomerOrder({ id: 'order-pop-409', orderCode: 'K01', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: minutesAgoIso(1) }),
  ];
  await seedMyOrders(page, seeded);
  await mockOwnOrdersSelect(page, seeded);
  await seedOwnedOrderIds(page, ['order-pop-409']);
  const responses = [
    { status: 409, body: { error: 'switch_to_counter_uncertain', retryable: true, reason: 'x' }, expect: /Riprova tra qualche secondo/i },
    { status: 409, body: { error: 'order_already_paid' }, expect: /già pagato/i },
    { status: 409, body: { error: 'order_payment_abandoned' }, expect: /Ordine annullato: il pagamento non è stato completato entro 5 minuti\./ },
    { status: 409, body: { error: 'order_cancelled' }, expect: /annullato/i },
    { status: 403, body: { error: 'not_order_owner' }, expect: /Sessione ordine non riconosciuta/i },
    { status: 500, body: { error: 'internal' }, expect: /Riprova tra qualche secondo/i },
  ];
  let n = 0;
  await page.route('**/api/kitchen-customer-switch-to-counter', (route) => {
    const r = responses[n++];
    return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
  });
  await page.goto('/kitchen/status');
  for (const r of responses) {
    await page.getByTestId('ost-pop-switch-counter').click();
    await expect(page.getByTestId('ost-pop-switch-error')).toHaveText(r.expect);
    await expect(page.getByTestId('ost-pop-switch-counter')).toBeEnabled();
  }
  expect(n).toBe(responses.length);
});

test('50. S5 scadenza -> PA: testo esatto, RIFAI L\'ORDINE rimette i piatti nel sacco, CHIUDI nasconde solo su questo device', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({
      id: 'order-pa-1', orderCode: 'X01', nickname: 'Eros', status: 'payment_abandoned', paymentStatus: null,
      items: [{ itemId: 'item-058', name: 'Patate al Forno', quantity: 2, price: 5.0 }],
      total: 10, fulfillmentType: 'takeaway', createdAt: minutesAgoIso(6),
    }),
  ]);
  await seedOwnedOrderIds(page, ['order-pa-1']);

  await page.goto('/kitchen/status');
  const card = page.getByTestId('ost-pa-card');
  await expect(card).toBeVisible();
  await expect(page.locator('.ost-status-banner-sub')).toHaveText('Ordine annullato: il pagamento non è stato completato entro 5 minuti.');
  await expect(page.locator('.ost-status-banner-label')).toHaveText('ORDINE ANNULLATO');
  await expect(page.locator('.ost-codes-chip-status')).toHaveText('ORDINE ANNULLATO');
  // Nessuna promessa di "nessun addebito" e nessuna azione di pagamento su un PA.
  await expect(page.getByText(/addebit/i)).toHaveCount(0);
  await expect(page.getByTestId('ost-pop-block')).toHaveCount(0);
  await expect(page.getByTestId('ost-payment-fork')).toHaveCount(0);

  // RIFAI L'ORDINE: sacco ripopolato dalla persistenza esistente, poi /kitchen
  await page.getByTestId('ost-pa-rebuild').click();
  await expect(page).toHaveURL(/\/kitchen$/);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('walbox_kitchen_cart_v1') || 'null'));
  expect(cart.items).toEqual([{ id: 'item-058', baseId: 'item-058', qty: 2 }]);
  expect(cart.fulfillmentType).toBe('takeaway');
  // Un PA non è un "ordine attivo": nessun banner "SEGUI IL TUO ORDINE" nel menu.
  await expect(page.getByText(/HAI UN ORDINE ATTIVO/i)).toHaveCount(0);

  // CHIUDI: nasconde l'ordine PA su questo device, il registro proprietà resta intatto.
  await page.goto('/kitchen/status');
  await page.getByTestId('ost-pa-dismiss').click();
  await expect(page.getByTestId('ost-pa-card')).toHaveCount(0);
  await expect(page.getByTestId('order-status-empty')).toBeVisible();
  const owned = await page.evaluate(() => JSON.parse(localStorage.getItem('walbox_kitchen_my_order_ids') || '[]'));
  expect(owned).toContain('order-pa-1');
  await page.reload();
  await expect(page.getByTestId('ost-pa-card')).toHaveCount(0);
});

test('51. S5 finestre POP: active con timer + RIPROVA, retry_closed solo PAGA AL BANCO, closing "stiamo chiudendo" + PAGA AL BANCO', async ({ page }) => {
  await mockVenueOrdersSelect(page);
  await page.goto('/');
  await seedMyOrders(page, [
    makeOtherCustomerOrder({ id: 'pop-active', orderCode: 'W01', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: minutesAgoIso(1) }),
    makeOtherCustomerOrder({ id: 'pop-retry-closed', orderCode: 'W02', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: new Date(Date.now() - 285000).toISOString() }),
    makeOtherCustomerOrder({ id: 'pop-closing', orderCode: 'W03', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: minutesAgoIso(5.5) }),
    makeOtherCustomerOrder({ id: 'pop-no-date', orderCode: 'W04', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: undefined }),
  ]);
  await seedOwnedOrderIds(page, ['pop-active', 'pop-retry-closed', 'pop-closing', 'pop-no-date']);
  await page.goto('/kitchen/status');

  const active = page.getByTestId('ost-order-block-pop-active');
  await expect(active.getByTestId('ost-pop-timer')).toContainText(/Tempo rimasto per pagare online: [0-3]:\d\d/);
  await expect(active.getByTestId('ost-pop-retry')).toBeVisible();
  await expect(active.getByTestId('ost-pop-switch-counter')).toBeVisible();

  const rc = page.getByTestId('ost-order-block-pop-retry-closed');
  await expect(rc.getByTestId('ost-pop-retry-closed')).toHaveText('Il tempo per pagare online è finito. Puoi pagare al banco.');
  await expect(rc.getByTestId('ost-pop-retry')).toHaveCount(0);
  await expect(rc.getByTestId('ost-pop-switch-counter')).toBeVisible();

  const closing = page.getByTestId('ost-order-block-pop-closing');
  await expect(closing.getByTestId('ost-pop-closing')).toHaveText('Stiamo chiudendo il pagamento online…');
  await expect(closing.getByTestId('ost-pop-retry')).toHaveCount(0);
  await expect(closing.getByTestId('ost-pop-switch-counter')).toBeVisible();
  await expect(closing.locator('.ost-status-banner-label')).toHaveText('PAGAMENTO ONLINE IN CORSO');

  // createdAt mancante: nessun crash, nessun timer, RIPROVA disponibile
  const nodate = page.getByTestId('ost-order-block-pop-no-date');
  await expect(nodate.getByTestId('ost-pop-block')).toBeVisible();
  await expect(nodate.getByTestId('ost-pop-timer')).toHaveCount(0);
  await expect(nodate.getByTestId('ost-pop-retry')).toBeVisible();
});

test('52. S5 ritorno da SumUp dopo la scadenza: reconcile failed -> testo corretto, niente RIPROVA se retry_closed', async ({ page }) => {
  await page.goto('/');
  await seedSupabaseSession(page);
  await mockReconcile(page, 'failed');
  const seeded = [
    makeOtherCustomerOrder({ id: 'pop-late', orderCode: 'L01', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: new Date(Date.now() - 285000).toISOString() }),
  ];
  await seedMyOrders(page, seeded);
  await mockOwnOrdersSelect(page, seeded);
  await seedOwnedOrderIds(page, ['pop-late']);
  await page.goto('/kitchen/status?sumup=return&orderId=pop-late');

  const block = page.getByTestId('ost-order-block-pop-late');
  await expect(block.getByTestId('ost-pop-sumup-error')).toHaveText('Il pagamento online non è andato a buon fine.');
  await expect(block.getByTestId('ost-pop-retry')).toHaveCount(0);
  await expect(block.getByTestId('ost-pop-retry-closed')).toBeVisible();
  await expect(block.getByTestId('ost-pop-switch-counter')).toBeVisible();
});

test('53. S5 rete giù alla creazione: carrello intatto e stesso client_request_id al retry; carrello cambiato -> id nuovo', async ({ page }) => {
  await mockAnonymousSession(page);
  const ids = [];
  let attempt = 0;
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order_v2', (route) => {
    attempt += 1;
    ids.push(route.request().postDataJSON().p_client_request_id);
    if (attempt <= 2) return route.abort('failed');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 'order-net-1', order_code: 'N01', status: 'pending_counter_payment', payment_status: 'pending_counter_payment',
      total: 13.9, fulfillment_type: 'eat_here', created_at: new Date().toISOString(), service_day: '2026-10-13', service_sequence: 1,
    }) });
  });
  await page.route('**/rest/v1/kitchen_orders*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await fillCartToPayStep(page);

  await choosePayLane(page, 'counter');
  await expect(page.getByTestId('order-submit-error')).toBeVisible();
  await expect(page.getByTestId('pay-lane-counter')).toBeEnabled();
  // retry con lo stesso carrello: stesso client_request_id
  await choosePayLane(page, 'counter');
  await expect(page.getByTestId('order-submit-error')).toBeVisible();
  expect(ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('walbox_kitchen_cart_v1') || 'null'));
  expect(cart.items.length).toBe(1);

  // carrello cambiato dopo l'errore (ritiro diverso): id nuovo, poi la creazione riesce
  await page.reload();
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'takeaway');
  await submitOrder(page);
  await choosePayLane(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(ids.length).toBe(3);
  expect(ids[2]).not.toBe(ids[0]);
  // ordine creato: il client_request_id viene cancellato
  const stored = await page.evaluate(() => localStorage.getItem('walbox_kitchen_client_request_id_v1'));
  expect(stored).toBeNull();
});

test('54. S5 doppio tap su ONLINE: una sola creazione ordine', async ({ page }) => {
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'D01' });
  await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock' });
  await fillCartToPayStep(page);
  await page.getByTestId('pay-lane-online').dblclick();
  await expect(page).toHaveURL(/\/kitchen\/status/);
  expect(sent.calls.length).toBe(1);
});

test('55. S5 idempotenza "vince il primo": scelta BANCO ma il server restituisce POP -> status con pannello POP, nessun SumUp', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'I01', forceStatus: 'pending_online_payment' });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock' });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.getByTestId('ost-pop-block')).toBeVisible();
  await expect(page.getByTestId('ost-pop-switch-counter')).toBeVisible();
  expect(pay.attempts.length).toBe(0);
});

test('56. S5 idempotenza inversa: scelta ONLINE ma il server restituisce PCP -> status al banco, nessun SumUp', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'I02', forceStatus: 'pending_counter_payment' });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock' });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'online');
  await expect(page).toHaveURL(/\/kitchen\/status/);
  await expect(page.getByText('MOSTRA QUESTO CODICE ALLA CASSA')).toBeVisible();
  await expect(page.getByTestId('ost-pop-block')).toHaveCount(0);
  expect(pay.attempts.length).toBe(0);
});

// Customer Experience V2: senza il controllo codice promo l'importo del tentativo è sempre il
// totale pieno dell'ordine e il checkout non chiama mai il redeem (nessun passaggio in più).
test('57. S5 online senza promo: attempt_start con il totale pieno, nessun redeem prima del pagamento', async ({ page }) => {
  await mockCreateOrderRpc(page, { fulfillmentType: 'eat_here', orderCode: 'R01', total: 13.9 });
  const pay = await mockOnlinePayment(page, { orderId: 'order-e2e-checkout-mock' });
  const redeems = [];
  await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', async (route) => {
    redeems.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ total: 1 }) });
  });
  await fillCartToPayStep(page);
  await choosePayLane(page, 'online');
  await expect(page).toHaveURL(/\/kitchen\/status\?.*sumup=return/);
  expect(redeems).toHaveLength(0);
  expect(pay.attempts[0].p_amount).toBe(13.9);
});

test('59. S5 attempt_start rifiuta (online_payment_expired / order_payment_abandoned): messaggio corretto, ordine invariato', async ({ page }) => {
  await mockAnonymousSession(page);
  await page.goto('/');
  await seedSupabaseSession(page);
  const seeded = [
    makeOtherCustomerOrder({ id: 'pop-rej', orderCode: 'J01', nickname: 'Eros', status: 'pending_online_payment', paymentStatus: null, createdAt: minutesAgoIso(1) }),
  ];
  await seedMyOrders(page, seeded);
  await mockOwnOrdersSelect(page, seeded);
  await seedOwnedOrderIds(page, ['pop-rej']);
  const errors = ['online_payment_expired', 'order_payment_abandoned'];
  let n = 0;
  await page.route('**/rest/v1/rpc/kitchen_payment_attempt_start', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: errors[n++], details: null, hint: null }) })
  );
  await page.goto('/kitchen/status');
  await page.getByTestId('ost-pop-retry').click();
  await expect(page.getByTestId('ost-pop-sumup-error')).toHaveText('Il tempo per pagare online è finito. Puoi pagare al banco.');
  await page.getByTestId('ost-pop-retry').click();
  await expect(page.getByTestId('ost-pop-sumup-error')).toHaveText('Ordine annullato: il pagamento non è stato completato entro 5 minuti.');
});

// RITIRO AL WALRUS (2026-10-28): terza scelta con orario. Ora fissata a Roma (15/01/2026 12:30,
// UTC+1) per non dipendere dall'orologio reale; data nel passato così il token mockato non risulta
// scaduto. Al server va takeaway + p_pickup_slot sulla v3, mai sulla v2.
test('60. Ritiro al Walrus: scelta orario -> RPC v3 con takeaway + p_pickup_slot', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-15T12:30:00+01:00'));
  const sent = await mockCreateOrderRpc(page, { fulfillmentType: 'takeaway', orderCode: 'R01' });
  const v3 = { calls: [] };
  await page.route('**/rest/v1/rpc/kitchen_customer_create_order_v3', async (route) => {
    const body = route.request().postDataJSON();
    v3.calls.push(body);
    sent.createdRow = sent.createdRow ?? {
      id: 'order-e2e-pickup', order_code: 'R01', venue_id: 'walrus-main', table_id: null,
      nickname: body.p_nickname, status: 'pending_counter_payment', total: 13.9,
      payment_status: 'pending_counter_payment', payment_method: null, online_payment_disabled: false,
      fulfillment_type: body.p_fulfillment_type, pickup_slot: body.p_pickup_slot,
      customer_note: body.p_customer_note ?? null, service_day: '2026-01-15', service_sequence: 1,
      created_at: new Date().toISOString(),
      kitchen_order_items: (body.p_items ?? []).map((i) => ({ item_id: i.item_id, name: i.name, quantity: i.quantity, price: i.price })),
    };
    const row = { ...sent.createdRow };
    delete row.kitchen_order_items;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) });
  });

  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await chooseFulfillment(page, 'pickup');

  // Alle 12:30 la prima fascia prenotabile è 12:45 (anticipo minimo 15 minuti), la sera c'è tutta.
  const slots = page.getByTestId('pickup-slots');
  await expect(slots).toBeVisible();
  await expect(page.getByTestId('pickup-slot-1230')).toHaveCount(0);
  await expect(page.getByTestId('pickup-slot-1245')).toBeVisible();
  await expect(page.getByTestId('pickup-slot-2230')).toBeVisible();

  // Senza orario l'ordine non parte: si viene riportati sulla scelta dell'orario.
  await submitAndPay(page, 'counter');
  await expect(page.getByTestId('pickup-slot-error')).toBeVisible();
  expect(v3.calls).toHaveLength(0);

  await page.getByTestId('pickup-slot-1315').click();
  await expect(page.getByTestId('pickup-slot-chosen')).toContainText('13:15');
  await choosePayLane(page, 'counter');
  await expect(page).toHaveURL(/\/kitchen\/status/);

  expect(v3.calls).toHaveLength(1);
  expect(v3.calls[0].p_fulfillment_type).toBe('takeaway');
  expect(v3.calls[0].p_pickup_slot).toBe('13:15');
  expect(sent.calls).toHaveLength(0); // nessuna chiamata alla v2
  await expect(page.getByTestId('ost-pickup')).toHaveText('Ritiro alle 13:15');
});

test('61. Ritiro al Walrus: dopo le 22:15 la scelta è spenta con spiegazione', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-15T22:40:00+01:00'));
  await page.goto('/kitchen');
  await openFullMenu(page);
  await addFirstOrderableItem(page);
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await expect(page.getByTestId('fulfillment-pickup')).toBeDisabled();
  await expect(page.getByTestId('pickup-unavailable')).toContainText('fasce sono finite');
});
