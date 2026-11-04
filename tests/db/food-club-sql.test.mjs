// Wrapper node --test per i test SQL Food Club su Postgres LOCALE (saltato se il DB di test non è raggiungibile).
// Prima: PGHOST=/tmp PGPORT=54329 tests/db/apply-migrations.sh
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PGHOST = process.env.PGHOST || '/tmp';
const PGPORT = process.env.PGPORT || '54329';
const DB = process.env.FC_TEST_DB || 'walbox_fc_test';
const probe = spawnSync('psql', ['-h', PGHOST, '-p', PGPORT, '-U', 'postgres', '-d', DB, '-Atc',
  "select count(*) from pg_proc where proname = 'kitchen_customer_create_order_v4'"], { encoding: 'utf8' });
const ready = probe.status === 0 && probe.stdout.trim() === '1';

test('scenari SQL Food Club (regole, pagamenti, identità, RLS, notifiche)', { skip: ready ? false : 'DB locale migrato non disponibile' }, () => {
  const r = spawnSync(join(here, 'run-food-club-sql.sh'), [DB], { encoding: 'utf8', env: { ...process.env, PGHOST, PGPORT } });
  const passes = (r.stdout.match(/PASS /g) || []).length;
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(passes >= 44, `attesi >= 44 scenari, trovati ${passes}`);
});
