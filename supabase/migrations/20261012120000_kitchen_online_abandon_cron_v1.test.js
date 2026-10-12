// 20261012120000_kitchen_online_abandon_cron_v1.test.js — Payment Lifecycle V2, S6 (2026-10-12).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime (tick idle = zero HTTP, POP scaduto = una chiamata) va provato su Postgres locale.
// Eseguire a mano: node --test supabase/migrations/20261012120000_kitchen_online_abandon_cron_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261012120000_kitchen_online_abandon_cron_v1.sql'), 'utf8');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const code = squash(sqlOnly(src));

const fnBody = (name) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = code.indexOf('$function$;', start);
  assert.ok(end > start, `fine di ${name} non trovata`);
  return code.slice(start, end);
};

test('header: dichiara SOLO LOCALE e il gate di Eros', () => {
  assert.match(src, /SOLO LOCALE, non applicata al remoto/);
  assert.match(src, /gate di Eros/);
});

test('pg_cron attivato come da docs Supabase (schema pg_catalog) + grant a postgres', () => {
  assert.match(code, /CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;/);
  assert.match(code, /GRANT USAGE ON SCHEMA cron TO postgres;/);
});

test('migration additiva: nessun DROP, ALTER TABLE o modifica di funzioni esistenti', () => {
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bALTER TABLE\b/i);
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns.sort(), ['kitchen_online_abandon_sweep_tick', 'kitchen_order_log_online_abandon_stuck']);
});

test('tick: EXISTS sugli ordini POP scaduti PRIMA del Vault e della chiamata HTTP', () => {
  const body = fnBody('kitchen_online_abandon_sweep_tick');
  const iExists = body.indexOf('IF NOT EXISTS ( SELECT 1 FROM public.kitchen_orders');
  const iReturnNull = body.indexOf('RETURN NULL; END IF;', iExists);
  const iVault = body.indexOf('vault.decrypted_secrets');
  const iHttp = body.indexOf('net.http_post(');
  assert.ok(iExists > -1, 'EXISTS mancante');
  assert.ok(iExists < iReturnNull && iReturnNull < iVault && iVault < iHttp, 'ordine: EXISTS -> uscita -> Vault -> HTTP');
  assert.equal(body.split('net.http_post(').length - 1, 1, 'una sola chiamata HTTP');
});

test('tick: predicato coperto dall indice parziale S2 (status POP) con soglia 5 minuti', () => {
  const body = fnBody('kitchen_online_abandon_sweep_tick');
  assert.match(body, /status = 'pending_online_payment' AND created_at < now\(\) - interval '5 minutes'/);
});

test('tick: backoff degli ordini incerti oltre 15 minuti (solo minuti multipli di 10)', () => {
  const body = fnBody('kitchen_online_abandon_sweep_tick');
  assert.match(body, /created_at >= now\(\) - interval '15 minutes' OR extract\(minute FROM now\(\)\)::int % 10 = 0/);
});

test('tick: secret solo per NOME dal Vault, assente -> WARNING e nessuna chiamata', () => {
  const body = fnBody('kitchen_online_abandon_sweep_tick');
  assert.match(body, /WHERE name = 'kitchen_abandon_sweep_secret'/);
  assert.match(body, /IF v_secret IS NULL THEN RAISE WARNING .* RETURN NULL; END IF;/);
  assert.doesNotMatch(src, /Bearer [A-Za-z0-9]{16,}/, 'nessun secret letterale');
});

test('tick: endpoint di produzione, timeout esplicito, SECURITY DEFINER con search_path', () => {
  const body = fnBody('kitchen_online_abandon_sweep_tick');
  assert.match(body, /'https:\/\/walbox-from-zero-v2\.vercel\.app\/api\/kitchen-online-abandon-sweep'/);
  assert.match(body, /timeout_milliseconds := 30000/);
  assert.match(body, /SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
});

test('tick: nessun ruolo API puo chiamarla (solo postgres via pg_cron)', () => {
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    assert.match(code, new RegExp(`REVOKE (ALL|EXECUTE) ON FUNCTION public\\.kitchen_online_abandon_sweep_tick\\(text\\) FROM ${role};`));
  }
  assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.kitchen_online_abandon_sweep_tick/);
});

test('log stuck: service_role_only, una riga per ordine, actor system', () => {
  const body = fnBody('kitchen_order_log_online_abandon_stuck');
  assert.match(body, /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only';/);
  assert.match(body, /pg_advisory_xact_lock/);
  const iDedupe = body.indexOf("action = 'online_abandon_stuck' ) THEN RETURN false;");
  const iInsert = body.indexOf('INSERT INTO public.kitchen_action_log');
  assert.ok(iDedupe > -1 && iDedupe < iInsert, 'dedupe prima dell INSERT');
  assert.match(body, /'online_abandon_stuck', v_order\.status, v_order\.status, 'system'/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.kitchen_order_log_online_abandon_stuck\(text, text\) TO service_role;/);
  assert.match(code, /REVOKE EXECUTE ON FUNCTION public\.kitchen_order_log_online_abandon_stuck\(text, text\) FROM authenticated;/);
});

test('job ogni minuto che chiama solo il tick', () => {
  assert.match(code, /cron\.schedule\( 'kitchen-online-abandon-sweep', '\* \* \* \* \*', \$\$SELECT public\.kitchen_online_abandon_sweep_tick\(\)\$\$ \);/);
});

test('retention: job giornaliero che tiene 7 giorni di cron.job_run_details', () => {
  assert.match(code, /cron\.schedule\( 'kitchen-cron-history-retention', '17 4 \* \* \*', \$\$DELETE FROM cron\.job_run_details WHERE end_time < now\(\) - interval '7 days'\$\$ \);/);
});
