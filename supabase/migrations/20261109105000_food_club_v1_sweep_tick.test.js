// Food Club V1 Passo 3C — test statici sulla migration 20261109105000 (avvio corretto della sweep per i buoni trattenuti).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/70_sweep_tick.sql.
// Eseguire: node --test supabase/migrations/20261109105000_food_club_v1_sweep_tick.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261109105000_food_club_v1_sweep_tick.sql';
const raw = readFileSync(join(__dirname, FILE), 'utf8');
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(raw);

const fnBody = (name) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const next = code.indexOf('CREATE OR REPLACE FUNCTION', start + 10);
  const end = next > -1 ? next : code.indexOf('REVOKE ALL', start);
  assert.ok(end > start, `fine di ${name} non trovata`);
  return code.slice(start, end);
};

// T1 — Kitchen intatta, un solo cron.schedule con il nome esistente e il comando COALESCE.
test('T1 nessuna funzione kitchen_* creata/alterata/eliminata, nessun trigger/tabella Kitchen toccata', () => {
  assert.doesNotMatch(code, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\b(ALTER|DROP)\s+(FUNCTION|TRIGGER|TABLE)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(OR\s+REPLACE\s+)?TRIGGER\b/i);
  assert.doesNotMatch(code, /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?(kitchen_|food_club_)/i);
});

test('T1 definisce esattamente le tre funzioni Club attese', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...defined].sort(), [
    'food_club_release_sweep_tick', 'food_club_release_tick_due', 'food_club_release_tick_enabled',
  ]);
});

test('T1 un solo cron.schedule: nome esistente, stessa frequenza, comando COALESCE(Kitchen, Club); nessun cron nuovo/unschedule', () => {
  const calls = [...code.matchAll(/cron\.schedule\s*\(([\s\S]*?)\)\s*;/g)];
  assert.equal(calls.length, 1);
  assert.match(calls[0][1], /'kitchen-online-abandon-sweep'/);
  assert.match(calls[0][1], /'\* \* \* \* \*'/);
  assert.match(calls[0][1],
    /\$\$SELECT COALESCE\(public\.kitchen_online_abandon_sweep_tick\(\), public\.food_club_release_sweep_tick\(\)\)\$\$/);
  assert.doesNotMatch(code, /cron\.unschedule/i);
  assert.doesNotMatch(code, /cron\.alter_job/i);
});

// T2 — interruttore costante false, controllato prima di ogni query del tick Club.
test('T2 food_club_release_tick_enabled e una costante false, IMMUTABLE, search_path pg_catalog', () => {
  const b = fnBody('food_club_release_tick_enabled');
  assert.match(b, /RETURNS boolean/);
  assert.match(b, /\bIMMUTABLE\b/);
  assert.match(b, /SET search_path = pg_catalog/);
  assert.match(b, /AS \$\$ SELECT false \$\$/);
});

test('T2 il tick Club controlla l\'interruttore prima di ogni lettura (due, Vault, http_post)', () => {
  const b = fnBody('food_club_release_sweep_tick');
  const iEn = b.indexOf('food_club_release_tick_enabled()');
  assert.ok(iEn > -1);
  assert.match(b.slice(iEn, iEn + 120), /RETURN NULL/);
  for (const needle of ['food_club_release_tick_due', 'vault.decrypted_secrets', 'net.http_post', 'SELECT']) {
    const i = b.indexOf(needle, b.indexOf('BEGIN'));
    assert.ok(i > -1, needle);
    // la prima SELECT del corpo e quella dell'EXISTS/Vault: l'interruttore viene sempre prima
    if (needle !== 'SELECT') assert.ok(iEn < i, `${needle} prima dell'interruttore`);
  }
  const firstSelect = b.indexOf('SELECT', b.indexOf('BEGIN'));
  assert.ok(iEn < firstSelect, 'una SELECT precede l\'interruttore');
  assert.equal([...b.matchAll(/net\.http_post\s*\(/g)].length, 1, 'esattamente una http_post');
  assert.match(b, /SECURITY DEFINER/);
  assert.match(b, /SET search_path TO 'public', 'pg_temp'/);
  assert.match(b, /RETURNS bigint/);
});

// T3 — permessi e secret.
test('T3 REVOKE da PUBLIC/anon/authenticated/service_role per tutte e tre le funzioni; nessun GRANT', () => {
  const sigs = ['food_club_release_tick_enabled()', 'food_club_release_tick_due(timestamptz)',
    'food_club_release_sweep_tick(text)'];
  for (const s of sigs) {
    assert.ok(code.includes(`REVOKE ALL ON FUNCTION public.${s} FROM PUBLIC;`), `${s} PUBLIC`);
    for (const r of ['anon', 'authenticated', 'service_role']) {
      assert.ok(code.includes(`REVOKE EXECUTE ON FUNCTION public.${s} FROM ${r};`), `${s} ${r}`);
    }
  }
  assert.doesNotMatch(code, /\bGRANT\b/i);
});

test('T3 il secret compare solo per nome Vault: nessun valore, nessun create_secret, nessun token', () => {
  assert.equal([...code.matchAll(/kitchen_abandon_sweep_secret/g)].length, 2); // SELECT + WARNING
  assert.match(code, /name = 'kitchen_abandon_sweep_secret'/);
  assert.doesNotMatch(code, /vault\.create_secret|vault\.secrets|INSERT\s+INTO\s+vault/i);
  assert.doesNotMatch(code, /Bearer\s+[A-Za-z0-9_-]{8,}/);
  assert.match(code, /'Authorization', 'Bearer ' \|\| v_secret/);
});

// T4 — il criterio non dipende dallo stato della campagna.
test('T4 nessuna lettura di food_club_campaigns (ne in codice, ne via funzioni di campagna)', () => {
  assert.doesNotMatch(code, /food_club_campaigns/i);
  assert.doesNotMatch(code, /\bcampaign/i);
});

test('criterio: stesse condizioni del sigillo 3A, finestre 10 min / 24 h, raffica minuto%30<4, last_reason NULL gestito', () => {
  const b = fnBody('food_club_release_tick_due');
  assert.match(b, /v\.status = 'reserved'/);
  assert.match(b, /o\.status IN \('cancelled', 'payment_abandoned'\)/);
  assert.match(b, /o\.payment_status IS DISTINCT FROM 'paid'/);
  assert.match(b, /o\.created_at < p_now - interval '17 minutes'/);
  assert.match(b, /e\.event = 'held_until_checkout_expiry'/);
  assert.match(b, /NOT EXISTS \(SELECT 1 FROM public\.kitchen_payments p[\s\S]*?p\.status = 'succeeded'\)/);
  assert.match(b, /> p_now - interval '10 minutes'/);
  assert.match(b, /> p_now - interval '24 hours'/);
  assert.match(b, /% 30 < 4/);
  assert.match(b, /COALESCE\(s\.last_reason, ''\) NOT IN \('paid_evidence', 'order_paid', 'charge_succeeded'\)/);
  assert.match(b, /\bSTABLE\b/);
  assert.doesNotMatch(b, /\bnow\(\)/i, 'il criterio usa solo p_now');
  assert.doesNotMatch(b, /\b(INSERT|UPDATE|DELETE)\b/);
});
