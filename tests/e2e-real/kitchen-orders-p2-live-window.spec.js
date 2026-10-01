// P2 — Kitchen Orders Payload Reduction, E2E REAL SUPABASE LOCAL (nessun mock di rete).
// Gira SOLO contro lo stack locale (vedi playwright.real-local.config.js, che rifiuta URL non
// locali). Seed: oggi (12) + vecchio aperto (2) + 10 notti passate x 60 ordini chiusi.
//
// Le asserzioni UI valgono identiche prima e dopo P2 (nessun cambio di comportamento utente).
// Quelle sul payload/rete sono attive solo con P2_PHASE=after; con P2_PHASE=before il test si
// limita a misurare. P2_MEASURE_OUT=<file.json> salva righe/byte della fetch live.
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { serviceNightWindow, serviceNightWindowFor, shiftServiceNight } from '../../src/lib/kitchenServiceRules.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_LOCAL_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const PHASE = process.env.P2_PHASE || 'after';
const MEASURE_OUT = process.env.P2_MEASURE_OUT || '';

const STAFF_EMAIL = 'p2-staff@local.test';
const STAFF_PASSWORD = 'p2-staff-local-password';
const VENUE = 'walrus-main';
const PAST_NIGHTS = 10;
const ORDERS_PER_PAST_NIGHT = 60;

const TODAY_STATUS_PLAN = [
  ['pending_counter_payment', 2], ['received', 2], ['preparing', 2], ['ready', 2], ['delivered', 3], ['cancelled', 1],
];
const TODAY_COUNT = TODAY_STATUS_PLAN.reduce((s, [, n]) => s + n, 0); // 12
const OLD_OPEN_COUNT = 2;

async function rest(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`REST ${method} ${path} -> ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureStaffUser() {
  const create = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD, email_confirm: true }),
  });
  if (!create.ok && create.status !== 422) throw new Error(`create staff -> ${create.status} ${await create.text()}`);
  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
  });
  if (!login.ok) throw new Error(`staff login -> ${login.status} ${await login.text()}`);
  const { user } = await login.json();
  await rest('kitchen_staff_members?on_conflict=user_id,venue_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: { user_id: user.id, venue_id: VENUE, role: 'staff' },
  });
}

function mkItems(orderId, n) {
  return Array.from({ length: n }, (_, i) => ({
    order_id: orderId, venue_id: VENUE, item_id: `item-0${10 + i}`, name: `Prodotto ${i + 1}`, quantity: 1 + (i % 2), price: 9 + i,
  }));
}

async function seed() {
  await ensureStaffUser();
  // Stack LOCALE e isolato (guard su VITE_SUPABASE_URL in beforeAll): si riparte da un locale vuoto,
  // altrimenti gli ordini lasciati da altri spec real-local (es. kitchen-real-order) sporcano i conteggi.
  await rest(`kitchen_payments?venue_id=eq.${VENUE}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  await rest(`kitchen_orders?venue_id=eq.${VENUE}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

  const orders = [];
  const items = [];
  const push = (o, nItems) => {
    orders.push({
      venue_id: VENUE, nickname: `nick-${o.order_code}`, total: 20, payment_status: 'paid', payment_method: 'cash',
      ...o,
    });
    items.push(...mkItems(o.id, nItems));
  };

  // OGGI: distribuiti fra l'inizio della serata e adesso (mai nel futuro).
  const win = serviceNightWindow();
  const now = Date.now();
  let idx = 0;
  const step = Math.max(1, Math.floor((now - win.start) / (TODAY_COUNT + 1)));
  for (const [status, n] of TODAY_STATUS_PLAN) {
    for (let k = 0; k < n; k += 1) {
      idx += 1;
      const code = `T${String(idx).padStart(2, '0')}`;
      push({
        id: `p2-today-${code}`, order_code: code, status,
        payment_status: status === 'pending_counter_payment' ? 'pending_counter_payment' : 'paid',
        payment_method: status === 'pending_counter_payment' ? null : 'cash',
        created_at: new Date(win.start + step * idx).toISOString(),
      }, 2 + (idx % 3));
    }
  }

  // Notti passate: ordini chiusi (delivered/cancelled).
  const today = serviceNightWindow().night;
  for (let k = 1; k <= PAST_NIGHTS; k += 1) {
    const w = serviceNightWindowFor(shiftServiceNight(today, -k));
    for (let i = 0; i < ORDERS_PER_PAST_NIGHT; i += 1) {
      const code = `H${k}-${String(i).padStart(2, '0')}`;
      push({
        id: `p2-h${k}-${i}`, order_code: code, status: i % 6 === 5 ? 'cancelled' : 'delivered',
        created_at: new Date(w.start + 3600e3 + i * Math.floor((8 * 3600e3) / ORDERS_PER_PAST_NIGHT)).toISOString(),
      }, 1 + (i % 4));
    }
  }

  // Ordini VECCHI ancora aperti: devono restare nel live.
  push({
    id: 'p2-old-open-received', order_code: 'OLDREC', status: 'received',
    created_at: new Date(serviceNightWindowFor(shiftServiceNight(today, -2)).start + 5 * 3600e3).toISOString(),
  }, 2);
  push({
    id: 'p2-old-open-pending', order_code: 'OLDPEN', status: 'pending_counter_payment', payment_status: 'pending_counter_payment', payment_method: null,
    created_at: new Date(serviceNightWindowFor(shiftServiceNight(today, -3)).start + 5 * 3600e3).toISOString(),
  }, 1);

  await rest('kitchen_orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: orders });
  await rest('kitchen_order_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: items });
  return { orders: orders.length, items: items.length };
}

// Le fetch "ordini + items" dell'hook (live e storico) sono le uniche con l'embed degli item.
function isOrdersFetch(res) {
  if (res.request().method() !== 'GET') return false;
  const u = new URL(res.url());
  return u.pathname.endsWith('/rest/v1/kitchen_orders') && decodeURIComponent(u.search).includes('kitchen_order_items(*)');
}

function trackOrdersFetches(page) {
  const fetches = [];
  page.on('response', async (res) => {
    if (!isOrdersFetch(res)) return;
    try {
      const text = await res.text();
      fetches.push({ url: decodeURIComponent(res.url()), rows: JSON.parse(text).length, bytes: Buffer.byteLength(text) });
    } catch { /* risposta non leggibile (navigazione): ignorata */ }
  });
  return fetches;
}

async function loginAsStaff(page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(async ({ email, password }) => {
    const mod = await import('/src/lib/supabaseClient.js');
    const { error } = await mod.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, { email: STAFF_EMAIL, password: STAFF_PASSWORD });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  expect(SUPABASE_URL, 'VITE_SUPABASE_URL deve essere locale').toMatch(/^http:\/\/(127\.0\.0\.1|localhost):/);
  expect(SERVICE_KEY, 'E2E_LOCAL_SERVICE_ROLE_KEY mancante').toBeTruthy();
  const s = await seed();
  console.log(`[seed] orders=${s.orders} items=${s.items} phase=${PHASE}`);
});

test('Solo live: stessi ordini a schermo + payload della fetch live', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fetches = trackOrdersFetches(page);
  await loginAsStaff(page);
  await page.goto('/kitchen/solo');

  // Ordini di oggi + vecchi aperti presenti in coda; nessun ordine chiuso di notti passate.
  await expect(page.getByTestId('kpi-paga')).toHaveText('3');   // 2 oggi + OLDPEN
  await expect(page.getByTestId('kpi-dafare')).toHaveText('5'); // 2 received + 2 preparing + OLDREC
  await expect(page.getByTestId('kpi-pronti')).toHaveText('2');
  await expect(page.getByTestId('customer-name-OLDREC')).toHaveCount(1);
  await expect(page.getByTestId('customer-name-OLDPEN')).toHaveCount(1);

  expect(fetches.length).toBeGreaterThan(0);
  const first = fetches[0];
  console.log(`[payload:${PHASE}] live fetch rows=${first.rows} bytes=${first.bytes}`);
  if (MEASURE_OUT) fs.writeFileSync(MEASURE_OUT, JSON.stringify({ phase: PHASE, first, all: fetches }, null, 2));

  if (PHASE === 'after') {
    expect(first.rows).toBe(TODAY_COUNT + OLD_OPEN_COUNT);
    expect(first.url).toMatch(/created_at\.gte\./);
  } else {
    expect(first.rows).toBe(TODAY_COUNT + OLD_OPEN_COUNT + PAST_NIGHTS * ORDERS_PER_PAST_NIGHT);
  }
});

test('Storico: oggi dal live, notti passate on-demand (stessi numeri prima e dopo)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fetches = trackOrdersFetches(page);
  await loginAsStaff(page);
  await page.goto('/kitchen/solo');
  await page.getByRole('button', { name: /ALTRO/ }).click();
  await page.getByRole('button', { name: /Storico ordini/ }).click();
  await expect(page.getByTestId('service-night-selector')).toBeVisible();

  const countRows = async () => {
    for (let guard = 0; guard < 10; guard += 1) {
      const more = page.getByTestId('storico-load-more');
      if (await more.count() === 0) break;
      await more.click();
    }
    return page.locator('[data-testid^="storico-row-"]').count();
  };

  // OGGI: 3 delivered + 1 cancelled.
  await expect.poll(countRows).toBe(4);
  const fetchesAfterToday = fetches.length;

  // Ieri: 60 ordini chiusi.
  await page.getByTestId('service-night-prev').click();
  await expect.poll(countRows, { timeout: 15000 }).toBe(ORDERS_PER_PAST_NIGHT);

  // Due sere fa: 60 ordini chiusi (OLDREC e' aperto: non e' in Storico).
  await page.getByTestId('service-night-prev').click();
  await expect.poll(countRows, { timeout: 15000 }).toBe(ORDERS_PER_PAST_NIGHT);
  await expect(page.locator('[data-testid="storico-row-p2-old-open-received"]')).toHaveCount(0);

  // Ritorno a ieri (cache) e a OGGI.
  await page.getByTestId('service-night-next').click();
  await expect.poll(countRows, { timeout: 15000 }).toBe(ORDERS_PER_PAST_NIGHT);
  await page.getByTestId('service-night-today-btn').click();
  await expect.poll(countRows).toBe(4);

  if (PHASE === 'after') {
    const historyFetches = fetches.slice(fetchesAfterToday).filter((f) => /status=in\.\(delivered,cancelled\)/.test(f.url) && /created_at=gte\./.test(f.url));
    // una sola fetch per notte passata visitata (ieri, 2 sere fa); il ritorno a ieri e' dalla cache.
    expect(historyFetches).toHaveLength(2);
    historyFetches.forEach((f) => console.log(`[payload:after] history fetch rows=${f.rows} bytes=${f.bytes}`));
    historyFetches.forEach((f) => expect(f.rows).toBe(ORDERS_PER_PAST_NIGHT));
  }
});

test('TV e Prep Board: stessi ordini attivi (compreso il vecchio aperto)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginAsStaff(page);

  await page.goto('/kitchen/tv');
  await expect(page.locator('.cooking-code', { hasText: 'OLDREC' })).toHaveCount(1);
  await expect(page.locator('.cooking-code', { hasText: 'OLDPEN' })).toHaveCount(1);
  await expect(page.locator('.cooking-code')).toHaveCount(2 + 2 + 2 + 1 + 1); // pending+received+preparing + 2 vecchi
  await expect(page.locator('.ticket-code')).toHaveCount(2);                  // ready

  await page.goto('/kitchen/prep');
  await expect(page.locator('.kpb-ticket-code')).toHaveCount(2);              // preparing
});
