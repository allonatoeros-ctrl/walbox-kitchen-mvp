-- Passo 3A: restituzione sicura del buono (sigillo, intento, evidenze, rilascio, trigger, permessi, retention). S1-S20 + extra.
-- Gira in una transazione con ROLLBACK (run-food-club-sql.sh). Le RPC Club girano col RUOLO REALE service_role
-- (SET LOCAL ROLE + claims via fc_test.as_service()); i test negativi con anon/authenticated reali.
-- S21 (lock_timeout, due sessioni) sta in tests/db/food-club/p3c_release_concorrenza.sh.
--
-- FIXTURE dichiarate (mai usate per aggirare i permessi delle RPC sotto esame):
--  * una sola transazione => now() e' fisso: il tempo che passa si simula RETRODATANDO con
--    session_replication_role = replica (da superuser) created_at dell'ordine, created_at/checkout_claim_at dei
--    pagamenti, valid_until/recorded_at degli intenti (fc_test.set_ages), sealed_at del sigillo e fetched_at delle
--    evidenze. I valori nascono comunque dalle RPC reali; si sposta solo l'orologio.
--  * le costanti di verifica (food_club_release_verified_rules / food_club_expected_merchant_code) sono sostituite
--    DENTRO la transazione con CREATE OR REPLACE (fc_test.rules_set); il ROLLBACK le ripristina.
--  * righe charge extra (INSERT diretto da superuser PRIMA del sigillo) per simulare piu' attempt su un ordine.
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

-- ---------------------------------------------------------------------------------------------------
-- Stato iniziale: costanti spente
-- ---------------------------------------------------------------------------------------------------
DO $$ BEGIN
  ASSERT (SELECT valid_until_verified OR terminal_verified OR list_verified FROM public.food_club_release_verified_rules()) = false,
    'S10a costanti di verifica tutte false';
  ASSERT public.food_club_expected_merchant_code() IS NULL, 'S10a merchant atteso NULL';
  RAISE NOTICE 'PASS S10a costanti di verifica spente (false/false/false) e merchant NULL alla nascita';
END $$;

-- S1 ordine aperto -> sigillo rifiutato
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; r jsonb; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  PERFORM fc_test.start_online(o.id);
  PERFORM fc_test.set_ages(o.id, 1300);
  r := fc_test.seal(o.id);
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' = 'order_open', 'S1 ordine aperto: ' || r::text;
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_release_seals WHERE order_id = o.id), 'S1 nessun sigillo';
  RAISE NOTICE 'PASS S1 ordine aperto: sigillo rifiutato (order_open)';
END $$;

-- S2 meno di 17 minuti -> rifiutato; ordine non pagato/ordine pagato / charge riuscito rifiutati
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk('A');
  res := fc_test.seal(r.o);
  ASSERT (res ->> 'ok')::boolean = false AND res ->> 'reason' = 'too_early', 'S2 < 17 min: ' || res::text;
  PERFORM fc_test.set_ages(r.o, 17 * 60 - 5);
  res := fc_test.seal(r.o);
  ASSERT res ->> 'reason' = 'too_early', 'S2 16:55 ancora presto';
  PERFORM fc_test.set_ages(r.o, 17 * 60 + 5);
  res := fc_test.seal(r.o);
  ASSERT (res ->> 'ok')::boolean = true AND (res ->> 'already_sealed')::boolean = false, 'S2 17:05 sigillato: ' || res::text;
  RAISE NOTICE 'PASS S2 sotto i 17 minuti rifiutato, a 17:05 sigillato';
END $$;
DO $$ DECLARE r record; res jsonb; BEGIN
  -- ordine pagato dopo (late PAID) prima del sigillo: sigillo rifiutato
  SELECT * INTO r FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(r.o, 1300);
  PERFORM fc_test.confirm(r.a);
  res := fc_test.seal(r.o);
  ASSERT (res ->> 'ok')::boolean = false AND res ->> 'reason' = 'charge_succeeded', 'S2b charge riuscito: ' || res::text;
  RAISE NOTICE 'PASS S2b charge succeeded (PAID tardivo) prima del sigillo: sigillo rifiutato';
END $$;

-- S3 claim viva -> rifiutato; claim scaduta (> 20 s) -> sigillato
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk('A');
  PERFORM fc_test.set_ages(r.o, 1300);
  UPDATE public.kitchen_payments SET checkout_claim_at = now() - interval '5 seconds' WHERE id = r.a; -- fixture: claim viva
  res := fc_test.seal(r.o);
  ASSERT (res ->> 'ok')::boolean = false AND res ->> 'reason' = 'claim_in_progress', 'S3 claim viva: ' || res::text;
  UPDATE public.kitchen_payments SET checkout_claim_at = now() - interval '30 seconds' WHERE id = r.a;
  res := fc_test.seal(r.o);
  ASSERT (res ->> 'ok')::boolean = true, 'S3 claim scaduta: sigillo ok ' || res::text;
  RAISE NOTICE 'PASS S3 claim viva (<20 s) blocca il sigillo, claim scaduta no';
END $$;

-- S4 claim reale (kitchen_payment_attempt_claim_checkout) e INSERT charge SumUp su ordine sigillato -> food_club_order_sealed
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; twin public.kitchen_orders; ta uuid;
  res jsonb; c public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;               -- attempt 'initiated', mai richiesto
  PERFORM fc_test.set_ages(o.id, 1300);
  UPDATE public.kitchen_orders SET status = 'cancelled' WHERE id = o.id; -- fixture: annullo "vecchio stile" con attempt ancora initiated
  ASSERT fc_test.vev(v, 'held_until_checkout_expiry') = 1, 'S4 buono trattenuto';
  res := fc_test.seal(o.id);
  ASSERT (res ->> 'ok')::boolean = true, 'S4 sigillo ' || res::text;
  PERFORM fc_test.as_service();
  PERFORM fc_test.expect_error(format('SELECT public.kitchen_payment_attempt_claim_checkout(%L)', a), 'food_club_order_sealed');
  ASSERT (SELECT checkout_claim_at FROM public.kitchen_payments WHERE id = a) IS NULL, 'S4 nessuna claim scritta';
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'app', 'sumup', 'sumup_online', 'charge', 'initiated', 1, 'customer')$q$, o.id), 'food_club_order_sealed');
  -- D1: anche un charge cash/manual su ordine sigillato e' rifiutato; i rimborsi NON sono bloccati (trigger A solo charge).
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'counter', 'cash', 'cash', 'charge', 'failed', 1, 'staff')$q$, o.id), 'food_club_order_sealed');
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'counter', 'manual', 'card_counter_manual', 'charge', 'failed', 1, 'staff')$q$, o.id), 'food_club_order_sealed');
  INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
  VALUES (o.id, 'walrus-main', 'app', 'sumup', 'sumup_online', 'refund', 'failed', 1, 'system');
  -- Gemello non sigillato: la claim funziona normalmente (i trigger non interferiscono).
  twin := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  ta := (fc_test.start_online(twin.id)).id;
  PERFORM fc_test.as_service();
  c := public.kitchen_payment_attempt_claim_checkout(ta);
  ASSERT c.checkout_claim_at IS NOT NULL, 'S4 ordine non sigillato: claim normale';
  RAISE NOTICE 'PASS S4 claim reale e INSERT charge SumUp su ordine sigillato -> food_club_order_sealed; charge cash/manual rifiutati, rimborso e ordini non sigillati liberi';
END $$;

-- S5 evidenza prima di sigillo+60 s -> rifiutata; ordine non sigillato -> rifiutata
DO $$ DECLARE r record; s jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk('B');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'list', '{"http_status":200,"list_count":1}'), 'order_not_sealed');
  PERFORM fc_test.set_ages(r.o, 1300);
  s := fc_test.seal(r.o);
  ASSERT (s ->> 'ok')::boolean, 'S5 sigillo ' || s::text;
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'get', '{"http_status":200}'), 'evidence_too_early');
  PERFORM fc_test.set_sealed(r.o, 59);
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'get', '{"http_status":200}'), 'evidence_too_early');
  PERFORM fc_test.set_sealed(r.o, 61);
  ASSERT fc_test.rpc_evidence(r.a, 'get', '{"http_status":200}') > 0, 'S5 a sigillo+61 s accettata';
  RAISE NOTICE 'PASS S5 evidenza rifiutata se ordine non sigillato o prima di sigillo+60 s, accettata dopo';
END $$;

-- S6 evidenza vecchia (> 120 s) -> uncertain
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 300);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 200);   -- la piu' recente ha 200 s
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'uncertain:get_stale', 'S6 GET vecchie: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'S6 buono ancora riservato';
  -- List vecchia
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 200);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 110);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_missing_or_stale', 'S6 List vecchia: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'S6b buono ancora riservato';
  -- Evidenze prima di sigillo + 60 s (fetched_at antecedente): non contano
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.set_sealed(r.o, 100);                      -- sigillato 100 s fa
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 90);   -- fetched 90 s fa < sealed+60 (= 40 s fa)
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:second_get_missing', 'S6c GET anteriore a sigillo+60 s ignorata: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'reserved';
  RAISE NOTICE 'PASS S6 evidenze vecchie (>120 s) o anteriori a sigillo+60 s -> uncertain, buono riservato';
END $$;

-- S7 attempt in piu' senza evidenza -> uncertain
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B', 'claimed');     -- 2 attempt: B completo di prove + extra con claim e senza intento
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:no_intent' AND fc_test.vstatus(r.v) = 'reserved', 'S7 attempt extra con claim senza intento: ' || res::text;
  ASSERT jsonb_array_length(res -> 'verdicts') = 2, 'S7 due verdetti';
  -- Provider sconosciuto (satispay) -> uncertain
  SELECT * INTO r FROM fc_test.mk('A');
  INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    SELECT r.o, venue_id, 'app', 'satispay', 'satispay_app', 'charge', 'failed', total, 'customer' FROM public.kitchen_orders WHERE id = r.o;
  PERFORM fc_test.set_ages(r.o, 1300);
  PERFORM fc_test.seal(r.o); PERFORM fc_test.set_sealed(r.o, 600);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:unknown_provider' AND fc_test.vstatus(r.v) = 'reserved', 'S7 provider sconosciuto: ' || res::text;
  RAISE NOTICE 'PASS S7 attempt senza prova (extra con claim, provider sconosciuto) -> uncertain, nessun rilascio';
END $$;

-- S8 legami rotti (reference, importo, merchant, checkout_id, valuta, valid_until, HTTP, List) -> uncertain
DO $$ DECLARE r record; res jsonb; k text; over jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  FOREACH k IN ARRAY ARRAY['checkout_reference', 'amount', 'merchant_code', 'checkout_id', 'currency', 'valid_until', 'http_status'] LOOP
    SELECT * INTO r FROM fc_test.mk_sealed('B');
    over := CASE k
      WHEN 'checkout_reference' THEN jsonb_build_object(k, gen_random_uuid()::text)
      WHEN 'amount' THEN jsonb_build_object(k, 99.99)
      WHEN 'merchant_code' THEN jsonb_build_object(k, 'ALTRO')
      WHEN 'checkout_id' THEN jsonb_build_object(k, 'co-altro')
      WHEN 'currency' THEN jsonb_build_object(k, 'USD')
      WHEN 'valid_until' THEN jsonb_build_object(k, now() + interval '1 hour')
      ELSE jsonb_build_object(k, 500) END;
    PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 110);
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING', over), 30);   -- la GET recente e' sbagliata -> la precedente non ha una "recente" legata
    PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING', over), 100);
    res := fc_test.release(r.o);
    ASSERT (res ->> 'released')::boolean = false AND fc_test.vstatus(r.v) = 'reserved' AND res ->> 'reason' LIKE 'uncertain:%',
      'S8 ' || k || ' non legato -> uncertain: ' || res::text;
  END LOOP;
  -- merchant atteso NULL (default): nessun legame possibile
  PERFORM fc_test.rules_set(true, true, true, NULL);
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:get_missing_or_unbound' AND fc_test.vstatus(r.v) = 'reserved', 'S8 merchant atteso NULL: ' || res::text;
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  -- List non coerente: count 2 oppure checkout_id diverso
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 2), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 110);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_mismatch' AND fc_test.vstatus(r.v) = 'reserved', 'S8 List con 2 risultati: ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1, '{"checkout_id":"co-altro"}'), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 110);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_mismatch', 'S8 List con checkout_id diverso: ' || res::text;
  RAISE NOTICE 'PASS S8 legami rotti (reference, importo, merchant, checkout_id, valuta, valid_until, HTTP, List, merchant NULL) -> uncertain';
END $$;

-- S9 PAID in una evidenza -> nessun rilascio (anche con regole accese e prove altrimenti perfette)
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PAID');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'S9 PAID: ' || res::text;
  ASSERT (SELECT last_reason FROM public.food_club_release_seals WHERE order_id = r.o) = 'paid_evidence', 'S9 last_reason';
  -- PAID anche in un'evidenza vecchia o non legata: blocca comunque
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'paid', '{"merchant_code":"ALTRO"}'), 500);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'paid_evidence' AND fc_test.vstatus(r.v) = 'reserved', 'S9b PAID vecchio/non legato blocca: ' || res::text;
  -- Un attempt PAID su due: nessun rilascio
  SELECT * INTO r FROM fc_test.mk_sealed('A', 'never');
  PERFORM fc_test.ev(r.a, 'get', '{"http_status":200,"sumup_status":"PAID"}'::jsonb, 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'paid_evidence', 'S9c PAID su un attempt di P-A: ' || res::text;
  RAISE NOTICE 'PASS S9 PAID in qualunque evidenza dell''attempt -> nessun rilascio (paid_evidence)';
END $$;

-- S10 costanti false: mai rilascio anche con prove perfette (P-B e P-C)
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(false, false, false, NULL);
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean = false AND fc_test.vstatus(r.v) = 'reserved' AND res ->> 'reason' = 'uncertain:get_missing_or_unbound',
    'S10 P-B default: ' || res::text;
  -- Merchant noto ma regole spente
  PERFORM fc_test.rules_set(false, false, false, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:valid_until_rule_not_verified' AND fc_test.vstatus(r.v) = 'reserved', 'S10 P-B PENDING regole spente: ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'FAILED', 'EXPIRED');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:terminal_rule_not_verified' AND fc_test.vstatus(r.v) = 'reserved', 'S10 P-B terminale regole spente: ' || res::text;
  -- P-C: List vuota con regole spente
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early' AND fc_test.vstatus(r.v) = 'reserved', 'S10 P-C List vuota regole spente: ' || res::text;
  -- Una sola regola accesa non basta (P-C richiede list_verified E valid_until_verified)
  PERFORM fc_test.rules_set(true, true, false, 'M-TEST');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early', 'S10 P-C senza list_verified: ' || res::text;
  PERFORM fc_test.rules_set(false, true, true, 'M-TEST');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:list_empty_rules_off_or_too_early', 'S10 P-C senza valid_until_verified: ' || res::text;
  ASSERT (SELECT checks FROM public.food_club_release_seals WHERE order_id = r.o) = 3, 'S10 checks incrementati';
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS S10 costanti false: nessun rilascio con prove perfette (P-B default, P-B regole spente, P-C)';
END $$;

-- S11 costanti true (override nella transazione) + tutto not_payable -> rilascio + un solo evento
DO $$ DECLARE r record; res jsonb; ev jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  -- (a) P-B due GET PENDING dopo valid_until
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND res ->> 'voucher_status' = 'available', 'S11a: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'available' AND fc_test.vev(r.v, 'released_after_checkout_evidence') = 1, 'S11a stato/evento';
  SELECT metadata INTO ev FROM public.food_club_voucher_events WHERE voucher_id = r.v AND event = 'released_after_checkout_evidence';
  ASSERT jsonb_array_length(ev -> 'evidence_ids') = 3, 'S11a l''evento cita le 3 evidenze usate';
  ASSERT (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = r.v) IS NULL, 'S11a reserved_order_id NULL';
  -- (b) P-B terminale
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'FAILED', 'EXPIRED');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND fc_test.vstatus(r.v) = 'available', 'S11b: ' || res::text;
  -- (c) P-C List vuota
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND fc_test.vstatus(r.v) = 'available', 'S11c: ' || res::text;
  -- (d) P-C List con 1 checkout + due GET (fase A, migration 20261109108000: CANCELLED non e' uno stato di checkout
  -- documentato da SumUp -> la coppia terminale usa FAILED/EXPIRED; FAILED/CANCELLED resta incerta, vedi d2)
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.std(r.a, 'FAILED', 'EXPIRED');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND fc_test.vstatus(r.v) = 'available', 'S11d: ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('C');
  PERFORM fc_test.std(r.a, 'FAILED', 'CANCELLED');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:states_not_concordant' AND fc_test.vstatus(r.v) = 'reserved', 'S11d2 CANCELLED: ' || res::text;
  -- (e) due attempt: P-B completo + riga extra mai richiesta (P-A)
  SELECT * INTO r FROM fc_test.mk_sealed('B', 'never');
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND jsonb_array_length(res -> 'verdicts') = 2, 'S11e: ' || res::text;
  -- (f) GET troppo vicine (< 60 s) -> uncertain
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 1), 20);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 80);
  PERFORM fc_test.ev(r.a, 'get', fc_test.gf(r.a, 'PENDING'), 30);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:second_get_missing' AND fc_test.vstatus(r.v) = 'reserved', 'S11f GET a 50 s: ' || res::text;
  -- (g) stati discordi
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.std(r.a, 'PENDING', 'FAILED');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:states_not_concordant' AND fc_test.vstatus(r.v) = 'reserved', 'S11g: ' || res::text;
  -- (h) valid_until non scaduto da almeno 2 minuti rispetto alla GET precedente
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  PERFORM fc_test.set_ages(r.o, 1020 + 60);    -- valid_until = created + 15 min = 3 min fa... GET precedente a 110 s fa => 70 s dopo: < 2 min
  PERFORM fc_test.std(r.a, 'PENDING', 'PENDING');
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:states_not_concordant' AND fc_test.vstatus(r.v) = 'reserved', 'S11h valid_until troppo recente: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS S11 costanti true (override): P-B PENDING/terminale, P-C vuota/1 checkout, due attempt -> rilascio e un evento; GET vicine/discordi/valid_until recente -> nessun rilascio';
END $$;

-- S12 idempotenza
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean, 'S12 primo rilascio P-A: ' || res::text;
  res := fc_test.release(r.o);
  ASSERT (res ->> 'ok')::boolean AND res ->> 'result' = 'already_released' AND (res ->> 'released')::boolean = false, 'S12 secondo: ' || res::text;
  ASSERT fc_test.vev(r.v, 'released_after_checkout_evidence') = 1, 'S12 un solo evento';
  ASSERT (fc_test.seal(r.o) ->> 'already_sealed')::boolean, 'S12 sigillo idempotente';
  ASSERT (SELECT count(*) FROM public.food_club_release_seals WHERE order_id = r.o) = 1;
  -- il buono rilasciato e poi riservato altrove: il rilascio dell'ordine vecchio non lo tocca
  UPDATE public.food_club_vouchers SET status = 'reserved', reserved_order_id = (fc_test.order(fc_test.new_member(), '[{"item_id":"item-009","quantity":1}]', 'counter')).id, reserved_at = now() WHERE id = r.v;
  res := fc_test.release(r.o);
  ASSERT res ->> 'result' = 'already_released' AND fc_test.vev(r.v, 'released_after_checkout_evidence') = 1, 'S12 riservato altrove: nessuna scrittura';
  RAISE NOTICE 'PASS S12 idempotenza: secondo rilascio e secondo sigillo no-op, un solo evento';
END $$;

-- S13 buono scaduto -> expired
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 hour' WHERE id = r.v;
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND res ->> 'voucher_status' = 'expired' AND fc_test.vstatus(r.v) = 'expired', 'S13: ' || res::text;
  ASSERT (SELECT to_status FROM public.food_club_voucher_events WHERE voucher_id = r.v AND event = 'released_after_checkout_evidence') = 'expired';
  RAISE NOTICE 'PASS S13 buono scaduto durante la trattenuta -> expired (un evento)';
END $$;

-- S14 permessi: anon / authenticated reali
DO $$ DECLARE rl text; f text; t text; ok boolean; BEGIN
  FOREACH rl IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH f IN ARRAY ARRAY[
      $f$SELECT public.food_club_seal_order_for_release('x')$f$,
      $f$SELECT public.food_club_release_voucher_after_evidence('x')$f$,
      $f$SELECT public.food_club_record_checkout_intent(gen_random_uuid())$f$,
      $f$SELECT public.food_club_record_checkout_evidence(gen_random_uuid(), 'get', '{}'::jsonb)$f$,
      $f$SELECT * FROM public.food_club_release_verified_rules()$f$,
      $f$SELECT public.food_club_expected_merchant_code()$f$,
      $f$SELECT public.food_club_evidence_normalize('{}'::jsonb)$f$,
      $f$SELECT public.food_club_retention_sweep()$f$] LOOP
      ok := false;
      BEGIN
        EXECUTE format('SET LOCAL ROLE %I', rl);
        EXECUTE f;
      EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
      EXECUTE 'RESET ROLE';
      ASSERT ok, format('S14 %s puo'' eseguire: %s', rl, f);
    END LOOP;
    FOREACH t IN ARRAY ARRAY['food_club_release_seals', 'food_club_checkout_intents', 'food_club_checkout_evidence'] LOOP
      FOREACH f IN ARRAY ARRAY['SELECT count(*) FROM public.%I', 'DELETE FROM public.%I', 'UPDATE public.%I SET order_id = order_id'] LOOP
        ok := false;
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', rl);
          EXECUTE format(f, t);
        EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
        EXECUTE 'RESET ROLE';
        ASSERT ok, format('S14 %s accede a %s (%s)', rl, t, f);
      END LOOP;
    END LOOP;
    ok := false;
    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', rl);
      PERFORM nextval('public.food_club_checkout_evidence_id_seq');
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    EXECUTE 'RESET ROLE';
    ASSERT ok, 'S14 sequenza accessibile a ' || rl;
  END LOOP;
  -- Con claims service_role MA ruolo anon: la guardia di grant vince (EXECUTE negato prima del corpo)
  PERFORM fc_test.as_service();
  ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.food_club_seal_order_for_release('x');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  ASSERT ok, 'S14 anon con claim service_role forgiato';
  -- authenticated con claims utente: la guardia interna (se il grant ci fosse) darebbe service_role_only
  -- service_role: EXECUTE ammesso sulle 4 RPC
  ASSERT has_function_privilege('service_role', 'public.food_club_seal_order_for_release(text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.food_club_release_voucher_after_evidence(text)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.food_club_record_checkout_intent(uuid)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.food_club_record_checkout_evidence(uuid, text, jsonb)', 'EXECUTE'), 'S14 service_role deve poter eseguire le 4 RPC';
  ASSERT NOT has_function_privilege('service_role', 'public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz)', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.food_club_seal_guard_insert()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.food_club_seal_guard_claim()', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.food_club_evidence_normalize(jsonb)', 'EXECUTE'), 'S14 funzioni interne/trigger non eseguibili da service_role';
  RAISE NOTICE 'PASS S14 anon/authenticated: permission denied su 8 funzioni, 3 tabelle (SELECT/DELETE/UPDATE) e sequenza; service_role solo sulle 4 RPC';
END $$;
-- Guardia interna: chiamata con ruolo DB service_role ma claim non service_role
DO $$ BEGIN
  PERFORM fc_test.as_user(fc_test.new_user(false), 'authenticated');
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM public.food_club_seal_order_for_release('x');
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'S14 guardia interna assente';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    ASSERT SQLERRM = 'service_role_only', 'S14 guardia interna: ' || SQLERRM;
  END;
  RAISE NOTICE 'PASS S14b guardia interna service_role_only anche con il ruolo DB giusto';
END $$;

-- S15 ordine sigillato che si "riapre" (UPDATE status come staff UI vecchia): nessun errore Kitchen, il rilascio rifiuta
DO $$ DECLARE r record; res jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  UPDATE public.kitchen_orders SET status = 'pending_online_payment' WHERE id = r.o;   -- riapertura (transizione consentita da Kitchen)
  ASSERT fc_test.ostatus(r.o) LIKE 'pending_online_payment|%', 'S15 riaperto senza errori';
  res := fc_test.release(r.o);
  ASSERT (res ->> 'ok')::boolean = false AND res ->> 'reason' = 'order_not_closed' AND fc_test.vstatus(r.v) = 'reserved', 'S15 rilascio rifiutato: ' || res::text;
  -- sull'ordine riaperto (qui in cucina, come farebbe uno staff vecchio) non nasce un nuovo attempt SumUp online
  -- (effetto voluto del sigillo; i controlli Kitchen vengono prima, quindi uso uno stato che li supera).
  UPDATE public.kitchen_orders SET status = 'cancelled' WHERE id = r.o;
  UPDATE public.kitchen_orders SET status = 'received' WHERE id = r.o;
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'order_not_closed' AND fc_test.vstatus(r.v) = 'reserved', 'S15 riaperto in cucina: rilascio rifiutato ' || res::text;
  PERFORM fc_test.as_user((SELECT customer_id FROM public.kitchen_orders WHERE id = r.o));
  PERFORM fc_test.expect_error(format($q$SELECT public.kitchen_payment_attempt_start(%L, 'app', 'sumup', 'sumup_online', %s, 'k15')$q$, r.o,
    (SELECT total FROM public.kitchen_orders WHERE id = r.o)), 'food_club_order_sealed');
  -- ...il banco non e' toccato dal Club: stesso esito che ha un gemello non sigillato (qualunque sia, preesistente a Kitchen)
  RAISE NOTICE 'PASS S15 riapertura di un ordine sigillato: UPDATE Kitchen senza errori, rilascio rifiutato (order_not_closed), nuovo attempt SumUp bloccato (food_club_order_sealed)';
END $$;

-- S16 confirm (PAID tardivo su attempt esistente), refund e record_counter come su un gemello (fix D1: 20261109107000)
DO $$ DECLARE r record; g record; res jsonb; s uuid := fc_test.new_staff(); rc_s text; rc_g text; rf_s text; rf_g text; BEGIN
  -- confirm tardivo (PAID dopo sigillo): buono used / consumed_on_late_charge, esattamente come VT2
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  SELECT * INTO g FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(g.o, 1300);                     -- gemello: stessa storia, NESSUN sigillo
  PERFORM fc_test.confirm(r.a);
  PERFORM fc_test.confirm(g.a);
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vstatus(g.v) = 'used', 'S16 buono used in entrambi';
  ASSERT fc_test.vev(r.v, 'consumed_on_late_charge') = 1 AND fc_test.vev(g.v, 'consumed_on_late_charge') = 1, 'S16 evento late in entrambi';
  ASSERT fc_test.ostatus(r.o) = fc_test.ostatus(g.o), 'S16 stesso stato ordine: ' || fc_test.ostatus(r.o) || ' vs ' || fc_test.ostatus(g.o);
  ASSERT fc_test.alog(r.o, 'payment_confirmed_after_abandon') = fc_test.alog(g.o, 'payment_confirmed_after_abandon'), 'S16 stesso log K2';
  res := fc_test.release(r.o);
  ASSERT res ->> 'result' = 'already_used' AND fc_test.vev(r.v, 'released_after_checkout_evidence') = 0, 'S16 rilascio dopo PAID: already_used ' || res::text;
  -- confirm ripetuto (webhook doppio) su sigillato: idempotente
  PERFORM fc_test.confirm(r.a);
  ASSERT fc_test.vev(r.v, 'consumed_on_late_charge') = 1, 'S16 webhook doppio';
  -- refund tardivo: stesso esito del gemello
  rf_s := fc_test.try(format('SELECT fc_test.refund(%L, %L)', r.o, s));
  rf_g := fc_test.try(format('SELECT fc_test.refund(%L, %L)', g.o, s));
  ASSERT rf_s = rf_g, format('S16 refund identico: sigillato=%s gemello=%s', rf_s, rf_g);
  -- record_counter su ordine chiuso+sigillato vs gemello (nessun attempt di cui parlare): stesso esito
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  SELECT * INTO g FROM fc_test.mk('A');
  PERFORM fc_test.set_ages(g.o, 1300);
  rc_s := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s));
  rc_g := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', g.o, s));
  -- FIX D1 (20261109107000): con il buono ancora riservato il sigillo non aggiunge blocchi al banco. Decide Kitchen,
  -- come sul gemello (ordine PA: online_order_paid_status_conflict). Il blocco Club resta solo a buono restituito
  -- (tests/db/food-club/90_d1_banco.sql D1-S1, 80_held_staff.sql D3).
  ASSERT rc_s = rc_g, format('S16 record_counter: sigillato=%s gemello=%s', rc_s, rc_g);
  ASSERT rc_s NOT LIKE '%food_club_order_sealed%', format('S16 record_counter su sigillato con buono riservato: %s', rc_s);
  ASSERT fc_test.vstatus(r.v) = 'reserved' AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments WHERE order_id = r.o AND provider = 'cash'), 'S16 sigillato: nessun charge cash, buono invariato';
  RAISE NOTICE 'PASS S16 confirm (PAID tardivo, doppio) e refund = gemello; record_counter su sigillato = gemello [refund: %; record_counter: %]', left(rf_s, 40), left(rc_s, 40);
END $$;

-- S17 P-A: attempt mai richiesto -> not_payable e rilascio anche con costanti false
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(false, false, false, NULL);
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean AND (res -> 'verdicts' -> 0 ->> 'reason') = 'never_requested' AND fc_test.vstatus(r.v) = 'available', 'S17: ' || res::text;
  -- P-A con un intento presente (impossibile in produzione) -> uncertain
  SELECT * INTO r FROM fc_test.mk('C');
  PERFORM fc_test.set_ages(r.o, 1300);
  PERFORM fc_test.seal(r.o); PERFORM fc_test.set_sealed(r.o, 600);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_payments SET checkout_claim_at = NULL WHERE id = r.a;   -- fixture: claim azzerata (non accade mai nel codice)
  PERFORM fc_test.fx_replica(false);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:intent_without_claim' AND fc_test.vstatus(r.v) = 'reserved', 'S17 intento senza claim: ' || res::text;
  -- solo cash/manual dopo l'abbandono: nessuna prova -> no_payment_proof
  RAISE NOTICE 'PASS S17 P-A (checkout mai richiesto): rilascio senza costanti; intento senza claim -> uncertain';
END $$;

-- S18 P-C senza intento -> uncertain
DO $$ DECLARE r record; res jsonb; BEGIN
  PERFORM fc_test.rules_set(true, true, true, 'M-TEST');
  SELECT * INTO r FROM fc_test.mk_sealed('C0');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'uncertain:no_intent' AND fc_test.vstatus(r.v) = 'reserved', 'S18 claim senza intento: ' || res::text;
  PERFORM fc_test.rules_set(false, false, false, NULL);
  RAISE NOTICE 'PASS S18 claim senza intento (attempt vecchio) -> uncertain per sempre, nessun rilascio';
END $$;

-- S19 service_role non scrive direttamente; neanche il superuser altera orari/prove
DO $$ DECLARE r record; t text; ok boolean; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  FOREACH t IN ARRAY ARRAY['food_club_release_seals', 'food_club_checkout_intents', 'food_club_checkout_evidence'] LOOP
    ok := false;
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      PERFORM count(*) FROM public.food_club_release_seals;   -- SELECT ammesso
      EXECUTE format('DELETE FROM public.%I', t);
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    EXECUTE 'RESET ROLE';
    ASSERT ok, 'S19 service_role DELETE su ' || t;
    ok := false;
    BEGIN
      EXECUTE 'SET LOCAL ROLE service_role';
      EXECUTE format('UPDATE public.%I SET order_id = order_id', t);
    EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
    EXECUTE 'RESET ROLE';
    ASSERT ok, 'S19 service_role UPDATE su ' || t;
  END LOOP;
  ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO public.food_club_release_seals (order_id, voucher_id) VALUES (r.o, r.v);
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  ASSERT ok, 'S19 service_role INSERT sigilli';
  ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO public.food_club_checkout_evidence (order_id, attempt_id, kind) VALUES (r.o, r.a, 'get');
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  ASSERT ok, 'S19 service_role INSERT evidenze';
  ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    INSERT INTO public.food_club_checkout_intents (attempt_id, order_id, valid_until) VALUES (r.a, r.o, now());
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  ASSERT ok, 'S19 service_role INSERT intenti';
  ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    TRUNCATE public.food_club_checkout_evidence;
  EXCEPTION WHEN insufficient_privilege THEN ok := true; END;
  EXECUTE 'RESET ROLE';
  ASSERT ok, 'S19 service_role TRUNCATE';
  ASSERT has_table_privilege('service_role', 'public.food_club_release_seals', 'SELECT'), 'S19 service_role legge';
  -- Superuser: i trigger vietano comunque UPDATE di sealed_at / fetched_at e DELETE di prove recenti
  PERFORM fc_test.expect_error(format('UPDATE public.food_club_release_seals SET sealed_at = now() WHERE order_id = %L', r.o), 'food_club_release_seal_immutable');
  PERFORM fc_test.expect_error(format('UPDATE public.food_club_release_seals SET voucher_id = gen_random_uuid() WHERE order_id = %L', r.o), 'food_club_release_seal_immutable');
  PERFORM fc_test.expect_error(format('DELETE FROM public.food_club_release_seals WHERE order_id = %L', r.o), 'food_club_release_seal_immutable');
  PERFORM fc_test.expect_error('UPDATE public.food_club_checkout_evidence SET fetched_at = now()', 'food_club_release_append_only');
  PERFORM fc_test.expect_error('UPDATE public.food_club_checkout_evidence SET sumup_status = ''FAILED''', 'food_club_release_append_only');
  PERFORM fc_test.expect_error('DELETE FROM public.food_club_checkout_evidence', 'food_club_release_append_only');
  PERFORM fc_test.expect_error('UPDATE public.food_club_checkout_intents SET valid_until = now()', 'food_club_release_append_only');
  PERFORM fc_test.expect_error('DELETE FROM public.food_club_checkout_intents', 'food_club_release_append_only');
  -- consentito: i soli campi di bookkeeping del sigillo
  UPDATE public.food_club_release_seals SET checks = checks + 1, last_check_at = now(), last_reason = 'x' WHERE order_id = r.o;
  PERFORM fc_test.expect_error(format('UPDATE public.food_club_release_seals SET checks = 0 WHERE order_id = %L', r.o), 'food_club_release_seal_immutable');
  RAISE NOTICE 'PASS S19 service_role: solo SELECT sulle 3 tabelle; superuser: sealed_at/fetched_at/prove immutabili, DELETE recente vietato';
END $$;

-- S20 tetto giornaliero (20 rilasci in 24 h)
DO $$ DECLARE r record; res jsonb; w record; i int; BEGIN
  SELECT * INTO w FROM fc_test.mk_sealed('A');   -- buono "ospite" per gli eventi del tetto
  FOR i IN 1..(19 - (SELECT count(*)::int FROM public.food_club_voucher_events WHERE event = 'released_after_checkout_evidence' AND created_at > now() - interval '24 hours')) LOOP
    INSERT INTO public.food_club_voucher_events (voucher_id, from_status, to_status, event, order_id, actor)
    VALUES (w.v, 'reserved', 'available', 'released_after_checkout_evidence', 'cap-' || i, 'system');
  END LOOP;
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean, 'S20 19 eventi: il ventesimo rilascio passa ' || res::text;
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean = false AND res ->> 'reason' = 'release_cap_reached', 'S20 al 21esimo: ' || res::text;
  ASSERT fc_test.vstatus(r.v) = 'reserved' AND fc_test.alog(r.o, 'food_club_release_cap_reached') = 1, 'S20 buono riservato + log staff';
  res := fc_test.release(r.o);
  ASSERT res ->> 'reason' = 'release_cap_reached' AND fc_test.alog(r.o, 'food_club_release_cap_reached') = 1, 'S20 log una sola volta';
  -- eventi vecchi (> 24 h) non contano
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_voucher_events SET created_at = now() - interval '25 hours' WHERE event = 'released_after_checkout_evidence' AND order_id LIKE 'cap-%';
  PERFORM fc_test.fx_replica(false);
  res := fc_test.release(r.o);
  ASSERT (res ->> 'released')::boolean, 'S20 eventi > 24 h non contano: ' || res::text;
  RAISE NOTICE 'PASS S20 tetto 20 rilasci/24 h: rifiuto + log food_club_release_cap_reached una volta; eventi > 24 h esclusi';
END $$;

-- E-I intento pre-POST: rifiuti, idempotenza, too_late
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; i1 jsonb; i2 jsonb; w public.kitchen_orders; wa uuid; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', gen_random_uuid()), 'attempt_not_found');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', a), 'claim_missing');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  i1 := fc_test.rpc_intent(a);
  ASSERT i1 ->> 'valid_until' = to_char(date_trunc('second', o.created_at + interval '15 minutes') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'E-I valid_until = created_at + 15 min (troncato al secondo, UTC): ' || i1::text;
  i2 := fc_test.rpc_intent(a);
  ASSERT i2 ->> 'valid_until' = i1 ->> 'valid_until' AND (i2 ->> 'already_recorded')::boolean, 'E-I idempotente';
  ASSERT (SELECT count(*) FROM public.food_club_checkout_intents WHERE attempt_id = a) = 1, 'E-I una sola riga';
  -- provider_ref presente
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_set_provider_ref(a, 'co-x');
  -- ordine senza buono
  w := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  wa := (fc_test.start_online(w.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(wa);
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', wa), 'no_reserved_voucher');
  -- too late: ordine con buono creato 16 minuti fa
  o := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]', 'online', fc_test.mkv(m));
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  PERFORM fc_test.backdate(o.id, now() - interval '14 minutes 59 seconds');
  ASSERT (fc_test.rpc_intent(a) ->> 'valid_until') IS NOT NULL, 'E-I a 14:59 ancora ok';
  o := fc_test.order(m, '[{"item_id":"item-011","quantity":1}]', 'online', fc_test.mkv(m));
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  PERFORM fc_test.backdate(o.id, now() - interval '15 minutes');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', a), 'intent_too_late');
  -- attempt non SumUp
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.rpc_intent((SELECT id FROM public.kitchen_payments WHERE order_id = %L AND provider = 'cash' LIMIT 1))$q$, w.id), 'attempt_not_found');
  RAISE NOTICE 'PASS E-I intento: attempt_not_found, claim_missing, no_reserved_voucher, intent_too_late (15:00), idempotente, valid_until DB troncato al secondo';
END $$;
DO $$ DECLARE r record; BEGIN
  -- intento su ordine sigillato / con provider_ref gia' valorizzato
  SELECT * INTO r FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(r.o, 1300);
  PERFORM fc_test.seal(r.o);
  -- l'intento c'era gia': ritorna l'esistente (idempotente) anche su sigillato
  ASSERT (fc_test.rpc_intent(r.a) ->> 'already_recorded')::boolean, 'E-I intento esistente restituito';
  SELECT * INTO r FROM fc_test.mk('C0');
  PERFORM fc_test.set_ages(r.o, 1300);
  PERFORM fc_test.seal(r.o);
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', r.a), 'food_club_order_sealed');
  RAISE NOTICE 'PASS E-I2 intento nuovo su ordine sigillato rifiutato, esistente restituito';
END $$;
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a uuid; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_claim_checkout(a);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attempt_set_provider_ref(a, 'co-y');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_intent(%L)', a), 'provider_ref_present');
  RAISE NOTICE 'PASS E-I3 provider_ref gia'' presente: intento rifiutato';
END $$;

-- E-E whitelist evidenze: cast errati, campi extra ignorati, fetched_at non sovrascrivibile, order_id dal DB
DO $$ DECLARE r record; eid bigint; ev public.food_club_checkout_evidence; k text; bad jsonb; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('B');
  FOREACH bad IN ARRAY ARRAY['{"http_status":"abc"}'::jsonb, '{"http_status":200.5}', '{"amount":"x"}', '{"amount":12.345}',
      '{"valid_until":"non-una-data"}', '{"valid_until":5}', '{"list_count":-1}', '{"list_count":"1"}', '{"body_sha256":"zz"}',
      '{"checkout_id":5}', '{"sumup_status":["PAID"]}', '{"currency":"EUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUREUR"}'] LOOP
    PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'get', bad), 'evidence_bad_field');
  END LOOP;
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'get', '[1,2]'), 'evidence_bad_field');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, NULL::jsonb)', r.a, 'get'), 'evidence_bad_field');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', r.a, 'post', '{}'), 'evidence_bad_kind');
  PERFORM fc_test.expect_error(format('SELECT fc_test.rpc_evidence(%L, %L, %L::jsonb)', gen_random_uuid(), 'get', '{}'), 'attempt_not_found');
  ASSERT (SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = r.a) = 0, 'E-E nessuna riga dai rifiuti';
  eid := fc_test.rpc_evidence(r.a, 'get', jsonb_build_object('http_status', 200, 'sumup_status', 'PENDING', 'amount', 8.9,
    'fetched_at', '2000-01-01T00:00:00Z', 'order_id', 'ORDINE-ALTRUI', 'id', 7, 'attempt_id', gen_random_uuid(), 'kind', 'list',
    'pan', '4111111111111111', 'body_sha256', repeat('a', 64), 'valid_until', '2026-11-08T20:15:00+00:00', 'checkout_id', NULL));
  SELECT * INTO ev FROM public.food_club_checkout_evidence WHERE id = eid;
  ASSERT ev.order_id = r.o, 'E-E order_id dal DB, non dal chiamante';
  ASSERT ev.attempt_id = r.a AND ev.kind = 'get', 'E-E attempt/kind dai parametri';
  ASSERT ev.fetched_at > now() - interval '1 minute', 'E-E fetched_at sempre dal DB';
  ASSERT ev.http_status = 200 AND ev.sumup_status = 'PENDING' AND ev.amount = 8.9 AND ev.checkout_id IS NULL, 'E-E campi tipizzati';
  ASSERT ev.valid_until = '2026-11-08T20:15:00Z'::timestamptz AND ev.body_sha256 = repeat('a', 64), 'E-E valid_until e hash';
  -- campi extra non finiscono da nessuna parte (la tabella non ha colonne per pan ecc.)
  ASSERT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'food_club_checkout_evidence' AND column_name IN ('raw', 'body', 'payload', 'pan', 'card')), 'E-E nessun dato carta/raw';
  -- attempt di rimborso non ammesso
  RAISE NOTICE 'PASS E-E whitelist evidenze: cast errati -> evidence_bad_field, extra ignorati, fetched_at/order_id dal DB, nessun raw';
END $$;

-- E-R retention 90 giorni: una prova necessaria a un buono riservato NON si cancella, anche se vecchia
DO $$ DECLARE r record; ret jsonb; n int; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_checkout_evidence SET fetched_at = now() - interval '100 days' WHERE attempt_id = r.a;
  UPDATE public.food_club_release_seals SET sealed_at = now() - interval '100 days' WHERE order_id = r.o;
  INSERT INTO public.food_club_checkout_intents (attempt_id, order_id, valid_until, recorded_at)
    VALUES (r.a, r.o, now() - interval '100 days', now() - interval '100 days');
  PERFORM fc_test.fx_replica(false);
  ret := fc_test.retention();
  ASSERT (ret ->> 'release_evidence')::int = 0 AND (ret ->> 'release_intents')::int = 0 AND (ret ->> 'release_seals')::int = 0, 'E-R buono riservato: niente cancellato ' || ret::text;
  ASSERT (SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = r.a) = 1
     AND (SELECT count(*) FROM public.food_club_release_seals WHERE order_id = r.o) = 1, 'E-R prove ancora presenti';
  PERFORM fc_test.expect_error(format('DELETE FROM public.food_club_checkout_evidence WHERE attempt_id = %L', r.a), 'food_club_release_append_only');
  PERFORM fc_test.expect_error(format('DELETE FROM public.food_club_release_seals WHERE order_id = %L', r.o), 'food_club_release_seal_immutable');
  -- Comportamento esistente invariato: chiavi precedenti presenti
  ASSERT ret ? 'tickets' AND ret ? 'events' AND ret ? 'messages', 'E-R chiavi preesistenti';
  -- Rilascio -> buono non piu' riservato -> la retention cancella le prove vecchie, ma non quelle recenti
  UPDATE public.food_club_vouchers SET status = 'available', reserved_order_id = NULL, reserved_at = NULL WHERE id = r.v;
  SELECT * INTO r FROM fc_test.mk_sealed('A');           -- altro ordine con prove recenti e buono riservato
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  ret := fc_test.retention();
  ASSERT (ret ->> 'release_evidence')::int = 1 AND (ret ->> 'release_intents')::int = 1 AND (ret ->> 'release_seals')::int = 1, 'E-R dopo il rilascio: cancellate le prove > 90 giorni ' || ret::text;
  SELECT count(*) INTO n FROM public.food_club_checkout_evidence WHERE attempt_id = r.a;
  ASSERT n = 1 AND (SELECT count(*) FROM public.food_club_release_seals WHERE order_id = r.o) = 1, 'E-R prove recenti intatte';
  RAISE NOTICE 'PASS E-R retention 90 giorni: prove di un buono ancora riservato intatte (anche con trigger), cancellate solo dopo il rilascio; recenti intatte';
END $$;

-- E-C cancellazione di un account: buoni -> sigilli a cascata (profondita' trigger > 1), evidenze con il pagamento
DO $$ DECLARE r record; n int; BEGIN
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  DELETE FROM public.food_club_voucher_events WHERE voucher_id = r.v;       -- eventi gia' a cascata, tolti per chiarezza
  UPDATE public.kitchen_orders SET customer_id = NULL WHERE id = r.o;       -- l'ordine resta (storico), l'utente va via
  UPDATE public.food_club_vouchers SET status = 'available', reserved_order_id = NULL, reserved_at = NULL WHERE id = r.v;
  DELETE FROM public.food_club_members WHERE user_id = r.m;
  DELETE FROM auth.users WHERE id = r.m;
  SELECT count(*) INTO n FROM public.food_club_release_seals WHERE order_id = r.o;
  ASSERT n = 0, 'E-C sigillo cancellato a cascata con il buono';
  -- evidenze: cancellazione a cascata del pagamento (profondita' > 1) consentita
  SELECT * INTO r FROM fc_test.mk_sealed('A');
  PERFORM fc_test.ev(r.a, 'list', fc_test.lf(r.a, 0), 20);
  DELETE FROM public.kitchen_payments WHERE id = r.a;                        -- cascata verso le evidenze
  ASSERT (SELECT count(*) FROM public.food_club_checkout_evidence WHERE attempt_id = r.a) = 0, 'E-C evidenze a cascata col pagamento';
  RAISE NOTICE 'PASS E-C cascata (auth.users -> buono -> sigillo; pagamento -> evidenze) non bloccata dal trigger di immutabilita''';
END $$;
