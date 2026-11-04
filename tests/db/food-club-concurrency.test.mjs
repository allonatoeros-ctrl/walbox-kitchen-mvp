// Test di concorrenza Food Club su Postgres LOCALE (sessioni psql parallele, dati committati nel DB di test).
// Prerequisiti: tests/db/apply-migrations.sh + tests/db/run-food-club-sql.sh (helper fc_test).
// Senza Postgres locale raggiungibile il test viene saltato (mai contro DB remoti: PGHOST deve essere locale).
import { test } from 'node:test';
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
      assert.equal(status, 'cancelled');
      assert.equal(vs, 'available', 'annullato => buono rilasciato');
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
