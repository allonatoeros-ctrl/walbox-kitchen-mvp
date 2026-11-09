-- FASE A (2026-11-08): simulazioni SB-1..SB-7 lato DB (sigillo, intento, evidenze, verdetto, rilascio, PAID tardivo).
-- Gira in una transazione con ROLLBACK (run-food-club-sql.sh). Report: ai-ops/reports/food-club-local-fase-a-sb-2026-11-08.md
-- Le risposte SumUp NON sono reali: sono evidenze registrate con la RPC reale food_club_record_checkout_evidence,
-- con i campi che la fase JS (api/_lib/foodClubVoucherRelease.js) ricaverebbe da quella risposta. Nessuna e' una prova
-- SumUp: dicono solo come reagisce il DB a quella risposta. Lato JS: tests/unit/food-club-sb-simulations.test.mjs.
--
-- FIXTURE dichiarate (identiche a 60_release.sql, da cui sono copiati gli helper):
--  * now() fisso nella transazione: il tempo si simula RETRODATANDO (session_replication_role = replica) ordini,
--    pagamenti, intenti, sigilli ed evidenze. I valori nascono comunque dalle RPC reali.
--  * le costanti di verifica sono accese SOLO dentro la transazione (fc_test.rules_set) per dimostrare che anche con
--    regole accese i casi incerti restano incerti; il ROLLBACK le ripristina (false/false/false, merchant NULL).
--  * casi "impossibili in produzione" marcati come tali (servono a provare l'invariante, non il flusso).
-- Casi gia' coperti altrove sono CITATI, non duplicati: S1..S20/E-* (60_release.sql), D1-* (90_d1_banco.sql).
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- ---------------------------------------------------------------------------------------------------
-- Helper locali (spariscono col ROLLBACK)
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION fc_test.mkv(p_uid uuid, p_expires interval DEFAULT interval '10 days') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + p_expires) RETURNING id $$;
CREATE FUNCTION fc_test.vstatus(p_v uuid) RETURNS text LANGUAGE sql AS $$ SELECT status FROM public.food_club_vouchers WHERE id = p_v $$;
CREATE FUNCTION fc_test.vev(p_v uuid, p_event text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND event = p_event $$;
CREATE FUNCTION fc_test.alog(p_o text, p_action text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_action_log WHERE order_id = p_o AND action = p_action $$;
CREATE FUNCTION fc_test.ostatus(p_o text) RETURNS text LANGUAGE sql AS $$
  SELECT status || '|' || COALESCE(payment_status, '-') FROM public.kitchen_orders WHERE id = p_o $$;
CREATE FUNCTION fc_test.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'OK'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLERRM; END $$;

CREATE FUNCTION fc_test.fx_replica(p_on boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('session_replication_role', CASE WHEN p_on THEN 'replica' ELSE 'origin' END, true) $$;

-- Costanti di verifica: valori esatti (rules + merchant) per il test.
CREATE FUNCTION fc_test.rules_set(p_vu boolean, p_term boolean, p_list boolean, p_merchant text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format($q$CREATE OR REPLACE FUNCTION public.food_club_release_verified_rules()
    RETURNS TABLE (valid_until_verified boolean, terminal_verified boolean, list_verified boolean)
    LANGUAGE sql IMMUTABLE AS $b$SELECT %s, %s, %s$b$ $q$, p_vu::text, p_term::text, p_list::text);
  EXECUTE format($q$CREATE OR REPLACE FUNCTION public.food_club_expected_merchant_code()
    RETURNS text LANGUAGE sql IMMUTABLE AS $b$SELECT %s::text$b$ $q$, CASE WHEN p_merchant IS NULL THEN 'NULL' ELSE quote_literal(p_merchant) END);
END $$;

-- Chiamate Club col ruolo REALE service_role.
CREATE FUNCTION fc_test.seal(p_o text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    r := public.food_club_seal_order_for_release(p_o);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
CREATE FUNCTION fc_test.release(p_o text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    r := public.food_club_release_voucher_after_evidence(p_o);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
CREATE FUNCTION fc_test.rpc_intent(p_a uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    r := public.food_club_record_checkout_intent(p_a);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
CREATE FUNCTION fc_test.rpc_evidence(p_a uuid, p_kind text, p_fields jsonb) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r bigint;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    r := public.food_club_record_checkout_evidence(p_a, p_kind, p_fields);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
CREATE FUNCTION fc_test.retention() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    r := public.food_club_retention_sweep();
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;

-- Sweep dei 5 minuti (Kitchen reale): retrodata l'ordine di 6 minuti e chiude con kitchen_order_mark_payment_abandoned.
CREATE FUNCTION fc_test.abandon(p_o text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.backdate(p_o, now() - interval '6 minutes');
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(p_o);
END $$;
CREATE FUNCTION fc_test.confirm(p_att uuid, p_ref text DEFAULT 'sumup-late') RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.as_service(); RETURN public.kitchen_payment_confirm(p_att, p_ref, '{}'::jsonb); END $$;

-- Sposta l'orologio dell'ordine: created_at = now() - p_age_s; pagamenti, claim e intento coerenti.
CREATE FUNCTION fc_test.set_ages(p_o text, p_age_s int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c timestamptz := now() - make_interval(secs => p_age_s);
BEGIN
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_orders SET created_at = c WHERE id = p_o;
  UPDATE public.kitchen_payments SET created_at = c,
         checkout_claim_at = CASE WHEN checkout_claim_at IS NULL THEN NULL ELSE c + interval '10 seconds' END
   WHERE order_id = p_o;
  UPDATE public.food_club_checkout_intents SET valid_until = date_trunc('second', c + interval '15 minutes'),
         recorded_at = c + interval '11 seconds' WHERE order_id = p_o;
  PERFORM fc_test.fx_replica(false);
END $$;
CREATE FUNCTION fc_test.set_sealed(p_o text, p_secs_ago int) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_release_seals SET sealed_at = now() - make_interval(secs => p_secs_ago) WHERE order_id = p_o;
  PERFORM fc_test.fx_replica(false);
END $$;

-- Scenario: ordine online con buono + attempt SumUp, poi abbandonato (buono trattenuto, evento held).
--  A  = nessuna claim (checkout mai richiesto)
--  B  = claim + intento + provider_ref
--  C  = claim + intento, provider_ref NULL (esito POST ignoto)
--  C0 = claim senza intento (attempt nato col codice vecchio)
-- p_extra: 'never' (riga charge SumUp extra senza claim) | 'claimed' (riga extra con claim e senza intento).
CREATE FUNCTION fc_test.mk(p_mode text, p_extra text DEFAULT NULL, OUT m uuid, OUT v uuid, OUT o text, OUT a uuid)
LANGUAGE plpgsql AS $$
DECLARE ord public.kitchen_orders;
BEGIN
  m := fc_test.new_member(); v := fc_test.mkv(m);
  ord := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  o := ord.id;
  a := (fc_test.start_online(o)).id;
  IF p_mode <> 'A' THEN
    PERFORM fc_test.as_service();
    PERFORM public.kitchen_payment_attempt_claim_checkout(a);
    IF p_mode <> 'C0' THEN PERFORM fc_test.rpc_intent(a); END IF;
    IF p_mode = 'B' THEN
      PERFORM fc_test.as_service();
      PERFORM public.kitchen_payment_attempt_set_provider_ref(a, 'co-' || a);
    END IF;
    UPDATE public.kitchen_payments SET checkout_claim_at = now() - interval '2 minutes' WHERE id = a;
  END IF;
  IF p_extra IS NOT NULL THEN
    INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount,
                                         initiated_by_actor_type, checkout_claim_at)
    VALUES (o, ord.venue_id, 'app', 'sumup', 'sumup_online', 'charge', 'failed', ord.total, 'customer',
            CASE WHEN p_extra = 'claimed' THEN now() - interval '2 minutes' END);
  END IF;
  PERFORM fc_test.abandon(o);
END $$;

CREATE FUNCTION fc_test.mk_sealed(p_mode text, p_extra text DEFAULT NULL, OUT m uuid, OUT v uuid, OUT o text, OUT a uuid)
LANGUAGE plpgsql AS $$
DECLARE s jsonb;
BEGIN
  SELECT x.m, x.v, x.o, x.a INTO m, v, o, a FROM fc_test.mk(p_mode, p_extra) x;
  PERFORM fc_test.set_ages(o, 1300);
  s := fc_test.seal(o);
  IF (s ->> 'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'mk_sealed: sigillo rifiutato %', s; END IF;
  PERFORM fc_test.set_sealed(o, 600);
END $$;

-- Campi di una GET legata all'attempt / di una List.
CREATE FUNCTION fc_test.gf(p_a uuid, p_status text, p_over jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('http_status', 200, 'checkout_id', 'co-' || p_a, 'checkout_reference', p_a::text,
           'sumup_status', p_status, 'amount', p.amount, 'currency', 'EUR', 'merchant_code', 'M-TEST',
           'valid_until', i.valid_until) || p_over
    FROM public.kitchen_payments p JOIN public.food_club_checkout_intents i ON i.attempt_id = p.id WHERE p.id = p_a $$;
CREATE FUNCTION fc_test.lf(p_a uuid, p_count int, p_over jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('http_status', 200, 'list_count', p_count) ||
         CASE WHEN p_count = 1 THEN jsonb_build_object('checkout_id', 'co-' || p_a) ELSE '{}'::jsonb END || p_over $$;
-- Registra un'evidenza con la RPC reale e ne retrodata fetched_at di p_age_s secondi.
CREATE FUNCTION fc_test.ev(p_a uuid, p_kind text, p_fields jsonb, p_age_s int) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r bigint;
BEGIN
  r := fc_test.rpc_evidence(p_a, p_kind, p_fields);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_checkout_evidence SET fetched_at = now() - make_interval(secs => p_age_s) WHERE id = r;
  PERFORM fc_test.fx_replica(false);
  RETURN r;
END $$;
-- Prove standard: List fresca (20 s), GET1 a 110 s, GET2 a 30 s.
CREATE FUNCTION fc_test.std(p_a uuid, p_s1 text, p_s2 text, p_list int DEFAULT 1) RETURNS bigint[] LANGUAGE plpgsql AS $$
BEGIN
  RETURN ARRAY[fc_test.ev(p_a, 'list', fc_test.lf(p_a, p_list), 20),
               fc_test.ev(p_a, 'get', fc_test.gf(p_a, p_s1), 110),
               fc_test.ev(p_a, 'get', fc_test.gf(p_a, p_s2), 30)];
END $$;


-- Helper in piu' (copiati da 90_d1_banco.sql) ------------------------------------------------------------------------
CREATE FUNCTION fc_test.vused_on(p_v uuid) RETURNS text LANGUAGE sql AS $$ SELECT used_order_id FROM public.food_club_vouchers WHERE id = p_v $$;
CREATE FUNCTION fc_test.vev_to_used(p_v uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND to_status = 'used' $$;
CREATE FUNCTION fc_test.ok_charges(p_o text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_payments WHERE order_id = p_o AND direction = 'charge' AND status = 'succeeded' $$;
CREATE FUNCTION fc_test.fail_sumup(p_att uuid) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.as_service(); RETURN public.kitchen_payment_fail(p_att, 'sumup_failed', '{}'::jsonb); END $$;
CREATE FUNCTION fc_test.reopen_counter(p_o text) RETURNS void LANGUAGE sql AS $$
  UPDATE public.kitchen_orders SET status = 'pending_counter_payment', online_payment_disabled = true WHERE id = p_o $$;
-- Prove "perfette" (List 1 + due GET legate) con stati scelti; ritorna il verdetto del rilascio.
CREATE FUNCTION fc_test.rel2(p_o text, p_a uuid, p_s1 text, p_s2 text) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.std(p_a, p_s1, p_s2); RETURN fc_test.release(p_o); END $$;
-- ==== FINE HELPER SB ====

-- ---------------------------------------------------------------------------------------------------
-- SB0 precondizioni: costanti spente, funzione di verdetto senza CANCELLED (migration 20261109108000)
-- ---------------------------------------------------------------------------------------------------
DO $$ BEGIN
  ASSERT (SELECT NOT (valid_until_verified OR terminal_verified OR list_verified) FROM public.food_club_release_verified_rules()), 'SB0-01 costanti false';
  ASSERT public.food_club_expected_merchant_code() IS NULL, 'SB0-01 merchant NULL';
  ASSERT (SELECT prosrc !~* 'CANCELLED' AND prosrc ~ $r$IN \('FAILED', 'EXPIRED'\)$r$ FROM pg_proc WHERE proname = 'food_club_release_eval_attempt'),
    'SB0-02 eval_attempt senza CANCELLED';
  RAISE NOTICE 'PASS SB0-01 costanti spente (false/false/false, merchant NULL) dopo tutte le migration';
  RAISE NOTICE 'PASS SB0-02 food_club_release_eval_attempt in DB: terminali solo FAILED/EXPIRED (CANCELLED tolto)';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-1 valid_until
-- (intento = created_at + 15 min troncato al secondo: E-I di 60_release.sql; JS: C-2/C-15/C-7)
-- ---------------------------------------------------------------------------------------------------
-- SB1-S1 checkout FAILED e poi PAID sullo STESSO checkout prima di 4:30 (retry sulla pagina hosted): un incasso, buono usato 1 volta
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; a2 uuid; i1 jsonb; i2 jsonb; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  i1 := fc_test.rpc_intent(a);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_set_provider_ref(a, 'co-' || a);
  PERFORM fc_test.fail_sumup(a);                                   -- GET/webhook FAILED
  a2 := (fc_test.start_online(o.id)).id;                           -- il cliente riprova: stesso attempt (FAILED riusabile)
  ASSERT a2 = a, 'SB1-S1 attempt_start dopo FAILED restituisce lo stesso attempt';
  i2 := fc_test.rpc_intent(a);
  ASSERT i2 ->> 'valid_until' = i1 ->> 'valid_until' AND (i2 ->> 'already_recorded')::boolean, 'SB1-S1 intento idempotente: ' || i2::text;
  PERFORM fc_test.confirm(a, 'co-' || a);                          -- PAID sullo stesso checkout
  ASSERT fc_test.ostatus(o.id) = 'received|paid' AND fc_test.ok_charges(o.id) = 1, 'SB1-S1 ordine pagato una volta: ' || fc_test.ostatus(o.id);
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vev_to_used(v) = 1, 'SB1-S1 buono usato una volta';
  RAISE NOTICE 'PASS SB1-S1 FAILED poi PAID sullo stesso checkout (<4:30): stesso attempt, intento idempotente (%), 1 incasso, buono used 1 volta', i1 ->> 'valid_until';
END $$;

-- SB1-S2 nessun nuovo checkout dopo created_at + 4:30: attempt_start rifiutato (online_payment_expired); a 4:29 ammesso
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; t text; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  PERFORM fc_test.fx_replica(true); UPDATE public.kitchen_orders SET created_at = now() - interval '269 seconds' WHERE id = o.id; PERFORM fc_test.fx_replica(false);
  t := fc_test.try(format('SELECT fc_test.start_online(%L)', o.id));
  ASSERT t = 'OK', 'SB1-S2 a 4:29 attempt ammesso: ' || t;
  PERFORM fc_test.fx_replica(true); UPDATE public.kitchen_orders SET created_at = now() - interval '271 seconds' WHERE id = o.id; PERFORM fc_test.fx_replica(false);
  t := fc_test.try(format('SELECT fc_test.start_online(%L)', o.id));
  ASSERT t LIKE 'ERR%online_payment_expired%', 'SB1-S2 a 4:31: ' || t;
  RAISE NOTICE 'PASS SB1-S2 dopo created_at+4:30 nessun nuovo attempt (online_payment_expired); a 4:29 ammesso';
END $$;

-- SB1-S3 checkout oltre la scadenza senza alcuna prova (solo tempo trascorso, ordine di 3 ore): mai rilascio, anche a regole accese
DO $$ DECLARE r record; res jsonb; k int; BEGIN
  FOR k IN 0..1 LOOP
    IF k = 1 THEN PERFORM fc_test.rules_set(true, true, true, 'M-TEST'); END IF;
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    PERFORM fc_test.set_ages(r.o, 3 * 3600);
    res := fc_test.release(r.o);
    ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'uncertain:list_missing_or_stale' AND fc_test.vstatus(r.v) = 'reserved',
      'SB1-S3 solo tempo: ' || res::text;
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB1-S3 solo tempo trascorso (3 h, regole spente e accese): uncertain:list_missing_or_stale, buono reserved';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-2 stati del checkout (doc SumUp: PENDING, FAILED, PAID, EXPIRED; CANCELLED solo per le transazioni)
-- ---------------------------------------------------------------------------------------------------
-- SB2-S1 regole SPENTE: FAILED/FAILED, EXPIRED/EXPIRED, PENDING/PENDING oltre valid_until -> mai rilascio.
-- (a) configurazione reale (merchant atteso NULL): nessuna GET e' mai "legata" -> get_missing_or_unbound;
-- (b) merchant valorizzato ma regole false: si arriva al ramo degli stati e la regola spenta blocca.
DO $$ DECLARE r record; res jsonb; s text; exp text; got text := ''; cfg int; BEGIN
  FOR cfg IN 0..1 LOOP
    PERFORM fc_test.rules_set(false, false, false, CASE WHEN cfg = 1 THEN 'M-TEST' END);
    FOREACH s IN ARRAY ARRAY['FAILED', 'EXPIRED', 'PENDING'] LOOP
      SELECT * INTO r FROM fc_test.mk_sealed('B');
      res := fc_test.rel2(r.o, r.a, s, s);
      exp := CASE WHEN cfg = 0 THEN 'uncertain:get_missing_or_unbound'
                  WHEN s = 'PENDING' THEN 'uncertain:valid_until_rule_not_verified' ELSE 'uncertain:terminal_rule_not_verified' END;
      ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = exp AND fc_test.vstatus(r.v) = 'reserved', 'SB2-S1 ' || s || ': ' || res::text;
      got := got || CASE WHEN cfg = 0 THEN 'reale:' ELSE 'merchant:' END || s || '=' || (res ->> 'reason') || ' ';
    END LOOP;
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB2-S1 regole spente: FAILED/EXPIRED/PENDING con prove perfette -> nessun rilascio [%]', trim(got);
END $$;

-- SB2-S2 regole ACCESE (solo nella transazione): CANCELLED e stati non documentati -> uncertain:states_not_concordant
DO $$ DECLARE r record; res jsonb; p text[]; got text := ''; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH p SLICE 1 IN ARRAY ARRAY[['CANCELLED', 'CANCELLED'], ['cancelled', 'Cancelled'], ['FAILED', 'CANCELLED'], ['CANCELLED', 'EXPIRED'],
                                   ['PROCESSING', 'PROCESSING'], ['SUCCESSFUL', 'SUCCESSFUL'], ['REFUNDED', 'REFUNDED'], ['', '']] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    res := fc_test.rel2(r.o, r.a, p[1], p[2]);
    ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'uncertain:states_not_concordant' AND fc_test.vstatus(r.v) = 'reserved',
      format('SB2-S2 %s/%s: %s', p[1], p[2], res);
    ASSERT fc_test.vev(r.v, 'released_after_checkout_evidence') = 0, 'SB2-S2 nessun evento di rilascio';
    got := got || p[1] || '/' || p[2] || ' ';
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB2-S2 regole forzate a true + due GET CANCELLED (o stati non documentati) -> uncertain:states_not_concordant, buono reserved [%]', trim(got);
END $$;

-- SB2-S3 controllo positivo (regole accese): EXPIRED/EXPIRED e FAILED/EXPIRED rilasciano -> il test sopra e' sensibile
DO $$ DECLARE r record; res jsonb; p text[]; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH p SLICE 1 IN ARRAY ARRAY[['EXPIRED', 'EXPIRED'], ['FAILED', 'EXPIRED']] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    res := fc_test.rel2(r.o, r.a, p[1], p[2]);
    ASSERT (res ->> 'released')::boolean AND (res -> 'verdicts' -> 0 ->> 'reason') = 'terminal_state' AND fc_test.vstatus(r.v) = 'available',
      format('SB2-S3 %s/%s: %s', p[1], p[2], res);
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB2-S3 controllo positivo: con regole forzate EXPIRED/EXPIRED e FAILED/EXPIRED -> terminal_state (rilascio solo nella transazione)';
END $$;

-- SB2-S4 PAID vince sempre (regole accese): CANCELLED + PAID, PENDING + paid minuscolo
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  res := fc_test.rel2(r.o, r.a, 'CANCELLED', 'PAID');
  ASSERT res ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'SB2-S4 CANCELLED+PAID: ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  res := fc_test.rel2(r.o, r.a, 'EXPIRED', 'paid');
  ASSERT res ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'SB2-S4 EXPIRED+paid: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB2-S4 PAID (anche minuscolo) vince su CANCELLED/EXPIRED: paid_evidence, nessun rilascio';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-3 POST con esito incerto -> P-C (claim + intento, provider_ref NULL)
-- ---------------------------------------------------------------------------------------------------
-- SB3-S1 P-C con List vuota ripetuta, ordine di 2 ore, regole spente: uncertain, buono reserved (mai "mai creato")
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.set_ages(r.o, 2 * 3600);
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 90);
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early' AND fc_test.vstatus(r.v) = 'reserved',
    'SB3-S1: ' || res::text;
  RAISE NOTICE 'PASS SB3-S1 P-C List vuota (2 letture, ordine di 2 h, regole spente) -> %, buono reserved', res ->> 'reason';
END $$;

-- SB3-S2 P-C List vuota con regole PARZIALI (solo list_verified) o List in errore (HTTP 500/429): uncertain
DO $$ DECLARE r record; res jsonb; h int; BEGIN
  PERFORM fc_test.rules_set(false, true, true, 'M-TEST');            -- valid_until NON verificato
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early' AND fc_test.vstatus(r.v) = 'reserved', 'SB3-S2 regole parziali: ' || res::text;
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH h IN ARRAY ARRAY[500, 429, 401] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('C');
    PERFORM fc_test.ev(r.a, 'list', jsonb_build_object('http_status', h), 20);
    res := fc_test.release(r.o);
    ASSERT res ->> 'reason' = 'uncertain:list_missing_or_stale' AND fc_test.vstatus(r.v) = 'reserved', 'SB3-S2 List HTTP ' || h || ': ' || res::text;
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB3-S2 P-C List vuota con valid_until non verificato, List HTTP 500/429/401 (regole accese) -> uncertain, buono reserved';
END $$;

-- SB3-S3 P-C List senza conteggio affidabile (corpo con elementi di altri reference -> list_count omesso dal JS dopo il fix
-- fase A) o con 1 risultato senza id: uncertain:list_unexpected_count anche a regole accese e valid_until passato da ore
DO $$ DECLARE r record; res jsonb; f jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH f IN ARRAY ARRAY['{"http_status":200}'::jsonb, '{"http_status":200,"list_count":1}'::jsonb, '{"http_status":200,"list_count":3}'::jsonb] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('C');
    PERFORM fc_test.set_ages(r.o, 3 * 3600);
    PERFORM fc_test.ev(r.a, 'list', f, 20);
    res := fc_test.release(r.o);
    ASSERT res ->> 'reason' = 'uncertain:list_unexpected_count' AND fc_test.vstatus(r.v) = 'reserved', 'SB3-S3 ' || f::text || ': ' || res::text;
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB3-S3 P-C List senza list_count / 1 senza id / 3 risultati (regole accese) -> uncertain:list_unexpected_count';
END $$;

-- SB3-S4 POST arrivata DOPO: prima List vuota, poi List con 1 checkout e GET PAID -> paid_evidence (la List piu' recente vince)
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 100);
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PAID'), 10);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'SB3-S4 PAID: ' || res::text;
  -- stessa storia ma il checkout comparso e' PENDING: valutato come P-B sul checkout trovato (regole spente -> uncertain)
  PERFORM fc_test.rules_set(false, false, false, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 100);
  res := fc_test.rel2(r.o, r.a, 'PENDING', 'PENDING');
  ASSERT res ->> 'reason' = 'uncertain:valid_until_rule_not_verified' AND fc_test.vstatus(r.v) = 'reserved', 'SB3-S4 PENDING: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB3-S4 POST arrivata dopo (List vuota poi 1 match): PAID -> paid_evidence; PENDING a regole spente -> uncertain';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-4 GET/List anomale (legami: S8 di 60_release.sql copre reference, importo, merchant, checkout_id, valuta, valid_until,
-- HTTP, List 2 / id diverso, merchant atteso NULL). Qui: campi MANCANTI e varianti di formato, regole accese.
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; res jsonb; k text; got text := ''; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH k IN ARRAY ARRAY['checkout_reference', 'amount', 'currency', 'merchant_code', 'valid_until', 'checkout_id', 'http_status', 'sumup_status'] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED') - k, 110);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED') - k, 30);
    res := fc_test.release(r.o);
    ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' LIKE 'uncertain:%' AND fc_test.vstatus(r.v) = 'reserved',
      'SB4-S1 campo ' || k || ' mancante: ' || res::text;
    got := got || k || '->' || (res ->> 'reason') || ' ';
  END LOOP;
  -- varianti di formato: valuta minuscola, merchant con spazio, reference maiuscola
  FOREACH k IN ARRAY ARRAY['currency', 'merchant_code', 'checkout_reference'] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED', CASE k WHEN 'currency' THEN '{"currency":"eur"}'::jsonb
      WHEN 'merchant_code' THEN '{"merchant_code":"M-TEST "}'::jsonb ELSE jsonb_build_object('checkout_reference', upper(r.a::text)) END), 110);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED', CASE k WHEN 'currency' THEN '{"currency":"eur"}'::jsonb
      WHEN 'merchant_code' THEN '{"merchant_code":"M-TEST "}'::jsonb ELSE jsonb_build_object('checkout_reference', upper(r.a::text)) END), 30);
    res := fc_test.release(r.o);
    ASSERT res ->> 'reason' = 'uncertain:get_missing_or_unbound' AND fc_test.vstatus(r.v) = 'reserved', 'SB4-S1 formato ' || k || ': ' || res::text;
  END LOOP;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB4-S1 GET EXPIRED con un campo mancante (8 campi) o formato diverso (valuta/merchant/reference) a regole accese -> uncertain [%]', trim(got);
END $$;

-- SB4-S2 la RPC rifiuta campi di tipo sbagliato (evidence_bad_field) e la fase JS riprova senza quel campo: il campo tolto
-- rende la GET "non legata" -> uncertain (E-E di 60_release.sql copre la whitelist; qui l'effetto sul verdetto)
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'get', (fc_test.gf(r.a, 'EXPIRED') || '{"amount":"10.00"}')::text), 'evidence_bad_field');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED') - 'amount', 110);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'EXPIRED') - 'amount', 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:get_missing_or_unbound' AND fc_test.vstatus(r.v) = 'reserved', 'SB4-S2: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB4-S2 importo stringa -> evidence_bad_field; GET registrata senza importo -> uncertain:get_missing_or_unbound';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-5 PAID tardivo (S16 e D1-08a/b coprono confirm dopo sigillo/banco; qui le combinazioni mancanti)
-- ---------------------------------------------------------------------------------------------------
-- SB5-S1 PAID dopo l'abbandono, PRIMA del sigillo: buono consumato una volta, sigillo rifiutato, rilascio impossibile
DO $$ DECLARE r record; s jsonb; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk('B');
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);
  PERFORM fc_test.set_ages(r.o, 1300);
  s := fc_test.seal(r.o);
  ASSERT (s ->> 'ok')::boolean = false, 'SB5-S1 sigillo rifiutato: ' || s::text;
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'not_sealed', 'SB5-S1 rilascio: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1 AND fc_test.ok_charges(r.o) = 1, 'SB5-S1 un incasso, buono used 1 volta';
  ASSERT fc_test.alog(r.o, 'payment_confirmed_after_abandon') = 1, 'SB5-S1 log Da riconciliare';
  RAISE NOTICE 'PASS SB5-S1 PAID dopo abbandono e prima del sigillo: sigillo rifiutato (%), buono used 1 volta, log payment_confirmed_after_abandon', s ->> 'reason';
END $$;

-- SB5-S2 PAID dopo il sigillo con prove precedenti PENDING (regole accese): la GET PAID successiva vince; confirm doppio idempotente
DO $$ DECLARE r record; res jsonb; res2 jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');                  -- da sole basterebbero per not_payable (pending_after_valid_until)
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PAID'), 5);       -- notifica / GET PAID arrivata dopo
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PAID'), 3);       -- stessa notifica ripetuta
  res := fc_test.release(r.o);
  res2 := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'paid_evidence' AND res2 ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'SB5-S2: ' || res::text;
  ASSERT fc_test.vev(r.v, 'released_after_checkout_evidence') = 0, 'SB5-S2 nessun rilascio';
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);                      -- webhook PAID
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);                      -- webhook ripetuto
  ASSERT fc_test.ok_charges(r.o) = 1 AND fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'SB5-S2 un incasso, buono used 1 volta';
  res := fc_test.release(r.o);
  ASSERT res ->> 'result' = 'already_used', 'SB5-S2 rilascio dopo incasso: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB5-S2 PENDING/PENDING poi PAID (x2): paid_evidence due volte, nessun rilascio; webhook x2 -> 1 incasso, buono used 1 volta, poi already_used';
END $$;

-- SB5-S3 PAID dopo l'incasso al banco su ordine sigillato: un incasso, buono usato una volta, payment_confirm_lost_race (Da riconciliare)
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.reopen_counter(r.o);
  PERFORM fc_test.pay_counter(r.o, s);
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);
  ASSERT fc_test.ok_charges(r.o) = 1 AND fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'SB5-S3 un incasso, buono used 1 volta';
  ASSERT fc_test.alog(r.o, 'payment_confirm_lost_race') = 1, 'SB5-S3 un solo log lost_race: ' || fc_test.alog(r.o, 'payment_confirm_lost_race');
  res := fc_test.release(r.o);
  ASSERT res ->> 'result' = 'already_used', 'SB5-S3 rilascio: ' || res::text;
  RAISE NOTICE 'PASS SB5-S3 banco poi PAID tardivo (x2) su sigillato: 1 incasso, buono used 1 volta, 1 log payment_confirm_lost_race, rilascio already_used';
END $$;

-- SB5-S4 PAID dopo il rilascio P-A con buono gia' riservato su un altro ordine (IMPOSSIBILE in produzione: P-A = nessuna
-- claim = nessuna POST; serve a provare l'invariante "mai due usi dello stesso buono")
DO $$ DECLARE r record; res jsonb; ob public.kitchen_orders; s uuid := fc_test.new_staff(); BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND fc_test.vstatus(r.v) = 'available', 'SB5-S4 rilascio P-A: ' || res::text;
  ob := fc_test.order(r.m, '[{"item_id":"item-009","quantity":1}]', 'counter', r.v);   -- buono riusato su un ordine nuovo
  PERFORM fc_test.confirm(r.a, 'co-late');                                              -- PAID "impossibile" sull'ordine vecchio
  ASSERT fc_test.vstatus(r.v) = 'reserved' AND (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = r.v) = ob.id,
    'SB5-S4 buono resta sul nuovo ordine';
  ASSERT fc_test.alog(r.o, 'food_club_voucher_double_spend') = 1 AND fc_test.alog(r.o, 'payment_confirmed_after_abandon') = 1, 'SB5-S4 log anomalia';
  PERFORM fc_test.pay_counter(ob.id, s);
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vused_on(r.v) = ob.id AND fc_test.vev_to_used(r.v) = 1, 'SB5-S4 buono usato una sola volta (ordine nuovo)';
  RAISE NOTICE 'PASS SB5-S4 PAID dopo rilascio P-A (caso impossibile): buono mai usato due volte, log food_club_voucher_double_spend + payment_confirmed_after_abandon';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-6 duplicati
-- ---------------------------------------------------------------------------------------------------
-- SB6-S1 doppio click: la seconda claim entro la lease non vince (riga NULL -> API 409 checkout_creation_in_progress)
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; c1 public.kitchen_payments; c2 public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); c1 := public.kitchen_payment_attempt_claim_checkout(a);
  PERFORM fc_test.as_service(); c2 := public.kitchen_payment_attempt_claim_checkout(a);
  ASSERT c1.id = a AND c2.id IS NULL, 'SB6-S1 seconda claim persa';
  ASSERT (SELECT count(*) FROM public.food_club_checkout_intents WHERE attempt_id = a) = 0, 'SB6-S1 nessun intento';
  RAISE NOTICE 'PASS SB6-S1 doppia claim concorrente sullo stesso attempt: la seconda restituisce riga NULL (nessun secondo checkout)';
END $$;
-- SB6-S2 List con 2 risultati (duplicato SumUp) su P-C -> uncertain (P-B: S8 di 60_release.sql)
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 2), 20);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_unexpected_count' AND fc_test.vstatus(r.v) = 'reserved', 'SB6-S2: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB6-S2 P-C con List di 2 checkout per lo stesso reference -> uncertain:list_unexpected_count';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- SB-7 valid_until gia' passato
-- ---------------------------------------------------------------------------------------------------
-- SB7-S1 intento a created_at + 14:59.x con created_at frazionario: accettato con valid_until <= now() (troncamento al secondo).
-- Raggiungibile solo se la guardia JS 4:30 e' aggirata (orologi sfasati > 10 min). Registrato come osservazione.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; i jsonb; vu timestamptz; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_orders SET created_at = now() - interval '15 minutes' + interval '0.4 seconds' WHERE id = o.id;
  PERFORM fc_test.fx_replica(false);
  i := fc_test.rpc_intent(a);
  vu := (i ->> 'valid_until')::timestamptz;
  ASSERT vu = date_trunc('second', (SELECT created_at FROM public.kitchen_orders WHERE id = o.id) + interval '15 minutes'), 'SB7-S1 valore troncato';
  RAISE NOTICE 'PASS SB7-S1 intento a 14:59.6: accettato, valid_until=% (gia'' passato: %)', i ->> 'valid_until', vu <= now();
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_orders SET created_at = now() - interval '15 minutes' WHERE id = o.id;
  PERFORM fc_test.fx_replica(false);
  PERFORM fc_test.expect_error(format('SELECT fc_test.start_online(%L)', o.id), 'online_payment_expired');
  ASSERT (SELECT count(*) FROM public.food_club_checkout_intents WHERE order_id = o.id) = 1, 'SB7-S1b nessun intento in piu''';
  RAISE NOTICE 'PASS SB7-S1b a 15:00 nessun attempt/intento nuovo (online_payment_expired prima di intent_too_late; E-I copre intent_too_late)';
END $$;

-- SB7-S2 valid_until passato al POST: SumUp rifiuta (400 -> P-C) o accetta (201 -> P-B); a regole spente mai rilascio
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('C');                         -- 400: provider_ref mai scritto
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early' AND fc_test.vstatus(r.v) = 'reserved', 'SB7-S2 400: ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('B');                         -- 201: checkout creato, poi EXPIRED (config reale)
  res := fc_test.rel2(r.o, r.a, 'EXPIRED', 'EXPIRED');
  ASSERT res ->> 'reason' = 'uncertain:get_missing_or_unbound' AND fc_test.vstatus(r.v) = 'reserved', 'SB7-S2 201: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  res := fc_test.rel2(r.o, r.a, 'EXPIRED', 'EXPIRED');
  ASSERT res ->> 'reason' = 'uncertain:terminal_rule_not_verified' AND fc_test.vstatus(r.v) = 'reserved', 'SB7-S2 201 merchant: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS SB7-S2 valid_until passato: 400 (P-C List vuota) e 201 (P-B EXPIRED) a regole spente -> uncertain, buono reserved';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- INV invarianti trasversali
-- ---------------------------------------------------------------------------------------------------
-- INV-01 dopo il sigillo nessun nuovo checkout: claim e intento rifiutati con food_club_order_sealed (S4/E-I2: dettagli)
-- Su un ordine abbandonato la claim e' fermata PRIMA da Kitchen (order_payment_abandoned); su un ordine annullato con
-- attempt ancora 'initiated' dal trigger Club (food_club_order_sealed, S4). In entrambi i casi nessuna claim scritta.
DO $$ DECLARE r record; t text; c0 timestamptz; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  SELECT checkout_claim_at INTO c0 FROM public.kitchen_payments WHERE id = r.a;
  PERFORM fc_test.as_service();
  t := fc_test.try(format('SELECT public.kitchen_payment_attempt_claim_checkout(%L)', r.a));
  ASSERT t LIKE 'ERR%order_payment_abandoned%' OR t LIKE 'ERR%food_club_order_sealed%', 'INV-01 claim: ' || t;
  ASSERT (SELECT checkout_claim_at FROM public.kitchen_payments WHERE id = r.a) = c0, 'INV-01 claim invariata';
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  PERFORM fc_test.fx_replica(true); UPDATE public.kitchen_payments SET checkout_claim_at = now() - interval '30 seconds' WHERE id = r.a; PERFORM fc_test.fx_replica(false);
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', r.a), 'food_club_order_sealed');
  RAISE NOTICE 'PASS INV-01 ordine sigillato: claim rifiutata (%), intento rifiutato (food_club_order_sealed)', substr(t, 5, 40);
END $$;
