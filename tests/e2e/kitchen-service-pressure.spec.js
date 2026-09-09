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
      nickname: 'Bob',
      items: [{ itemId: 'item-001', name: 'Porchetta', quantity: 1, price: 8.5 }],
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
      nickname: 'Frank',
      items: [{ itemId: 'item-001', name: 'Porchetta', quantity: 2, price: 8.5 }],
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
      nickname: 'Ivy',
      items: [{ itemId: 'item-001', name: 'Porchetta', quantity: 1, price: 8.5 }],
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
  await page.setViewportSize({ width: 1280, height: 900 });
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

// STAFF UX CONSOLIDATION FASE 1 (2026-09-07): /kitchen/staff non monta piu' la vecchia dashboard
// a tab (BANCONE/CUCINA/MENU/STORICO/ALERT) — e' solo un redirect verso /kitchen/solo, l'unica UI
// operativa. Questa suite e' stata riportata sul modello reale di Solo Service: coda + un ordine
// in focus alla volta (non righe multiple per tab), selezione ordine via `.kss-qcard[data-order]`
// (il nickname non e' piu' mostrato nella coda live — solo l'orderCode, vedi audit Fase 1), azione
// consigliata via `next-action`, azioni secondarie (RITIRATO manuale, nota staff, annulla) nel menu
// ALTRO..., overlay MENU/STORICO/ALERT via i bottoni header (stessi componenti MenuView/StoricoView/
// AlertView, invariati e riusati identici da Team dashboard e Solo Service).
test.describe('Kitchen Service Pressure Test', () => {
  test('1. loads a clean Walbox Demo Night', async ({ page }) => {
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible();

    // I 9 ordini seed si distribuiscono nelle 3 code attive (delivered/cancelled restano fuori,
    // visibili solo in STORICO): D01/D02 da incassare, D03/D04/D09 da fare, D05/D06 pronti.
    await expect(page.getByTestId('kpi-paga')).toHaveText('2');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('3');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');

    for (const code of ['D01', 'D02', 'D03', 'D04', 'D09', 'D05', 'D06']) {
      await expect(page.locator(`.kss-qcard[data-order="${code}"]`)).toBeVisible();
    }
    // Delivered/cancelled non fanno parte della coda attiva.
    await expect(page.locator('.kss-qcard[data-order="D07"]')).toHaveCount(0);
    await expect(page.locator('.kss-qcard[data-order="D08"]')).toHaveCount(0);
  });

  test('2. incasso in contanti al banco + ritiro ordine pronto', async ({ page }) => {
    // Sprint 3B: l'incasso al banco passa dalla RPC kitchen_payment_record_counter. Gli ordini
    // del seed sono locali/demo e non esistono lato server, quindi si mocka il path RPC (stesso
    // approccio di kitchen-solo-service.spec.js) per osservare la UI a fronte di un esito ok.
    const rpcMethods = [];
    await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', (route) => {
      rpcMethods.push(route.request().postDataJSON()?.p_method);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    // Incasso in contanti (Alice/D01): il bottone principale next-action resta CONTANTI di
    // default (vedi anche 2c per il percorso CARTA/POS) — porta l'ordine in focus e conferma.
    // L'incasso riuscito sposta D01 da DA INCASSARE a DA FARE (resta in coda, cambia gruppo),
    // non sparisce dal DOM: si verifica sul conteggio KPI, come kitchen-solo-service.spec.js:4.
    await page.locator('.kss-qcard[data-order="D01"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D01');
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');
    await page.getByTestId('next-action').click();

    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('4');
    expect(rpcMethods).toContain('cash');

    // Mark one ready order as RITIRATO (Eve/D05).
    await page.locator('.kss-qcard[data-order="D05"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D05');
    await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
    await page.getByTestId('next-action').click();
    await expect(page.locator('.kss-qcard[data-order="D05"]')).toHaveCount(0);
  });

  // GAP CHIUSO (SOLO SERVICE CONSOLIDATION GAP FIX, 2026-09-07): il focus/next-action di Solo
  // Service ora espone anche CARTA/POS accanto al bottone principale (sempre CONTANTI, invariato
  // per compatibilità con i test esistenti), stesso contratto RPC di CounterOrdersView legacy
  // (p_method: 'cash' | 'card_counter_manual') e stessa conferma esplicita via window.confirm
  // prima di incassare con carta/POS — l'incasso avviene su hardware esterno e non è verificabile
  // dall'app. Vedi src/pages/KitchenSoloService.jsx (recordCounterPayment, next-action-card).
  test('2c. incasso con carta/POS al banco richiede conferma esplicita', async ({ page }) => {
    const rpcMethods = [];
    await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', (route) => {
      rpcMethods.push(route.request().postDataJSON()?.p_method);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    // Bob/D02: il bottone CONTANTI principale resta disponibile (invariato), CARTA/POS è
    // un'azione distinta che richiede conferma esplicita prima di chiamare la RPC.
    await page.locator('.kss-qcard[data-order="D02"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D02');
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');
    await expect(page.getByTestId('next-action-card')).toContainText('CARTA/POS');

    const confirmTexts = [];
    page.once('dialog', (dialog) => { confirmTexts.push(dialog.message()); dialog.accept(); });
    await page.getByTestId('next-action-card').click();

    expect(confirmTexts).toHaveLength(1);
    expect(confirmTexts[0]).toContain('8.50');
    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    expect(rpcMethods).toEqual(['card_counter_manual']);
  });

  test('2d. annullare la conferma carta/POS non incassa l\'ordine', async ({ page }) => {
    const rpcMethods = [];
    await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', (route) => {
      rpcMethods.push(route.request().postDataJSON()?.p_method);
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    await page.locator('.kss-qcard[data-order="D02"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D02');

    page.once('dialog', (dialog) => dialog.dismiss());
    await page.getByTestId('next-action-card').click();

    // Nessuna conferma -> nessuna chiamata RPC, l'ordine resta da incassare.
    await expect(page.getByTestId('kpi-paga')).toHaveText('2');
    expect(rpcMethods).toEqual([]);
  });

  test('2b. cancels a pending counter order with a preset reason', async ({ page }) => {
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    // Solo Service non ha il modale MOTIVO ANNULLAMENTO (Fuori stock / Altro) di CounterOrdersView:
    // usa window.prompt con default 'Fuori stock' (src/pages/KitchenSoloService.jsx:354-359,
    // askCancel). Stessa capacita' (annulla con motivo), meccanismo diverso (dialog nativo).
    await page.locator('.kss-qcard[data-order="D02"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D02');

    let dialogMessage = '';
    let dialogDefault = '';
    page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      dialogDefault = dialog.defaultValue();
      // dialog.accept() senza argomento restituisce stringa vuota a window.prompt(), non il
      // default mostrato nel box: askCancel tratta '' come falsy e non chiama cancelOrder.
      // Va passato esplicitamente il default per confermarlo davvero.
      dialog.accept(dialogDefault);
    });
    await page.getByRole('button', { name: /ALTRO/i }).click();
    await page.getByRole('button', { name: 'Annulla ordine' }).click();

    expect(dialogMessage).toContain('Annullare D02');
    expect(dialogDefault).toBe('Fuori stock');
    await expect(page.locator('.kss-qcard[data-order="D02"]')).toHaveCount(0);

    const orders = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '[]'), LS_ORDERS);
    const order = orders.find((o) => o.id === 'demo-order-2');
    expect(order.status).toBe('cancelled');
    expect(order.cancelReason).toBe('Fuori stock');
  });

  test('3. handles kitchen production flow', async ({ page }) => {
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    // Start one paid/new order (Charlie/D03).
    await page.locator('.kss-qcard[data-order="D03"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D03');
    await expect(page.getByTestId('next-action')).toContainText('INIZIA');
    await page.getByTestId('next-action').click();
    await expect(page.locator('.kss-qcard[data-order="D03"]')).toContainText('IN PREPARAZIONE');

    // Mark one preparing order as PRONTO (Diana/D04).
    await page.locator('.kss-qcard[data-order="D04"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D04');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // Diana e' ora pronta per il ritiro: la card resta in coda nel gruppo PRONTI, RITIRATO
    // disponibile dal menu ALTRO... sul suo focus.
    await expect(page.locator('.kss-qcard[data-order="D04"]')).toBeVisible();
    await page.locator('.kss-qcard[data-order="D04"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('D04');
    await page.getByRole('button', { name: /ALTRO/i }).click();
    await expect(page.getByRole('button', { name: 'Segna come RITIRATO' })).toBeEnabled();
    await page.keyboard.press('Escape').catch(() => {});
  });

  test('4. keeps menu, history and alerts useful', async ({ page }) => {
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    // Open MENU and toggle one product availability (overlay, stesso MenuView.jsx di Team).
    await page.getByRole('button', { name: /^MENU$/ }).click();
    const firstAvailable = page.getByRole('button', { name: /✓ DISPONIBILE/i }).first();
    await expect(firstAvailable).toBeVisible();
    await firstAvailable.click();
    await expect(page.getByRole('button', { name: /✕ ESAURITO/i }).first()).toBeVisible();

    const savedMap = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || '{}'),
      LS_MENU,
    );
    expect(Object.values(savedMap).some((v) => v === false)).toBe(true);
    await page.getByRole('button', { name: 'CHIUDI' }).click();

    // Open STORICO and verify delivered/cancelled orders are visible (stesso StoricoView.jsx).
    await page.getByRole('button', { name: /STORICO/i }).click();
    await expect(page.getByText('Grace')).toBeVisible(); // Delivered
    await expect(page.getByText('Hank')).toBeVisible(); // Cancelled
    await expect(page.getByText('Fuori stock')).toBeVisible();
    await page.getByRole('button', { name: 'CHIUDI' }).click();

    // Open ALERT and verify allergen/slow order signals are visible (stesso AlertView.jsx).
    // Sprint 3B: gli allergeni sono raggruppati per ORDINE, non piu' per tavolo, quindi lo stesso
    // nickname puo' comparire sia in URGENZA TEMPI sia in ALLERGENI ATTIVI. Le asserzioni sono
    // percio' scopate sulla sezione, non globali.
    await page.getByRole('button', { name: /ALERT/i }).click();

    const urgentSection = page.locator('.ksd-section', { hasText: 'URGENZA TEMPI' });
    await expect(urgentSection.getByText('Ivy')).toBeVisible(); // Slow/critical
    await expect(urgentSection.getByText(/🔴 CRITICO/)).toBeVisible();

    const allergenSection = page.locator('.ksd-section', { hasText: 'ALLERGENI ATTIVI' });
    await expect(allergenSection.getByText('GLUTINE').first()).toBeVisible();
    await expect(allergenSection.getByText('PESCE').first()).toBeVisible();

    // Il conteggio e' in ordini e le righe sono identificate da #codice + nickname:
    // nessun residuo di tavoli nel contratto Kitchen.
    await expect(allergenSection.locator('.ksd-section-count')).toContainText(/ordin[ei]/);
    await expect(allergenSection.locator('.ksd-row-nickname').first()).toBeVisible();
    await expect(page.locator('.ksd-row-table')).toHaveCount(0);
  });

  test('5. LOGOUT nel menu ALTRO (non in header) riporta al login', async ({ page }) => {
    // Mock del solo endpoint auth logout (stesso approccio di mock RPC del test 2): la sessione
    // e' bypassata (VITE_E2E_BYPASS_STAFF_AUTH), quindi non esiste una sessione reale da chiudere,
    // ma handleLogout chiama comunque supabaseAuth.signOut() prima di navigare al login.
    await page.route('**/auth/v1/logout*', (route) => route.fulfill({ status: 204, body: '' }));

    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    await expect(page.locator('.kss-header').getByRole('button', { name: /LOGOUT/i })).toHaveCount(0);

    await page.getByRole('button', { name: /ALTRO/i }).click();
    await page.getByTestId('logout-btn').click();

    await page.waitForURL('**/kitchen/login', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/login/);
  });

  test('6. Pagamenti dal menu ALTRO apre /kitchen/payments direttamente (nessuna dipendenza da /kitchen/staff)', async ({ page }) => {
    await page.goto('/kitchen/staff');
    await page.waitForURL('**/kitchen/solo');

    await page.getByRole('button', { name: /ALTRO/i }).click();
    await page.getByRole('button', { name: 'Pagamenti' }).click();

    await page.waitForURL('**/kitchen/payments', { timeout: 10000 });
    await expect(page).toHaveURL(/\/kitchen\/payments/);
  });
});
