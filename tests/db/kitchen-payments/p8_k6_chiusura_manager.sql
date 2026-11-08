-- P8 K6 (2026-11-08): policy stretta del log + chiusura "Da riconciliare" solo manager.
-- Migration: supabase/migrations/20261108150000_kitchen_reconciliation_resolve_manager_v1.sql
-- Ruoli REALI: le prove girano con SET ROLE authenticated / anon / service_role (RLS + GRANT applicati),
-- il claim JWT (auth.uid()/auth.role()) e' impostato da fc_test.as_user / fc_test.as_service come negli altri scenari.
-- Il setup (utenti, membri staff, righe forgiate) gira come superuser postgres. Tutto in BEGIN ... ROLLBACK.
-- Uso: { echo BEGIN; cat p8_k6_chiusura_manager.sql; echo ROLLBACK; } | psql -qX -v ON_ERROR_STOP=1 -d <db_migrato>
--      (dopo 00_fc_test_base.sql e 00_kp_helpers.sql)
\set ON_ERROR_STOP 1

-- ---------- helper locali (schema k6_test, sparisce col ROLLBACK) ----------
CREATE SCHEMA k6_test;
CREATE FUNCTION k6_test.id(p_name text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT current_setting('k6.' || p_name)::uuid $$;
CREATE FUNCTION k6_test.txt(p_name text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('k6.' || p_name) $$;
-- Esito di una chiamata: 'OK' o il codice d'errore (SQLERRM).
CREATE FUNCTION k6_test.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;
CREATE FUNCTION k6_test.resolve(p_log uuid, p_outcome text, p_note text DEFAULT 'verificato', p_ref text DEFAULT NULL)
RETURNS text LANGUAGE sql AS $$
  SELECT k6_test.try(format('SELECT public.kitchen_reconciliation_resolve(%L::uuid, %L, %L, %L)', p_log, p_outcome, p_note, p_ref)) $$;
CREATE FUNCTION k6_test.log_rows() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM public.kitchen_action_log $$;
GRANT USAGE ON SCHEMA k6_test TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA k6_test TO anon, authenticated, service_role;
-- conteggi "veri" (superuser, fuori RLS) per le verifiche
CREATE FUNCTION k6_test.res_count(p_log uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM public.kitchen_reconciliation_resolutions WHERE source_log_id = p_log $$;
CREATE FUNCTION k6_test.log_count_true(p_order text) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
  SELECT count(*) FROM public.kitchen_action_log WHERE order_id = p_order $$;
GRANT EXECUTE ON FUNCTION k6_test.res_count(uuid), k6_test.log_count_true(text) TO anon, authenticated, service_role;
-- gli helper kp_test (00_kp_helpers.sql) non sono concessi ai ruoli API: li concedo qui (solo test, ROLLBACK)
GRANT USAGE ON SCHEMA kp_test TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA kp_test TO authenticated, service_role;
GRANT USAGE ON SCHEMA fc_test TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fc_test TO service_role;

-- ---------- setup (superuser) ----------
SELECT fc_test.new_staff() AS s1 \gset
SELECT fc_test.new_staff() AS m1 \gset
SELECT fc_test.new_staff() AS m2 \gset
UPDATE public.kitchen_staff_members SET role = 'manager' WHERE user_id IN (:'m1', :'m2');
-- m1 ha un nome impostato lato server (app_metadata); m2 no ma ha un nome in user_metadata (modificabile dall'utente)
UPDATE auth.users SET email = 'marco.rossi@example.test', raw_app_meta_data = '{"display_name":"Marco"}' WHERE id = :'m1';
UPDATE auth.users SET email = 'giulia.bianchi@example.test', raw_user_meta_data = '{"display_name":"Giulia finta"}' WHERE id = :'m2';
SELECT fc_test.new_user(false) AS mx \gset
INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) VALUES (:'mx', 'altro-locale', 'manager');
SELECT fc_test.new_user(false) AS sx \gset
INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) VALUES (:'sx', 'altro-locale', 'staff');
SELECT fc_test.new_user(false) AS nostaff \gset
SELECT set_config('k6.s1', :'s1', false), set_config('k6.m1', :'m1', false), set_config('k6.m2', :'m2', false),
       set_config('k6.mx', :'mx', false), set_config('k6.sx', :'sx', false), set_config('k6.nostaff', :'nostaff', false) \gset

-- Segnalazione vera A: pagato dopo annullo (RPC di sistema) + segnalazione vera B: stessa cosa su un altro ordine.
SELECT fc_test.new_user() AS cu \gset
SELECT id AS oa FROM kp_test.new_order(:'cu', 'online') \gset
SELECT id AS aa FROM fc_test.start_online(:'oa') \gset
SELECT 1 FROM fc_test.cancel(:'oa', :'s1');
SELECT 1 FROM kp_test.confirm(:'aa');
SELECT id AS la FROM public.kitchen_action_log WHERE order_id = :'oa' AND action = 'payment_confirmed_after_cancel' \gset
SELECT id AS ob FROM kp_test.new_order(:'cu', 'online') \gset
SELECT id AS ab FROM fc_test.start_online(:'ob') \gset
SELECT 1 FROM fc_test.cancel(:'ob', :'s1');
SELECT 1 FROM kp_test.confirm(:'ab');
SELECT id AS lb FROM public.kitchen_action_log WHERE order_id = :'ob' AND action = 'payment_confirmed_after_cancel' \gset
SELECT id AS oc FROM kp_test.new_order(:'cu', 'online') \gset
SELECT id AS ac FROM fc_test.start_online(:'oc') \gset
SELECT 1 FROM fc_test.cancel(:'oc', :'s1');
SELECT 1 FROM kp_test.confirm(:'ac');
SELECT id AS lc FROM public.kitchen_action_log WHERE order_id = :'oc' AND action = 'payment_confirmed_after_cancel' \gset
SELECT id AS od FROM kp_test.new_order(:'cu', 'online') \gset
SELECT id AS ad FROM fc_test.start_online(:'od') \gset
SELECT 1 FROM fc_test.cancel(:'od', :'s1');
SELECT 1 FROM kp_test.confirm(:'ad');
SELECT id AS ld FROM public.kitchen_action_log WHERE order_id = :'od' AND action = 'payment_confirmed_after_cancel' \gset
-- Segnalazione "storica" forgiata: actor system, flag, created_at prima della migration (come sarebbe stata
-- falsificabile con la policy vecchia).
INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata, created_at)
VALUES (:'oa', 'walrus-main', 'payment_confirm_lost_race', 'system', '{"needs_manual_reconciliation":true,"classification":"double_charge"}', '2026-11-01 20:00:00+00')
RETURNING id AS lold \gset
-- Riga staff (non una segnalazione) creata adesso.
INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
VALUES (:'oa', 'walrus-main', 'payment_confirm_lost_race', 'staff', :'s1', '{"needs_manual_reconciliation":true}')
RETURNING id AS lstaff \gset
SELECT set_config('k6.la', :'la', false), set_config('k6.lb', :'lb', false), set_config('k6.lc', :'lc', false),
       set_config('k6.ld', :'ld', false), set_config('k6.lold', :'lold', false), set_config('k6.lstaff', :'lstaff', false),
       set_config('k6.oa', :'oa', false), set_config('k6.ob', :'ob', false), set_config('k6.oc', :'oc', false) \gset

-- =====================================================================================================
-- 1) Policy INSERT sul log (authenticated reale, RLS)
-- =====================================================================================================
SET ROLE authenticated;
DO $$ DECLARE r text; ins text := 'INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata) VALUES (%L, %L, %L, %L, %L, %L)';
BEGIN
  ASSERT current_user = 'authenticated', 'P8-1 ruolo reale authenticated';
  PERFORM fc_test.as_user(k6_test.id('s1'));
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'status_changed', 'staff', k6_test.id('s1'), '{}'));
  RAISE NOTICE 'EVID P8-1a staff/proprio uid -> %', r;  ASSERT r = 'OK', 'P8-1a [DIFETTO] riga staff legittima negata';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'status_changed', 'staff', k6_test.id('m1'), '{}'));
  RAISE NOTICE 'EVID P8-1b staff/uid altrui -> %', r;   ASSERT r LIKE '%row-level security%', 'P8-1b [DIFETTO] uid altrui accettato';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'payment_confirm_lost_race', 'system', NULL, '{"needs_manual_reconciliation":true}'));
  RAISE NOTICE 'EVID P8-1c system -> %', r;             ASSERT r LIKE '%row-level security%', 'P8-1c [DIFETTO] riga system forgiata accettata';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'payment_confirm_lost_race', 'system', k6_test.id('s1'), '{"needs_manual_reconciliation":true}'));
  RAISE NOTICE 'EVID P8-1c2 system con proprio uid -> %', r; ASSERT r LIKE '%row-level security%', 'P8-1c2 [DIFETTO] riga system forgiata accettata';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'status_changed', 'customer', k6_test.id('s1'), '{}'));
  RAISE NOTICE 'EVID P8-1d customer -> %', r;           ASSERT r LIKE '%row-level security%', 'P8-1d [DIFETTO] riga customer accettata';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'altro-locale', 'status_changed', 'staff', k6_test.id('s1'), '{}'));
  RAISE NOTICE 'EVID P8-1e locale non suo -> %', r;     ASSERT r LIKE '%row-level security%', 'P8-1e [DIFETTO] locale altrui accettato';
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'status_changed', 'staff', NULL, '{}'));
  RAISE NOTICE 'EVID P8-1f staff actor_id NULL -> %', r; ASSERT r LIKE '%row-level security%', 'P8-1f [DIFETTO] actor_id NULL accettato';
  PERFORM fc_test.as_user(k6_test.id('nostaff'));
  r := k6_test.try(format(ins, k6_test.txt('oa'), 'walrus-main', 'status_changed', 'staff', k6_test.id('nostaff'), '{}'));
  RAISE NOTICE 'EVID P8-1g autenticato non staff -> %', r; ASSERT r LIKE '%row-level security%', 'P8-1g [DIFETTO] non staff accettato';
  RAISE NOTICE 'PASS P8-1 policy log: solo staff + proprio uid + proprio locale';
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ DECLARE r text;
BEGIN
  ASSERT current_user = 'anon';
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', false);
  r := k6_test.try(format('INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id) VALUES (%L, ''walrus-main'', ''x'', ''staff'', NULL)', k6_test.txt('oa')));
  RAISE NOTICE 'EVID P8-1h anon insert log -> %', r;
  ASSERT r LIKE '%row-level security%' OR r LIKE '%permission denied%', 'P8-1h [DIFETTO] anon scrive nel log';
  RAISE NOTICE 'PASS P8-1h anon non scrive nel log';
END $$;
RESET ROLE;

-- =====================================================================================================
-- 2) Regressione: le RPC chiamate dai ruoli reali scrivono ancora nel log
-- =====================================================================================================
SELECT fc_test.new_user() AS cu2 \gset
SELECT set_config('k6.cu2', :'cu2', false) \gset
SET ROLE authenticated;
DO $$ DECLARE o public.kitchen_orders; o2 public.kitchen_orders; o3 public.kitchen_orders; a public.kitchen_payments; a3 public.kitchen_payments;
  c public.kitchen_payments; n0 bigint; s uuid := k6_test.id('s1'); cu uuid := k6_test.id('cu2'); r text;
BEGIN
  ASSERT current_user = 'authenticated';
  -- cliente: ordine + attempt_start
  o := fc_test.order(cu, '[{"item_id":"item-009","quantity":1}]'::jsonb, 'counter');
  n0 := k6_test.log_count_true(o.id);
  a := fc_test.start_online(o.id);
  ASSERT k6_test.log_count_true(o.id) > n0, 'P8-2a [DIFETTO] attempt_start (cliente) non scrive nel log';
  -- staff: PASSA AL BANCO (close_unpaid) + INCASSA (record_counter)
  n0 := k6_test.log_count_true(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  ASSERT k6_test.log_count_true(o.id) > n0, 'P8-2b [DIFETTO] close_unpaid (staff) non scrive nel log';
  n0 := k6_test.log_count_true(o.id);
  c := fc_test.pay_counter(o.id, s);
  ASSERT c.status = 'succeeded' AND k6_test.log_count_true(o.id) > n0, 'P8-2c [DIFETTO] record_counter (staff) non scrive nel log';
  -- staff: rimborso (richiesta)
  n0 := k6_test.log_count_true(o.id);
  PERFORM fc_test.as_user(s);
  PERFORM public.kitchen_payment_refund(o.id, 'test');
  ASSERT k6_test.log_count_true(o.id) > n0, 'P8-2d [DIFETTO] refund (staff) non scrive nel log';
  -- staff: annullo con attempt
  o2 := fc_test.order(cu, '[{"item_id":"item-009","quantity":1}]'::jsonb, 'online');
  PERFORM fc_test.start_online(o2.id);
  n0 := k6_test.log_count_true(o2.id);
  PERFORM fc_test.cancel(o2.id, s);
  ASSERT k6_test.log_count_true(o2.id) > n0, 'P8-2e [DIFETTO] cancel_with_payment_attempt (staff) non scrive nel log';
  -- staff: fail di un attempt (actor staff)
  o3 := fc_test.order(cu, '[{"item_id":"item-009","quantity":1}]'::jsonb, 'online');
  a3 := fc_test.start_online(o3.id);
  n0 := k6_test.log_count_true(o3.id);
  PERFORM fc_test.as_user(s);
  r := k6_test.try(format('SELECT public.kitchen_payment_fail(%L::uuid, %L, ''{}''::jsonb)', a3.id, 'staff_test'));
  RAISE NOTICE 'EVID P8-2f fail come staff -> % (log +%)', r, k6_test.log_count_true(o3.id) - n0;
  ASSERT r = 'OK' AND k6_test.log_count_true(o3.id) > n0, 'P8-2f [DIFETTO] fail (staff) non scrive nel log';
  PERFORM set_config('k6.o3', o3.id, false);
  PERFORM set_config('k6.orefund', o.id, false);
  RAISE NOTICE 'PASS P8-2 authenticated: attempt_start, close_unpaid, record_counter, refund, cancel, fail scrivono nel log';
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ DECLARE o public.kitchen_orders; a public.kitchen_payments; n0 bigint; rf uuid; cu uuid := k6_test.id('cu2');
BEGIN
  ASSERT current_user = 'service_role';
  -- webhook PAID (confirm) + switch al banco del cliente + sweep abbandono + conferma rimborso
  SELECT * INTO o FROM public.kitchen_orders WHERE id = k6_test.txt('o3');
  PERFORM fc_test.as_service();
  SELECT id INTO rf FROM public.kitchen_payments WHERE order_id = k6_test.txt('orefund') AND direction = 'refund';
  n0 := k6_test.log_count_true(k6_test.txt('orefund'));
  PERFORM public.kitchen_payment_refund_confirm(rf, 'ref-' || rf, '{}'::jsonb);
  ASSERT k6_test.log_count_true(k6_test.txt('orefund')) > n0, 'P8-2g [DIFETTO] refund_confirm (service_role) non scrive nel log';
  RAISE NOTICE 'PASS P8-2g service_role: refund_confirm scrive nel log';
END $$;
RESET ROLE;
-- confirm / switch / abandon sotto service_role (gli helper cambiano solo il claim, il ruolo resta service_role)
SELECT id AS o4 FROM kp_test.new_order(:'cu2', 'online') \gset
SELECT id AS a4 FROM fc_test.start_online(:'o4') \gset
SELECT id AS o5 FROM kp_test.new_order(:'cu2', 'online') \gset
SELECT set_config('k6.o4', :'o4', false), set_config('k6.a4', :'a4', false), set_config('k6.o5', :'o5', false) \gset
SET ROLE service_role;
DO $$ DECLARE n0 bigint;
BEGIN
  ASSERT current_user = 'service_role';
  n0 := k6_test.log_count_true(k6_test.txt('o4'));
  PERFORM kp_test.switch_to_counter(k6_test.txt('o4'));
  ASSERT k6_test.log_count_true(k6_test.txt('o4')) > n0, 'P8-2h [DIFETTO] switch_to_counter_system non scrive nel log';
  n0 := k6_test.log_count_true(k6_test.txt('o4'));
  PERFORM kp_test.confirm(k6_test.id('a4'));
  ASSERT k6_test.log_count_true(k6_test.txt('o4')) > n0, 'P8-2i [DIFETTO] confirm non scrive nel log';
  RAISE NOTICE 'PASS P8-2h/i service_role: switch_to_counter_system e confirm scrivono nel log';
END $$;
RESET ROLE;
-- mark_payment_abandoned: kp_test.abandon retrodata l'ordine (UPDATE da superuser), poi la RPC gira come service_role
SELECT fc_test.backdate(:'o5', now() - interval '6 minutes');
SET ROLE service_role;
DO $$ DECLARE n0 bigint;
BEGIN
  n0 := k6_test.log_count_true(k6_test.txt('o5'));
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(k6_test.txt('o5'));
  ASSERT k6_test.log_count_true(k6_test.txt('o5')) > n0, 'P8-2j [DIFETTO] mark_payment_abandoned non scrive nel log';
  RAISE NOTICE 'PASS P8-2j service_role: mark_payment_abandoned scrive nel log';
END $$;
RESET ROLE;

-- =====================================================================================================
-- 3) Chiusura: permessi, isolamento locali, validazioni
-- =====================================================================================================
SET ROLE authenticated;
DO $$ DECLARE r text; n bigint;
BEGIN
  ASSERT current_user = 'authenticated';
  -- staff non manager
  PERFORM fc_test.as_user(k6_test.id('s1'));
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  RAISE NOTICE 'EVID P8-3a staff -> %', r;          ASSERT r = 'not_manager_for_venue', 'P8-3a [DIFETTO] staff chiude';
  -- manager di un altro locale
  PERFORM fc_test.as_user(k6_test.id('mx'));
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  RAISE NOTICE 'EVID P8-3b manager altro locale -> %', r; ASSERT r = 'not_manager_for_venue', 'P8-3b [DIFETTO] manager altrui chiude';
  -- autenticato non staff: niente chiusura, SELECT vuota
  PERFORM fc_test.as_user(k6_test.id('nostaff'));
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  RAISE NOTICE 'EVID P8-3c non staff -> %', r;      ASSERT r = 'not_manager_for_venue', 'P8-3c [DIFETTO] non staff chiude';
  -- authenticated senza uid (claim senza sub)
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  RAISE NOTICE 'EVID P8-3d senza uid -> %', r;      ASSERT r = 'not_authenticated', 'P8-3d [DIFETTO] chiusura senza utente';
  -- manager: esiti e input non validi
  PERFORM fc_test.as_user(k6_test.id('m1'));
  r := k6_test.resolve(k6_test.id('la'), 'boh');                 ASSERT r = 'invalid_outcome', 'P8-3e esito non ammesso: ' || r;
  r := k6_test.resolve(k6_test.id('la'), NULL);                  ASSERT r = 'invalid_outcome', 'P8-3e esito NULL: ' || r;
  r := k6_test.resolve(k6_test.id('la'), 'seen', '   ');         ASSERT r = 'invalid_note', 'P8-3f nota vuota: ' || r;
  r := k6_test.resolve(k6_test.id('la'), 'seen', repeat('x', 141)); ASSERT r = 'invalid_note', 'P8-3f nota 141: ' || r;
  r := k6_test.resolve(k6_test.id('la'), 'refunded_on_sumup', 'ok', 'ABC-12'); ASSERT r = 'invalid_refund_ref', 'P8-3g ref con trattino: ' || r;
  r := k6_test.resolve(k6_test.id('la'), 'refunded_on_sumup', 'ok', '1234567'); ASSERT r = 'invalid_refund_ref', 'P8-3g ref 7: ' || r;
  r := k6_test.resolve(gen_random_uuid(), 'seen');               ASSERT r = 'source_log_not_found', 'P8-3h log inesistente: ' || r;
  RAISE NOTICE 'EVID P8-3e..h esiti/nota/ref/log non validi rifiutati';
  -- riga storica forgiata e riga staff
  r := k6_test.resolve(k6_test.id('lold'), 'seen');
  RAISE NOTICE 'EVID P8-3i riga storica forgiata -> %', r; ASSERT r = 'legacy_item_not_verifiable', 'P8-3i [DIFETTO] evento storico accettato';
  r := k6_test.resolve(k6_test.id('lstaff'), 'seen');
  RAISE NOTICE 'EVID P8-3j riga staff -> %', r;     ASSERT r = 'not_a_reconciliation_item', 'P8-3j [DIFETTO] riga staff accettata';
  -- refunded_in_walbox senza rimborso
  r := k6_test.resolve(k6_test.id('lb'), 'refunded_in_walbox');
  RAISE NOTICE 'EVID P8-3k walbox senza rimborso -> %', r; ASSERT r = 'no_walbox_refund_found', 'P8-3k [DIFETTO] rimborso inventato accettato';
  n := k6_test.res_count(k6_test.id('la')) + k6_test.res_count(k6_test.id('lb'));
  ASSERT n = 0, 'P8-3 nessuna chiusura scritta dai tentativi rifiutati';
  RAISE NOTICE 'PASS P8-3 permessi e validazioni: solo il manager del locale, input controllati, nessuna riga scritta';
END $$;
RESET ROLE;

-- Rimborso di ALTRO locale sullo stesso ordine B (riga forgiata da superuser) -> ancora rifiutato.
INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
VALUES (:'ob', 'altro-locale', 'app', 'sumup', 'sumup_online', 'refund', 'succeeded', 1, 'system');
-- Rimborso dello stesso locale ma PRIMA della segnalazione C -> rifiutato.
INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type, created_at)
VALUES (:'oc', 'walrus-main', 'app', 'sumup', 'sumup_online', 'refund', 'succeeded', 1, 'system', now() - interval '1 hour');
SET ROLE authenticated;
DO $$ DECLARE r text;
BEGIN
  PERFORM fc_test.as_user(k6_test.id('m1'));
  r := k6_test.resolve(k6_test.id('lb'), 'refunded_in_walbox');
  RAISE NOTICE 'EVID P8-3l rimborso di altro locale -> %', r; ASSERT r = 'no_walbox_refund_found', 'P8-3l [DIFETTO] rimborso di altro locale accettato';
  r := k6_test.resolve(k6_test.id('lc'), 'refunded_in_walbox');
  RAISE NOTICE 'EVID P8-3m rimborso precedente alla segnalazione -> %', r; ASSERT r = 'no_walbox_refund_found', 'P8-3m [DIFETTO] rimborso precedente accettato';
  RAISE NOTICE 'PASS P8-3l/m refunded_in_walbox: stesso locale e dopo la segnalazione';
END $$;
RESET ROLE;
-- Rimborso vero (staff + conferma di sistema) sull'ordine D -> refunded_in_walbox accettato.
SELECT fc_test.refund(:'od', :'s1');

-- =====================================================================================================
-- 4) Chiusura riuscita, idempotenza, already_resolved, nome mostrato
-- =====================================================================================================
SET ROLE authenticated;
DO $$ DECLARE r text; x public.kitchen_reconciliation_resolutions; y public.kitchen_reconciliation_resolutions; n bigint;
BEGIN
  ASSERT current_user = 'authenticated';
  PERFORM fc_test.as_user(k6_test.id('m1'));
  x := public.kitchen_reconciliation_resolve(k6_test.id('la'), 'refunded_on_sumup', '  rimborsato da app SumUp  ', ' A1b2C3 ');
  RAISE NOTICE 'EVID P8-4a chiusura m1: by=m1? % outcome=% note="%" ref=% label=% created_at? %',
    x.resolved_by = k6_test.id('m1'), x.outcome, x.note, x.refund_ref_tail, x.resolved_by_label, x.created_at IS NOT NULL;
  ASSERT x.resolved_by = k6_test.id('m1') AND x.outcome = 'refunded_on_sumup' AND x.note = 'rimborsato da app SumUp'
     AND x.refund_ref_tail = 'A1b2C3' AND x.venue_id = 'walrus-main' AND x.order_id = k6_test.txt('oa')
     AND x.created_at IS NOT NULL, 'P8-4a [DIFETTO] chiusura manager non registrata come atteso';
  ASSERT x.resolved_by_label = 'Marco', 'P8-4b label da app_metadata.display_name';
  ASSERT position('@' IN coalesce(x.resolved_by_label, '')) = 0 AND x.resolved_by_label NOT ILIKE '%marco.rossi%', 'P8-4b [DIFETTO] email nel nome';
  -- doppio clic: stesso manager, stesso esito -> stessa riga
  y := public.kitchen_reconciliation_resolve(k6_test.id('la'), 'refunded_on_sumup', 'secondo clic', NULL);
  ASSERT y.id = x.id AND k6_test.res_count(k6_test.id('la')) = 1, 'P8-4c [DIFETTO] doppio clic crea una seconda chiusura';
  -- stesso manager, esito diverso -> already_resolved
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  ASSERT r = 'already_resolved', 'P8-4d stesso manager esito diverso: ' || r;
  -- secondo manager, stesso esito o diverso -> already_resolved
  PERFORM fc_test.as_user(k6_test.id('m2'));
  r := k6_test.resolve(k6_test.id('la'), 'seen');
  RAISE NOTICE 'EVID P8-4e secondo manager esito diverso -> %', r; ASSERT r = 'already_resolved', 'P8-4e [DIFETTO] chiusura sovrascritta';
  r := k6_test.resolve(k6_test.id('la'), 'refunded_on_sumup');
  ASSERT r = 'already_resolved', 'P8-4f secondo manager stesso esito: ' || r;
  ASSERT k6_test.res_count(k6_test.id('la')) = 1, 'P8-4 una sola riga';
  -- m2 senza app_metadata: label NULL (mai email, mai user_metadata)
  y := public.kitchen_reconciliation_resolve(k6_test.id('lb'), 'verified_not_charged', 'nessun addebito su SumUp', NULL);
  RAISE NOTICE 'EVID P8-4g label m2 senza app_metadata -> %', coalesce(y.resolved_by_label, 'NULL');
  ASSERT y.resolved_by_label IS NULL, 'P8-4g [DIFETTO] label inventato (email o user_metadata)';
  -- refunded_in_walbox con rimborso vero
  y := public.kitchen_reconciliation_resolve(k6_test.id('ld'), 'refunded_in_walbox', 'rimborsato da Walbox', NULL);
  ASSERT y.outcome = 'refunded_in_walbox', 'P8-4h refunded_in_walbox con rimborso succeeded';
  -- SELECT: manager e staff dello stesso locale vedono, altri no
  SELECT count(*) INTO n FROM public.kitchen_reconciliation_resolutions;
  ASSERT n = 3, 'P8-4i manager vede le 3 chiusure del locale, viste: ' || n;
  PERFORM fc_test.as_user(k6_test.id('s1'));
  SELECT count(*) INTO n FROM public.kitchen_reconciliation_resolutions;
  ASSERT n = 3, 'P8-4j staff del locale vede le chiusure, viste: ' || n;
  PERFORM fc_test.as_user(k6_test.id('sx'));
  SELECT count(*) INTO n FROM public.kitchen_reconciliation_resolutions;
  RAISE NOTICE 'EVID P8-4k staff altro locale vede % chiusure', n; ASSERT n = 0, 'P8-4k [DIFETTO] staff di altro locale vede le chiusure';
  PERFORM fc_test.as_user(k6_test.id('nostaff'));
  SELECT count(*) INTO n FROM public.kitchen_reconciliation_resolutions;
  RAISE NOTICE 'EVID P8-4l non staff vede % chiusure', n; ASSERT n = 0, 'P8-4l [DIFETTO] non staff vede le chiusure';
  RAISE NOTICE 'PASS P8-4 chiusura manager, doppio clic idempotente, already_resolved, label sicuro, isolamento SELECT';
END $$;

-- 5) Scritture dirette sulla tabella: negate a authenticated (anche manager), anon, service_role; trigger per superuser
DO $$ DECLARE r text;
BEGIN
  PERFORM fc_test.as_user(k6_test.id('m1'));
  r := k6_test.try(format('INSERT INTO public.kitchen_reconciliation_resolutions (venue_id, source_log_id, outcome, note, resolved_by) VALUES (''walrus-main'', %L, ''seen'', ''x'', %L)', k6_test.id('lc'), k6_test.id('m1')));
  RAISE NOTICE 'EVID P8-5a INSERT diretto manager -> %', r; ASSERT r LIKE '%permission denied%', 'P8-5a [DIFETTO] insert diretto';
  r := k6_test.try('UPDATE public.kitchen_reconciliation_resolutions SET note = ''cambiata''');
  RAISE NOTICE 'EVID P8-5b UPDATE diretto manager -> %', r; ASSERT r LIKE '%permission denied%', 'P8-5b [DIFETTO] update diretto';
  r := k6_test.try('DELETE FROM public.kitchen_reconciliation_resolutions');
  RAISE NOTICE 'EVID P8-5c DELETE diretto manager -> %', r; ASSERT r LIKE '%permission denied%', 'P8-5c [DIFETTO] delete diretto';
  r := k6_test.try('TRUNCATE public.kitchen_reconciliation_resolutions');
  ASSERT r LIKE '%permission denied%', 'P8-5d [DIFETTO] truncate diretto: ' || r;
  RAISE NOTICE 'PASS P8-5a-d authenticated: nessuna scrittura diretta';
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', false);
  r := k6_test.resolve(k6_test.id('lc'), 'seen');
  RAISE NOTICE 'EVID P8-5e anon RPC -> %', r; ASSERT r LIKE '%permission denied for function%', 'P8-5e [DIFETTO] anon esegue la RPC';
  r := k6_test.try('SELECT count(*) FROM public.kitchen_reconciliation_resolutions');
  RAISE NOTICE 'EVID P8-5f anon SELECT -> %', r; ASSERT r LIKE '%permission denied%', 'P8-5f [DIFETTO] anon legge';
  RAISE NOTICE 'PASS P8-5e/f anon: nessun EXECUTE, nessuna lettura';
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ DECLARE r text;
BEGIN
  PERFORM fc_test.as_service();
  r := k6_test.resolve(k6_test.id('lc'), 'seen');
  RAISE NOTICE 'EVID P8-5g service_role RPC senza uid -> %', r; ASSERT r = 'not_authenticated', 'P8-5g [DIFETTO] service_role chiude senza autore';
  r := k6_test.try(format('INSERT INTO public.kitchen_reconciliation_resolutions (venue_id, source_log_id, outcome, note, resolved_by) VALUES (''walrus-main'', %L, ''seen'', ''x'', gen_random_uuid())', k6_test.id('lc')));
  RAISE NOTICE 'EVID P8-5h service_role INSERT diretto -> %', r; ASSERT r LIKE '%permission denied%', 'P8-5h [DIFETTO] service_role scrive direttamente';
  r := k6_test.try('UPDATE public.kitchen_reconciliation_resolutions SET note = ''x''');
  ASSERT r LIKE '%permission denied%', 'P8-5i service_role update: ' || r;
  RAISE NOTICE 'PASS P8-5g-i service_role: RPC -> not_authenticated, nessuna scrittura diretta';
END $$;
RESET ROLE;
DO $$ DECLARE r text; n0 bigint;
BEGIN
  ASSERT current_user = 'postgres';
  SELECT count(*) INTO n0 FROM public.kitchen_reconciliation_resolutions;
  r := k6_test.try('UPDATE public.kitchen_reconciliation_resolutions SET note = ''cambiata''');
  RAISE NOTICE 'EVID P8-5j superuser UPDATE -> %', r; ASSERT r = 'reconciliation_resolutions_append_only', 'P8-5j [DIFETTO] update superuser';
  r := k6_test.try('DELETE FROM public.kitchen_reconciliation_resolutions');
  RAISE NOTICE 'EVID P8-5k superuser DELETE -> %', r; ASSERT r = 'reconciliation_resolutions_append_only', 'P8-5k [DIFETTO] delete superuser';
  r := k6_test.try('TRUNCATE public.kitchen_reconciliation_resolutions');
  RAISE NOTICE 'EVID P8-5l superuser TRUNCATE -> %', r; ASSERT r = 'reconciliation_resolutions_append_only', 'P8-5l [DIFETTO] truncate superuser';
  r := k6_test.try(format('DELETE FROM public.kitchen_action_log WHERE id = %L', k6_test.id('la')));
  RAISE NOTICE 'EVID P8-5m cancellazione della segnalazione chiusa -> %', r; ASSERT r <> 'OK', 'P8-5m [DIFETTO] segnalazione chiusa cancellabile';
  ASSERT (SELECT count(*) FROM public.kitchen_reconciliation_resolutions) = n0 AND n0 = 3, 'P8-5 righe invariate';
  RAISE NOTICE 'PASS P8-5j-m append-only anche per superuser; segnalazione chiusa non cancellabile (FK RESTRICT)';
END $$;
