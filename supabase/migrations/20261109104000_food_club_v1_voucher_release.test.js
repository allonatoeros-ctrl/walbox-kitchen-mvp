// Food Club V1 Passo 3A — test statici sulla migration 20261109104000 (sigillo, intento, evidenze, rilascio sicuro del buono).
// Stile repo: assert sul testo SQL, nessun DB. Il comportamento a runtime e' in tests/db/food-club/60_release.sql,
// tests/db/food-club/p3c_release_concorrenza.sh e tests/db/food-club/p3_grants_supabase_local.sh.
// Eseguire: node --test supabase/migrations/20261109104000_food_club_v1_voucher_release.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FILE = '20261109104000_food_club_v1_voucher_release.sql';
const sqlOnly = (t) => t.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const code = sqlOnly(readFileSync(join(__dirname, FILE), 'utf8'));

const fnBody = (name) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(start > -1, `funzione ${name} non trovata`);
  const end = code.indexOf('$$;', code.indexOf('AS $$', start));
  assert.ok(end > start, `fine di ${name} non trovata`);
  return code.slice(start, end + 3);
};
const defined = [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
const RPCS = ['food_club_seal_order_for_release', 'food_club_record_checkout_intent',
  'food_club_record_checkout_evidence', 'food_club_release_voucher_after_evidence'];
const INTERNAL = ['food_club_evidence_normalize', 'food_club_release_eval_attempt', 'food_club_release_seals_guard',
  'food_club_release_append_only_guard', 'food_club_seal_guard_insert', 'food_club_seal_guard_claim'];

test('la migration esiste e definisce esattamente le funzioni attese', () => {
  assert.deepEqual([...defined].sort(), [
    'food_club_evidence_normalize', 'food_club_expected_merchant_code', 'food_club_record_checkout_evidence',
    'food_club_record_checkout_intent', 'food_club_release_append_only_guard', 'food_club_release_eval_attempt',
    'food_club_release_seals_guard', 'food_club_release_verified_rules', 'food_club_release_voucher_after_evidence',
    'food_club_retention_sweep', 'food_club_seal_guard_claim', 'food_club_seal_guard_insert', 'food_club_seal_order_for_release',
  ].sort());
});

test('nessun CREATE/ALTER/DROP di funzione o trigger kitchen_*', () => {
  assert.doesNotMatch(code, /\b(CREATE|ALTER|DROP)\s+(OR\s+REPLACE\s+)?(FUNCTION|TRIGGER)\s+(IF\s+EXISTS\s+)?(public\.)?kitchen_/i);
  for (const name of defined) assert.match(name, /^food_club_/, `${name}: prefisso non Club`);
});

test('nessuna ridefinizione delle RPC Kitchen K1-K6 e collegate', () => {
  for (const rpc of ['kitchen_payment_attempt_start', 'kitchen_payment_attempt_claim_checkout', 'kitchen_order_mark_payment_abandoned',
    'kitchen_payment_confirm', 'kitchen_payment_fail', 'kitchen_payment_record_counter', 'kitchen_order_cancel_with_payment_attempt',
    'kitchen_order_cancel', 'kitchen_order_switch_to_counter_system', 'kitchen_payment_attempt_close_unpaid',
    'kitchen_payment_refund', 'kitchen_payment_refund_confirm', 'kitchen_payment_refund_fail',
    'kitchen_payment_attempt_set_provider_ref', 'kitchen_reconciliation_resolve', 'kitchen_privacy_erase_order']) {
    assert.doesNotMatch(code, new RegExp(`FUNCTION\\s+public\\.${rpc}\\(`), rpc);
  }
  assert.doesNotMatch(code, /\bALTER\s+TABLE\s+public\.kitchen_/i, 'nessun ALTER TABLE su tabelle Kitchen');
  assert.doesNotMatch(code, /\bCREATE\s+TRIGGER\b[^;]*\bON\s+public\.kitchen_orders\b/i, 'nessun trigger su kitchen_orders');
  assert.doesNotMatch(code, /\bDELETE\s+FROM\s+public\.kitchen_|\bUPDATE\s+public\.kitchen_|\bINSERT\s+INTO\s+public\.kitchen_(?!action_log)/i,
    'nessuna scrittura su tabelle Kitchen (salvo il log staff)');
});

test('ogni funzione nuova ha REVOKE esplicito; le RPC hanno GRANT solo a service_role', () => {
  for (const name of defined) {
    const rev = [...code.matchAll(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM ([^;]+);`, 'g'))];
    assert.ok(rev.length >= 1, `${name}: manca REVOKE ALL`);
    const roles = rev.map((m) => m[1]).join(',');
    for (const r of ['PUBLIC', 'anon', 'authenticated']) assert.match(roles, new RegExp(r), `${name}: REVOKE senza ${r}`);
  }
  for (const name of [...RPCS, 'food_club_retention_sweep']) {
    assert.match(code, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`), `${name}: manca GRANT a service_role`);
  }
  for (const name of INTERNAL) {
    const rev = code.match(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM ([^;]+);`));
    assert.match(rev[1], /service_role/, `${name}: interna/trigger deve essere negata anche a service_role`);
    assert.doesNotMatch(code, new RegExp(`GRANT[^;]*public\\.${name}\\(`), `${name}: nessun GRANT`);
  }
  const grants = code.split(';').filter((s) => /\bGRANT\b/i.test(s));
  for (const g of grants) assert.doesNotMatch(g, /\b(anon|authenticated|PUBLIC)\b/, `GRANT a ruolo pubblico: ${g.trim().slice(0, 80)}`);
});

test('le RPC: SECURITY DEFINER, search_path fisso, lock_timeout 2s, statement_timeout 5s, guardia service_role', () => {
  for (const name of RPCS) {
    const body = fnBody(name);
    assert.match(body, /SECURITY DEFINER/, `${name}: SECURITY DEFINER`);
    assert.match(body, /SET search_path = public, pg_temp/, `${name}: search_path`);
    assert.match(body, /SET lock_timeout = '2s'/, `${name}: lock_timeout`);
    assert.match(body, /SET statement_timeout = '5s'/, `${name}: statement_timeout`);
    assert.match(body, /IF auth\.role\(\) IS DISTINCT FROM 'service_role' THEN\s+RAISE EXCEPTION 'service_role_only'/, `${name}: guardia interna`);
    assert.doesNotMatch(body, /IMMUTABLE|STABLE/, `${name}: deve restare VOLATILE (snapshot nuovo a ogni query)`);
  }
  for (const name of [...INTERNAL.filter((n) => n.startsWith('food_club_seal_guard')), 'food_club_release_seals_guard', 'food_club_release_append_only_guard']) {
    const body = fnBody(name);
    assert.doesNotMatch(body, /IMMUTABLE|STABLE/, `${name}: trigger VOLATILE`);
    assert.match(body, /SET search_path = public, pg_temp/, `${name}: search_path`);
  }
});

test('lock K4: righe charge ORDER BY id -> ordine -> buono -> sigillo, mai lock pagamenti dopo l\'ordine', () => {
  for (const name of ['food_club_seal_order_for_release', 'food_club_release_voucher_after_evidence']) {
    const b = fnBody(name);
    const iPay = b.indexOf('ORDER BY p.id FOR UPDATE');
    const iOrd = b.indexOf('FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE');
    const iVou = b.indexOf('FROM public.food_club_vouchers');
    assert.ok(iPay > -1 && iOrd > iPay, `${name}: pagamenti prima dell'ordine`);
    assert.ok(iVou > iOrd, `${name}: buono dopo l'ordine`);
    assert.equal((b.match(/FROM public\.kitchen_payments[^;]*FOR UPDATE/g) || []).length, 1, `${name}: un solo lock sui pagamenti, il primo`);
    assert.match(b, /v_now_ids IS DISTINCT FROM v_locked/, `${name}: ricontrollo dell'insieme dei charge`);
    assert.match(b, /'payments_changed'/);
  }
  const rel = fnBody('food_club_release_voucher_after_evidence');
  assert.ok(rel.indexOf('FROM public.food_club_vouchers WHERE id = v_seal.voucher_id FOR UPDATE') < rel.indexOf('FROM public.food_club_release_seals WHERE order_id = p_order_id FOR UPDATE'),
    'rilascio: riga sigillo dopo il buono');
  const intent = fnBody('food_club_record_checkout_intent');
  assert.match(intent, /FROM public\.kitchen_payments WHERE id = p_attempt_id FOR UPDATE/);
  assert.doesNotMatch(intent, /FROM public\.kitchen_orders[^;]*FOR UPDATE/, 'intento: ordine letto senza lock');
});

test('costanti di verifica spente e merchant atteso NULL; nessun GUC le cambia', () => {
  assert.match(fnBody('food_club_release_verified_rules'), /SELECT false, false, false/);
  assert.match(fnBody('food_club_release_verified_rules'), /IMMUTABLE/);
  assert.match(fnBody('food_club_expected_merchant_code'), /SELECT NULL::text/);
  assert.doesNotMatch(code, /current_setting\(/, 'nessun parametro/GUC');
  assert.doesNotMatch(code, /set_config\(/);
});

test('trigger Club A e B su kitchen_payments con clausola WHEN; niente trigger su kitchen_orders', () => {
  assert.match(code, /CREATE TRIGGER food_club_seal_guard_insert\s+BEFORE INSERT ON public\.kitchen_payments\s+FOR EACH ROW\s+WHEN \(NEW\.direction = 'charge'\)/);
  assert.match(code, /CREATE TRIGGER food_club_seal_guard_claim\s+BEFORE UPDATE OF checkout_claim_at ON public\.kitchen_payments\s+FOR EACH ROW\s+WHEN \(NEW\.checkout_claim_at IS DISTINCT FROM OLD\.checkout_claim_at AND NEW\.checkout_claim_at IS NOT NULL\)/);
  assert.equal((code.match(/CREATE TRIGGER/g) || []).length, 5, 'A, B + 3 guardie di immutabilita\' (sigilli, evidenze, intenti)');
});

test('tabelle nuove: RLS senza policy, REVOKE, nessuna scrittura a service_role, sequenza chiusa', () => {
  for (const t of ['food_club_release_seals', 'food_club_checkout_intents', 'food_club_checkout_evidence']) {
    assert.match(code, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`), `${t}: RLS`);
    assert.match(code, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}\\b`));
  }
  assert.doesNotMatch(code, /CREATE POLICY/i, 'nessuna policy');
  assert.match(code, /REVOKE ALL ON public\.food_club_release_seals, public\.food_club_checkout_intents, public\.food_club_checkout_evidence\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(code, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER\s+ON public\.food_club_release_seals, public\.food_club_checkout_intents, public\.food_club_checkout_evidence\s+FROM service_role;/);
  assert.match(code, /GRANT SELECT ON public\.food_club_release_seals, public\.food_club_checkout_intents, public\.food_club_checkout_evidence\s+TO service_role;/);
  assert.match(code, /REVOKE ALL ON SEQUENCE public\.food_club_checkout_evidence_id_seq FROM PUBLIC, anon, authenticated, service_role;/);
  assert.match(code, /body_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(code, /kind\s+text NOT NULL CHECK \(kind IN \('get', 'list'\)\)/);
  assert.match(code, /order_id\s+text PRIMARY KEY REFERENCES public\.kitchen_orders\(id\) ON DELETE CASCADE/);
});

test('immutabilita\': UPDATE vietato, DELETE solo a cascata (profondita\' > 1) o dopo 90 giorni se il buono non e\' piu\' riservato', () => {
  const seals = fnBody('food_club_release_seals_guard');
  assert.match(seals, /NEW\.sealed_at IS DISTINCT FROM OLD\.sealed_at/);
  assert.match(seals, /pg_trigger_depth\(\) > 1/);
  assert.match(seals, /interval '90 days'/);
  assert.match(seals, /v\.status = 'reserved' AND v\.reserved_order_id = OLD\.order_id/);
  const app = fnBody('food_club_release_append_only_guard');
  assert.match(app, /RAISE EXCEPTION 'food_club_release_append_only'/);
  assert.match(app, /pg_trigger_depth\(\) > 1/);
  assert.match(app, /v\.status = 'reserved' AND v\.reserved_order_id = OLD\.order_id/);
  assert.match(code, /CREATE TRIGGER food_club_checkout_evidence_guard\s+BEFORE UPDATE OR DELETE ON public\.food_club_checkout_evidence/);
  assert.match(code, /CREATE TRIGGER food_club_checkout_intents_guard\s+BEFORE UPDATE OR DELETE ON public\.food_club_checkout_intents/);
  assert.match(code, /CREATE TRIGGER food_club_release_seals_guard\s+BEFORE UPDATE OR DELETE ON public\.food_club_release_seals/);
});

test('sigillo: condizioni (17 min, claim 20 s, evento held) e fetched_at/sealed_at dal DB', () => {
  const b = fnBody('food_club_seal_order_for_release');
  for (const re of [/interval '17 minutes'/, /interval '20 seconds'/, /held_until_checkout_expiry/, /'cancelled', 'payment_abandoned'/,
    /payment_status IS NOT DISTINCT FROM 'paid'/, /p\.status = 'succeeded'/, /clock_timestamp\(\)/, /ON CONFLICT \(order_id\) DO NOTHING/]) assert.match(b, re, String(re));
  const ev = fnBody('food_club_record_checkout_evidence');
  assert.match(ev, /interval '60 seconds'/);
  assert.match(ev, /'evidence_too_early'/);
  assert.match(ev, /v_pay\.order_id/, 'order_id dal DB');
  assert.doesNotMatch(ev, /p_fields\s*->>?\s*'(fetched_at|order_id|attempt_id|id)'/, 'campi riservati non letti dal JSON');
  const norm = fnBody('food_club_evidence_normalize');
  assert.match(norm, /'http_status', 'checkout_id', 'checkout_reference', 'sumup_status', 'amount', 'currency',\s+'merchant_code', 'valid_until', 'list_count', 'body_sha256'/);
  assert.match(norm, /evidence_bad_field/);
  const intent = fnBody('food_club_record_checkout_intent');
  assert.match(intent, /date_trunc\('second', v_order\.created_at \+ interval '15 minutes'\)/);
  assert.match(intent, /'intent_too_late'/);
});

test('rilascio: verdetto calcolato in SQL (nessun parametro di prova), doppia GET, tetto 20/24h, evento unico', () => {
  assert.match(code, /food_club_release_voucher_after_evidence\(p_order_id text\)/, 'solo l\'ordine come parametro');
  const ev = fnBody('food_club_release_eval_attempt');
  for (const re of [/interval '120 seconds'/, /interval '60 seconds'/, /interval '2 minutes'/, /e\.checkout_reference = p_attempt\.id::text/,
    /e\.currency = 'EUR'/, /e\.merchant_code = v_merchant/, /e\.valid_until = v_intent\.valid_until/, /e\.amount = p_attempt\.amount/,
    /v_rules\.valid_until_verified/, /v_rules\.terminal_verified/, /v_rules\.list_verified/, /'never_requested'/, /upper\(e\.sumup_status\) = 'PAID'/,
    /p_attempt\.provider IN \('cash', 'manual'\)/]) assert.match(ev, re, String(re));
  const rel = fnBody('food_club_release_voucher_after_evidence');
  assert.match(rel, />= 20 THEN/, 'tetto 20');
  assert.match(rel, /interval '24 hours'/);
  assert.match(rel, /food_club_release_cap_reached/);
  assert.match(rel, /'released_after_checkout_evidence'/);
  assert.match(rel, /CASE WHEN v_voucher\.expires_at > now\(\) THEN 'available' ELSE 'expired' END/);
  assert.match(rel, /'already_used'/);
  assert.match(rel, /'already_released'/);
  assert.equal((rel.match(/food_club_log_voucher\(/g) || []).length, 1, 'un solo punto di scrittura evento');
});

test('retention: stesse tre pulizie di prima + prove 90 giorni solo se il buono non e\' piu\' riservato', () => {
  const b = fnBody('food_club_retention_sweep');
  assert.match(b, /DELETE FROM public\.food_club_merge_tickets WHERE expires_at < now\(\) - interval '1 day'/);
  assert.match(b, /DELETE FROM public\.food_club_events WHERE created_at < now\(\) - interval '400 days'/);
  assert.match(b, /DELETE FROM public\.food_club_messages WHERE created_at < now\(\) - interval '180 days'/);
  for (const t of ['food_club_checkout_evidence', 'food_club_checkout_intents', 'food_club_release_seals']) {
    assert.match(b, new RegExp(`DELETE FROM public\\.${t}`));
  }
  assert.equal((b.match(/NOT EXISTS \(SELECT 1 FROM public\.food_club_vouchers v WHERE v\.status = 'reserved' AND v\.reserved_order_id =/g) || []).length, 3);
  assert.doesNotMatch(code, /cron\.schedule/, 'nessuna pianificazione toccata');
});

test('api/: un solo sito di POST di creazione checkout SumUp (create-checkout) e checkout_claim_at mai azzerato', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const apiFiles = walk(join(ROOT, 'api')).filter((p) => /\.(js|mjs)$/.test(p) && !/\.test\.(js|mjs)$/.test(p));
  const hits = apiFiles.filter((p) => {
    const t = readFileSync(p, 'utf8');
    if (!/v0\.1\/checkouts|SUMUP_CHECKOUTS_URL/.test(t)) return false;
    return /method:\s*['"]POST['"]/.test(t);
  }).map((p) => relative(ROOT, p));
  assert.deepEqual(hits, ['api/kitchen-sumup-create-checkout.js'], `siti di POST checkout: ${hits.join(', ')}`);
  const post = (readFileSync(join(ROOT, 'api/kitchen-sumup-create-checkout.js'), 'utf8').match(/method:\s*['"]POST['"]/g) || []).length;
  assert.equal(post, 1, 'una sola POST in create-checkout');
  // checkout_claim_at: nei file SQL solo "= now()" (claim), mai NULL; nelle API mai scritto
  const mig = readdirSync(__dirname).filter((f) => f.endsWith('.sql')).map((f) => sqlOnly(readFileSync(join(__dirname, f), 'utf8'))).join('\n');
  const assigns = [...mig.matchAll(/checkout_claim_at\s*=\s*([^\s,;]+)/gi)].map((m) => m[1].toLowerCase());
  assert.ok(assigns.length >= 2, 'le due definizioni della claim');
  assert.deepEqual([...new Set(assigns)], ['now()'], `checkout_claim_at assegnato a valori diversi da now(): ${assigns}`);
  for (const p of apiFiles) {
    const t = readFileSync(p, 'utf8');
    assert.doesNotMatch(t, /checkout_claim_at\s*:\s*(null|undefined)/, `${relative(ROOT, p)}: azzera la claim`);
    assert.doesNotMatch(t, /\.update\(\s*\{[^}]*checkout_claim_at/, `${relative(ROOT, p)}: scrive la claim`);
  }
});
