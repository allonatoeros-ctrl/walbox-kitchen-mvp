// Passo 3B: scenari di integrazione su Supabase LOCALE (lanciato da p3b_api_supabase_local.sh).
// Handler VERI importati in node (api/kitchen-sumup-create-checkout.js, api/kitchen-online-abandon-sweep.js), RPC e
// tabelle reali sullo stack locale. fetch: passa SOLO verso lo stack locale; api.sumup.com sempre finto; qualunque
// altro host -> errore. Fixture dichiarate: il tempo si simula retrodatando (superuser, session_replication_role =
// replica) created_at/claim/intento/sigillo, come nel 3A; tutto il resto nasce dalle RPC reali.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import process from 'node:process';

const API_URL = process.env.P3B_API_URL;
const DB_URL = process.env.P3B_DB_URL;
const ANON_KEY = process.env.P3B_ANON_KEY;
const SERVICE_KEY = process.env.P3B_SERVICE_ROLE_KEY;
if (!API_URL?.startsWith('http://127.0.0.1:') || !DB_URL?.includes('@127.0.0.1:')) {
  console.error('BLOCKED: stack locale non indicato'); process.exit(2);
}

// ---------------------------------------------------------------------------------------------------------------
// fetch: stack locale reale, SumUp finto, tutto il resto vietato
// ---------------------------------------------------------------------------------------------------------------
const realFetch = globalThis.fetch;
const sumupCalls = [];
let sumupHandler = null; // (call) => Response | Error ; per scenario
let restInterceptor = null; // (url) => Response | Error | null
const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
  if (url.startsWith('https://api.sumup.com/')) {
    const call = { method, url, body: init.body ? JSON.parse(init.body) : null, redirect: init.redirect };
    sumupCalls.push(call);
    const r = sumupHandler ? await sumupHandler(call) : new Error('sumup_unreachable');
    if (r instanceof Error) throw r;
    return r;
  }
  if (url.startsWith(API_URL)) {
    if (restInterceptor) {
      const r = restInterceptor(url, method);
      if (r instanceof Error) throw r;
      if (r) return r;
    }
    return realFetch(input, init);
  }
  throw new Error(`host non ammesso nel test: ${url}`);
};
// SumUp "generico": checkout noti per id/attempt; il resto irraggiungibile (ordini di altri scenari).
const sumupWorld = { byId: new Map(), byRef: new Map() };
function worldHandler(call) {
  const u = new URL(call.url);
  if (call.method !== 'GET') return new Error(`metodo ${call.method} non previsto`);
  if (u.pathname === '/v0.1/checkouts' && u.searchParams.has('checkout_reference')) {
    const ref = u.searchParams.get('checkout_reference');
    const w = sumupWorld.byRef.get(ref);
    if (!w) return new Error('sumup_unreachable');
    return w.list === 'down' ? new Error('sumup_unreachable') : jsonRes(200, w.list);
  }
  const id = decodeURIComponent(u.pathname.slice('/v0.1/checkouts/'.length));
  const w = sumupWorld.byId.get(id);
  if (!w) return new Error('sumup_unreachable');
  return jsonRes(200, w);
}

// ---------------------------------------------------------------------------------------------------------------
// psql (superuser locale) e helper
// ---------------------------------------------------------------------------------------------------------------
function sql(q) {
  return execFileSync('psql', [DB_URL, '-qAtX', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

sql(`
CREATE SCHEMA IF NOT EXISTS fc3b;
CREATE OR REPLACE FUNCTION fc3b.mkv(p_uid uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + interval '10 days') RETURNING id $$;
CREATE OR REPLACE FUNCTION fc3b.age(p_o text, p_age_s int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c timestamptz := now() - make_interval(secs => p_age_s);
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.kitchen_orders SET created_at = c WHERE id = p_o;
  UPDATE public.kitchen_payments SET created_at = c,
         checkout_claim_at = CASE WHEN checkout_claim_at IS NULL THEN NULL ELSE c + interval '10 seconds' END
   WHERE order_id = p_o;
  UPDATE public.food_club_checkout_intents SET valid_until = date_trunc('second', c + interval '15 minutes'),
         recorded_at = c + interval '11 seconds' WHERE order_id = p_o;
  PERFORM set_config('session_replication_role', 'origin', true);
END $$;
CREATE OR REPLACE FUNCTION fc3b.set_sealed(p_o text, p_secs_ago int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE public.food_club_release_seals SET sealed_at = now() - make_interval(secs => p_secs_ago) WHERE order_id = p_o;
  PERFORM set_config('session_replication_role', 'origin', true);
END $$;
CREATE OR REPLACE FUNCTION fc3b.abandon(p_o text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(p_o);
END $$;
`);
sql('SELECT fc_test.activate_campaign()');

// Utente cliente REALE (GoTrue locale) con token di sessione; password di test casuale, mai stampata.
async function newCustomer({ member = true } = {}) {
  const email = `fc3b-${randomUUID()}@test.local`;
  const password = randomBytes(18).toString('base64url');
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const c = await realFetch(`${API_URL}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, email_confirm: true }) });
  const u = await c.json();
  assert.ok(u.id, `utente non creato: ${c.status}`);
  const t = await realFetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const tok = await t.json();
  assert.ok(tok.access_token, `login fallito: ${t.status}`);
  if (member) {
    sql(`INSERT INTO public.food_club_members (user_id, terms_version, service_consent_at, joined_at)
         VALUES (${lit(u.id)}, 'test-v1', now(), now() - interval '60 days')`);
  }
  return { uid: u.id, token: tok.access_token };
}

// Ordine online reale (create_order_v4) con o senza buono + attempt SumUp reale (attempt_start).
async function newOnlineOrder({ voucher }) {
  const cust = await newCustomer();
  const v = voucher ? sql(`SELECT fc3b.mkv(${lit(cust.uid)})`) : null;
  const orderId = sql(`SELECT (fc_test.order(${lit(cust.uid)}, '[{"item_id":"item-009","quantity":1}]', 'online', ${v ? `${lit(v)}::uuid` : 'NULL'})).id`);
  const attemptId = sql(`SELECT (fc_test.start_online(${lit(orderId)})).id`);
  return { cust, voucherId: v, orderId, attemptId };
}

const voucherStatus = (v) => sql(`SELECT status FROM public.food_club_vouchers WHERE id = ${lit(v)}`);
const voucherEvents = (v, ev) => Number(sql(`SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = ${lit(v)} AND event = ${lit(ev)}`));
const clubCounts = () => sql(`SELECT (SELECT count(*) FROM public.food_club_release_seals) || '/' || (SELECT count(*) FROM public.food_club_checkout_intents) || '/' || (SELECT count(*) FROM public.food_club_checkout_evidence) || '/' || (SELECT count(*) FROM public.food_club_voucher_events)`);

// ---------------------------------------------------------------------------------------------------------------
// Handler veri
// ---------------------------------------------------------------------------------------------------------------
const SWEEP_SECRET = `sweep-${randomBytes(8).toString('hex')}`;
Object.assign(process.env, {
  VITE_SUPABASE_URL: API_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUMUP_API_KEY: 'sumup-finta-locale',
  SUMUP_MERCHANT_CODE: 'MTEST3B', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'walbox.test',
  KITCHEN_ABANDON_SWEEP_SECRET: SWEEP_SECRET,
});
delete process.env.FOOD_CLUB_RELEASE_ENABLED;
const { default: createCheckout } = await import('../../../api/kitchen-sumup-create-checkout.js');
const { default: sweepHandler } = await import('../../../api/kitchen-online-abandon-sweep.js');

function makeRes() {
  const res = { statusCode: null, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}
async function callCheckout(o) {
  const res = makeRes();
  await createCheckout({ method: 'POST', headers: { authorization: `Bearer ${o.cust.token}` }, body: { order_id: o.orderId, payment_attempt_id: o.attemptId } }, res);
  return res;
}
async function callSweep(flag) {
  if (flag) process.env.FOOD_CLUB_RELEASE_ENABLED = 'true'; else delete process.env.FOOD_CLUB_RELEASE_ENABLED;
  const res = makeRes();
  await sweepHandler({ method: 'POST', headers: { authorization: `Bearer ${SWEEP_SECRET}` } }, res);
  return res;
}
const callsFor = (attemptId, from = 0) => sumupCalls.slice(from).filter((c) => c.url.includes(attemptId) || (c.body && c.body.checkout_reference === attemptId));

// ---------------------------------------------------------------------------------------------------------------
// Scenari
// ---------------------------------------------------------------------------------------------------------------
const results = [];
async function scenario(name, fn) {
  const origErr = console.error; const origWarn = console.warn;
  const logs = [];
  console.error = (...a) => logs.push(['error', a.map(String).join(' ').slice(0, 160)]);
  console.warn = (...a) => logs.push(['warn', a.map(String).join(' ').slice(0, 160)]);
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    origErr.call(console, `ok   ${name}${note ? ` — ${note}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false });
    origErr.call(console, `FAIL ${name}: ${err?.message}`);
    for (const l of logs.slice(-6)) origErr.call(console, `       [${l[0]}] ${l[1]}`);
  } finally {
    console.error = origErr; console.warn = origWarn;
    sumupHandler = null; restInterceptor = null;
  }
}
const okPost = (call) => jsonRes(201, { id: `co-${call.body.checkout_reference}`, hosted_checkout_url: 'https://pay.sumup.test/x', valid_until: call.body.valid_until, checkout_reference: call.body.checkout_reference });

// 1. Ordine senza buono: checkout invariato.
await scenario('1 senza buono: checkout invariato (List + POST, nessun valid_until, nessun intento)', async () => {
  const o = await newOnlineOrder({ voucher: false });
  const from = sumupCalls.length;
  sumupHandler = (c) => (c.method === 'GET' ? jsonRes(200, []) : okPost(c));
  const res = await callCheckout(o);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { checkout_id: `co-${o.attemptId}`, hosted_checkout_url: 'https://pay.sumup.test/x' });
  const calls = sumupCalls.slice(from);
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST']);
  assert.deepEqual(Object.keys(calls[1].body), ['checkout_reference', 'amount', 'currency', 'merchant_code', 'description', 'redirect_url', 'return_url', 'hosted_checkout']);
  assert.equal(sql(`SELECT count(*) FROM public.food_club_checkout_intents WHERE attempt_id = ${lit(o.attemptId)}`), '0');
  assert.equal(sql(`SELECT provider_ref FROM public.kitchen_payments WHERE id = ${lit(o.attemptId)}`), `co-${o.attemptId}`);
});

// 2. Ordine con buono: intento nel DB PRIMA della POST, valid_until del corpo = valore DB.
await scenario('2 con buono: intento in food_club_checkout_intents prima della POST, valid_until = DB', async () => {
  const o = await newOnlineOrder({ voucher: true });
  let seenAtPost = null;
  sumupHandler = (c) => {
    if (c.method === 'GET') return jsonRes(200, []);
    seenAtPost = sql(`SELECT to_char(valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM public.food_club_checkout_intents WHERE attempt_id = ${lit(o.attemptId)}`);
    return okPost(c);
  };
  const from = sumupCalls.length;
  const res = await callCheckout(o);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const post = sumupCalls.slice(from).find((c) => c.method === 'POST');
  assert.ok(seenAtPost, 'intento gia nel DB quando arriva la POST');
  assert.equal(post.body.valid_until, seenAtPost);
  const expected = sql(`SELECT to_char(date_trunc('second', created_at + interval '15 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM public.kitchen_orders WHERE id = ${lit(o.orderId)}`);
  assert.equal(post.body.valid_until, expected);
  return `valid_until ${post.body.valid_until}`;
});

// 3. Intento fallito: nessuna POST (a: rifiuto reale del DB; b: PostgREST irraggiungibile per la sola RPC intento).
await scenario('3 intento fallito: nessuna POST (rifiuto DB reale + RPC irraggiungibile)', async () => {
  const a = await newOnlineOrder({ voucher: true });
  // il buono risulta gia usato su questo ordine (fixture superuser): lookup "con buono" vero, intento -> no_reserved_voucher
  sql(`SET session_replication_role = replica; UPDATE public.food_club_vouchers SET status = 'used', used_order_id = ${lit(a.orderId)}, reserved_order_id = NULL WHERE id = ${lit(a.voucherId)}`);
  const fromA = sumupCalls.length;
  sumupHandler = (c) => (c.method === 'GET' ? jsonRes(200, []) : okPost(c));
  const ra = await callCheckout(a);
  assert.equal(ra.statusCode, 503); assert.deepEqual(ra.body, { error: 'food_club_intent_failed' });
  assert.deepEqual(sumupCalls.slice(fromA).map((c) => c.method), ['GET'], 'solo la List, nessuna POST');
  assert.equal(sql(`SELECT count(*) FROM public.food_club_checkout_intents WHERE attempt_id = ${lit(a.attemptId)}`), '0');

  const b = await newOnlineOrder({ voucher: true });
  restInterceptor = (url) => (url.includes('/rpc/food_club_record_checkout_intent') ? new Error('ECONNRESET') : null);
  const fromB = sumupCalls.length;
  const rb = await callCheckout(b);
  assert.equal(rb.statusCode, 503); assert.deepEqual(rb.body, { error: 'food_club_intent_failed' });
  assert.equal(sumupCalls.slice(fromB).filter((c) => c.method === 'POST').length, 0);
  assert.equal(sql(`SELECT status || '|' || (checkout_claim_at IS NOT NULL) FROM public.kitchen_payments WHERE id = ${lit(b.attemptId)}`), 'initiated|true');
});

// Prepara un ordine con buono chiuso, vecchio di ~21 min. mode: 'A' (mai richiesto), 'C' (POST incerta), 'B' (checkout noto).
async function closedVoucherOrder(mode, { getStatus = 'PENDING' } = {}) {
  const o = await newOnlineOrder({ voucher: true });
  if (mode !== 'A') {
    sumupHandler = (c) => {
      if (c.method === 'GET') return jsonRes(200, []);
      if (mode === 'C') return Object.assign(new Error('timeout'), { name: 'TimeoutError' });
      return okPost(c);
    };
    const r = await callCheckout(o);
    assert.equal(r.statusCode, mode === 'C' ? 503 : 200, `checkout ${mode}: ${JSON.stringify(r.body)}`);
    sumupHandler = null;
    const vu = sql(`SELECT to_char(valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM public.food_club_checkout_intents WHERE attempt_id = ${lit(o.attemptId)}`);
    assert.ok(vu, 'intento registrato');
    const amount = Number(sql(`SELECT amount FROM public.kitchen_payments WHERE id = ${lit(o.attemptId)}`));
    const co = { id: `co-${o.attemptId}`, checkout_reference: o.attemptId, amount, currency: 'EUR', merchant_code: 'MTEST3B', status: getStatus, valid_until: vu };
    if (mode === 'B') { sumupWorld.byId.set(co.id, co); sumupWorld.byRef.set(o.attemptId, { list: [co] }); }
  }
  sql(`SELECT fc3b.age(${lit(o.orderId)}, 1300)`);
  sql(`SELECT fc3b.abandon(${lit(o.orderId)})`);
  assert.equal(sql(`SELECT status FROM public.kitchen_orders WHERE id = ${lit(o.orderId)}`), 'payment_abandoned');
  assert.equal(voucherStatus(o.voucherId), 'reserved');
  assert.equal(voucherEvents(o.voucherId, 'held_until_checkout_expiry'), 1);
  return o;
}
async function sealAndAge(o) {
  sumupHandler = worldHandler;
  const r1 = await callSweep(true);
  assert.equal(r1.statusCode, 200);
  assert.ok(sql(`SELECT count(*) FROM public.food_club_release_seals WHERE order_id = ${lit(o.orderId)}`) === '1', `sigillo: ${JSON.stringify(r1.body.food_club)}`);
  assert.ok(r1.body.food_club.waiting.some((w) => w.order_id === o.orderId), 'primo giro: waiting');
  sql(`SELECT fc3b.set_sealed(${lit(o.orderId)}, 70)`);
  return r1;
}

// 4. Checkout sconosciuto / SumUp irraggiungibile: buono resta reserved.
await scenario('4 checkout sconosciuto (List vuota) o SumUp irraggiungibile: buono resta reserved', async () => {
  const a = await closedVoucherOrder('C');
  sumupWorld.byRef.set(a.attemptId, { list: [] });
  await sealAndAge(a);
  const r = await callSweep(true);
  const nrA = r.body.food_club.not_released.find((x) => x.order_id === a.orderId);
  assert.ok(nrA, JSON.stringify(r.body.food_club));
  assert.equal(voucherStatus(a.voucherId), 'reserved');
  assert.equal(voucherEvents(a.voucherId, 'released_after_checkout_evidence'), 0);
  assert.equal(sql(`SELECT list_count FROM public.food_club_checkout_evidence WHERE attempt_id = ${lit(a.attemptId)} AND kind = 'list'`), '0');

  const b = await closedVoucherOrder('C');
  sumupWorld.byRef.set(b.attemptId, { list: 'down' });
  await sealAndAge(b);
  const rb = await callSweep(true);
  const nrB = rb.body.food_club.not_released.find((x) => x.order_id === b.orderId);
  assert.ok(nrB, JSON.stringify(rb.body.food_club));
  assert.equal(voucherStatus(b.voucherId), 'reserved');
  assert.equal(sql(`SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = ${lit(b.attemptId)}`), '0', 'nessuna evidenza da SumUp irraggiungibile');

  const c = await closedVoucherOrder('B', { getStatus: 'PENDING' });
  await sealAndAge(c);
  const rc = await callSweep(true);
  const nrC = rc.body.food_club.not_released.find((x) => x.order_id === c.orderId);
  assert.ok(nrC, JSON.stringify(rc.body.food_club));
  assert.equal(voucherStatus(c.voucherId), 'reserved');
  return `motivi: ${nrA.reason} | ${nrB.reason} | ${nrC.reason}`;
});

// 5. P-A: rilascio con prova SQL, nessuna chiamata SumUp.
let releasedPA = null;
await scenario('5 P-A mai richiesto: sigillo, attesa 60 s simulata, rilascio senza SumUp', async () => {
  const o = await closedVoucherOrder('A');
  const from = sumupCalls.length;
  await sealAndAge(o);
  const r = await callSweep(true);
  assert.ok(r.body.food_club.released.includes(o.orderId), JSON.stringify(r.body.food_club));
  assert.equal(voucherStatus(o.voucherId), 'available');
  assert.equal(voucherEvents(o.voucherId, 'released_after_checkout_evidence'), 1);
  assert.equal(callsFor(o.attemptId, from).length, 0, 'nessuna chiamata SumUp per l attempt P-A');
  releasedPA = o;
});

// 6. Pagamento tardivo: (a) confirm PAID dopo il rilascio; (b) PAID in evidenza -> nessun rilascio, poi confirm.
await scenario('6 pagamento tardivo: confirm dopo rilascio -> used/reclaimed o anomalia; PAID in evidenza -> nessun rilascio', async () => {
  assert.ok(releasedPA, 'serve lo scenario 5');
  const sb = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };
  const conf = async (attemptId, ref) => realFetch(`${API_URL}/rest/v1/rpc/kitchen_payment_confirm`, {
    method: 'POST', headers: sb, body: JSON.stringify({ p_attempt_id: attemptId, p_provider_ref: ref, p_raw_payload: {} }),
  });
  const ra = await conf(releasedPA.attemptId, `co-late-${releasedPA.attemptId}`);
  const st = voucherStatus(releasedPA.voucherId);
  const anomaly = Number(sql(`SELECT count(*) FROM public.kitchen_action_log WHERE order_id = ${lit(releasedPA.orderId)} AND action IN ('food_club_voucher_double_spend','food_club_error')`));
  const reclaimed = voucherEvents(releasedPA.voucherId, 'reclaimed_on_late_payment');
  assert.ok(st === 'used' || anomaly > 0, `buono ${st}, anomalie ${anomaly}, confirm HTTP ${ra.status}`);

  const b = await closedVoucherOrder('B', { getStatus: 'PAID' });
  sumupWorld.byRef.set(b.attemptId, { list: [{ ...sumupWorld.byId.get(`co-${b.attemptId}`) }] });
  await sealAndAge(b);
  const r = await callSweep(true);
  const nr = r.body.food_club.not_released.find((x) => x.order_id === b.orderId);
  assert.ok(nr && nr.reason === 'paid_evidence', JSON.stringify(r.body.food_club));
  assert.equal(voucherStatus(b.voucherId), 'reserved');
  assert.ok(Number(sql(`SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = ${lit(b.attemptId)} AND sumup_status = 'PAID'`)) >= 1);
  const rb = await conf(b.attemptId, `co-${b.attemptId}`);
  assert.equal(rb.status, 200);
  assert.equal(voucherStatus(b.voucherId), 'used');
  return `(a) confirm HTTP ${ra.status}, buono ${st}, reclaimed ${reclaimed}, anomalie ${anomaly}; (b) paid_evidence, poi used`;
});

// 7. Due sweep contemporanee (flag acceso): un solo evento di rilascio. 5 ripetizioni.
await scenario('7 due sweep in parallelo: un solo evento di rilascio (5 ripetizioni)', async () => {
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const o = await closedVoucherOrder('A');
    await sealAndAge(o);
    sumupHandler = worldHandler;
    process.env.FOOD_CLUB_RELEASE_ENABLED = 'true';
    const run = async () => { const res = makeRes(); await sweepHandler({ method: 'POST', headers: { authorization: `Bearer ${SWEEP_SECRET}` } }, res); return res; };
    const [r1, r2] = await Promise.all([run(), run()]);
    assert.equal(r1.statusCode, 200); assert.equal(r2.statusCode, 200);
    assert.equal(voucherEvents(o.voucherId, 'released_after_checkout_evidence'), 1, `ripetizione ${i}`);
    assert.equal(voucherStatus(o.voucherId), 'available');
    const rel = [r1, r2].filter((r) => r.body.food_club.released.includes(o.orderId)).length;
    assert.ok(rel <= 1, 'al massimo una risposta dichiara il rilascio');
    seen.push(rel);
  }
  return `risposte con rilascio per ripetizione: ${seen.join(',')}`;
});

// 8. Flag spento: Kitchen invariata, nessuna riga Club scritta.
await scenario('8 flag spento: Kitchen lavora, nessuna riga Club, nessuna chiave food_club', async () => {
  const o = await closedVoucherOrder('A'); // candidato pronto (non sigillato)
  const cust = await newCustomer({ member: false });
  const pop = sql(`SELECT (fc_test.order(${lit(cust.uid)}, '[{"item_id":"item-009","quantity":1}]', 'online', NULL)).id`);
  sql(`SELECT fc_test.backdate(${lit(pop)}, now() - interval '6 minutes')`);
  const before = clubCounts();
  const from = sumupCalls.length;
  sumupHandler = worldHandler;
  const r = await callSweep(false);
  assert.equal(r.statusCode, 200);
  assert.equal('food_club' in r.body, false);
  assert.ok(r.body.abandoned.includes(pop), `Kitchen ha chiuso il POP scaduto: ${JSON.stringify(r.body)}`);
  assert.equal(clubCounts(), before, 'nessuna riga Club (sigilli/intenti/evidenze/eventi buono) scritta');
  assert.equal(sql(`SELECT count(*) FROM public.food_club_release_seals WHERE order_id = ${lit(o.orderId)}`), '0');
  assert.equal(callsFor(o.attemptId, from).length, 0);
  assert.equal(voucherStatus(o.voucherId), 'reserved');
  // stesso giro col flag acceso: il candidato viene sigillato (prova che il flag e l'unica differenza)
  const r2 = await callSweep(true);
  assert.ok('food_club' in r2.body);
  assert.equal(sql(`SELECT count(*) FROM public.food_club_release_seals WHERE order_id = ${lit(o.orderId)}`), '1');
  return `contatori Club prima/dopo flag spento: ${before}`;
});

// Controlli finali.
await scenario('controlli finali: nessun buono con >1 rilascio, nessun ordine con >1 charge riuscito, solo GET/POST verso SumUp', async () => {
  assert.equal(sql(`SELECT count(*) FROM (SELECT voucher_id FROM public.food_club_voucher_events WHERE event = 'released_after_checkout_evidence' GROUP BY voucher_id HAVING count(*) > 1) x`), '0');
  assert.equal(sql(`SELECT count(*) FROM (SELECT order_id FROM public.kitchen_payments WHERE direction = 'charge' AND status = 'succeeded' GROUP BY order_id HAVING count(*) > 1) x`), '0');
  const methods = [...new Set(sumupCalls.map((c) => c.method))].sort();
  assert.ok(methods.every((m) => m === 'GET' || m === 'POST'), methods.join(','));
  const sweepNonGet = sumupCalls.filter((c) => c.method !== 'GET' && !c.url.endsWith('/v0.1/checkouts'));
  assert.equal(sweepNonGet.length, 0, 'nessun DELETE/PUT/PATCH');
  return `chiamate SumUp finte: ${sumupCalls.length} (${methods.join('/')})`;
});

const failed = results.filter((r) => !r.ok).length;
console.log(`\nP3B scenari: ${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
