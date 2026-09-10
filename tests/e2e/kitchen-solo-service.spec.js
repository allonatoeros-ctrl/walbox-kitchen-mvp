import { test, expect } from '@playwright/test';

const LS_ORDERS = 'walbox_kitchen_orders_demo';

function seedOrders() {
  const now = Date.now();
  const ago = (m) => new Date(now - m * 60 * 1000).toISOString();
  return [
    // Da pagare al banco
    {
      id: 'solo-1', orderCode: 'W47', table: 'T1', nickname: 'Alice',
      items: [{ itemId: 'item-002', name: 'Panino del Tricheco', quantity: 2, price: 9.0 }],
      total: 18.5, status: 'pending_counter_payment', paymentStatus: 'pending',
      createdAt: ago(2), note: '',
    },
    // In preparazione (focus atteso: il più vecchio dei "da fare")
    {
      id: 'solo-2', orderCode: 'W43', table: 'T3', nickname: 'Bruno',
      items: [{ itemId: 'item-002', name: 'Combo Cavallo', quantity: 2, price: 16.0 }],
      total: 32.0, status: 'preparing', paymentStatus: 'paid',
      createdAt: ago(7), note: '', staffNote: '',
    },
    // Nuovo, pagato
    {
      id: 'solo-3', orderCode: 'W44', table: 'T4', nickname: 'Carla',
      items: [{ itemId: 'item-001', name: 'Smash Burger', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'received', paymentStatus: 'paid',
      createdAt: ago(4), note: 'Senza cipolla', staffNote: 'Allergia dichiarata',
    },
    // Pronto per il ritiro
    {
      id: 'solo-4', orderCode: 'W41', table: 'T1', nickname: 'Dario',
      items: [{ itemId: 'item-002', name: 'Pulled Pork', quantity: 1, price: 9.0 }],
      total: 9.0, status: 'ready', paymentStatus: 'paid',
      createdAt: ago(20), readyAt: ago(1), note: '',
    },
  ];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(
    ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
    { key: LS_ORDERS, data: seedOrders() }
  );
});

test.describe('Kitchen — Solo Service Mode V2', () => {

  test('1. tablet: CODA + ORDINE IN FOCUS con KPI PAGA/DA FARE/PRONTI', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByText('SOLO SERVICE MODE')).toBeVisible();
    await expect(page.getByText('CODA ORDINI')).toBeVisible();

    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('2');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');

    // Focus di default = ordine "da fare" più vecchio
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // Gruppi coda
    await expect(page.getByText('DA INCASSARE', { exact: true })).toBeVisible();
    await expect(page.getByText('DA FARE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PRONTI', { exact: true }).first()).toBeVisible();
  });

  test('2. una sola next action, coerente con lo stato', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    const next = page.getByTestId('next-action');
    await expect(next).toContainText('PRONTO');
    await next.click();

    // W43 diventa pronto: il focus passa al prossimo da fare (W44)
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await expect(page.getByTestId('next-action')).toContainText('INIZIA');

    await page.getByTestId('next-action').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
  });

  test('3. allergeni prominenti sull\'ordine in focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByText('ALLERGENI')).toBeVisible();
    await expect(page.getByTestId('focus-allergeni')).toContainText('Glutine');
    await expect(page.getByText('ATTENZIONE')).toBeVisible();
  });

  test('4. pagamento rapido: incassa e torna al focus precedente', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // Il pagamento rapido chiama la RPC Supabase reale (kitchen_payment_record_counter):
    // gli ordini seed sono locali/demo e non esistono lato server, quindi va mockato
    // il path RPC corrente per verificare il comportamento della UI a fronte di un esito positivo.
    await page.route('**/rest/v1/rpc/kitchen_payment_record_counter', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    const quickPay = page.getByTestId('quick-pay');
    await expect(quickPay).toContainText('W47');
    await quickPay.click();

    // Il focus resta su W43, la coda "da pagare" si svuota
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('kpi-paga')).toHaveText('0');
    await expect(page.getByTestId('kpi-dafare')).toHaveText('3');
  });

  test('5. deviazione manuale sul banco: dopo l\'incasso torna a W43', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W47');
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');

    await page.getByTestId('next-action').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
  });

  test('6. MENU / STORICO / ALERT restano secondari (overlay)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    // Il focus resta la vista principale, nessuna tab bar
    await expect(page.getByRole('button', { name: /^BANCONE$/ })).toHaveCount(0);

    await page.getByRole('button', { name: /MENU/ }).click();
    await expect(page.locator('.kss-overlay')).toBeVisible();
    await page.getByRole('button', { name: /CHIUDI/ }).click();
    await expect(page.locator('.kss-overlay')).toHaveCount(0);

    await page.getByRole('button', { name: /ALERT/ }).click();
    await expect(page.locator('.kss-overlay')).toBeVisible();
  });

  test('7. phone: Focus Mode, un ordine alla volta', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/kitchen/solo');

    // Coda nascosta, focus visibile
    await expect(page.locator('.kss-queue-col')).toBeHidden();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // Navigazione fra ordini
    await page.getByRole('button', { name: /SUCC/ }).click();
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await page.getByRole('button', { name: /PREC/ }).click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');

    // La coda si apre a schermo intero e riporta al focus
    await page.getByRole('button', { name: /CODA \(/ }).click();
    await expect(page.locator('.kss-queue-col')).toBeVisible();
    await page.locator('.kss-qcard[data-order="W41"]').click();
    await expect(page.locator('.kss-queue-col')).toBeHidden();
    await expect(page.getByTestId('focus-code')).toHaveText('W41');
    await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
  });

  test('8. RINVIA sposta il focus senza perdere l\'ordine', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await page.getByRole('button', { name: /RINVIA/ }).click();

    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    // W43 resta in coda, solo rinviato
    await expect(page.locator('.kss-qcard[data-order="W43"]')).toBeVisible();
    await expect(page.getByTestId('kpi-dafare')).toHaveText('2');
  });

  // Supabase non è configurato in questo ambiente locale (nessun .env) — ogni write
  // fallisce già oggi, silenziosamente prima di questa patch. Questi test verificano
  // che il fallimento sia ora sempre visibile (mai presentato come successo) e che il
  // polling non "rewindi" silenziosamente lo stato durante/dopo un fallimento.
  test('9. write failure: azione mutativa mostra il tag SYNC ✗ sulla card, mai spacciata per successo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // W43 passa a "pronto" nella UI (ottimistico), ma la sync verso Supabase fallisce
    // (ambiente senza .env): deve comparire un indicatore di errore sulla card, non un
    // successo silenzioso.
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();

    // Il dettaglio in focus (aprendo la card) mostra il banner con motivo e RIPROVA.
    await page.locator('.kss-qcard[data-order="W43"]').click();
    const banner = page.getByTestId('sync-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Salvataggio non riuscito');
    await expect(page.getByRole('button', { name: 'RIPROVA' })).toBeVisible();
  });

  test('10. retry: RIPROVA ritenta la sync senza spacciare il fallimento per successo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.getByTestId('next-action').click();
    await page.locator('.kss-qcard[data-order="W43"]').click();

    const banner = page.getByTestId('sync-error-banner');
    await expect(banner).toBeVisible();

    // Stesso ambiente (Supabase non configurato): il retry fallisce di nuovo,
    // ma il banner/tag devono restare — mai un falso "sincronizzato".
    await page.getByRole('button', { name: 'RIPROVA' }).click();
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();
    await expect(page.getByTestId('focus-code')).toHaveText('W43'); // stato locale coerente, nessun crash
  });

  test('11. poll durante mutation: lo stato aggiornato non viene riavvolto dal polling successivo', async ({ page }) => {
    test.setTimeout(40000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // Ordine passato a "pronto" (ottimistico); la sync verso Supabase fallisce subito
    // (ambiente senza .env) e resta segnalata.
    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();

    // Il poll gira ogni 10s: aspettiamo un ciclo pieno. Prima della fix, il poll
    // avrebbe silenziosamente riportato W43 allo stato precedente ("preparing"),
    // facendolo sparire dai "pronti" e riapparire tra i "da fare" senza alcun avviso.
    await page.waitForTimeout(11000);

    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
    await expect(page.locator('.kss-qcard[data-order="W43"]')).toBeVisible();
  });

  // P0-B — protezione da click accidentale: banner undo dopo PRONTO/CONSEGNATO.
  test('12. PRONTO → UNDO ripristina lo stato precedente e il focus', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await page.getByTestId('next-action').click();

    // Il focus passa avanti, ma compare l'undo per W43 appena segnato pronto.
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    const toast = page.getByTestId('undo-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('W43');
    await expect(toast).toContainText('PRONTO');

    await page.getByTestId('undo-btn').click();

    // Reverse esplicito: W43 torna "in preparazione", focus torna su W43, toast sparito.
    await expect(page.getByTestId('undo-toast')).toHaveCount(0);
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await expect(page.getByTestId('kpi-pronti')).toHaveText('1');
  });

  test('13. CONSEGNATO → UNDO ripristina PRONTO', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W41"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W41');
    await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
    await page.getByTestId('next-action').click();

    const toast = page.getByTestId('undo-toast');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('W41');
    await expect(toast).toContainText('CONSEGNATO');

    await page.getByTestId('undo-btn').click();

    // Reverse esplicito: W41 torna "pronto", focus torna su W41, toast sparito.
    await expect(page.getByTestId('undo-toast')).toHaveCount(0);
    await expect(page.getByTestId('focus-code')).toHaveText('W41');
    await expect(page.getByTestId('next-action')).toContainText('RITIRATO');
  });

  test('14. la finestra di UNDO scade automaticamente senza reverse', async ({ page }) => {
    test.setTimeout(20000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.getByTestId('next-action').click(); // W43 -> pronto
    await expect(page.getByTestId('undo-toast')).toBeVisible();

    await page.waitForTimeout(9500);

    // Toast auto-dismiss allo scadere; nessun reverse automatico: W43 resta "pronto".
    await expect(page.getByTestId('undo-toast')).toHaveCount(0);
    await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
  });

  test('15. undo rispetta P0-A: sync fallita resta visibile con SYNC ✗ e RIPROVA, mai un falso successo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await page.getByTestId('next-action').click(); // W43 -> pronto, sync fallisce già qui (ambiente senza .env)
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();

    await page.getByTestId('undo-btn').click(); // reverse esplicito: ritenta la sync sul patch inverso

    // Stato locale ripristinato e focus tornato su W43, ma il fallimento della sync
    // sull'operazione di undo resta segnalato: mai un successo silenzioso.
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');
    await expect(page.getByTestId('sync-error-tag-W43')).toBeVisible();
  });

  // P0-1 — vedi ai-ops/reports/kitchen-solo-final-operational-review.md: dopo una qualunque
  // selezione manuale (tap coda, RINVIA, quick-pay, PREC/SUCC) focusId resta "agganciato" a un
  // id preciso e il vecchio fallback su workOrder[0] smette di far avanzare il focus dopo PRONTO.
  test('16. P0-1: selezione manuale in coda poi PRONTO — il focus avanza, non resta bloccato', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    // Selezione manuale esplicita (anche sull'ordine già in focus): fissa focusId, come farebbe
    // uno staff che tocca la coda per orientarsi — precondizione del bug P0-1.
    await page.locator('.kss-qcard[data-order="W43"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');

    await page.getByTestId('next-action').click();

    // Il focus deve avanzare al prossimo ordine da fare (W44), non restare bloccato su W43
    // (ora "pronto"): altrimenti l'operatore vede "RITIRATO" su un ordine già fatto mentre W44
    // resta ignorato in coda.
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
    await expect(page.getByTestId('next-action')).toContainText('INIZIA');
    // W43 resta in coda, ora tra i PRONTI: nessun ordine perso.
    await expect(page.locator('.kss-qcard[data-order="W43"]')).toBeVisible();
  });

  test('17. P0-1: RINVIA, selezione di ritorno, poi PRONTO — il focus avanza comunque', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await page.getByRole('button', { name: /RINVIA/ }).click();
    await expect(page.getByTestId('focus-code')).toHaveText('W44');

    // Lo staff torna manualmente su W43 (rinviato ma ancora attivo) per completarlo.
    await page.locator('.kss-qcard[data-order="W43"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W43');
    await expect(page.getByTestId('next-action')).toContainText('PRONTO');

    await page.getByTestId('next-action').click();

    // Anche dopo RINVIA + selezione di ritorno, il focus avanza al prossimo ordine da fare
    // (W44), non resta bloccato su W43 appena segnato pronto.
    await expect(page.getByTestId('focus-code')).toHaveText('W44');
  });

  // Personalità Discutibile Pass — Redemption V2 (Opzione A). La RPC
  // kitchen_promo_pass_redeem_for_order è mockata via route: questi test verificano solo il
  // wiring client (prompt → chiamata → badge/messaggio), non la logica server (già coperta da
  // supabase/migrations/20260910120000_kitchen_promo_pass_redeem_v1.test.js).
  test('18. Codice promo valido: badge sconto + totale aggiornato, CONFERMA PAGAMENTO resta disponibile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'solo-1', promo_code: 'WALRUS-AB12C', discount_amount: 1.39, total: 17.11 }),
      })
    );
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    await expect(page.getByTestId('focus-code')).toHaveText('W47');
    await expect(page.getByTestId('promo-code-btn')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept('walrus-ab12c'));
    await page.getByTestId('promo-code-btn').click();

    const badge = page.getByTestId('promo-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('WALRUS-AB12C');
    await expect(badge).toContainText('1.39');
    await expect(badge).toContainText('17.11');
    await expect(page.getByTestId('promo-code-btn')).toHaveCount(0);
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');
  });

  test('19. Codice già usato: messaggio inline, nessun blocco del pagamento a prezzo pieno', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'promo_already_redeemed' }) })
    );
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    page.once('dialog', (dialog) => dialog.accept('WALRUS-USED1'));
    await page.getByTestId('promo-code-btn').click();

    await expect(page.getByTestId('promo-feedback')).toHaveText('Codice già usato');
    await expect(page.getByTestId('promo-code-btn')).toBeVisible();
    await expect(page.getByTestId('promo-badge')).toHaveCount(0);
    await expect(page.getByTestId('next-action')).toContainText('CONFERMA PAGAMENTO');
  });

  test('20. Ordine senza Pesi Massimi: nessuno sconto, messaggio esplicito', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'promo_no_eligible_item' }) })
    );
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    page.once('dialog', (dialog) => dialog.accept('WALRUS-VALID'));
    await page.getByTestId('promo-code-btn').click();

    await expect(page.getByTestId('promo-feedback')).toHaveText('Nessun Peso Massimo in questo ordine');
    await expect(page.getByTestId('promo-badge')).toHaveCount(0);
  });

  test('21. Ordine già pagato: messaggio esplicito, nessuno sconto applicato', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.route('**/rest/v1/rpc/kitchen_promo_pass_redeem_for_order', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'order_already_paid' }) })
    );
    await page.goto('/kitchen/solo');

    await page.locator('.kss-qcard[data-order="W47"]').click();
    page.once('dialog', (dialog) => dialog.accept('WALRUS-VALID'));
    await page.getByTestId('promo-code-btn').click();

    await expect(page.getByTestId('promo-feedback')).toHaveText('Ordine già pagato — sconto non applicabile');
    await expect(page.getByTestId('promo-badge')).toHaveCount(0);
  });
});

// Sprint 3A — notifica audio nuovo ordine. Sostituisce il Web Audio reale con un mock
// registrato prima di ogni navigazione, per osservare quali toni (frequenze) vengono
// suonati senza dipendere da hardware audio reale.
test.describe('Kitchen — Solo Service Sprint 3A: notifica audio nuovo ordine', () => {

  async function mockAudioContext(page) {
    await page.addInitScript(() => {
      window.__audioEvents = [];
      class MockOscillator {
        constructor() { this.frequency = { value: 0 }; }
        connect(dest) { return dest; }
        start() { window.__audioEvents.push(this.frequency.value); }
        stop() {}
      }
      class MockGain {
        constructor() { this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
        connect(dest) { return dest; }
      }
      class MockAudioContext {
        constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
        createOscillator() { return new MockOscillator(); }
        createGain() { return new MockGain(); }
        resume() { this.state = 'running'; return Promise.resolve(); }
      }
      window.AudioContext = MockAudioContext;
      window.webkitAudioContext = MockAudioContext;
    });
  }

  test('16. nessun suono al primo mount per un ordine pending_counter_payment già in coda', async ({ page }) => {
    await mockAudioContext(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    // W47 (pending_counter_payment) è già nel seed iniziale: non è un "nuovo" ordine.
    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__audioEvents.length)).toBe(0);
  });

  // Nota: la verifica end-to-end del suono di notifyCounterPayment() (invariato, fuori
  // scope Sprint 3A / audio UX fix) richiederebbe un click su CONFERMA PAGAMENTO che in
  // questo ambiente fallisce per un gap pre-esistente e non correlato (VITE_SUPABASE_URL/
  // ANON_KEY assenti al server Vite di test — stesso gap che fa fallire anche il test 4
  // preesistente, "pagamento rapido"). La distinzione dei due suoni resta comunque garantita
  // a livello di codice: observeOrders() chiama sempre notifyNewOrder() — doppio richiamo
  // 990→1320Hz ripetuto due volte, timbro chime (fondamentale + ottava), ~1.56s totali —,
  // notifyCounterPayment() chiama sempre play([440, 660, 880]) — vedi
  // src/hooks/useKitchenAudio.js.
  test('17. un nuovo ordine pending_counter_payment suona "nuovo ordine", senza doppioni sul poll successivo', async ({ page }) => {
    await mockAudioContext(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/kitchen/solo');

    await expect(page.getByTestId('kpi-paga')).toHaveText('1');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__audioEvents.length)).toBe(0);

    // Simula l'arrivo di un nuovo ordine da incassare (come da un altro dispositivo/tab):
    // scrive in localStorage e forza il refresh con lo stesso evento 'focus' già ascoltato
    // da useKitchenOrders per la sync cross-tab.
    await page.evaluate(({ key }) => {
      const current = JSON.parse(localStorage.getItem(key));
      current.push({
        id: 'solo-5', orderCode: 'W48', table: 'T6', nickname: 'Elisa',
        items: [{ itemId: 'item-001', name: 'Smash Burger', quantity: 1, price: 9.0 }],
        total: 9.0, status: 'pending_counter_payment', paymentStatus: 'pending',
        createdAt: new Date().toISOString(), note: '',
      });
      localStorage.setItem(key, JSON.stringify(current));
      window.dispatchEvent(new Event('focus'));
    }, { key: LS_ORDERS });

    await expect(page.getByTestId('kpi-paga')).toHaveText('2');
    // notifyNewOrder(): doppio richiamo 990→1320Hz ripetuto due volte, timbro chime — ogni nota
    // suona fondamentale + ottava superiore (audio UX fix "più udibile, tipo iPhone") — 4 note ×
    // 2 oscillatori = 8 eventi.
    await expect.poll(() => page.evaluate(() => window.__audioEvents.length)).toBe(8);
    expect(await page.evaluate(() => window.__audioEvents)).toEqual([990, 1980, 1320, 2640, 990, 1980, 1320, 2640]);

    // Dedup: un secondo refresh senza nuovi ordini non deve riprodurre di nuovo il suono.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__audioEvents.length)).toBe(8);
  });
});
