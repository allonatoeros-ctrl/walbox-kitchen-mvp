// 20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js — contratto RPC
// kitchen_promo_pass_redeem_for_order dopo l'estensione del gate a "staff OR proprietario
// dell'ordine" (Opzione 2, redeem lato cliente). Stile repo: assert statiche sul sorgente SQL,
// nessuna connessione DB reale (stesso pattern di 20260910120000_kitchen_promo_pass_redeem_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260910130000_kitchen_promo_pass_redeem_customer_v1.sql'), 'utf8');

function fnBody() {
  const start = src.indexOf('CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_redeem_for_order');
  const end = src.indexOf('$function$;', start);
  return src.slice(start, end);
}

test('nessuna nuova tabella/colonna: solo CREATE OR REPLACE sulla RPC esistente', () => {
  assert.doesNotMatch(src, /CREATE TABLE/);
  assert.doesNotMatch(src, /ALTER TABLE/);
  assert.match(src, /CREATE OR REPLACE FUNCTION public\.kitchen_promo_pass_redeem_for_order/);
});

test('gate: autorizzato se staff del venue OPPURE proprietario dell\'ordine (auth.uid() = customer_id), non più solo staff', () => {
  const fn = fnBody();
  assert.match(
    fn,
    /IF NOT \(is_staff_for_venue\(v_order\.venue_id\) OR v_order\.customer_id = auth\.uid\(\)\) THEN/
  );
  assert.match(fn, /RAISE EXCEPTION 'not_authorized_for_order'/);
  // Il vecchio gate staff-only e il suo codice errore non devono più comparire: un cliente non
  // proprietario deve poter distinguere "non è il tuo ordine" (nuovo errore) da un vecchio
  // messaggio che presupponeva sempre lo staff.
  assert.doesNotMatch(fn, /RAISE EXCEPTION 'not_staff_for_venue'/);
});

test('un cliente che NON è proprietario dell\'ordine non è coperto da nessuno dei due rami del gate', () => {
  const fn = fnBody();
  const gateLine = fn.match(/IF NOT \(.*\) THEN\s*\n\s*RAISE EXCEPTION 'not_authorized_for_order';/);
  assert.ok(gateLine, 'gate combinato staff-or-owner presente');
  // La condizione è un OR fra le due sole fonti di autorizzazione: is_staff_for_venue(...) e
  // v_order.customer_id = auth.uid(). Nessuna terza via (es. un ruolo generico "authenticated")
  // che aprirebbe l'RPC a qualunque sessione cliente indipendentemente dall'ordine.
  assert.match(gateLine[0], /is_staff_for_venue\(v_order\.venue_id\)/);
  assert.match(gateLine[0], /v_order\.customer_id = auth\.uid\(\)/);
  const orCount = (gateLine[0].match(/ OR /g) || []).length;
  assert.equal(orCount, 1, 'un solo OR: esattamente due condizioni di autorizzazione, non di più');
});

test('resto della RPC invariato: retry idempotente, blocchi su ordine già promo-ato/pagato', () => {
  const fn = fnBody();
  assert.match(fn, /IF v_order\.promo_code = v_code THEN\s*\n\s*RETURN v_order;/);
  assert.match(fn, /IF v_order\.promo_code IS NOT NULL THEN/);
  assert.match(fn, /RAISE EXCEPTION 'order_already_has_promo'/);
  assert.match(fn, /IF v_order\.payment_status = 'paid' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'order_already_paid'/);
});

test('resto della RPC invariato: pass non trovato/già redento distinti, nessun accesso a un codice di un altro venue', () => {
  const fn = fnBody();
  assert.match(fn, /RAISE EXCEPTION 'promo_code_not_found'/);
  assert.match(fn, /IF v_promo\.status = 'redeemed' THEN/);
  assert.match(fn, /RAISE EXCEPTION 'promo_already_redeemed'/);
  assert.match(fn, /IF v_promo\.venue_id <> v_order\.venue_id THEN/);
  assert.match(fn, /RAISE EXCEPTION 'promo_venue_mismatch'/);
});

test('resto della RPC invariato: allowlist Pesi Massimi, sconto -10% sul più economico, guardia atomica anti-doppio-uso', () => {
  const fn = fnBody();
  assert.match(
    fn,
    /ARRAY\['item-009', 'item-010', 'item-011', 'item-040', 'item-041', 'item-042'\]/
  );
  assert.match(fn, /ORDER BY oi\.price ASC\s*\n\s*LIMIT 1/);
  assert.match(fn, /v_discount := round\(v_unit_price \* 0\.10, 2\)/);
  assert.match(fn, /WHERE code = v_promo\.code AND status = 'issued'/);
  assert.match(fn, /IF NOT FOUND THEN\s*\n\s*RAISE EXCEPTION 'promo_already_redeemed';/);
});

test('grant: EXECUTE solo per authenticated, revocato da PUBLIC (invariato, stesso pattern)', () => {
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) FROM PUBLIC/);
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_promo_pass_redeem_for_order\(text, text\) TO authenticated/);
});

console.log('20260910130000_kitchen_promo_pass_redeem_customer_v1.test.js: tutti i test passati.');
