// 20261108150000_kitchen_reconciliation_resolve_manager_v1.test.js — K6 (2026-11-08).
// Stile repo: assert statiche sul testo SQL, nessuna connessione DB (migration NON applicata).
// Il comportamento a runtime (ruoli reali, RLS, concorrenza) e' provato su Postgres locale da
// tests/db/kitchen-payments/p8_k6_chiusura_manager.sql e p8b_k6_concorrenza.sh.
// Eseguire: node --test supabase/migrations/20261108150000_kitchen_reconciliation_resolve_manager_v1.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261108150000_kitchen_reconciliation_resolve_manager_v1.sql'), 'utf8');

const sqlOnly = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const squash = (t) => t.replace(/\s+/g, ' ').trim();
const code = squash(sqlOnly(src));
const FN = 'public.kitchen_reconciliation_resolve(';
const fnStart = code.indexOf(`CREATE FUNCTION ${FN}`);
const body = code.slice(fnStart, code.indexOf('$function$;', code.indexOf('AS $function$', fnStart)));

test('header: migration dichiarata locale e non applicata', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
});

test('policy log: drop + create con staff, proprio uid e locale; nessun altro cambio al log', () => {
  assert.ok(code.includes('DROP POLICY IF EXISTS staff_insert_venue_action_log ON public.kitchen_action_log;'));
  assert.ok(code.includes(squash(`CREATE POLICY staff_insert_venue_action_log ON public.kitchen_action_log
    FOR INSERT TO authenticated
    WITH CHECK ( is_staff_for_venue(venue_id) AND actor_type = 'staff' AND actor_id = auth.uid() );`)));
  const logStatements = code.split(';').filter((s) => /\bON public\.kitchen_action_log\b|ALTER TABLE public\.kitchen_action_log\b/.test(s));
  assert.equal(logStatements.length, 2, 'solo DROP + CREATE della policy toccano kitchen_action_log');
  assert.doesNotMatch(code, /ALTER TABLE public\.kitchen_action_log/);
  assert.doesNotMatch(code, /staff_select_venue_action_log/);
});

test('tabella: append-only, label nullable, vincoli', () => {
  assert.match(code, /CREATE TABLE public\.kitchen_reconciliation_resolutions \(/);
  assert.match(code, /resolved_by_label text,/, 'resolved_by_label nullable');
  assert.doesNotMatch(code, /resolved_by_label text NOT NULL/);
  assert.match(code, /source_log_id uuid NOT NULL REFERENCES public\.kitchen_action_log\(id\) ON DELETE RESTRICT/);
  assert.match(code, /CONSTRAINT kitchen_reconciliation_resolutions_source_unique UNIQUE \(source_log_id\)/);
  assert.match(code, /outcome = ANY \(ARRAY\['refunded_on_sumup','verified_not_charged','refunded_in_walbox','seen'\]\)/);
  assert.match(code, /char_length\(btrim\(note\)\) BETWEEN 1 AND 140/);
  assert.match(code, /refund_ref_tail ~ '\^\[A-Za-z0-9\]\{1,6\}\$'/);
  assert.match(code, /ALTER TABLE public\.kitchen_reconciliation_resolutions ENABLE ROW LEVEL SECURITY;/);
  assert.match(code, /CREATE POLICY staff_select_venue_reconciliation_resolutions ON public\.kitchen_reconciliation_resolutions FOR SELECT TO authenticated USING \(is_staff_for_venue\(venue_id\)\);/);
  assert.equal((code.match(/CREATE POLICY \w+ ON public\.kitchen_reconciliation_resolutions/g) ?? []).length, 1, 'nessuna policy di scrittura');
  assert.ok(code.includes('REVOKE ALL ON public.kitchen_reconciliation_resolutions FROM PUBLIC, anon, authenticated, service_role;'));
  assert.ok(code.includes('GRANT SELECT ON public.kitchen_reconciliation_resolutions TO authenticated, service_role;'));
  assert.doesNotMatch(code, /GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*kitchen_reconciliation_resolutions/);
});

test('trigger: UPDATE/DELETE per riga e TRUNCATE per statement sollevano errore', () => {
  assert.match(code, /RAISE EXCEPTION 'reconciliation_resolutions_append_only'/);
  assert.match(code, /BEFORE UPDATE OR DELETE ON public\.kitchen_reconciliation_resolutions FOR EACH ROW EXECUTE FUNCTION public\.kitchen_reconciliation_resolutions_block_change\(\)/);
  assert.match(code, /BEFORE TRUNCATE ON public\.kitchen_reconciliation_resolutions FOR EACH STATEMENT EXECUTE FUNCTION public\.kitchen_reconciliation_resolutions_block_change\(\)/);
});

test('istante di fiducia: costante fissata con now() della migration, non eseguibile dai ruoli API', () => {
  assert.match(code, /CREATE FUNCTION public\.kitchen_reconciliation_trusted_since\(\) RETURNS timestamptz LANGUAGE sql IMMUTABLE/);
  assert.match(code, /AS \$body\$ SELECT %L::timestamptz \$body\$ \$f\$, now\(\)\);/);
  assert.ok(code.includes('REVOKE ALL ON FUNCTION public.kitchen_reconciliation_trusted_since() FROM PUBLIC, anon, authenticated;'));
});

test('RPC: SECURITY DEFINER, search_path, controlli in ordine', () => {
  assert.ok(fnStart > -1);
  assert.match(body, /SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
  const order = [
    "IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'",
    "pg_advisory_xact_lock(hashtext('kitchen_reconciliation_resolve'), hashtext(p_source_log_id::text))",
    "RAISE EXCEPTION 'source_log_not_found'",
    "role = 'manager'",
    "RAISE EXCEPTION 'not_manager_for_venue'",
    'v_log.created_at < public.kitchen_reconciliation_trusted_since()',
    "RAISE EXCEPTION 'legacy_item_not_verifiable'",
    "v_log.actor_type <> 'system'",
    "RAISE EXCEPTION 'not_a_reconciliation_item'",
    "RAISE EXCEPTION 'invalid_outcome'",
    "RAISE EXCEPTION 'invalid_note'",
    "RAISE EXCEPTION 'invalid_refund_ref'",
    "RAISE EXCEPTION 'already_resolved'",
    "RAISE EXCEPTION 'no_walbox_refund_found'",
    'INSERT INTO public.kitchen_reconciliation_resolutions',
  ];
  let pos = -1;
  for (const s of order) {
    const i = body.indexOf(s, pos + 1);
    assert.ok(i > pos, `atteso in ordine: ${s}`);
    pos = i;
  }
  assert.match(body, /WHERE user_id = v_uid AND venue_id = v_log\.venue_id AND role = 'manager'/);
});

test('RPC: idempotenza solo con stesso esito e stesso autore', () => {
  assert.ok(body.includes(squash(`IF FOUND THEN
    IF v_existing.outcome = p_outcome AND v_existing.resolved_by = v_uid THEN RETURN v_existing; END IF;
    RAISE EXCEPTION 'already_resolved'; END IF;`)));
});

test('RPC: refunded_in_walbox richiede rimborso succeeded stesso ordine, stesso locale, dopo la segnalazione', () => {
  assert.ok(body.includes(squash(`WHERE order_id = v_log.order_id
      AND venue_id = v_log.venue_id
      AND direction = 'refund'
      AND status = 'succeeded'
      AND created_at >= v_log.created_at`)));
});

test('RPC: nome solo da raw_app_meta_data.display_name, mai email o user_metadata', () => {
  assert.match(body, /raw_app_meta_data->>'display_name'/);
  assert.doesNotMatch(body, /email/);
  assert.doesNotMatch(body, /raw_user_meta_data/);
  assert.doesNotMatch(body, /split_part/);
});

test('RPC: grant solo ad authenticated, revocata a PUBLIC e anon', () => {
  assert.ok(code.includes('REVOKE ALL ON FUNCTION public.kitchen_reconciliation_resolve(uuid, text, text, text) FROM PUBLIC, anon;'));
  assert.ok(code.includes('GRANT EXECUTE ON FUNCTION public.kitchen_reconciliation_resolve(uuid, text, text, text) TO authenticated;'));
  assert.doesNotMatch(code, /GRANT EXECUTE ON FUNCTION public\.kitchen_reconciliation_resolve[^;]*anon/);
});

test('perimetro: nessuna modifica a pagamenti, ordini o funzioni di pagamento', () => {
  assert.doesNotMatch(code, /(ALTER|UPDATE|DELETE FROM|INSERT INTO) public\.kitchen_(payments|orders)\b/);
  assert.doesNotMatch(code, /FUNCTION public\.kitchen_payment_/);
  assert.doesNotMatch(code, /CREATE OR REPLACE/);
});
