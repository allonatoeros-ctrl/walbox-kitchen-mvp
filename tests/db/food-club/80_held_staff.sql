-- Passo 3D: buoni in verifica (food_club_staff_held_vouchers) e rilascio manuale dopo 24 h
-- (food_club_manager_resolve_held_voucher). Gira in una transazione con ROLLBACK (run-food-club-sql.sh).
-- Le RPC staff girano col RUOLO REALE authenticated/anon (SET LOCAL ROLE + claims); le prove SumUp si registrano con le RPC
-- reali del Passo 3A (ruolo service_role). Il tempo si simula retrodatando (stesso metodo di 60_release.sql, fixture
-- dichiarate li'): l'orologio si sposta, i valori nascono dalle RPC. Gli helper fc_test.mk* sono copiati da 60_release.sql
-- (ogni file gira nella sua transazione e non vede gli helper degli altri).
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


-- Helper specifici del Passo 3D ---------------------------------------------------------------------
-- Manager di walrus-main (new_staff crea role 'staff').
CREATE FUNCTION fc_test.new_manager() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE u uuid := fc_test.new_staff();
BEGIN UPDATE public.kitchen_staff_members SET role = 'manager' WHERE user_id = u; RETURN u; END $$;

-- Rilascio manuale col ruolo p_role (authenticated|anon) e claims di p_uid; propaga gli errori.
CREATE FUNCTION fc_test.resolve(p_uid uuid, p_v uuid, p_note text, p_role text DEFAULT 'authenticated') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_user(p_uid, p_role);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    r := public.food_club_manager_resolve_held_voucher(p_v, p_note);
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
-- Vista staff: righe del buono p_v (come record jsonb) col ruolo indicato.
CREATE FUNCTION fc_test.held_row(p_uid uuid, p_v uuid, p_role text DEFAULT 'authenticated') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM fc_test.as_user(p_uid, p_role);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    SELECT to_jsonb(h) INTO r FROM public.food_club_staff_held_vouchers('walrus-main') h WHERE h.voucher_id = p_v;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
-- Buono riservato su ordine annullato CON checkout (scenario B), sigillato p_hours_ago ore fa.
CREATE FUNCTION fc_test.held(p_hours_ago numeric, OUT m uuid, OUT v uuid, OUT o text, OUT a uuid) LANGUAGE plpgsql AS $$
BEGIN
  SELECT x.m, x.v, x.o, x.a INTO m, v, o, a FROM fc_test.mk_sealed('B') x;
  PERFORM fc_test.set_sealed(o, (p_hours_ago * 3600)::int);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H1 vista: elenco con over_24h corretto, dati del sigillo, has_succeeded_charge falso; staff semplice la vede
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE s uuid := fc_test.new_staff(); h1 record; h2 record; j1 jsonb; j2 jsonb; j3 jsonb; n_before int; BEGIN
  SELECT * INTO h1 FROM fc_test.held(2);                 -- sigillato 2 h fa
  SELECT * INTO h2 FROM fc_test.held(30);                -- sigillato 30 h fa
  j1 := fc_test.held_row(s, h1.v);
  j2 := fc_test.held_row(s, h2.v);
  ASSERT j1 IS NOT NULL AND j2 IS NOT NULL, 'H1 entrambi i buoni sono elencati (anche per staff non manager)';
  ASSERT (j1 ->> 'over_24h')::boolean = false AND (j2 ->> 'over_24h')::boolean = true, 'H1 over_24h: ' || j1::text || j2::text;
  ASSERT (j1 ->> 'hours_since_reference')::numeric BETWEEN 1.9 AND 2.1 AND (j2 ->> 'hours_since_reference')::numeric BETWEEN 29.9 AND 30.1, 'H1 ore dal riferimento';
  ASSERT (j2 ->> 'order_id') = h2.o AND (j2 ->> 'order_status') IN ('cancelled', 'payment_abandoned')
     AND (j2 ->> 'has_succeeded_charge')::boolean = false AND (j2 ->> 'seal_checks') IS NOT NULL
     AND (j2 ->> 'voucher_code') = (SELECT code FROM public.food_club_vouchers WHERE id = h2.v), 'H1 campi dell''ordine e del sigillo';
  -- ordinati per reference_at (il piu' vecchio per primo)
  PERFORM fc_test.as_user(s); EXECUTE 'SET LOCAL ROLE authenticated';
  ASSERT (SELECT array_position(array_agg(h.voucher_id ORDER BY h.reference_at, h.voucher_id), h2.v) <
                 array_position(array_agg(h.voucher_id ORDER BY h.reference_at, h.voucher_id), h1.v)
            FROM public.food_club_staff_held_vouchers('walrus-main') h), 'H1 ordine per reference_at';
  EXECUTE 'RESET ROLE';
  -- senza sigillo: riferimento = created_at + 17 min
  SELECT * INTO h1 FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(h1.o, 26 * 3600);
  j3 := fc_test.held_row(s, h1.v);
  ASSERT j3 IS NOT NULL AND (j3 ->> 'seal_checks') IS NULL AND (j3 ->> 'over_24h')::boolean = true
     AND abs(extract(epoch FROM ((j3 ->> 'reference_at')::timestamptz - (now() - interval '26 hours' + interval '17 minutes')))) < 5, 'H1 senza sigillo: created_at + 17 min ' || j3::text;
  -- un buono NON riservato (altro stato) non e' elencato; un buono su ordine in corso non e' elencato
  UPDATE public.food_club_vouchers SET status = 'available', reserved_order_id = NULL, reserved_at = NULL WHERE id = h2.v;
  ASSERT fc_test.held_row(s, h2.v) IS NULL, 'H1 buono tornato available: non elencato';
  RAISE NOTICE 'PASS H1 vista staff: elenco, over_24h e ore corretti, sigillo/nessun sigillo, ordinamento, buoni non riservati esclusi';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H2 permessi: anon negato, non-staff negato, staff non manager -> manager_only; vista di altro locale negata
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager(); h record; u uuid := fc_test.new_user(false); out text; BEGIN
  SELECT * INTO h FROM fc_test.held(30);
  out := fc_test.try(format('SELECT fc_test.resolve(%L, %L, %L, %L)', s, h.v, 'nota abbastanza lunga', 'authenticated'));
  ASSERT out LIKE '%manager_only%', 'H2 staff non manager: ' || out;
  out := fc_test.try(format('SELECT fc_test.resolve(%L, %L, %L, %L)', u, h.v, 'nota abbastanza lunga', 'authenticated'));
  ASSERT out LIKE '%manager_only%', 'H2 utente non staff: ' || out;
  out := fc_test.try(format('SELECT fc_test.resolve(%L, %L, %L, %L)', '00000000-0000-0000-0000-000000000000'::uuid, h.v, 'nota abbastanza lunga', 'anon'));
  ASSERT out LIKE '%permission denied%', 'H2 anon negato: ' || out;
  out := fc_test.try(format('SELECT fc_test.held_row(%L, %L, %L)', u, h.v, 'authenticated'));
  ASSERT out LIKE '%not_staff_for_venue%', 'H2 vista: non staff negato: ' || out;
  out := fc_test.try(format('SELECT fc_test.held_row(%L, %L, %L)', '00000000-0000-0000-0000-000000000000'::uuid, h.v, 'anon'));
  ASSERT out LIKE '%permission denied%', 'H2 vista: anon negato: ' || out;
  -- un manager di un ALTRO locale non puo' liberare un buono di walrus-main
  INSERT INTO auth.users (id, is_anonymous, email) VALUES ('11111111-1111-1111-1111-111111111111', false, 'altro-manager@test.local');
  INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'altro-locale', 'manager');
  out := fc_test.try(format('SELECT fc_test.resolve(%L, %L, %L)', '11111111-1111-1111-1111-111111111111'::uuid, h.v, 'nota abbastanza lunga'));
  ASSERT out LIKE '%manager_only%' OR out LIKE '%not_staff_for_venue%', 'H2 manager di altro locale: ' || out;
  ASSERT fc_test.vstatus(h.v) = 'reserved' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H2 nessuna scrittura';
  RAISE NOTICE 'PASS H2 permessi: anon negato, non-staff e staff semplice manager_only, manager di altro locale negato, nessuna scrittura';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H3 rifiuti senza scrittura: nota corta/vuota/solo spazi, < 24 h, charge riuscito, evidenza PAID
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE mg uuid := fc_test.new_manager(); h record; r jsonb; BEGIN
  SELECT * INTO h FROM fc_test.held(30);
  -- nota: troppo corta / NULL / solo spazi / 9 caratteri dopo il trim
  r := fc_test.resolve(mg, h.v, 'corta');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' = 'note_too_short', 'H3 nota corta ' || r::text;
  r := fc_test.resolve(mg, h.v, NULL);
  ASSERT r ->> 'reason' = 'note_too_short', 'H3 nota NULL';
  r := fc_test.resolve(mg, h.v, '            ');
  ASSERT r ->> 'reason' = 'note_too_short', 'H3 nota di soli spazi';
  r := fc_test.resolve(mg, h.v, '   123456789   ');
  ASSERT r ->> 'reason' = 'note_too_short', 'H3 9 caratteri dopo il trim';
  ASSERT fc_test.vstatus(h.v) = 'reserved' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H3a nessuna scrittura';

  -- meno di 24 h
  SELECT * INTO h FROM fc_test.held(23.9);
  r := fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' = 'too_early', 'H3 < 24 h ' || r::text;
  ASSERT fc_test.vstatus(h.v) = 'reserved' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H3b nessuna scrittura';
  -- esattamente oltre la soglia: 24 h + 1 minuto e' ammesso, 24 h - 1 minuto no
  PERFORM fc_test.set_sealed(h.o, 24 * 3600 - 60);
  ASSERT fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato') ->> 'reason' = 'too_early', 'H3 24 h - 1 min ancora presto';

  -- charge riuscito (PAID tardivo registrato da Kitchen): il buono e' gia' consumato da consume_on_charge, nessun rilascio
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.confirm(h.a);
  r := fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' IN ('not_reserved', 'charge_succeeded', 'order_paid'), 'H3 charge succeeded ' || r::text;
  ASSERT fc_test.vstatus(h.v) = 'used' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H3c buono resta used';
  -- ...e se il buono fosse ancora riservato (fixture: lo riporto a reserved a mano) il rifiuto e' per il charge riuscito
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.fx_replica(true);                                           -- fixture: senza trigger, solo la riga pagamento
  UPDATE public.kitchen_payments SET status = 'succeeded' WHERE id = h.a;
  PERFORM fc_test.fx_replica(false);
  r := fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' IN ('charge_succeeded', 'order_paid'), 'H3 charge succeeded con buono riservato: ' || r::text;
  ASSERT fc_test.vstatus(h.v) = 'reserved' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H3d nessuna scrittura';
  ASSERT (fc_test.held_row(mg, h.v) ->> 'has_succeeded_charge')::boolean = true, 'H3d la vista segnala has_succeeded_charge';

  -- evidenza PAID in una prova SumUp
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.ev(h.a, 'get', fc_test.gf(h.a, 'PAID'), 30);
  r := fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' = 'paid_evidence', 'H3 evidenza PAID ' || r::text;
  ASSERT fc_test.vstatus(h.v) = 'reserved' AND fc_test.vev(h.v, 'manual_release_after_24h') = 0, 'H3e nessuna scrittura';
  -- evidenza in minuscolo
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.ev(h.a, 'get', fc_test.gf(h.a, 'paid'), 30);
  ASSERT fc_test.resolve(mg, h.v, 'controllato su SumUp, non pagato') ->> 'reason' = 'paid_evidence', 'H3 evidenza paid minuscola';

  -- buono inesistente
  r := fc_test.resolve(mg, gen_random_uuid(), 'controllato su SumUp, non pagato');
  ASSERT r ->> 'reason' = 'voucher_not_found', 'H3 buono inesistente ' || r::text;
  RAISE NOTICE 'PASS H3 rifiuti senza scritture: nota corta/NULL/spazi, < 24 h (anche 24 h - 1 min), charge succeeded, evidenza PAID (anche minuscola), buono inesistente';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H4 caso valido: available + 1 evento con i dettagli; seconda chiamata = not_reserved, nessun secondo evento
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE mg uuid := fc_test.new_manager(); h record; r jsonb; e record; BEGIN
  SELECT * INTO h FROM fc_test.held(30);
  r := fc_test.resolve(mg, h.v, '  controllato nella dashboard SumUp, ordine non pagato  ');
  ASSERT (r ->> 'ok')::boolean AND (r ->> 'released')::boolean AND r ->> 'voucher_status' = 'available', 'H4 rilascio ' || r::text;
  ASSERT fc_test.vstatus(h.v) = 'available', 'H4 buono available';
  ASSERT (SELECT reserved_order_id IS NULL AND reserved_at IS NULL AND used_order_id IS NULL FROM public.food_club_vouchers WHERE id = h.v), 'H4 campi azzerati';
  ASSERT fc_test.vev(h.v, 'manual_release_after_24h') = 1, 'H4 un evento';
  SELECT * INTO e FROM public.food_club_voucher_events WHERE voucher_id = h.v AND event = 'manual_release_after_24h';
  ASSERT e.from_status = 'reserved' AND e.to_status = 'available' AND e.order_id = h.o AND e.actor = 'staff', 'H4 evento: stati e attore';
  ASSERT (e.metadata ->> 'staff_user_id')::uuid = mg AND e.metadata ->> 'note' = 'controllato nella dashboard SumUp, ordine non pagato'
     AND (e.metadata ->> 'reference_at') IS NOT NULL, 'H4 dettagli evento ' || e.metadata::text;
  ASSERT (SELECT last_reason FROM public.food_club_release_seals WHERE order_id = h.o) = 'manual_release_after_24h', 'H4 sigillo annotato';
  ASSERT fc_test.held_row(mg, h.v) IS NULL, 'H4 non piu'' in elenco';
  -- seconda chiamata
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT (r ->> 'ok')::boolean = false AND r ->> 'reason' = 'not_reserved', 'H4 seconda chiamata ' || r::text;
  ASSERT fc_test.vev(h.v, 'manual_release_after_24h') = 1 AND fc_test.vstatus(h.v) = 'available', 'H4 nessun secondo evento';
  -- ordine senza sigillo (riferimento = created_at + 17 min) rilasciabile, evento senza modifiche al sigillo inesistente
  SELECT * INTO h FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(h.o, 26 * 3600);
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT (r ->> 'ok')::boolean AND fc_test.vstatus(h.v) = 'available' AND fc_test.vev(h.v, 'manual_release_after_24h') = 1, 'H4 senza sigillo ' || r::text;
  -- D3: dopo il rilascio manuale su ordine SENZA sigillo ora il sigillo esiste e un incasso al banco e' rifiutato
  SELECT * INTO h FROM fc_test.mk('B');
  PERFORM fc_test.set_ages(h.o, 26 * 3600);
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_release_seals WHERE order_id = h.o), 'D3 prima: nessun sigillo';
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT (r ->> 'ok')::boolean, 'D3 rilascio ' || r::text;
  ASSERT (SELECT voucher_id FROM public.food_club_release_seals WHERE order_id = h.o) = h.v
     AND (SELECT last_reason FROM public.food_club_release_seals WHERE order_id = h.o) = 'manual_release_after_24h', 'D3 sigillo creato';
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', h.o, fc_test.new_staff())) LIKE '%food_club_order_sealed%', 'D3 banco rifiutato dopo rilascio manuale';
  ASSERT fc_test.vstatus(h.v) = 'available' AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments WHERE order_id = h.o AND provider = 'cash'), 'D3 buono invariato, nessun charge cash';
  -- ordine NON annullato: nessun rilascio (fixture: riapro l'ordine come farebbe un bug a monte)
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_orders SET status = 'preparing' WHERE id = h.o;
  PERFORM fc_test.fx_replica(false);
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT r ->> 'reason' = 'order_not_closed' AND fc_test.vstatus(h.v) = 'reserved', 'H4 ordine non chiuso ' || r::text;
  RAISE NOTICE 'PASS H4 rilascio valido: available, campi azzerati, 1 evento con staff_user_id/nota/reference_at, seconda chiamata not_reserved, senza sigillo ok, ordine non chiuso rifiutato';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H5 buono scaduto -> expired (come il rilascio automatico)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE mg uuid := fc_test.new_manager(); h record; r jsonb; BEGIN
  SELECT * INTO h FROM fc_test.held(30);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 hour' WHERE id = h.v;
  PERFORM fc_test.fx_replica(false);
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT (r ->> 'ok')::boolean AND r ->> 'voucher_status' = 'expired' AND fc_test.vstatus(h.v) = 'expired', 'H5 expired ' || r::text;
  ASSERT (SELECT to_status FROM public.food_club_voucher_events WHERE voucher_id = h.v AND event = 'manual_release_after_24h') = 'expired', 'H5 evento expired';
  RAISE NOTICE 'PASS H5 buono scaduto: rilasciato come expired, 1 evento';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- H6 PAID tardivo DOPO il rilascio manuale: passa da consume_on_charge (reclaim), nessun doppio used
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE mg uuid := fc_test.new_manager(); h record; r jsonb; BEGIN
  SELECT * INTO h FROM fc_test.held(30);
  r := fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato');
  ASSERT (r ->> 'ok')::boolean AND fc_test.vstatus(h.v) = 'available', 'H6 rilascio ' || r::text;
  PERFORM fc_test.confirm(h.a);                                 -- il cliente paga in ritardo con lo sconto
  ASSERT fc_test.vstatus(h.v) = 'used', 'H6 PAID tardivo: buono used, stato ' || fc_test.vstatus(h.v);
  ASSERT (SELECT used_order_id FROM public.food_club_vouchers WHERE id = h.v) = h.o, 'H6 usato su quell''ordine';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = h.v AND to_status = 'used') = 1, 'H6 un solo passaggio a used';
  ASSERT fc_test.vev(h.v, 'manual_release_after_24h') = 1, 'H6 il rilascio manuale resta nello storico';
  -- webhook doppio: idempotente
  PERFORM fc_test.confirm(h.a);
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = h.v AND to_status = 'used') = 1, 'H6 nessun doppio used';
  -- e un nuovo rilascio manuale non e' piu' possibile
  ASSERT fc_test.resolve(mg, h.v, 'controllato nella dashboard SumUp, ordine non pagato') ->> 'reason' = 'not_reserved', 'H6 ripetuto: not_reserved';
  RAISE NOTICE 'PASS H6 PAID tardivo dopo rilascio manuale: reclaim via consume_on_charge (1 solo used), webhook doppio idempotente';
END $$;
