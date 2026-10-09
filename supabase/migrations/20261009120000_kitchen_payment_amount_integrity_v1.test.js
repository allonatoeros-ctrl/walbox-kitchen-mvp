// 20261009120000_kitchen_payment_amount_integrity_v1.test.js — S0.5 F1 Amount Integrity.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB (migration NON applicata).
// Eseguire a mano: node --test supabase/migrations/20261009120000_kitchen_payment_amount_integrity_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261009120000_kitchen_payment_amount_integrity_v1.sql'), 'utf8');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  return src.slice(start, src.indexOf('$function$;', start));
}
const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const promo = sqlOnly(fnBody('kitchen_promo_pass_redeem_for_order'));
const start = sqlOnly(fnBody('kitchen_payment_attempt_start'));
const confirm = sqlOnly(fnBody('kitchen_payment_confirm'));

test('migration: solo CREATE OR REPLACE delle 3 RPC, nessun ALTER/DROP/CREATE TABLE/POLICY/INSERT-DDL', () => {
  const code = sqlOnly(src);
  assert.equal((code.match(/CREATE OR REPLACE FUNCTION/g) || []).length, 3);
  assert.doesNotMatch(code, /\b(ALTER|DROP)\s+(TABLE|POLICY|FUNCTION|COLUMN)|CREATE\s+(TABLE|POLICY|TRIGGER|INDEX)/i);
  assert.doesNotMatch(code, /kitchen_orders_update|ENABLE ROW LEVEL/i);
});

// ---- promo (I2) ------------------------------------------------------------------------------
test('promo: payment_in_progress se esiste un charge attempt live / retry-eligible', () => {
  assert.match(promo, /RAISE EXCEPTION 'payment_in_progress'/);
  assert.match(promo, /\(p\.status IN \('initiated', 'pending'\) AND p\.channel = 'app'\)/);
  assert.match(promo, /p\.status = 'failed' AND p\.provider = 'sumup' AND p\.failure_reason = 'sumup_failed'/);
  assert.match(promo, /p\.direction = 'charge'/);
});
test('promo: guard DOPO il retry idempotente e DOPO already_paid, PRIMA di ogni scrittura', () => {
  const idem = promo.indexOf('IF v_order.promo_code = v_code');
  const paid = promo.indexOf("order_already_paid");
  const guard = promo.indexOf("payment_in_progress");
  const promoSelect = promo.indexOf('SELECT * INTO v_promo');
  const update = promo.indexOf('UPDATE public.kitchen_orders');
  assert.ok(idem > -1 && idem < guard, 'retry idempotente prima del guard');
  assert.ok(paid < guard, 'order_already_paid prima del guard');
  assert.ok(guard < promoSelect && guard < update, 'nessuna scrittura / lock promo prima del guard');
});
test('promo: attempt terminali NON bloccano', () => {
  assert.doesNotMatch(promo, /sumup_expired|sumup_cancelled|sumup_amount_mismatch/);
});
test('promo: un attempt initiated/pending su channel counter NON blocca (filtro channel app solo sul ramo initiated/pending)', () => {
  assert.doesNotMatch(promo, /p\.status IN \('initiated', 'pending'\)\s*\n/);
  assert.match(promo, /p\.status = 'failed' AND p\.provider = 'sumup' AND p\.failure_reason = 'sumup_failed'/);
});
test('promo: calcolo sconto, allowlist, guardia anti-doppio-uso e GRANT invariati', () => {
  assert.match(promo, /ARRAY\['item-009', 'item-010', 'item-011', 'item-040', 'item-041', 'item-042'\]/);
  assert.match(promo, /total = total - v_discount/);
  assert.match(promo, /WHERE code = v_promo\.code AND status = 'issued'/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) FROM PUBLIC;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) TO authenticated;/);
});

// ---- attempt_start (I1) ----------------------------------------------------------------------
test('attempt_start: v_existing con amount != order.total -> amount_mismatch_live_attempt, mai riusato', () => {
  const found = start.indexOf('IF FOUND THEN');
  const cmp = start.indexOf('IF v_existing.amount <> v_order.total THEN', found);
  const raise = start.indexOf("RAISE EXCEPTION 'amount_mismatch_live_attempt'", cmp);
  const ret = start.indexOf('RETURN v_existing;', found);
  assert.ok(found > -1 && cmp > found && raise > cmp && ret > raise, 'confronto e RAISE prima del RETURN v_existing');
});
test('attempt_start: amount uguale -> ritorna v_existing; guard preesistenti invariati', () => {
  assert.match(start, /RETURN v_existing;/);
  for (const g of ['order_not_found', 'order_cancelled', 'order_already_paid', 'not_order_owner', 'online_payment_disabled', 'not_staff_for_venue', 'invalid_channel', "RAISE EXCEPTION 'amount_mismatch';"]) {
    assert.ok(start.includes(g), `guard ${g} deve restare`);
  }
  assert.match(start, /SELECT \* INTO v_order FROM public\.kitchen_orders WHERE id = p_order_id FOR UPDATE;/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_attempt_start\(text, text, text, text, numeric, text\)\s+TO authenticated;/);
});

// ---- confirm (I3) ----------------------------------------------------------------------------
test('confirm: mismatch -> charge resta succeeded, ordine NON toccato, log payment_confirmed_amount_mismatch', () => {
  const lock = confirm.indexOf('FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE');
  const mm = confirm.indexOf('IF v_payment.amount IS DISTINCT FROM v_order_total THEN');
  const firstOrderUpdate = confirm.indexOf('UPDATE public.kitchen_orders');
  assert.ok(lock > -1 && mm > lock, 'confronto dopo il lock sull ordine');
  assert.ok(mm < firstOrderUpdate, 'confronto prima di qualsiasi UPDATE kitchen_orders');
  const branch = confirm.slice(mm, confirm.indexOf('END IF;', mm));
  assert.doesNotMatch(branch, /UPDATE public\.kitchen_orders/);
  assert.doesNotMatch(branch, /payment_status = 'paid'/);
  assert.match(branch, /'payment_confirmed_amount_mismatch'/);
  assert.match(branch, /'needs_manual_reconciliation', true/);
  assert.match(branch, /RETURN v_payment;/);
});
test('confirm: il charge viene marcato succeeded PRIMA del confronto (evidenza finanziaria preservata)', () => {
  assert.ok(confirm.indexOf("SET status = 'succeeded'") < confirm.indexOf('IS DISTINCT FROM v_order_total'));
});
test('confirm: happy path invariato (rami pending_counter_payment / cancelled / else, log payment_confirmed, lost_race)', () => {
  assert.match(confirm, /v_order_status = 'pending_counter_payment' THEN\s*\n\s*UPDATE public\.kitchen_orders\s*\n\s*SET payment_status = 'paid'.*status = 'received'/);
  assert.match(confirm, /ELSIF v_order_status = 'cancelled' THEN/);
  assert.match(confirm, /'payment_confirmed_after_cancel'/);
  assert.match(confirm, /'payment_confirmed',\s*'system'|'payment_confirmed', 'system'/);
  assert.match(confirm, /payment_confirm_lost_race/);
  assert.match(confirm, /service_role_only/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\)\s+TO service_role;/);
});

// ---- concorrenza (statica: stesso lock order) ------------------------------------------------
test('concorrenza: promo e attempt_start serializzano sulla stessa riga kitchen_orders FOR UPDATE', () => {
  assert.match(promo, /FROM public\.kitchen_orders WHERE id = p_order_id FOR UPDATE/);
  assert.match(start, /FROM public\.kitchen_orders WHERE id = p_order_id FOR UPDATE/);
  assert.ok(promo.indexOf('FOR UPDATE') < promo.indexOf('payment_in_progress'), 'guard letto sotto lock ordine');
});
test('concorrenza: confirm mantiene lock order payment -> order (invariato, nessun deadlock nuovo)', () => {
  assert.ok(confirm.indexOf('FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE') < confirm.indexOf('FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE'));
});
