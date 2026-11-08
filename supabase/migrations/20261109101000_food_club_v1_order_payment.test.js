// Food Club V1 Passo 1 — test statici sulla migration 20261109101000 (consumo buono, trattenuta, errori isolati).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/50_ct_voucher_hold.sql
// e tests/db/food-club-concurrency.test.mjs (Postgres locale).
// Eseguire: node --test supabase/migrations/20261109*.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(__dirname).filter((f) => /^20261109.*food_club.*\.sql$/.test(f)).sort();
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const MAIN = '20261109101000_food_club_v1_order_payment.sql';
const main = sqlOnly(read(MAIN));
const all = files.map((f) => sqlOnly(read(f))).join('\n');

const fnBody = (name) => {
  const start = main.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = main.indexOf('$$;', main.indexOf('AS $$', start));
  assert.ok(end > start, `fine di ${name} non trovata`);
  return main.slice(start, end);
};

test('le migration Club sono presenti (4 file 20261109*)', () => {
  assert.equal(files.length, 4, files.join(', '));
  assert.ok(files.includes(MAIN));
});

test('nessuna migration Club ridefinisce le RPC Kitchen di pagamento/ordine/riconciliazione', () => {
  assert.doesNotMatch(all, /CREATE OR REPLACE FUNCTION public\.kitchen_payment_/);
  assert.doesNotMatch(all, /CREATE OR REPLACE FUNCTION public\.kitchen_reconciliation_/);
  // kitchen_orders_food_club_* (trigger Club) e' ammesso; kitchen_order_<x> no, salvo il trigger-function di snapshot
  // gia' presente nella migration schema (kitchen_order_items_food_snapshot: trigger, non RPC).
  const defined = [...all.matchAll(/CREATE OR REPLACE FUNCTION public\.(kitchen_order_[a-z]\w*)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, ['kitchen_order_items_food_snapshot']);
  for (const rpc of ['kitchen_order_cancel_with_payment_attempt', 'kitchen_order_mark_payment_abandoned',
    'kitchen_order_switch_to_counter_system', 'kitchen_order_cancel', 'kitchen_order_set_status']) {
    assert.doesNotMatch(all, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`), rpc);
  }
});

test('i trigger Club isolano gli errori: EXCEPTION WHEN OTHERS + food_club_log_error', () => {
  for (const name of ['kitchen_orders_food_club_on_paid', 'kitchen_payments_food_club_on_charge',
    'kitchen_orders_food_club_on_closed_unpaid', 'kitchen_orders_food_club_on_refunded']) {
    const body = fnBody(name);
    assert.match(body, /EXCEPTION WHEN OTHERS/, `${name}: manca EXCEPTION WHEN OTHERS`);
    assert.match(body, /PERFORM public\.food_club_log_error\(/, `${name}: manca food_club_log_error`);
  }
});

test('unica eccezione bloccante: kitchen_orders_food_club_guard (nessun WHEN OTHERS)', () => {
  const body = fnBody('kitchen_orders_food_club_guard');
  assert.doesNotMatch(body, /EXCEPTION WHEN OTHERS/);
  assert.match(body, /RAISE EXCEPTION 'food_club_voucher_locks_order_amount'/);
});

test('food_club_log_error non propaga errori (WARNING se anche il log fallisce)', () => {
  const body = fnBody('food_club_log_error');
  assert.match(body, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
});

test('consume_on_charge e log_error: nessun GRANT ad anon/authenticated, REVOKE esplicito', () => {
  for (const name of ['food_club_consume_on_charge', 'food_club_log_error', 'kitchen_payments_food_club_on_charge']) {
    const grants = all.split(';').filter((s) => /\bGRANT\b/.test(s) && s.includes(`public.${name}(`));
    assert.deepEqual(grants.filter((s) => /anon|authenticated|PUBLIC/i.test(s)), [], `${name}: GRANT a ruoli pubblici`);
    assert.match(all, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`), `${name}: manca REVOKE`);
  }
});

test('food_club_finalize_hold NON esiste (rinviato ai Passi 2-3)', () => {
  assert.doesNotMatch(all, /food_club_finalize_hold/);
  for (const f of files) assert.doesNotMatch(sqlOnly(read(f)), /food_club_finalize_hold/, f);
});

test('create_order_v4: campagna spenta rifiutata, buono bloccato DOPO la creazione ordine (ordine -> buono)', () => {
  const body = fnBody('kitchen_customer_create_order_v4');
  assert.match(body, /voucher_campaign_inactive/);
  const iCampaign = body.indexOf('voucher_campaign_inactive');
  const iCreate = body.indexOf('kitchen_customer_create_order_v3(');
  const iLock = body.indexOf('FROM public.food_club_vouchers WHERE id = p_voucher_id FOR UPDATE');
  assert.ok(iCampaign > -1 && iCreate > iCampaign, 'il controllo campagna precede la creazione ordine');
  assert.ok(iLock > iCreate, 'FOR UPDATE sul buono dopo la creazione dell\'ordine');
});

test('trattenuta: on_closed_unpaid tiene il buono con evento held_until_checkout_expiry e rilascia solo il banco puro', () => {
  const body = fnBody('kitchen_orders_food_club_on_closed_unpaid');
  assert.match(body, /held_until_checkout_expiry/);
  assert.match(body, /p\.provider IS DISTINCT FROM 'cash' AND p\.provider IS DISTINCT FROM 'manual'/);
  assert.match(body, /counter_only_no_collection/);
  assert.match(body, /food_club_consume_on_charge\(NEW\.id, 'on_closed'\)/);
});

test('consumo: eventi order_paid / consumed_on_late_charge / used_on_charge / reclaimed_on_late_payment e double_spend', () => {
  const body = fnBody('food_club_consume_on_charge');
  for (const ev of ['order_paid', 'consumed_on_late_charge', 'used_on_charge', 'reclaimed_on_late_payment', 'food_club_voucher_double_spend']) {
    assert.match(body, new RegExp(ev), ev);
  }
  assert.match(body, /SELECT \* INTO v_order FROM public\.kitchen_orders WHERE id = p_order_id FOR UPDATE/);
});

test('on_refunded: D-P2 nessun riaccredito su ordine annullato/abbandonato o consumato in ritardo; FIX-3 premio invito', () => {
  const body = fnBody('kitchen_orders_food_club_on_refunded');
  assert.match(body, /NEW\.status NOT IN \('cancelled', 'payment_abandoned'\)/);
  assert.match(body, /consumed_on_late_charge/);
  assert.match(body, /referral_order_refunded/);
});

test('trigger charge: AFTER INSERT OR UPDATE OF status solo per charge succeeded', () => {
  assert.match(main, /CREATE TRIGGER kitchen_payments_food_club_on_charge\s+AFTER INSERT OR UPDATE OF status ON public\.kitchen_payments\s+FOR EACH ROW\s+WHEN \(NEW\.direction = 'charge' AND NEW\.status = 'succeeded'\)/);
});

test('FK RESTRICT su ordine (FIX-4) e indice eventi per ordine nella migration schema', () => {
  const schema = sqlOnly(read('20261109100000_food_club_v1_schema.sql'));
  assert.match(schema, /order_id\s+text UNIQUE REFERENCES public\.kitchen_orders\(id\) ON DELETE RESTRICT/);
  assert.match(schema, /reserved_order_id\s+text REFERENCES public\.kitchen_orders\(id\) ON DELETE RESTRICT/);
  assert.match(schema, /used_order_id\s+text REFERENCES public\.kitchen_orders\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(schema, /kitchen_orders\(id\) ON DELETE SET NULL/);
  assert.match(schema, /food_club_voucher_events_order ON public\.food_club_voucher_events \(order_id\)/);
});
