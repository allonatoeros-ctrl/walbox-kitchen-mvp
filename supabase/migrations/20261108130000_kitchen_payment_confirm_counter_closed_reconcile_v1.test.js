// 20261108130000_kitchen_payment_confirm_counter_closed_reconcile_v1.test.js — K2 SQL (2026-11-08).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime e' provato su Postgres locale da tests/db/kitchen-payments/ (P1c, P6a, P6b, P6c, P7c).
// Eseguire: node --test supabase/migrations/20261108130000_kitchen_payment_confirm_counter_closed_reconcile_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(__dirname, f), 'utf8');
const src = read('20261108130000_kitchen_payment_confirm_counter_closed_reconcile_v1.sql');
const prev = read('20261012100000_kitchen_online_payment_lifecycle_rpc_v1.sql');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const fnBody = (text, name) => {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = text.indexOf('$function$;', start);
  assert.ok(end > start, `fine di ${name} non trovata`);
  return squash(text.slice(start, end));
};
// Toglie anche i commenti in coda alla riga (es. "-- K2: ...") per confrontare solo il codice.
const stripInline = (t) => t.split('\n').map((l) => l.replace(/\s--\s.*$/, '')).join('\n');

const code = sqlOnly(src);
const body = fnBody(stripInline(code), 'kitchen_payment_confirm');
const prevBody = fnBody(stripInline(sqlOnly(prev)), 'kitchen_payment_confirm');

const K2_DECL = squash(`v_attempt public.kitchen_payments;
  v_losing_ref text;
  v_winning_ref text;
  v_losing_evidence text;
  v_winning_evidence text;
  v_classification text;`);
const K2_GUARD = squash(`AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup'
              AND v_payment.failure_reason IN ('customer_switched_to_counter', 'staff_closed_for_counter'))
     AND NOT (v_payment.status = 'cancelled' AND v_payment.provider = 'sumup')`);

test('header: migration dichiarata locale e non applicata', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
});

test('ridefinisce solo kitchen_payment_confirm, nessun DDL su tabelle/policy/indici', () => {
  const fns = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(fns, ['kitchen_payment_confirm']);
  assert.doesNotMatch(code, /\b(ALTER|DROP|CREATE)\s+(TABLE|POLICY|INDEX|TRIGGER)\b/i);
});

test('stati confermabili: aggiunti solo i due motivi "banco" e cancelled, sempre provider sumup', () => {
  assert.ok(body.includes(K2_GUARD), 'guardia K2 mancante');
  // i rami gia' esistenti restano
  assert.ok(body.includes("v_payment.status NOT IN ('initiated', 'pending')"));
  assert.ok(body.includes("v_payment.failure_reason = 'sumup_failed'"));
  assert.ok(body.includes("v_payment.failure_reason = 'abandoned_timeout'"));
  // gli stati terminali veri restano rifiutati: nessuna eccezione per expired/cancelled/mismatch SumUp
  assert.doesNotMatch(body, /sumup_expired|sumup_cancelled|sumup_amount_mismatch/);
  assert.ok(body.indexOf(K2_GUARD) < body.indexOf("RAISE EXCEPTION 'invalid_attempt_status'"));
});

test('lost_race: flag double_charge + needs_manual_reconciliation e riferimenti dei due incassi', () => {
  const lr = body.slice(body.indexOf('EXCEPTION WHEN unique_violation'), body.indexOf('RETURN v_payment; END;'));
  for (const k of ['losing_attempt_id', 'winning_payment_id', 'winning_channel', 'winning_method',
    'winning_provider', 'winning_amount', 'losing_provider', 'losing_provider_ref', 'losing_amount',
    'losing_status_before', 'losing_failure_reason_before']) {
    assert.ok(lr.includes(`'${k}'`), `manca ${k}`);
  }
  // Passo 3B: double_charge non e' piu' una costante, deriva dalla classificazione
  assert.doesNotMatch(lr, /'double_charge', true/);
  assert.ok(lr.includes("'double_charge', v_classification = 'double_charge'"));
  assert.ok(lr.includes("'needs_manual_reconciliation', true"));
  // nessun payload grezzo nel log (puo' contenere dati della carta)
  assert.doesNotMatch(lr, /p_raw_payload|raw_last_event/);
});

test('lost_race: vincente obbligatorio e segnalazione idempotente per attempt', () => {
  const lr = body.slice(body.indexOf('EXCEPTION WHEN unique_violation'), body.indexOf('RETURN v_payment; END;'));
  assert.ok(lr.includes("IF NOT FOUND THEN RAISE EXCEPTION 'payment_confirm_winner_not_found'; END IF;"));
  assert.ok(lr.indexOf("RAISE EXCEPTION 'payment_confirm_winner_not_found'") < lr.indexOf('INSERT INTO public.kitchen_action_log'));
  assert.ok(lr.includes("metadata->>'losing_attempt_id' = p_attempt_id::text"));
  assert.ok(lr.includes('IF NOT EXISTS'));
});

test('lost_race (Passo 3B): classificazione esplicita con prova di entrambi gli incassi', () => {
  const lr = body.slice(body.indexOf('EXCEPTION WHEN unique_violation'), body.indexOf('RETURN v_payment; END;'));
  for (const k of ['losing_evidence', 'winning_evidence', 'classification']) assert.ok(lr.includes(`'${k}'`), `manca ${k}`);
  // perdente verificato solo con id checkout SumUp reale, mai con il fallback = id attempt
  assert.ok(lr.includes("v_attempt.provider = 'sumup' AND v_losing_ref IS NOT NULL AND v_losing_ref <> p_attempt_id::text"));
  assert.ok(lr.includes("v_payment.provider = 'sumup' AND v_winning_ref IS NOT NULL AND v_winning_ref <> v_payment.id::text"));
  // banco = staff_recorded solo contanti / POS manuale (niente omaggi o manual_other)
  assert.ok(lr.includes("v_payment.channel = 'counter' AND v_payment.provider IN ('cash', 'manual') AND v_payment.method IN ('cash', 'card_counter_manual') THEN 'staff_recorded'"));
  assert.doesNotMatch(lr, /manual_comp|manual_other/);
  // stesso provider_ref = notifica duplicata, valutata prima del double_charge
  assert.ok(lr.indexOf("'duplicate_notification'") < lr.indexOf("THEN 'double_charge'"));
  assert.ok(lr.includes("ELSE 'unverified_collection' END"));
  // la classificazione e' calcolata prima dell'INSERT del log
  assert.ok(lr.indexOf('v_classification := CASE') < lr.indexOf('INSERT INTO public.kitchen_action_log'));
});

test('resto del corpo identico a 20261012100000 (rami POP/PCP/PA/annullato/importo)', () => {
  const fromOrderLock = (b) => b.slice(b.indexOf('SELECT status, total INTO v_order_status, v_order_total'));
  assert.equal(fromOrderLock(body), fromOrderLock(prevBody));
  const head = (b) => b.slice(0, b.indexOf('IF v_payment.status NOT IN'));
  assert.equal(head(body).replace(K2_DECL + ' ', ''), head(prevBody));
});

test('grant invariati (solo service_role) e SECURITY DEFINER con search_path', () => {
  const g = squash(code);
  assert.match(g, /REVOKE EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\) FROM PUBLIC;/);
  assert.match(g, /REVOKE EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\) FROM anon;/);
  assert.match(g, /REVOKE EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\) FROM authenticated;/);
  assert.match(g, /GRANT EXECUTE ON FUNCTION public\.kitchen_payment_confirm\(uuid, text, jsonb\) TO service_role;/);
  assert.match(body, /SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
  assert.ok(body.includes("IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role_only';"));
});
