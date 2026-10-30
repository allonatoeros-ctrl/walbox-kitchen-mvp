// 20261030140000_kitchen_privacy_retention_v1.test.js — Privacy Fase 2 (2026-10-30).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime va provato su Postgres locale (skill e2e-real-local).
// Eseguire a mano: node --test supabase/migrations/20261030140000_kitchen_privacy_retention_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261030140000_kitchen_privacy_retention_v1.sql'), 'utf8');

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

const sweep = () => fnBody('kitchen_privacy_retention_sweep');
const erase = () => fnBody('kitchen_privacy_erase_order');

test('header: dichiara SOLO LOCALE e il gate di Eros', () => {
  assert.match(src, /SOLO LOCALE, non applicata al remoto/);
  assert.match(src, /gate di Eros/);
});

test('migration additiva: nessun DROP, ALTER TABLE, TRUNCATE; solo le 2 funzioni nuove', () => {
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bALTER TABLE\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  // pg_cron gia' attivo: ripetere CREATE EXTENSION rompe l'hook Supabase (provato in locale).
  assert.doesNotMatch(code, /CREATE EXTENSION/i);
  assert.doesNotMatch(code, /GRANT \w+ ON SCHEMA cron/i);
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns.sort(), ['kitchen_privacy_erase_order', 'kitchen_privacy_retention_sweep']);
});

test('funzioni SECURITY DEFINER con search_path fisso', () => {
  for (const body of [sweep(), erase()]) {
    assert.match(body, /SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
  }
});

test('sweep eseguibile solo da postgres (cron): revocato a PUBLIC, anon, authenticated, service_role', () => {
  for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
    assert.match(code, new RegExp(`REVOKE (ALL|EXECUTE) ON FUNCTION public\\.kitchen_privacy_retention_sweep\\(\\) FROM ${role};`));
  }
  assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.kitchen_privacy_retention_sweep/);
});

test('erase: solo service_role, revocato a PUBLIC/anon/authenticated', () => {
  for (const role of ['PUBLIC', 'anon', 'authenticated']) {
    assert.match(code, new RegExp(`REVOKE (ALL|EXECUTE) ON FUNCTION public\\.kitchen_privacy_erase_order\\(text, text\\) FROM ${role};`));
  }
  assert.match(code, /GRANT EXECUTE ON FUNCTION public\.kitchen_privacy_erase_order\(text, text\) TO service_role;/);
});

test('ordini: 30 giorni, nickname anonimo + note NULL, idempotente, salta le righe incoerenti I2', () => {
  const body = sweep();
  assert.match(body, /UPDATE public\.kitchen_orders SET nickname = 'anonimo', note = NULL, customer_note = NULL, staff_note = NULL WHERE created_at < now\(\) - interval '30 days'/);
  assert.match(body, /nickname IS DISTINCT FROM 'anonimo' OR note IS NOT NULL OR customer_note IS NOT NULL OR staff_note IS NOT NULL/);
  assert.match(body, /AND NOT \(payment_status IS NOT DISTINCT FROM 'paid' AND status IN \('pending_online_payment', 'payment_abandoned'\)\)/);
});

test('ordini: importi, stati e date non vengono toccati', () => {
  const upd = sweep().match(/UPDATE public\.kitchen_orders SET (.*?) WHERE/)[1];
  for (const col of ['total', 'status', 'payment_status', 'created_at', 'paid_at', 'discount_amount']) {
    assert.doesNotMatch(upd, new RegExp(`\\b${col}\\b\\s*=`), `${col} non deve cambiare`);
  }
  assert.doesNotMatch(sweep(), /DELETE FROM public\.kitchen_orders/);
  assert.doesNotMatch(sweep(), /kitchen_order_items/);
});

test('sessioni cliente 30 giorni, push 180 giorni, analytics 90 giorni', () => {
  const body = sweep();
  assert.match(body, /DELETE FROM public\.kitchen_customer_sessions WHERE last_seen_at < now\(\) - interval '30 days';/);
  assert.match(body, /DELETE FROM public\.kitchen_push_subscriptions WHERE last_seen_at < now\(\) - interval '180 days';/);
  assert.match(body, /DELETE FROM public\.kitchen_promo_analytics_events WHERE created_at < now\(\) - interval '90 days';/);
});

test('pagamenti: raw ridotto dopo 90 giorni, transactions[].id resta (rimborso), idempotente', () => {
  const body = sweep();
  assert.match(body, /UPDATE public\.kitchen_payments SET raw_last_event = jsonb_strip_nulls\(jsonb_build_object\(/);
  assert.match(body, /'id', t -> 'id'/);
  assert.match(body, /jsonb_typeof\(raw_last_event -> 'transactions'\) = 'array'/);
  assert.match(body, /WHERE updated_at < now\(\) - interval '90 days' AND NOT \(raw_last_event \? 'privacy_reduced'\);/);
  assert.doesNotMatch(body, /raw_last_event = '\{\}'/);
  assert.doesNotMatch(body, /DELETE FROM public\.kitchen_payments\b/);
});

test('webhook: raw_payload svuotato dopo 90 giorni, righe tenute', () => {
  const body = sweep();
  assert.match(body, /UPDATE public\.kitchen_payment_webhook_events SET raw_payload = '\{\}'::jsonb WHERE received_at < now\(\) - interval '90 days' AND raw_payload <> '\{\}'::jsonb;/);
  assert.doesNotMatch(body, /DELETE FROM public\.kitchen_payment_webhook_events/);
});

test('utenti: solo anonimi inattivi da 90 giorni, senza ordini recenti, pass promo, ruolo staff; lotto 1000', () => {
  const body = sweep();
  assert.match(body, /DELETE FROM auth\.users u WHERE u\.id IN \(/);
  assert.match(body, /WHERE a\.is_anonymous AND greatest\(a\.created_at, a\.last_sign_in_at\) < now\(\) - interval '90 days'/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM auth\.sessions s WHERE s\.user_id = a\.id AND greatest\(s\.created_at, s\.updated_at, s\.refreshed_at\) >= now\(\) - interval '90 days'\)/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM public\.kitchen_orders o WHERE o\.customer_id = a\.id AND o\.created_at >= now\(\) - interval '90 days'\)/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM public\.kitchen_promo_passes p WHERE p\.customer_id = a\.id\)/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM public\.kitchen_staff_members m WHERE m\.user_id = a\.id\)/);
  assert.match(body, /NOT EXISTS \(SELECT 1 FROM public\.kitchen_service_state st WHERE st\.updated_by = a\.id\)/);
  assert.match(body, /LIMIT 1000\);/);
});

test('fuori perimetro: action_log, menu e tabelle di cassa non toccati', () => {
  const body = sweep();
  for (const t of ['kitchen_action_log', 'kitchen_menu_items', 'kitchen_menu_availability', 'kitchen_service_order_counters']) {
    assert.doesNotMatch(body, new RegExp(t));
  }
});

test('erase: verifica nickname, anonimizza gli ordini del cliente, cancella sessioni e push', () => {
  const body = erase();
  assert.match(body, /RAISE EXCEPTION 'order_not_found'/);
  assert.match(body, /IF lower\(btrim\(v_nickname\)\) IS DISTINCT FROM lower\(btrim\(p_nickname\)\) THEN RAISE EXCEPTION 'nickname_mismatch'/);
  const iCheck = body.indexOf('nickname_mismatch');
  const iUpdate = body.indexOf('UPDATE public.kitchen_orders');
  assert.ok(iCheck > -1 && iCheck < iUpdate, 'il controllo nickname precede ogni scrittura');
  assert.match(body, /WHERE \(id = p_order_id OR \(v_customer_id IS NOT NULL AND customer_id = v_customer_id\)\) AND NOT \(payment_status IS NOT DISTINCT FROM 'paid' AND status IN \('pending_online_payment', 'payment_abandoned'\)\);/);
  assert.match(body, /DELETE FROM public\.kitchen_customer_sessions WHERE customer_id = v_customer_id;/);
  assert.match(body, /DELETE FROM public\.kitchen_push_subscriptions WHERE customer_id = v_customer_id;/);
  assert.doesNotMatch(body, /auth\.users/);
});

test('job pg_cron kitchen-privacy-retention ogni notte alle 04:37', () => {
  assert.match(code, /SELECT cron\.schedule\( 'kitchen-privacy-retention', '37 4 \* \* \*', \$\$SELECT public\.kitchen_privacy_retention_sweep\(\)\$\$ \);/);
});
