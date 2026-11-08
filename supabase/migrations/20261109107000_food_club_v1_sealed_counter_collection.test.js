// Food Club V1 FIX D1 — test statici sulla migration 20261109107000 (incasso al banco su ordine sigillato con buono ancora
// riservato). Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in
// tests/db/food-club/90_d1_banco.sql (scenari D1-01..D1-12, D1-S1..S6) e tests/db/food-club/p90_d1_concorrenza.sh.
// Eseguire: node --test supabase/migrations/20261109107000_food_club_v1_sealed_counter_collection.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = '20261109107000_food_club_v1_sealed_counter_collection.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));
const body = (() => {
  const start = code.indexOf('CREATE OR REPLACE FUNCTION public.food_club_seal_guard_insert(');
  assert.ok(start > -1, 'funzione food_club_seal_guard_insert non trovata');
  const end = code.indexOf('$$;', code.indexOf('AS $$', start));
  return code.slice(start, end + 3);
})();

test('ridefinisce SOLO la funzione trigger Club del sigillo: nessuna kitchen_*, nessun trigger/tabella/cron', () => {
  const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(defined, ['food_club_seal_guard_insert']);
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  assert.doesNotMatch(code, /\bCREATE\s+(TABLE|TRIGGER)\b|DROP\s+TRIGGER|cron\.|ALTER\s+TABLE|\bDELETE\b|\bUPDATE\s+public\./i);
});

test('SECURITY DEFINER con search_path fisso, eseguibile da nessun ruolo di API', () => {
  assert.match(body, /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  assert.match(code, /REVOKE ALL ON FUNCTION public\.food_club_seal_guard_insert\(\) FROM PUBLIC, anon, authenticated, service_role;/);
  assert.doesNotMatch(code, /GRANT\s/i);
});

test('ordine non sigillato: passa senza altre letture', () => {
  assert.match(body, /SELECT \* INTO v_seal FROM public\.food_club_release_seals s WHERE s\.order_id = NEW\.order_id;\s+IF NOT FOUND THEN\s+RETURN NEW;/);
});

test('eccezione SOLO per l incasso riuscito al banco (counter, cash/manual, succeeded)', () => {
  assert.match(body, /NEW\.channel = 'counter'/);
  assert.match(body, /NEW\.provider IN \('cash', 'manual'\)/);
  assert.match(body, /NEW\.method IN \('cash', 'card_counter_manual'\)/);
  assert.match(body, /NEW\.status = 'succeeded'/);
  assert.doesNotMatch(body, /'sumup'|'sumup_online'|'app'/i, 'nessuna eccezione per charge SumUp');
});

test('il buono del sigillo deve essere ancora riservato su QUESTO ordine, con lock della riga buono', () => {
  assert.match(body, /v\.id = v_seal\.voucher_id\s+AND v\.status = 'reserved'\s+AND v\.reserved_order_id = NEW\.order_id\s+FOR UPDATE;/);
});

test('prova SumUp PAID registrata -> errore dedicato, mai un secondo incasso', () => {
  assert.match(body, /food_club_checkout_evidence e\s+WHERE e\.order_id = NEW\.order_id AND upper\(e\.sumup_status\) = 'PAID'/);
  assert.match(body, /RAISE EXCEPTION 'food_club_order_paid_evidence'/);
});

test('ogni altro charge su ordine sigillato resta rifiutato con food_club_order_sealed', () => {
  const raises = [...body.matchAll(/RAISE EXCEPTION '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(raises, ['food_club_order_paid_evidence', 'food_club_order_sealed']);
  assert.match(body, /END IF;\s+RAISE EXCEPTION 'food_club_order_sealed';\s+END;\s+\$\$;$/);
});
