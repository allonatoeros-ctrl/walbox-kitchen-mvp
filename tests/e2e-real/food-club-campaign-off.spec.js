// E2E REAL SUPABASE LOCAL — Food Club: iscrizione con OTP (GoTrue locale, numeri di prova, nessun SMS) e campagna OFF
// coerente tra carrello, server e pagina Club. Gira SOLO contro lo stack locale (playwright.real-local.config.js) con
// VITE_FOOD_CLUB_ENABLED=true e E2E_LOCAL_DB_URL (Postgres dello stack, solo 127.0.0.1/localhost).
// Prerequisito GoTrue: [auth.sms] enable_signup + enable_confirmations, test_otp 393475550001/2 = "123456" (vedi
// docs/food-club/CLOUD_HANDOFF.md §5). Ogni richiesta del browser verso host non locali viene bloccata e annotata.
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const API = process.env.VITE_SUPABASE_URL || '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY || '';
const DB_URL = process.env.E2E_LOCAL_DB_URL || '';
const PHONE = '347 555 0001';
const PHONE_DB = '393475550001';
const LOCAL = /^(127\.0\.0\.1|localhost)$/;

function sql(text) {
  const r = spawnSync('psql', [DB_URL, '-qAtX', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim().split('\n').filter(Boolean).pop() ?? '';
}
const memberId = () => sql(`SELECT id FROM auth.users WHERE phone = '${PHONE_DB}'`);
const setCampaign = (on) => sql(`UPDATE public.food_club_campaigns SET active = ${on ? 'true' : 'false'} WHERE id = 'visite-v1' RETURNING active`);

test.describe.configure({ mode: 'serial' });
test.skip(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(API) || !/@(127\.0\.0\.1|localhost):/.test(DB_URL),
  'serve lo stack Supabase locale (VITE_SUPABASE_URL e E2E_LOCAL_DB_URL locali)');

let page;
const blocked = [];

test.beforeAll(async ({ browser }) => {
  sql(`DELETE FROM auth.users WHERE phone = '${PHONE_DB}'`);
  setCampaign(true);
  const context = await browser.newContext();
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.protocol === 'data:' || u.protocol === 'blob:' || LOCAL.test(u.hostname)) return route.continue();
    blocked.push(u.host);
    return route.abort('blockedbyclient');
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  setCampaign(false); // stato di default delle migration: campagna spenta
  console.log(`[evidence] richieste esterne bloccate: ${blocked.length ? [...new Set(blocked)].join(', ') : 'nessuna'}`);
  await page?.context().close();
});

// Chiamata RPC con la sessione del cliente (token preso dal localStorage del browser): la stessa via del client.
async function rpcAsCustomer(name, args) {
  return page.evaluate(async ({ api, anon, name, args }) => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const token = key ? JSON.parse(localStorage.getItem(key)).access_token : anon;
    const res = await fetch(`${api}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { api: API, anon: ANON, name, args });
}

async function openCartWithBurger() {
  await page.goto('/kitchen');
  await page.getByRole('button', { name: /^PESI MASSIMI$/i }).click();
  await page.getByRole('button', { name: /^Aggiungi Pulled Pork, panino/ }).click();
  await page.getByRole('button', { name: /VAI ALLA CASSA/i }).click();
  await page.getByTestId('fulfillment-takeaway').click();
}

test('FC-E1 iscrizione con OTP: numero -> codice di prova -> membro con telefono verificato, stesso uid anonimo', async () => {
  await page.goto('/kitchen/club');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/kitchen/club');
  await page.getByRole('button', { name: /ISCRIVITI AL CLUB/ }).click();
  await page.locator('#fc-phone').fill('02 1234567');
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /MANDAMI IL CODICE/ }).click();
  await expect(page.getByRole('alert')).toContainText('cellulare italiano');
  await page.locator('#fc-phone').fill(PHONE);
  await page.getByRole('button', { name: /MANDAMI IL CODICE/ }).click();
  await expect(page.getByRole('group', { name: 'Codice a 6 cifre' })).toBeVisible();
  // Codice inviato: la sessione nel browser è quella anonima creata per l'invio (flusso phone_change).
  const anonUid = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const sess = key ? JSON.parse(localStorage.getItem(key)) : null;
    return sess?.user?.is_anonymous ? sess.user.id : null;
  });
  expect(anonUid, 'sessione anonima creata prima della verifica').toBeTruthy();
  await page.getByLabel('Cifra 1').fill('000000');
  await page.getByRole('button', { name: /VERIFICA/ }).click();
  await expect(page.getByRole('alert')).toContainText('Codice sbagliato');
  await page.getByLabel('Cifra 1').fill('123456');
  await page.getByRole('button', { name: /VERIFICA/ }).click();
  await expect(page.getByText(/Sei nel Walrus Food Club/)).toBeVisible({ timeout: 15000 });
  const uid = memberId();
  expect(uid).toBeTruthy();
  expect(sql(`SELECT phone_confirmed_at IS NOT NULL FROM auth.users WHERE id = '${uid}'`)).toBe('t');
  expect(sql(`SELECT status FROM public.food_club_members WHERE user_id = '${uid}'`)).toBe('active');
  expect(uid, 'phone_change: stesso uid della sessione anonima').toBe(anonUid);
  console.log(`[evidence] membro ${uid} = uid anonimo prima della verifica`);
});

test('FC-E2 campagna OFF: buono maturato valido in pagina Club, non proposto nel carrello, rifiutato dal server, nessun timbro', async () => {
  const uid = memberId();
  const v = sql(`INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
                 VALUES (public.food_club_new_voucher_code(), '${uid}', 'visite-v1', 'manual', 5, 12, now() + interval '20 days') RETURNING id`);
  expect(setCampaign(false)).toBe('f');

  // Pagina Club: il buono resta DISPONIBILE, con la pausa dichiarata e senza "USALO ORA".
  await page.goto('/kitchen/club');
  await expect(page.getByTestId('fc-paused-note')).toBeVisible();
  await expect(page.getByTestId('fc-voucher-paused')).toBeVisible();
  await expect(page.getByText('DISPONIBILE')).toBeVisible();
  await expect(page.getByRole('button', { name: /USALO ORA/ })).toHaveCount(0);
  await page.goto('/kitchen/club/buoni');
  await expect(page.getByTestId('fc-voucher-paused')).toBeVisible();
  await expect(page.getByRole('button', { name: /USALO ORA/ })).toHaveCount(0);

  // Server: stato coerente, ordine col buono rifiutato.
  const st = await rpcAsCustomer('food_club_my_state', {});
  expect(st.status).toBe(200);
  expect(st.body.campaign.active).toBe(false);
  expect(st.body.vouchers.find((x) => x.id === v)?.status).toBe('available');
  const withVoucher = await rpcAsCustomer('kitchen_customer_create_order_v4', {
    p_venue_id: 'walrus-main', p_nickname: 'E2E Club', p_customer_note: null,
    p_items: [{ item_id: 'item-009', quantity: 2 }], p_fulfillment_type: 'takeaway', p_payment_lane: 'counter',
    p_client_request_id: crypto.randomUUID(), p_pickup_slot: null, p_voucher_id: v,
  });
  expect(JSON.stringify(withVoucher.body)).toContain('voucher_campaign_inactive');
  expect(sql(`SELECT count(*) FROM public.kitchen_orders WHERE customer_id = '${uid}'`)).toBe('0');

  // Menu e carrello: nessuna promessa di timbro, buono non proposto.
  await openCartWithBurger();
  await expect(page.getByTestId('fc-voucher-toggle')).toHaveCount(0);
  await expect(page.getByTestId('fc-cart-stamp')).toHaveCount(0);
  await expect(page.getByText(/fa timbro/)).toHaveCount(0);
  await page.goto('/kitchen');
  await expect(page.getByTestId('fc-menu-strip')).toHaveAttribute('data-state', 'paused');
  await expect(page.getByTestId('fc-menu-strip')).toContainText('Club in pausa');

  // Ordine senza buono dalla UI, pagato al banco dallo staff: nessun timbro, buono intatto.
  await openCartWithBurger();
  await page.getByTestId('customer-name-input').fill('E2E Club');
  await page.getByTestId('pay-lane-counter').click();
  await expect(page).toHaveURL(/\/kitchen\/status/, { timeout: 15000 });
  const order = sql(`SELECT id FROM public.kitchen_orders WHERE customer_id = '${uid}' ORDER BY created_at DESC LIMIT 1`);
  const staff = sql(`WITH u AS (INSERT INTO auth.users (id, aud, role, email) VALUES (gen_random_uuid(), 'authenticated', 'authenticated', 'e2e-staff-' || gen_random_uuid() || '@test.local') RETURNING id)
                     INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) SELECT id, 'walrus-main', 'staff' FROM u RETURNING user_id`);
  sql(`SELECT set_config('request.jwt.claims', json_build_object('sub', '${staff}', 'role', 'authenticated')::text, false);
       SELECT (public.kitchen_payment_record_counter('${order}', 'cash')).status;`);
  expect(sql(`SELECT payment_status FROM public.kitchen_orders WHERE id = '${order}'`)).toBe('paid');
  expect(sql(`SELECT count(*) FROM public.food_club_stamps WHERE user_id = '${uid}'`)).toBe('0');
  expect(sql(`SELECT status FROM public.food_club_vouchers WHERE id = '${v}'`)).toBe('available');
  console.log(`[evidence] campagna OFF: ordine ${order} pagato, timbri 0, buono ${v} available`);
});

test('FC-E3 controllo positivo: campagna di nuovo ON -> buono proposto nel carrello e USALO ORA in pagina', async () => {
  setCampaign(true);
  await page.goto('/kitchen/club/buoni');
  await expect(page.getByTestId('fc-paused-note')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /USALO ORA/ })).toBeVisible();
  await openCartWithBurger();
  await expect(page.getByTestId('fc-voucher-toggle')).toBeVisible();
});
