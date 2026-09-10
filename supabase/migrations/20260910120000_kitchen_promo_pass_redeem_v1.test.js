// 20260910120000_kitchen_promo_pass_redeem_v1.test.js — contratto RPC
// kitchen_promo_pass_redeem_for_order (Personalita' Discutibile Pass, redemption V2, Opzione A).
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260909140000_kitchen_promo_pass_issuance_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260910120000_kitchen_promo_pass_redeem_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260910120000_kitchen_promo_pass_redeem_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_redeem_for_order');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('schema: 2 colonne nullable/default su kitchen_orders, nessuna nuova tabella', () => {
  assert.match(src, /ADD COLUMN discount_amount numeric NOT NULL DEFAULT 0/);
  assert.match(src, /ADD COLUMN promo_code text/);
  assert.match(src, /CHECK \(discount_amount >= 0\)/);
  assert.doesNotMatch(src, /CREATE TABLE/);
});

test('RPC: verifica staff, blocca ordine già promo-ato o già pagato prima di toccare il pass', () => {
  const fn = fnBody();
  assert.match(fn, /IF NOT is_staff_for_venue\(v_order\.venue_id\) THEN/);
  assert.match(fn, /RAISE EXCEPTION 'not_staff_for_venue'/);
  assert.match(fn, /IF v_order\.promo_code IS NOT NULL THEN/);
  assert.match(fn, /RAISE EXCEPTION 'order_already_has_promo'/);
  assert.match(fn, /IF v_order\.payment_status = 'paid' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'order_already_paid'/);
});

test('retry idempotente: stesso codice sullo stesso ordine ritorna l\'ordine invariato, non sconta due volte', () => {
  const fn = fnBody();
  assert.match(fn, /IF v_order\.promo_code = v_code THEN\s*\n\s*RETURN v_order;/);
});

test('pass non trovato / già redento distinti, nessun accesso al codice di un altro venue', () => {
  const fn = fnBody();
  assert.match(fn, /RAISE EXCEPTION 'promo_code_not_found'/);
  assert.match(fn, /IF v_promo\.status = 'redeemed' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'promo_already_redeemed'/);
  assert.match(fn, /IF v_promo\.venue_id <> v_order\.venue_id THEN/);
  assert.match(fn, /RAISE EXCEPTION 'promo_venue_mismatch'/);
});

test('allowlist Pesi Massimi hardcoded server-side: esattamente i 6 item_id reali (LO VOGLIO + FALLO PESANTE)', () => {
  const fn = fnBody();
  assert.match(
    fn,
    /ARRAY\['item-009', 'item-010', 'item-011', 'item-040', 'item-041', 'item-042'\]/
  );
});

test('nessun Peso Massimo eleggibile: errore esplicito, pass non toccato (nessuna UPDATE su kitchen_promo_passes prima di questo check)', () => {
  const fn = fnBody();
  const eligibleCheckIdx = fn.indexOf("RAISE EXCEPTION 'promo_no_eligible_item'");
  const promoUpdateIdx = fn.indexOf('UPDATE public.kitchen_promo_passes');
  assert.ok(eligibleCheckIdx > -1, 'promo_no_eligible_item check presente');
  assert.ok(promoUpdateIdx > -1, 'UPDATE su kitchen_promo_passes presente');
  assert.ok(eligibleCheckIdx < promoUpdateIdx, 'il check eleggibilità precede la scrittura sul pass');
});

test('sconto: -10% arrotondato a 2 decimali sul prezzo unitario più basso fra gli item eleggibili', () => {
  const fn = fnBody();
  assert.match(fn, /ORDER BY oi\.price ASC\s*\n\s*LIMIT 1/);
  assert.match(fn, /v_discount := round\(v_unit_price \* 0\.10, 2\)/);
});

test('atomicità: guardia anti-doppio-uso su UPDATE...WHERE status=\'issued\', eccezione se non trovato (rollback dell\'intera funzione)', () => {
  const fn = fnBody();
  assert.match(fn, /WHERE code = v_promo\.code AND status = 'issued'/);
  assert.match(fn, /IF NOT FOUND THEN\s*\n\s*RAISE EXCEPTION 'promo_already_redeemed';/);
});

test('grant: EXECUTE solo per authenticated, revocato da PUBLIC (stesso pattern delle altre RPC Kitchen)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) FROM PUBLIC/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) TO authenticated/);
});

console.log('20260910120000_kitchen_promo_pass_redeem_v1.test.js: tutti i test passati.');
