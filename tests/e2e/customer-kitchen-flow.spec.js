import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

// Panini V2 esposti al cliente (item-001 / item-002 legacy sono nascosti nella UI cliente).
const PANINI_IDS = [
  'item-012', 'item-013', 'item-014',
  'item-015', 'item-016', 'item-017', 'item-032', 'item-033',
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

  // Home → menu completo → primo prodotto ordinabile (Pesi Massimi)
  await openFullMenu(page);
  await addFirstOrderableItem(page);

  // Open cart bottom sheet via the floating pill
  await page.getByRole('button', { name: /VAI ALL'ORDINE/i }).click();

  // Submit the order
  await page.getByRole('button', { name: /Invia ordine/i }).click();

  // handleSubmit ora attende addOrder() (sessione anonima + tentativo RPC) prima di mostrare
  // la conferma: aspettare lo schermo ORDINE RICEVUTO è il segnale reale che l'ordine è stato
  // scritto (fallback locale incluso), invece di leggere localStorage a tempo fisso subito
  // dopo il click.
  await expect(page.getByText('ORDINE RICEVUTO')).toBeVisible();

  // No-tables contract (2026-09-05): Kitchen non ha tavoli/asporto. L'ordine creato
  // deve preservare l'identità cliente (nickname) e avere un order_code coerente
  // (fallback locale A01…Z99 quando la RPC server-side non è raggiungibile), senza
  // richiedere né scrivere alcun campo table/fulfillment.
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
  expect(latest.fulfillmentType).toBeUndefined();
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
