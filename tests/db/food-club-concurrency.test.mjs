// Test di concorrenza Food Club su Postgres LOCALE (sessioni psql parallele, dati committati nel DB di test).
// Prerequisiti: tests/db/apply-migrations.sh + tests/db/run-food-club-sql.sh (helper fc_test).
// Senza Postgres locale raggiungibile il test viene saltato (mai contro DB remoti: PGHOST deve essere locale).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const PGHOST = process.env.PGHOST || '/tmp';
const PGPORT = process.env.PGPORT || '54329';
const DB = process.env.FC_TEST_DB || 'walbox_fc_test';
const isLocal = PGHOST.startsWith('/') || PGHOST === '127.0.0.1' || PGHOST === 'localhost';
const args = ['-h', PGHOST, '-p', PGPORT, '-U', 'postgres', '-d', DB, '-qAtX', '-v', 'ON_ERROR_STOP=1'];

const reachable = isLocal && spawnSync('psql', [...args, '-c', 'select 1 from pg_proc where proname = $$new_member$$'], { encoding: 'utf8' }).stdout.trim() === '1';

function sql(text) {
  const r = spawnSync('psql', [...args, '-c', text], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

function sqlAsync(text) {
  return new Promise((resolve) => {
    const p = spawn('psql', [...args, '-f', '-']);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.stdin.end(text);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Helper per i test di concorrenza (commit reale, schema fc_test del DB di test).
if (reachable) sql(`CREATE OR REPLACE FUNCTION fc_test.mkv_c(p_uid uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + interval '10 days') RETURNING id $$;
  GRANT EXECUTE ON FUNCTION fc_test.mkv_c(uuid) TO anon, authenticated`);
const opts = { skip: reachable ? false : 'Postgres locale con helper fc_test non disponibile' };

test('C1 stesso buono su due ordini in parallelo: uno solo passa', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const m = sql('SELECT fc_test.new_member()');
  const v = sql(`INSERT INTO food_club_vouchers (code,user_id,campaign_id,source,value,min_food,expires_at)
    VALUES (food_club_new_voucher_code(),'${m}','visite-v1','manual',5,12,now()+interval '5 days') RETURNING id`);
  const call = (sleepMs) => `BEGIN; SELECT (fc_test.order('${m}','[{"item_id":"item-009","quantity":1}]','online','${v}')).id; SELECT pg_sleep(${sleepMs / 1000}); COMMIT;`;
  const a = sqlAsync(call(800));
  await sleep(200);
  const b = sqlAsync(call(0));
  const [ra, rb] = await Promise.all([a, b]);
  const ok = [ra, rb].filter((r) => r.code === 0);
  const ko = [ra, rb].filter((r) => r.code !== 0);
  assert.equal(ok.length, 1, `una sola chiamata riuscita: ${ra.err} | ${rb.err}`);
  assert.match(ko[0].err, /voucher_not_available/);
  assert.equal(sql(`SELECT count(*) FROM kitchen_orders WHERE customer_id='${m}'`), '1', 'nessun ordine orfano creato');
  assert.equal(sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`), 'reserved');
});

test('C2 webhook duplicati e conferma concorrente: un solo consumo, un solo timbro', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const m = sql('SELECT fc_test.new_member()');
  const v = sql(`INSERT INTO food_club_vouchers (code,user_id,campaign_id,source,value,min_food,expires_at)
    VALUES (food_club_new_voucher_code(),'${m}','visite-v1','manual',5,12,now()+interval '5 days') RETURNING id`);
  const o = sql(`SELECT (fc_test.order('${m}','[{"item_id":"item-009","quantity":1}]','online','${v}')).id`);
  const att = sql(`SELECT (fc_test.start_online('${o}')).id`);
  const confirm = `SELECT fc_test.as_service(); BEGIN; SELECT (kitchen_payment_confirm('${att}','ref-1','{}'::jsonb)).status; SELECT pg_sleep(0.5); COMMIT;`;
  const runs = await Promise.all([sqlAsync(confirm), sleep(100).then(() => sqlAsync(confirm)), sleep(150).then(() => sqlAsync(confirm))]);
  for (const r of runs) assert.equal(r.code, 0, r.err);
  assert.equal(sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`), 'used');
  assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND to_status='used'`), '1');
  assert.equal(sql(`SELECT count(*) FROM food_club_stamps WHERE order_id='${o}'`), '1');
  assert.equal(sql(`SELECT count(*) FROM kitchen_payments WHERE order_id='${o}' AND status='succeeded'`), '1');
});

test('C3 annullo staff e conferma pagamento in corsa: stato finale coerente', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  for (let i = 0; i < 4; i += 1) {
    const m = sql('SELECT fc_test.new_member()');
    const s = sql('SELECT fc_test.new_staff()');
    const v = sql(`INSERT INTO food_club_vouchers (code,user_id,campaign_id,source,value,min_food,expires_at)
      VALUES (food_club_new_voucher_code(),'${m}','visite-v1','manual',5,12,now()+interval '5 days') RETURNING id`);
    const o = sql(`SELECT (fc_test.order('${m}','[{"item_id":"item-009","quantity":1}]','online','${v}')).id`);
    const att = sql(`SELECT (fc_test.start_online('${o}')).id`);
    const confirm = sqlAsync(`SELECT fc_test.as_service(); SELECT (kitchen_payment_confirm('${att}','ref','{}'::jsonb)).status;`);
    const cancel = sleep(i % 2 ? 0 : 30).then(() => sqlAsync(`SELECT (fc_test.cancel('${o}','${s}')).status;`));
    await Promise.all([confirm, cancel]);
    const [status, pay] = sql(`SELECT status || '|' || coalesce(payment_status,'-') FROM kitchen_orders WHERE id='${o}'`).split('|');
    const vs = sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`);
    if (pay === 'paid') {
      assert.notEqual(status, 'cancelled');
      assert.equal(vs, 'used', 'pagato => buono usato');
    } else {
      // Passo 1: con un attempt SumUp l'annullo NON rilascia (trattenuta); il confirm tardivo lo consuma. Mai 'available'.
      assert.equal(status, 'cancelled');
      assert.ok(['used', 'reserved'].includes(vs), `annullato con attempt => buono trattenuto o consumato, trovato ${vs}`);
    }
  }
});

test('C4 stesso cliente, due ordini pagati in parallelo nella stessa serata: un solo timbro', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const m = sql('SELECT fc_test.new_member()');
  const s = sql('SELECT fc_test.new_staff()');
  const o1 = sql(`SELECT (fc_test.order('${m}','[{"item_id":"item-009","quantity":1}]')).id`);
  const o2 = sql(`SELECT (fc_test.order('${m}','[{"item_id":"item-010","quantity":1}]')).id`);
  const pay = (o, ms) => `BEGIN; SELECT (fc_test.pay_counter('${o}','${s}')).status; SELECT pg_sleep(${ms / 1000}); COMMIT;`;
  const [r1, r2] = await Promise.all([sqlAsync(pay(o1, 500)), sleep(100).then(() => sqlAsync(pay(o2, 0)))]);
  assert.equal(r1.code, 0, r1.err);
  assert.equal(r2.code, 0, r2.err);
  assert.equal(sql(`SELECT count(*) FROM food_club_stamps WHERE user_id='${m}' AND revoked_at IS NULL`), '1');
  assert.equal(sql(`SELECT count(*) FROM kitchen_orders WHERE id IN ('${o1}','${o2}') AND payment_status='paid'`), '2', 'entrambi i pagamenti riusciti');
});

// ---- Passo 1 C-T: scenari C2, C3, C4 del piano (§5) ----
const noDeadlock = (...rs) => { for (const r of rs) assert.doesNotMatch(r.err, /deadlock/i, r.err); };
const ITEM = `'[{"item_id":"item-009","quantity":1}]'`;

test('PC2 confirm SumUp tardivo <-> record_counter sullo stesso ordine con buono: un charge, un uso, nessun deadlock', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  for (const [dA, dB] of [[0, 0], [0, 120], [120, 0], [0, 300], [300, 0]]) {
    const m = sql('SELECT fc_test.new_member()');
    const s = sql('SELECT fc_test.new_staff()');
    const v = sql(`SELECT fc_test.mkv_c('${m}')`);
    const o = sql(`SELECT (fc_test.order('${m}',${ITEM},'online','${v}')).id`);
    const att = sql(`SELECT (fc_test.start_online('${o}')).id`);
    // passa al banco: l'attempt SumUp si chiude (customer_switched_to_counter) ma resta confermabile (K2)
    sql(`SELECT fc_test.as_service(); SELECT public.kitchen_order_switch_to_counter_system('${o}','${m}')`);
    const confirm = `SELECT fc_test.as_service(); BEGIN; SELECT (kitchen_payment_confirm('${att}','sumup-late','{}'::jsonb)).status; SELECT pg_sleep(0.25); COMMIT;`;
    const counter = `BEGIN; SELECT (fc_test.pay_counter('${o}','${s}')).status; SELECT pg_sleep(0.25); COMMIT;`;
    const [rc, rk] = await Promise.all([sleep(dA).then(() => sqlAsync(confirm)), sleep(dB).then(() => sqlAsync(counter))]);
    noDeadlock(rc, rk);
    assert.equal(rc.code, 0, `confirm: ${rc.err}`);
    assert.equal(rk.code, 0, `record_counter: ${rk.err}`);
    assert.equal(sql(`SELECT count(*) FROM kitchen_payments WHERE order_id='${o}' AND direction='charge' AND status='succeeded'`), '1', 'un solo charge succeeded');
    assert.equal(sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`), 'used');
    assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND to_status='used' AND from_status<>to_status`), '1', 'un solo evento used');
    assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND to_status='available'`), '0', 'mai verso available');
    assert.equal(sql(`SELECT count(*) FROM food_club_stamps WHERE order_id='${o}'`), '1', 'un solo timbro');
    assert.equal(sql(`SELECT count(*) FROM kitchen_action_log WHERE order_id='${o}' AND action IN ('food_club_voucher_double_spend','food_club_error')`), '0', 'nessuna anomalia Club');
    assert.equal(sql(`SELECT payment_status FROM kitchen_orders WHERE id='${o}'`), 'paid');
  }
});

test('PC3 annullo staff con attempt <-> confirm: nessun deadlock, buono used o reserved, mai available', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  for (const [dA, dB, hold] of [[0, 0, 0.2], [0, 100, 0.4], [100, 0, 0.4], [0, 250, 0.5], [250, 0, 0.5], [0, 0, 0.0]]) {
    const m = sql('SELECT fc_test.new_member()');
    const s = sql('SELECT fc_test.new_staff()');
    const v = sql(`SELECT fc_test.mkv_c('${m}')`);
    const o = sql(`SELECT (fc_test.order('${m}',${ITEM},'online','${v}')).id`);
    const att = sql(`SELECT (fc_test.start_online('${o}')).id`);
    const confirm = `SELECT fc_test.as_service(); BEGIN; SELECT (kitchen_payment_confirm('${att}','sumup-race','{}'::jsonb)).status; SELECT pg_sleep(${hold}); COMMIT;`;
    const cancel = `BEGIN; SELECT (fc_test.cancel('${o}','${s}')).status; SELECT pg_sleep(${hold}); COMMIT;`;
    const [rc, rx] = await Promise.all([sleep(dA).then(() => sqlAsync(confirm)), sleep(dB).then(() => sqlAsync(cancel))]);
    noDeadlock(rc, rx);
    assert.equal(rc.code, 0, `confirm deve sempre riuscire: ${rc.err}`);
    if (rx.code !== 0) assert.match(rx.err, /order_already_paid_cannot_cancel|payment_attempt_not_cancelable/, rx.err);
    const [status, pay] = sql(`SELECT status || '|' || coalesce(payment_status,'-') FROM kitchen_orders WHERE id='${o}'`).split('|');
    const vs = sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`);
    assert.notEqual(vs, 'available', 'mai rilasciato con un attempt SumUp');
    assert.ok(!(status === 'cancelled' && pay === 'paid'), 'mai cancelled+paid');
    assert.equal(sql(`SELECT count(*) FROM kitchen_payments WHERE order_id='${o}' AND status='succeeded'`), '1', 'il confirm ha registrato il charge');
    assert.equal(vs, 'used', 'charge succeeded => buono usato (anche se tardivo)');
    assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND to_status='used' AND from_status<>to_status`), '1');
    assert.equal(sql(`SELECT count(*) FROM kitchen_action_log WHERE order_id='${o}' AND action IN ('food_club_voucher_double_spend','food_club_error')`), '0');
    if (pay !== 'paid') assert.equal(sql(`SELECT count(*) FROM food_club_stamps WHERE order_id='${o}'`), '0', 'ordine non paid => nessun timbro');
  }
});

test('PC3b annullo staff SENZA charge e attempt vivo <-> sweep abbandono: buono trattenuto, mai available', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const m = sql('SELECT fc_test.new_member()');
  const s = sql('SELECT fc_test.new_staff()');
  const v = sql(`SELECT fc_test.mkv_c('${m}')`);
  const o = sql(`SELECT (fc_test.order('${m}',${ITEM},'online','${v}')).id`);
  sql(`SELECT (fc_test.start_online('${o}')).id`);
  sql(`SELECT fc_test.backdate('${o}', now() - interval '6 minutes')`);
  const cancel = `BEGIN; SELECT (fc_test.cancel('${o}','${s}')).status; SELECT pg_sleep(0.3); COMMIT;`;
  const abandon = `SELECT fc_test.as_service(); BEGIN; SELECT (kitchen_order_mark_payment_abandoned('${o}')).status; SELECT pg_sleep(0.3); COMMIT;`;
  const [ra, rb] = await Promise.all([sqlAsync(cancel), sleep(100).then(() => sqlAsync(abandon))]);
  noDeadlock(ra, rb);
  assert.equal(ra.code, 0, ra.err);
  assert.equal(sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`), 'reserved');
  assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND event='held_until_checkout_expiry'`), '1');
});

test('PC4 due create_order_v4 con lo stesso buono, partenza simultanea: un solo ordine, una sola riserva', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  for (let i = 0; i < 4; i += 1) {
    const m = sql('SELECT fc_test.new_member()');
    const v = sql(`SELECT fc_test.mkv_c('${m}')`);
    const call = `BEGIN; SELECT (fc_test.order('${m}',${ITEM},'${i % 2 ? 'online' : 'counter'}','${v}')).id; SELECT pg_sleep(0.15); COMMIT;`;
    const [ra, rb] = await Promise.all([sqlAsync(call), sqlAsync(call)]);
    noDeadlock(ra, rb);
    const ok = [ra, rb].filter((r) => r.code === 0);
    const ko = [ra, rb].filter((r) => r.code !== 0);
    assert.equal(ok.length, 1, `una sola riuscita: ${ra.err} | ${rb.err}`);
    assert.match(ko[0].err, /voucher_not_available/);
    assert.equal(sql(`SELECT count(*) FROM kitchen_orders WHERE customer_id='${m}'`), '1', 'nessun ordine orfano');
    assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND event='reserved_on_order'`), '1');
    assert.equal(sql(`SELECT status FROM food_club_vouchers WHERE id='${v}'`), 'reserved');
    assert.equal(sql(`SELECT o.discount_amount FROM kitchen_orders o WHERE o.customer_id='${m}'`), '5');
  }
});

test('PC4b stesso client_request_id in parallelo (doppio tap): stesso ordine, sconto una volta sola', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const m = sql('SELECT fc_test.new_member()');
  const v = sql(`SELECT fc_test.mkv_c('${m}')`);
  const k = sql('SELECT gen_random_uuid()');
  const call = `SELECT fc_test.as_user('${m}'); BEGIN; SELECT (kitchen_customer_create_order_v4('walrus-main','T',NULL,${ITEM},'eat_here','online','${k}',NULL,'${v}')).id; SELECT pg_sleep(0.2); COMMIT;`;
  const [ra, rb] = await Promise.all([sqlAsync(call), sleep(50).then(() => sqlAsync(call))]);
  noDeadlock(ra, rb);
  // la seconda attende il commit della prima e poi rileva il replay: stesso ordine (o errore pulito, mai due ordini/sconti)
  assert.equal(ra.code, 0, ra.err);
  assert.equal(sql(`SELECT count(*) FROM kitchen_orders WHERE customer_id='${m}'`), '1');
  assert.equal(sql(`SELECT count(*) FROM food_club_voucher_events WHERE voucher_id='${v}' AND event='reserved_on_order'`), '1');
  assert.equal(sql(`SELECT total FROM kitchen_orders WHERE customer_id='${m}'`), '8.9');
});

// I test di concorrenza committano dati reali nel DB di test: i messaggi Club accodati sporcherebbero
// food_club_push_claim_batch(50) dei test SQL (40_notifications N01). Li segniamo come gestiti (solo DB locale di test).
after(() => {
  if (reachable) sql("UPDATE food_club_messages SET push_status = 'skipped', push_skip_reason = 'test_cleanup' WHERE push_status = 'queued'");
});
