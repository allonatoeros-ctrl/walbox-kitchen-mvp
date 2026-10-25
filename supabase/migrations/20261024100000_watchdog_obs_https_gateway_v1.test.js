import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20261024100000_watchdog_obs_https_gateway_v1.sql', import.meta.url), 'utf8');
// Lo script di rollback vive nel repo Watchdog (walbox-observability/scripts); copiata in walbox-kitchen-mvp la migration non ce l'ha accanto.
let rollback = null;
try {
  rollback = readFileSync(new URL('../scripts/rollback_https_gateway.sql', import.meta.url), 'utf8');
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}
const code = sql
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

test('header veritiero: preparatoria, non applicata, dipende dalla migration watchdog_obs', () => {
  assert.match(sql, /PREPARATORIA — NON APPLICATA/);
  assert.match(code, /applicare prima la migration 20261023100000/);
});

test('gateway SECURITY INVOKER con search_path fisso; nessuna nuova funzione SECURITY DEFINER', () => {
  assert.match(code, /FUNCTION public\.watchdog_obs_gateway\(p_check text, p_params jsonb[^)]*\)\s+RETURNS jsonb\s+LANGUAGE plpgsql VOLATILE SECURITY INVOKER\s+SET search_path = pg_catalog, pg_temp/);
  assert.ok(!/SECURITY DEFINER/.test(code));
});

test('EXECUTE sul gateway: revocato a PUBLIC, anon, authenticated; concesso solo a service_role', () => {
  assert.match(code, /REVOKE ALL ON FUNCTION public\.watchdog_obs_gateway\(text, jsonb\) FROM PUBLIC/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.watchdog_obs_gateway\(text, jsonb\) FROM anon/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.watchdog_obs_gateway\(text, jsonb\) FROM authenticated/);
  const grants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION public\.watchdog_obs_gateway\(text, jsonb\) TO (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(grants, ['service_role']);
});

test('service_role riceve solo le 10 letture e l\'attestazione, mai hardening, rollback o funzioni interne', () => {
  const fns = [...code.matchAll(/GRANT EXECUTE ON FUNCTION watchdog_obs\.(\w+)\([^)]*\) TO service_role/g)].map((m) => m[1]).sort();
  assert.deepEqual(fns, ['app_errors', 'b01_orders', 'b02_payments', 'b03_webhooks', 'b04_kitchen', 'b05_devices', 'b06_chain', 'gateway_attestation', 'identity', 'jobs', 'visibility']);
  assert.ok(!/GRANT ALL/i.test(code));
  assert.ok(!/GRANT .* ON (ALL )?TABLES?/i.test(code));
});

test('limite di durata dichiarato sulla funzione (applicato da PostgREST), inferiore al timeout della Edge Function', () => {
  assert.match(code, /SET search_path = pg_catalog, pg_temp\s+SET statement_timeout = '6s'\s+AS \$\$\s+DECLARE\s+v_data jsonb/);
});

test('sola lettura forzata prima di qualunque lettura', () => {
  const body = code.slice(code.indexOf('CREATE OR REPLACE FUNCTION public.watchdog_obs_gateway'));
  const ro = body.indexOf("set_config('transaction_read_only', 'on', true)");
  assert.ok(ro > 0);
  assert.ok(ro < body.indexOf('watchdog_obs.b01_orders'));
});

test('allow-list fissa: nessun SQL dinamico, nessun nome costruito dall\'input', () => {
  const body = code.slice(code.indexOf('CREATE OR REPLACE FUNCTION public.watchdog_obs_gateway'));
  assert.ok(!/EXECUTE\s+(format|\$|'|p_)/i.test(body));
  assert.match(body, /CASE p_check/);
  assert.match(body, /ELSE RAISE EXCEPTION 'controllo non ammesso'/);
  assert.match(body, /length\(p_params::text\) > 2048/);
});

test('nessun accesso a pg_net, vault, cron, auth dal gateway; nessuna scrittura', () => {
  for (const s of ['net.', 'vault.', 'cron.', 'auth.']) assert.ok(!code.includes(s), s);
  for (const w of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE', 'ALTER TABLE', 'DROP ']) assert.ok(!code.includes(w), w);
});

test('rollback: rimuove il gateway e ogni privilegio di service_role su watchdog_obs, con verifica finale', { skip: rollback === null && 'rollback_https_gateway.sql assente in questo repository' }, () => {
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.watchdog_obs_gateway\(text, jsonb\)/);
  assert.match(rollback, /REVOKE ALL ON FUNCTION %s FROM service_role/);
  assert.match(rollback, /REVOKE USAGE ON SCHEMA watchdog_obs FROM service_role/);
  assert.match(rollback, /rollback incompleto/);
  assert.match(rollback, /BEGIN;[\s\S]*COMMIT;/);
});
