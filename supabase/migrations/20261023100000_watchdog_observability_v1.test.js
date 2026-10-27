// Test statico gemello della migration (convenzione walbox-kitchen-mvp: asserzioni sul testo SQL, `node --test`).
// Il comportamento reale è collaudato su PostgreSQL in watchdog/test/integration/walbox-observability.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('./20261023100000_watchdog_observability_v1.sql', import.meta.url), 'utf8');
const code = sql.replace(/--[^\n]*/g, '');

test('header veritiero: preparatoria, non applicata', () => {
  assert.match(sql, /PREPARATORIA — NON APPLICATA/);
});

test('nessun URL di progetto, dominio o segreto cablato', () => {
  for (const s of ['walbox-from-zero-v2', 'pcrqfdzipotprqtuemso', 'vercel.app', 'supabase.co', 'PASSWORD', 'vault.']) {
    assert.ok(!code.includes(s), `trovato nel codice SQL: ${s}`);
  }
});

test('ruolo observer NOLOGIN senza attributi elevati', () => {
  assert.match(code, /CREATE ROLE watchdog_observer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/);
});

test('ogni funzione è SECURITY DEFINER o pura, con search_path fisso', () => {
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION (watchdog_obs\.\w+)[\s\S]*?\$\$;?/g)];
  assert.ok(fns.length >= 12);
  for (const m of fns) assert.match(m[0], /SET search_path = pg_catalog, pg_temp/, m[1]);
});

test('nessuna dipendenza da auth.uid() né dalle viste staff', () => {
  assert.ok(!/auth\.uid\(\)/.test(code));
  assert.ok(!/kitchen_payments_provider_drift_candidates|kitchen_payments_order_reconciliation/.test(code));
  assert.ok(!/is_staff_for_venue\s*\(/.test(code.split('13. Hardening')[0] ?? code));
});

test('nessun campo personale o payload grezzo restituito', () => {
  for (const f of ['nickname', 'customer_note', 'staff_note', 'customer_id', 'raw_payload', 'raw_last_event', 'actor_id', 'cancel_reason', 'table_id']) {
    assert.ok(!new RegExp(`\\b${f}\\b`).test(code), `campo esposto: ${f}`);
  }
});

test('nessuna scrittura sulle tabelle Kitchen', () => {
  assert.ok(!/\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./i.test(code));
  assert.ok(!/ALTER TABLE public\./i.test(code));
});

test('EXECUTE revocato a PUBLIC/anon/authenticated/service_role e concesso solo a watchdog_observer', () => {
  assert.match(code, /REVOKE ALL ON FUNCTION %s FROM PUBLIC/);
  for (const r of ['anon', 'authenticated', 'service_role']) assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION %s FROM ${r}`));
  const grants = [...code.matchAll(/GRANT EXECUTE ON FUNCTION watchdog_obs\.(\w+)\([^)]*\) TO (\w+);/g)];
  assert.ok(grants.length >= 10);
  for (const g of grants) assert.equal(g[2], 'watchdog_observer');
});

test('hardening anti-impersonificazione MIRATO: solo SECURITY DEFINER di public, non di estensioni, con snapshot', () => {
  const fn = code.slice(code.indexOf('FUNCTION watchdog_obs.harden_public_definer_functions'), code.indexOf('FUNCTION watchdog_obs.rollback_public_hardening'));
  assert.match(fn, /n\.nspname = 'public'/);
  assert.match(fn, /AND p\.prosecdef/);
  assert.match(fn, /deptype = 'e'/);
  assert.match(fn, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC/);
  assert.match(fn, /INSERT INTO watchdog_obs\.privilege_changes/);
  // preservazione: GRANT a ogni ruolo esistente tranne la famiglia observer (non una lista fissa di ruoli API)
  assert.match(fn, /FROM pg_roles r/);
  assert.match(fn, /pg_has_role\(r\.oid, 'watchdog_observer', 'USAGE'\)/);
  assert.match(fn, /pg_has_role\(r\.oid, 'watchdog_observer', 'SET'\)/);
  assert.ok(!/ARRAY\['anon', 'authenticated', 'service_role'\]/.test(code), 'lista fissa di ruoli API');
  assert.ok(!/ALTER DEFAULT PRIVILEGES/.test(code));
  // nessuna revoca su funzioni INVOKER né su schemi gestiti da Supabase
  assert.ok(!/nspname IN \('auth'|nspname = 'auth'|nspname = 'storage'/.test(fn));
});

test('hardening NON applicato dalla migration: nessuna chiamata implicita e nessuna ACL applicativa toccata', () => {
  const sql = code.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  // l'unica occorrenza è la DEFINIZIONE della funzione: nessun SELECT/PERFORM/CALL che la esegua
  assert.equal([...sql.matchAll(/harden_public_definer_functions\s*\(/g)].length, 1);
  assert.match(sql, /CREATE OR REPLACE FUNCTION watchdog_obs\.harden_public_definer_functions\(\)/);
  assert.ok(!/(SELECT|PERFORM|CALL)\s+watchdog_obs\.harden_public_definer_functions/i.test(sql));
  // nessun GRANT/REVOKE statico su funzioni o tabelle dello schema public (le ACL dinamiche stanno solo nelle funzioni di hardening)
  assert.ok(!/\b(GRANT|REVOKE)\b[^;]*\bON\s+(FUNCTION|ALL FUNCTIONS|TABLE|ALL TABLES)\s+public\./i.test(sql));
  assert.ok(!/ALTER\s+(FUNCTION|DEFAULT PRIVILEGES)/i.test(sql));
  // funzioni di hardening, rollback e snapshot restano disponibili per un'applicazione successiva autorizzata
  for (const f of ['harden_public_definer_functions', 'rollback_public_hardening', '_acl_norm']) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION watchdog_obs\\.${f}\\(`), f);
  }
  assert.match(sql, /CREATE TABLE IF NOT EXISTS watchdog_obs\.privilege_changes/);
});

test('rollback esatto: ripristino dell\'ACL registrata con confronto e annullamento in caso di differenza', () => {
  const fn = code.slice(code.indexOf('FUNCTION watchdog_obs.rollback_public_hardening'));
  assert.match(fn, /GRANT EXECUTE ON FUNCTION %s TO PUBLIC/);
  assert.match(fn, /_acl_norm\(v_now_acl, v_owner\) IS DISTINCT FROM watchdog_obs\._acl_norm\(v_c\.acl_before, v_owner\)/);
  assert.match(fn, /RAISE EXCEPTION 'ROLLBACK NON ESATTO/);
});

test('hardening, rollback e funzioni interne non eseguibili dall\'observer', () => {
  for (const f of ['harden_public_definer_functions', 'rollback_public_hardening', '_acl_norm']) {
    assert.ok(!new RegExp(`GRANT EXECUTE ON FUNCTION watchdog_obs\\.${f}`).test(code), f);
  }
  // la revoca generale su watchdog_obs viene DOPO la creazione di tutte le funzioni
  assert.ok(code.indexOf("WHERE n.nspname = 'watchdog_obs'\n  LOOP") > code.indexOf('FUNCTION watchdog_obs.rollback_public_hardening'));
});

test('attestazione di visibilità con row_security_active e statistiche', () => {
  assert.match(code, /row_security_active\(v_rel\)/);
  assert.match(code, /pg_stat_user_tables/);
});

test('parametri limitati (nessuna finestra illimitata richiedibile dall\'observer)', () => {
  assert.match(code, /LEAST\(hi, GREATEST\(lo,/);
});
