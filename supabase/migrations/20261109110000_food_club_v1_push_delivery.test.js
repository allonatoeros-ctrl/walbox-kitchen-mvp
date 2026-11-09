// Food Club V1 — test statici sulla migration 20261109110000 (consegna push, orfani, generatori, schedule).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/41_push_delivery.sql
// e tests/db/food-club-push-concurrency.test.mjs.
// Eseguire: node --test supabase/migrations/20261109110000_food_club_v1_push_delivery.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(__dirname, '20261109110000_food_club_v1_push_delivery.sql'), 'utf8');
const code = raw.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const orig = readFileSync(join(__dirname, '20261109102000_food_club_v1_identity_api.sql'), 'utf8')
  .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  return text.slice(start, text.indexOf('$$;', text.indexOf('AS $$', start)) + 3);
};
const head = (b) => b.slice(0, b.indexOf('AS $$')).replace(/\s+/g, ' ').trim();

test('header: solo locale, apply = gate di Eros, rollback documentato', () => {
  assert.match(raw, /SOLO LOCALE, non applicata al remoto/);
  assert.match(raw, /gate di Eros/);
  assert.match(raw, /cron\.unschedule\('food-club-push'\)/);
});

test('ridefinisce solo funzioni food_club_* di consegna: nessuna kitchen_*, nessuna tabella, nessun DROP', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(defined, ['food_club_promo_enqueue', 'food_club_push_claim_batch', 'food_club_push_claim_batch_at',
    'food_club_push_report', 'food_club_push_tick', 'food_club_winback_enqueue']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(TABLE|TRIGGER|POLICY|INDEX)\b|\bDROP\s/i);
});

test('firme pubbliche invariate rispetto a 20261109102000 (la Edge Function non cambia chiamata)', () => {
  for (const name of ['food_club_push_claim_batch', 'food_club_push_report', 'food_club_push_tick']) {
    assert.equal(head(fnBody(code, name)), head(fnBody(orig, name)), name);
  }
});

test('ogni funzione SECURITY DEFINER con search_path fisso e guardia interna', () => {
  for (const name of ['food_club_push_claim_batch_at', 'food_club_push_claim_batch', 'food_club_push_report',
    'food_club_promo_enqueue', 'food_club_winback_enqueue']) {
    const b = fnBody(code, name);
    assert.match(b, /SECURITY DEFINER\s+SET search_path = public, pg_temp/, name);
    assert.match(b, /RAISE EXCEPTION 'service_role_only'/, name);
  }
  assert.match(fnBody(code, 'food_club_push_tick'), /SET search_path = public, pg_temp/);
});

test('regole: orfani failed al 3° tentativo, lock per utente, finestra 17-20, campagna, ora dell ordine', () => {
  const b = fnBody(code, 'food_club_push_claim_batch_at');
  assert.match(b, /orphan_max_attempts/);
  assert.match(b, /pg_try_advisory_xact_lock\(hashtextextended\('food_club_push:' \|\| r\.user_id::text, 0\)\)/);
  assert.match(b, /time '17:00' OR v_ltime >= time '20:00'/);
  assert.match(b, /expiring_window_missed/);
  assert.match(b, /campaign_off/);
  assert.match(b, /o\.customer_id = r\.user_id AND o\.created_at > p_now - interval '1 hour'/);
  assert.match(b, /marketing_consent_at IS NULL OR v_m\.marketing_revoked_at IS NOT NULL OR NOT v_m\.notif_promo_enabled/);
  assert.match(b, /v_ltime >= time '22:30' OR v_ltime < time '10:00'/);
});

test('report: time_budget restituisce il tentativo, senza sottoscrizioni = skipped', () => {
  const b = fnBody(code, 'food_club_push_report');
  assert.match(b, /p_error = 'time_budget' THEN 'queued'/);
  assert.match(b, /GREATEST\(m\.push_attempts - 1, 0\)/);
  assert.match(b, /THEN 'no_club_subscription'/);
  assert.match(b, /WHERE m\.id = p_message_id AND m\.push_status = 'sending'/);
});

test('tick: secret solo da Vault per nome, WARNING senza secret, nessun segreto nel file', () => {
  const b = fnBody(code, 'food_club_push_tick');
  assert.match(b, /vault\.decrypted_secrets WHERE name = 'food_club_push_secret'/);
  assert.match(b, /RAISE WARNING[\s\S]*RETURN NULL;/);
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{10,}|sk_(live|test)_|BEGIN PRIVATE KEY/);
});

test('permessi: claim_batch_at solo proprietario, generatori a service_role, nessun grant ai client', () => {
  assert.match(code, /REVOKE ALL ON FUNCTION public\.food_club_push_claim_batch_at\(integer, timestamptz\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.doesNotMatch(code, /GRANT[^;]*\b(anon|authenticated)\b/);
  assert.match(code, /GRANT EXECUTE ON FUNCTION[^;]*food_club_promo_enqueue[^;]*TO service_role;/);
});

test('cron: food-club-push ogni 5 minuti verso la funzione, winback giornaliero', () => {
  const jobs = [...code.matchAll(/cron\.schedule\('([^']+)', '([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(jobs, [['food-club-push', '*/5 * * * *'], ['food-club-winback', '7 15 * * *']]);
  assert.match(code, /food_club_push_tick\('https:\/\/pcrqfdzipotprqtuemso\.supabase\.co\/functions\/v1\/send-food-club-push'\)/);
});
