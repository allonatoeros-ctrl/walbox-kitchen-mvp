// Collaudo browser del checkout contro lo stack Supabase LOCALE. Uso: node checkout.cjs <port> <off|on>
const { chromium } = require(require('node:path').join(process.cwd(), 'node_modules/playwright'));
const { execFileSync } = require('node:child_process');
const [port, mode] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${port}`;
const sql = (q) => execFileSync('psql', ['-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-AtX','-c',q], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' } }).trim();
const out = [];
const ok = (n, c, e = '') => out.push(`${c ? 'PASS' : 'FAIL'}  [${mode}] ${n}${e ? '  — ' + e : ''}`);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const clubCalls = []; const consoleErr = [];
  page.on('request', (r) => { if (/food_club|_v4/.test(r.url())) clubCalls.push(r.url().replace(/^.*\/rest\/v1\//, '')); });
  page.on('response', (r) => { if (r.status() >= 400) consoleErr.push('HTTP ' + r.status() + ' ' + r.request().method() + ' ' + r.url().replace(BASE, '').slice(0, 120)); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text().slice(0, 160)); });
  const shot = (n) => page.screenshot({ path: `${process.env.SHOT_DIR || '/tmp'}/fc-${mode}-${n}.png` });
  try {
    if (mode === 'on') {
      sql(`update food_club_campaigns set active=true where id='visite-v1'`);
      sql(`delete from auth.users where phone='393330000003'`);
      await page.goto(`${BASE}/kitchen/club/iscriviti`);
      await page.waitForTimeout(1500); await shot('01-join');
      await page.locator('#fc-phone').fill('3330000003');
      await page.getByText(/Accetto il regolamento/).click();
      await page.locator('form button[type=submit]').first().click();
      await page.getByLabel('Cifra 1').waitFor({ timeout: 10000 });
      for (let i = 0; i < 6; i++) await page.getByLabel(`Cifra ${i + 1}`).fill(String([1,2,3,4,5,6][i]));
      await page.waitForTimeout(500);
      const sub = page.locator('form button[type=submit]').first();
      if (await sub.isVisible().catch(() => false)) await sub.click().catch(() => {});
      await page.waitForTimeout(2500); await shot('02-after-otp');
      // consenso + conferma iscrizione se la pagina lo chiede
      for (const cb of await page.locator('input[type=checkbox]').all()) { const lbl = await cb.evaluate((e) => e.closest('label')?.innerText || ''); if (/servizio|regolamento|accetto|termini/i.test(lbl)) await cb.check().catch(() => {}); }
      const joinBtn = page.getByRole('button', { name: /ISCRIVIMI|ENTRA|ATTIVA|CONFERMA/i }).first();
      if (await joinBtn.isVisible().catch(() => false)) { await joinBtn.click(); await page.waitForTimeout(2500); }
      await shot('03-joined');
      const uid = sql(`select id from auth.users where phone='393330000003'`);
      ok('OTP via UI: utente creato con telefono confermato', !!uid && sql(`select phone_confirmed_at is not null from auth.users where id='${uid}'`) === 't');
      ok('iscrizione via UI', sql(`select count(*) from food_club_members where user_id='${uid}' and status='active'`) === '1', `uid=${uid}`);
      if (uid) sql(`insert into food_club_vouchers (code,user_id,campaign_id,source,value,min_food,expires_at) values ('WC-UI${Date.now()%100000}','${uid}','visite-v1','manual',5,12,now()+interval '5 days')`);
    }
    await page.goto(`${BASE}/kitchen?table=12`);
    await page.getByRole('button', { name: /^Aggiungi Pulled Pork, panino/i }).first().click({ timeout: 15000 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /sacco/i }).first().click();
    await page.waitForTimeout(800); await shot('10-cart');
    if (mode === 'on') {
      const tg = page.getByTestId('fc-voucher-toggle');
      ok('carrello: riga buono visibile', await tg.isVisible().catch(() => false));
      if (await tg.isVisible().catch(() => false)) { const pressed = await tg.getAttribute('aria-pressed'); if (pressed !== 'true') await tg.click(); await page.waitForTimeout(500); }
      await shot('11-cart-voucher');
    } else {
      ok('flag spento: nessuna UI Club nel carrello', (await page.getByTestId('fc-cart-club').count()) === 0);
    }
    await page.getByTestId('fulfillment-takeaway').click({ timeout: 5000 });
    await page.getByTestId('customer-name-input').fill(`UI${mode}`);
    await shot('20-checkout');
    const totTxt = (await page.getByTestId('checkout-total').first().innerText()).replace(/\s+/g, ' ');
    await page.getByTestId('pay-lane-counter').click();
    await page.waitForURL(/order|ordine|stato/i, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000); await shot('30-status');
    const row = sql(`select id||'|'||total||'|'||coalesce(discount_amount,0)||'|'||status||'|'||coalesce(source,'') from kitchen_orders where nickname='UI${mode}' order by created_at desc limit 1`);
    ok('ordine creato dal checkout', !!row, `${row} · checkout ${totTxt}`);
    const [oid, total, disc] = row.split('|');
    if (mode === 'on') {
      ok('totale scontato lato server (13,90 - 5)', Number(total) === 8.9 && Number(disc) === 5, `total=${total} disc=${disc}`);
      ok('buono riservato sull\'ordine', sql(`select status from food_club_vouchers where reserved_order_id='${oid}'`) === 'reserved');
      ok('checkout mostra il totale scontato', /8,90/.test(totTxt), totTxt);
    } else {
      ok('flag spento: totale pieno', Number(total) === 13.9 && Number(disc) === 0, `total=${total}`);
      ok('flag spento: zero chiamate food_club/v4', clubCalls.length === 0, clubCalls.join(','));
      const r = await page.goto(`${BASE}/kitchen/club`); await page.waitForTimeout(1000);
      ok('flag spento: /kitchen/club non mostra il Club', !(await page.locator('.fc-otp, #fc-phone, [data-testid^=fc-]').count()), page.url());
    }
    ok('console senza errori', consoleErr.length === 0, consoleErr.slice(0, 3).join(' | '));
  } catch (e) { ok('flusso completato', false, e.message.split('\n').slice(0,4).join(' / ')); await shot('99-error'); }
  console.log(out.join('\n'));
  await browser.close();
})();
