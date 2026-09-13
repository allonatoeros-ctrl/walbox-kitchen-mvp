// 20260913130000_kitchen_checkout_fulfillment_v1.test.js — Customer Checkout V1 fulfillment
// (MANGIO QUI / PORTO VIA), kitchen_customer_create_order overload a 5 argomenti.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale (stesso pattern di
// 20260913120000_kitchen_payment_counter_online_exclusivity_v1.test.js).
// Eseguire a mano: node --test supabase/migrations/20260913130000_kitchen_checkout_fulfillment_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260913130000_kitchen_checkout_fulfillment_v1.sql'), 'utf8');
const legacySrc = readFileSync(
  join(__dirname, '20260912110000_kitchen_customer_create_order_catalog_authority_v1.sql'),
  'utf8',
);

function fnBody(source, signatureSnippet) {
  const start = source.indexOf(signatureSnippet);
  assert.ok(start > -1, `firma "${signatureSnippet}" non trovata nel sorgente`);
  const end = source.indexOf('$function$;', start);
  return source.slice(start, end);
}

// ---- colonna fulfillment_type ------------------------------------------------------------------

test('colonna fulfillment_type: aggiunta nullable, nessun DEFAULT applicativo', () => {
  assert.match(src, /ADD COLUMN IF NOT EXISTS fulfillment_type text;/);
  assert.doesNotMatch(src, /fulfillment_type text DEFAULT/);
});

test('CHECK constraint: solo eat_here/takeaway o NULL, nessun altro valore ammesso', () => {
  const checkIdx = src.indexOf('kitchen_orders_fulfillment_type_check CHECK');
  assert.ok(checkIdx > -1, 'constraint kitchen_orders_fulfillment_type_check non trovato');
  const checkEnd = src.indexOf(');', checkIdx);
  const check = src.slice(checkIdx, checkEnd);
  assert.match(check, /fulfillment_type IS NULL OR fulfillment_type = ANY \(ARRAY\['eat_here'::text, 'takeaway'::text\]\)/);
});

test('nessun table_id/numero tavolo reintrodotto in questa migration', () => {
  assert.doesNotMatch(src, /ADD COLUMN[^;]*table/i);
  // table_id resta esplicitamente NULL nell'INSERT della nuova firma
  const fn = fnBody(src, 'CREATE FUNCTION public.kitchen_customer_create_order');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_orders');
  const valuesIdx = fn.indexOf('VALUES', insertIdx);
  const valuesEnd = fn.indexOf('RETURNING', valuesIdx);
  const values = fn.slice(valuesIdx, valuesEnd);
  const lines = values.split('\n').map((l) => l.trim()).filter(Boolean);
  // ordine colonne INSERT: id, order_code, venue_id, table_id, ... -> valori posizionali
  const tableIdLine = lines.find((l, i) => i > 0 && lines[i - 1] === 'p_venue_id,');
  assert.equal(tableIdLine, 'NULL,', 'table_id deve restare NULL nella nuova firma (riga dopo p_venue_id)');
});

// ---- overload a 5 argomenti, SENZA DEFAULT -----------------------------------------------------

test('nuova firma: 5 argomenti, p_fulfillment_type SENZA DEFAULT', () => {
  const sigIdx = src.indexOf('CREATE FUNCTION public.kitchen_customer_create_order(');
  assert.ok(sigIdx > -1, 'CREATE FUNCTION a 5 argomenti non trovata (deve essere CREATE, non OR REPLACE, per non toccare la firma legacy)');
  const sigEnd = src.indexOf(')\nRETURNS', sigIdx);
  const sig = src.slice(sigIdx, sigEnd);
  assert.match(sig, /p_fulfillment_type text\s*$/, 'p_fulfillment_type deve essere l\'ultimo parametro, senza DEFAULT');
  assert.doesNotMatch(sig, /p_fulfillment_type text DEFAULT/);
});

test('questa migration usa CREATE FUNCTION (non CREATE OR REPLACE): non puo\' sovrascrivere la firma legacy a 4 argomenti', () => {
  assert.doesNotMatch(src, /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order/);
});

test('validazione fulfillment_type: valori non ammessi sollevano invalid_fulfillment_type', () => {
  const fn = fnBody(src, 'CREATE FUNCTION public.kitchen_customer_create_order');
  assert.match(fn, /IF p_fulfillment_type IS NOT NULL AND p_fulfillment_type NOT IN \('eat_here', 'takeaway'\) THEN/);
  assert.match(fn, /RAISE EXCEPTION 'invalid_fulfillment_type';/);
});

test('fulfillment_type e\' scritto nell\'INSERT su kitchen_orders della nuova firma', () => {
  const fn = fnBody(src, 'CREATE FUNCTION public.kitchen_customer_create_order');
  const insertIdx = fn.indexOf('INSERT INTO public.kitchen_orders');
  const insertEnd = fn.indexOf(')', fn.indexOf('service_sequence', insertIdx));
  const insertCols = fn.slice(insertIdx, insertEnd);
  assert.match(insertCols, /fulfillment_type/);
  const valuesIdx = fn.indexOf('VALUES', insertIdx);
  const valuesEnd = fn.indexOf('RETURNING', valuesIdx);
  const values = fn.slice(valuesIdx, valuesEnd);
  assert.match(values, /p_fulfillment_type/);
});

test('grant esplicito sulla nuova firma a 5 argomenti (grant non ereditati tra overload)', () => {
  assert.match(src, /GRANT EXECUTE ON FUNCTION public\.kitchen_customer_create_order\(text, text, text, jsonb, text\) TO authenticated;/);
  assert.match(src, /REVOKE ALL ON FUNCTION public\.kitchen_customer_create_order\(text, text, text, jsonb, text\) FROM PUBLIC;/);
});

// ---- non-ambiguità / backward compatibility con la firma legacy a 4 argomenti -------------------

test('firma legacy a 4 argomenti (20260912110000) resta invariata: nessun DEFAULT, nessun tocco in questa migration', () => {
  assert.doesNotMatch(src, /kitchen_customer_create_order\(text, text, text, jsonb\)/);
  assert.match(legacySrc, /CREATE OR REPLACE FUNCTION public\.kitchen_customer_create_order\(\s*p_venue_id text,\s*p_nickname text,\s*p_customer_note text,\s*p_items jsonb\s*\)/);
});

test('nessuna ambiguità di overload resolution: le due firme hanno arity diversa (4 vs 5) e nessun DEFAULT le fa sovrapporre', () => {
  // Se p_fulfillment_type avesse un DEFAULT, una chiamata a 4 argomenti sarebbe candidata sia alla
  // firma legacy sia a questa (default-filled) -> Postgres rifiuta con "function ... is not unique".
  // Qui verifichiamo staticamente che non esista alcun DEFAULT sul 5° parametro nella nuova firma,
  // quindi la nuova firma richiede sempre e solo 5 argomenti espliciti: zero overlap di arity.
  const sigIdx = src.indexOf('CREATE FUNCTION public.kitchen_customer_create_order(');
  const sigEnd = src.indexOf(')\nRETURNS', sigIdx);
  const sig = src.slice(sigIdx, sigEnd);
  const paramCount = sig.split('\n').filter((l) => /^\s*p_\w+ \w+/.test(l)).length;
  assert.equal(paramCount, 5, 'la nuova firma deve dichiarare esattamente 5 parametri');
  assert.doesNotMatch(sig, /DEFAULT/);
});
