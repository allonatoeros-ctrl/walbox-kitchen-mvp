import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Il contratto no-tables e' applicato sul remoto da DUE migration distinte:
//   sezione 1 (table_id nullable, order-code, counter) -> 20260905072954
//   sezioni 2-3 (RPC, policy drop, CHECK payment_method) -> 20260906171426
// Il draft unico che le conteneva entrambe (20260901120000) e' superato ed e' conservato,
// non cancellato, in `ai-ops/archive/migrations/`. Qui si asserisce sui file realmente applicati.
const src = [
  '20260905072954_kitchen_order_code_infra_table_id_nullable_v1.sql',
  '20260906171426_kitchen_pilot_order_contract_rpc_v1.sql',
].map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');

function fnBody(name) {
  const start = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  return src.slice(start, src.indexOf('$function$;', start));
}

test('no-tables: table_id diventa opzionale e nessuna colonna/parametro fulfillment_type viene introdotto', () => {
  assert.match(src, /ALTER COLUMN table_id DROP NOT NULL/);
  assert.doesNotMatch(src, /ADD COLUMN IF NOT EXISTS fulfillment_type/);
  assert.doesNotMatch(src, /p_fulfillment_type/);
  assert.doesNotMatch(src, /p_table_id/);
});

test('codice: contatore unico per venue + giorno Rome e formato A01…A99, B01', () => {
  assert.match(src, /PRIMARY KEY \(venue_id, service_day\)/);
  assert.match(src, /timezone\('Europe\/Rome', now\(\)\)::date/);
  const fn = fnBody('kitchen_format_operational_code');
  assert.match(fn, /\(\(p_sequence - 1\) \/ 99\)/);
  assert.match(fn, /% 99/);
});

test('customer order: totale e codice sono derivati nel DB, non ricevuti dal client, table_id sempre NULL', () => {
  const fn = fnBody('kitchen_customer_create_order');
  assert.match(fn, /jsonb_to_recordset\(p_items\)/);
  assert.match(fn, /INSERT INTO public\.kitchen_service_order_counters/);
  assert.doesNotMatch(fn, /p_total|p_order_code|p_amount|p_fulfillment_type|p_table_id/);
  const insertBlock = fn.slice(fn.indexOf('INSERT INTO public.kitchen_orders'));
  assert.match(insertBlock, /id, order_code, venue_id, table_id, nickname, customer_id/);
});

test('counter payment: accetta solo cash/card manuale e usa v_order.total sotto lock', () => {
  const fn = fnBody('kitchen_payment_record_counter');
  assert.match(fn, /p_method NOT IN \('cash', 'card_counter_manual'\)/);
  assert.match(fn, /WHERE id = p_order_id FOR UPDATE/);
  assert.match(fn, /'succeeded', v_order\.total/);
  assert.doesNotMatch(fn, /p_amount/);
});

test('compatibilità cash: eventuale amount legacy è ignorato e delega al nuovo RPC', () => {
  const fn = fnBody('kitchen_payment_record_cash');
  assert.match(fn, /RETURN public\.kitchen_payment_record_counter\(p_order_id, 'cash'\)/);
  assert.doesNotMatch(fn, /p_amount[^\n]*v_order|amount_mismatch/);
});

console.log('20260906171426_kitchen_pilot_order_contract_rpc_v1.test.js: tutti i test passati.');
