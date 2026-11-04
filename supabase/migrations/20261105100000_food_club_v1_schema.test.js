// Food Club V1 — test statici sulle 4 migration 20261105* (stile repo: assert sul testo SQL, nessun DB).
// Il comportamento a runtime è coperto da tests/db/ (Postgres locale): tests/db/run-food-club-sql.sh e
// tests/db/food-club-concurrency.test.mjs. Eseguire: node --test supabase/migrations/20261105100000_food_club_v1_schema.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILES = [
  '20261105100000_food_club_v1_schema.sql',
  '20261105101000_food_club_v1_order_payment.sql',
  '20261105102000_food_club_v1_identity_api.sql',
  '20261105103000_food_club_v1_staff_analytics.sql',
];
const src = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(__dirname, f), 'utf8')]));
const all = Object.values(src).join('\n');
const code = all.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

test('header: ogni file dichiara che NON è applicato e che l\'apply è di Eros', () => {
  for (const f of FILES) assert.match(src[f], /NON applicato a produzione\. Applicazione = gate di Eros/, f);
});

test('additiva: nessun DROP di tabelle/colonne o DELETE su tabelle Kitchen esistenti', () => {
  assert.doesNotMatch(code, /DROP\s+TABLE/i);
  assert.doesNotMatch(code, /DROP\s+COLUMN/i);
  assert.doesNotMatch(code, /DELETE\s+FROM\s+public\.kitchen_(orders|order_items|payments|menu_items)\b/i);
  assert.doesNotMatch(code, /CREATE OR REPLACE FUNCTION public\.kitchen_payment_(confirm|record_counter|refund)/,
    'le RPC di pagamento esistenti non vengono riscritte');
});

test('RLS attiva su tutte le tabelle food_club_*', () => {
  const tables = [...code.matchAll(/CREATE TABLE IF NOT EXISTS public\.(food_club_[a-z_]+)/g)].map((m) => m[1]);
  assert.ok(tables.length >= 10);
  for (const t of tables) assert.match(code, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`), t);
});

test('ogni funzione SECURITY DEFINER fissa search_path', () => {
  const blocks = code.split(/CREATE OR REPLACE FUNCTION /).slice(1);
  for (const b of blocks) {
    const head = b.slice(0, b.indexOf('AS $'));
    if (/SECURITY DEFINER/.test(head)) assert.match(head, /SET search_path/, head.slice(0, 60));
  }
});

test('nessuna RPC cliente/staff eseguibile da anon (solo la campagna pubblica)', () => {
  const grantsToAnon = [...code.matchAll(/GRANT EXECUTE ON FUNCTION([\s\S]*?)TO ([^;]+);/g)]
    .filter((m) => /\banon\b/.test(m[2])).map((m) => m[1]);
  assert.deepEqual(grantsToAnon.map((s) => s.trim()), ['public.food_club_public_campaign(text)']);
});

test('provenienza ordine scritta dal trigger, immutabile', () => {
  assert.match(code, /CREATE TRIGGER kitchen_orders_source_stamp\s+BEFORE INSERT OR UPDATE OF source ON public\.kitchen_orders/);
  assert.match(code, /RAISE EXCEPTION 'order_source_immutable'/);
});

test('campagna V1 creata spenta, inviti/benvenuto/retroattivi spenti (decisioni aperte)', () => {
  assert.match(code, /VALUES \('visite-v1', 'walrus-main', 'Due visite, 5 €', false\)/);
  assert.match(code, /referral_enabled\s+boolean NOT NULL DEFAULT false/);
  assert.match(code, /welcome_stamp_enabled\s+boolean NOT NULL DEFAULT false/);
  assert.match(code, /retroactive_days\s+integer NOT NULL DEFAULT 0/);
  assert.match(code, /refund_recredits_voucher boolean NOT NULL DEFAULT false/);
});

test('buono: un riservato per ordine, consumo solo con charge riuscito di importo = totale', () => {
  assert.match(code, /food_club_vouchers_one_per_reserved_order\s+ON public\.food_club_vouchers \(reserved_order_id\) WHERE status = 'reserved'/);
  assert.match(code, /p\.status = 'succeeded'\s+AND p\.amount = NEW\.total/);
  assert.match(code, /WHEN \(NEW\.payment_status = 'paid' AND OLD\.payment_status IS DISTINCT FROM 'paid'\)/);
  assert.match(code, /WHEN \(NEW\.status IN \('cancelled', 'payment_abandoned'\)/);
  assert.match(code, /RAISE EXCEPTION 'food_club_voucher_locks_order_amount'/);
});

test('nessun job push schedulato senza Vault (gate di Eros); nessun secret nel SQL', () => {
  assert.doesNotMatch(code, /cron\.schedule\('food-club-push'/);
  assert.doesNotMatch(all, /eyJ[A-Za-z0-9_-]{20,}/, 'nessun JWT');
  assert.match(code, /WHERE name = 'food_club_push_secret'/);
});
