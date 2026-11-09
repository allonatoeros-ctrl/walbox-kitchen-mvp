// Concorrenza push Food Club (migration 20261109110000) su Postgres LOCALE: due tick che reclamano la coda insieme.
// Invariante: per ogni utente al massimo UN messaggio 'sending' (tetto 1 al giorno), nessun messaggio reclamato due volte.
// Prerequisiti: tests/db/apply-migrations.sh + tests/db/run-food-club-sql.sh (helper fc_test). Dati committati nel DB di test.
// Senza Postgres locale raggiungibile il test viene saltato (mai contro DB remoti: PGHOST deve essere locale).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';

const PGHOST = process.env.PGHOST || '/tmp';
const PGPORT = process.env.PGPORT || '54329';
const DB = process.env.FC_TEST_DB || 'walbox_fc_test';
const isLocal = PGHOST.startsWith('/') || PGHOST === '127.0.0.1' || PGHOST === 'localhost';
const args = ['-h', PGHOST, '-p', PGPORT, '-U', 'postgres', '-d', DB, '-qAtX', '-v', 'ON_ERROR_STOP=1'];

const reachable = isLocal && spawnSync('psql', [...args, '-c',
  "select count(*) from pg_proc where proname in ('new_member', 'food_club_push_claim_batch_at')"], { encoding: 'utf8' }).stdout.trim() === '2';
const opts = { skip: reachable ? false : 'Postgres locale con helper fc_test e migration 20261109110000 non disponibile' };

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

// N iscritti con avvisi tessera e sottoscrizione 'club', 2 messaggi Club in coda ciascuno.
function setupUsers(n) {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    const m = sql('SELECT fc_test.new_member()');
    sql(`SELECT fc_test.as_user('${m}'); SELECT public.food_club_push_subscribe('walrus-main', 'https://push.test/cc-${m}', 'k', 'a', 'ua', 'club', 'push-club-v1');`);
    sql(`SELECT public.food_club_enqueue_message('${m}', 'referral_reward', 'cc-1', 'T', 'B', '/kitchen/club');
         SELECT public.food_club_enqueue_message('${m}', 'voucher_unlocked', 'cc-2', 'T', 'B', '/kitchen/club');`);
    // Il primo messaggio di ogni utente è il più vecchio della coda: un tick con limite = n prende solo quelli, e il
    // secondo messaggio dello stesso utente resta all'altro tick (il caso reale con più di 50 messaggi in coda).
    sql(`UPDATE public.food_club_messages SET push_after = now() - interval '1 year' WHERE user_id = '${m}' AND ref = 'cc-1'`);
    ids.push(m);
  }
  return ids;
}
// Tick: claim alle 12:00 di domani (fuori dalla fascia silenziosa), transazione tenuta aperta holdMs.
const tick = (holdMs, limit = 200) => `SELECT fc_test.as_service(); BEGIN;
  SELECT count(*) FROM public.food_club_push_claim_batch_at(${limit},
    (((now() AT TIME ZONE 'Europe/Rome')::date + 1 + time '12:00') AT TIME ZONE 'Europe/Rome'));
  SELECT pg_sleep(${holdMs / 1000}); COMMIT;`;

function checkInvariant(ids, label) {
  const list = ids.map((x) => `'${x}'`).join(',');
  const rows = sql(`SELECT user_id || '|' || count(*) FILTER (WHERE push_status = 'sending') || '|' || max(push_attempts)
                      FROM public.food_club_messages WHERE user_id IN (${list}) GROUP BY user_id`).split('\n');
  assert.equal(rows.length, ids.length, `${label}: messaggi presenti per tutti`);
  for (const r of rows) {
    const [, sending, attempts] = r.split('|');
    assert.ok(Number(sending) <= 1, `${label}: ${sending} messaggi 'sending' per lo stesso utente`);
    assert.ok(Number(attempts) <= 1, `${label}: messaggio reclamato due volte (tentativi ${attempts})`);
  }
  return rows.reduce((acc, r) => acc + Number(r.split('|')[1]), 0);
}

test('PC1 due tick concorrenti: mai due push allo stesso utente, nessun doppio claim (10 ripetizioni)', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  for (let rep = 0; rep < 10; rep += 1) {
    const ids = setupUsers(5);
    const delay = rep % 3 === 0 ? 0 : 60;
    const [a, b] = await Promise.all([sqlAsync(tick(400, ids.length)), sleep(delay).then(() => sqlAsync(tick(rep % 2 ? 0 : 200)))]);
    assert.equal(a.code, 0, a.err);
    assert.equal(b.code, 0, b.err);
    assert.doesNotMatch(`${a.err}${b.err}`, /deadlock/i);
    const sending = checkInvariant(ids, `rep ${rep}`);
    assert.equal(sending, ids.length, `rep ${rep}: ogni utente ha esattamente un invio in corso`);
    // pulizia: chiude i messaggi di questi utenti così non interferiscono con le ripetizioni successive
    sql(`UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'test_cleanup'
          WHERE user_id IN (${ids.map((x) => `'${x}'`).join(',')})`);
  }
});

test('PC2 tick concorrente durante il recupero degli orfani: nessun doppio claim', opts, async () => {
  sql('SELECT fc_test.activate_campaign()');
  const ids = setupUsers(4);
  const list = ids.map((x) => `'${x}'`).join(',');
  // un messaggio per utente risulta 'sending' da 11 minuti (funzione caduta): entrambi i tick provano a recuperarlo
  sql(`UPDATE public.food_club_messages SET push_status = 'sending', push_attempts = 1,
         push_claimed_at = (((now() AT TIME ZONE 'Europe/Rome')::date + 1 + time '12:00') AT TIME ZONE 'Europe/Rome') - interval '11 minutes'
        WHERE user_id IN (${list}) AND kind = 'referral_reward'`);
  const [a, b] = await Promise.all([sqlAsync(tick(300, ids.length)), sleep(50).then(() => sqlAsync(tick(0)))]);
  assert.equal(a.code, 0, a.err);
  assert.equal(b.code, 0, b.err);
  const rows = sql(`SELECT user_id || '|' || count(*) FILTER (WHERE push_status = 'sending') || '|' || max(push_attempts)
                      FROM public.food_club_messages WHERE user_id IN (${list}) GROUP BY user_id`).split('\n');
  for (const r of rows) {
    const [, sending, attempts] = r.split('|');
    assert.equal(sending, '1', 'un solo invio in corso per utente');
    assert.ok(Number(attempts) <= 2, `orfano reclamato al massimo una volta in più (tentativi ${attempts})`);
  }
  sql(`UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'test_cleanup' WHERE user_id IN (${list})`);
});
