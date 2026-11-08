-- Passo 3C: avvio corretto della sweep per i buoni trattenuti (tick Club + job cron ri-schedulato). T5-T10 + extra.
-- Gira in una transazione con ROLLBACK (run-food-club-sql.sh), su DB locale con lo shim Supabase (net.http_post scrive
-- in net.http_request_queue: nessuna rete; vault.secrets e' una tabella di prova con un valore finto).
--
-- FIXTURE dichiarate:
--  * una sola transazione => now() e' fisso: il tempo si simula RETRODATANDO (session_replication_role = replica, da
--    superuser) created_at di ordine/pagamenti e inserendo il sigillo con sealed_at voluto. Per la logica a minuti si usa
--    food_club_release_tick_due(p_now) con p_now fissati (UTC); il cron reale usa now().
--  * l'interruttore food_club_release_tick_enabled() nasce `false`; SOLO in questo test viene ridefinito `true` con
--    CREATE OR REPLACE dentro la transazione (fc_test.tick_set). Il ROLLBACK lo ripristina.
--  * il comando del cron e' letto dal testo reale in cron.job (job `kitchen-online-abandon-sweep`) ed eseguito cosi' com'e'.
--  * un solo buono "eleggibile" per volta (fc_test.reset_club libera i buoni riservati delle prove precedenti), tranne
--    nel test dei buoni multipli.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- Isolamento: il DB locale puo' contenere righe COMMITTATE da altri script (p3b, concorrenza). Dentro questa transazione
-- (ROLLBACK a fine file) si portano tutti gli ordini preesistenti a created_at = now(): nessun POP "scaduto" e nessun
-- buono "eleggibile" ereditato; si svuota la coda dello shim pg_net. Nessun effetto fuori dal test.
SELECT set_config('session_replication_role', 'replica', true);
UPDATE public.kitchen_orders SET created_at = now();
SELECT set_config('session_replication_role', 'origin', true);
DELETE FROM net.http_request_queue;

-- ---------------------------------------------------------------------------------------------------
-- Helper locali (spariscono col ROLLBACK)
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION fc_test.fx_replica(p_on boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('session_replication_role', CASE WHEN p_on THEN 'replica' ELSE 'origin' END, true) $$;
CREATE FUNCTION fc_test.mkv(p_uid uuid) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + interval '10 days') RETURNING id $$;
CREATE FUNCTION fc_test.tick_set(p boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('CREATE OR REPLACE FUNCTION public.food_club_release_tick_enabled() RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $b$SELECT %s$b$', p::text);
END $$;
CREATE FUNCTION fc_test.q() RETURNS bigint LANGUAGE sql AS $$ SELECT count(*) FROM net.http_request_queue $$;
-- Esegue il TESTO ESATTO del comando del job cron e ne ritorna il primo valore (id richiesta o NULL).
CREATE FUNCTION fc_test.run_cron() RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c text; r bigint;
BEGIN
  SELECT command INTO c FROM cron.job WHERE jobname = 'kitchen-online-abandon-sweep';
  EXECUTE c INTO r;
  RETURN r;
END $$;
-- Ordine online abbandonato con buono trattenuto (riservato + evento held_until_checkout_expiry), come il flusso reale.
CREATE FUNCTION fc_test.held(OUT m uuid, OUT v uuid, OUT o text) LANGUAGE plpgsql AS $$
DECLARE ord public.kitchen_orders;
BEGIN
  m := fc_test.new_member(); v := fc_test.mkv(m);
  ord := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  o := ord.id;
  PERFORM fc_test.start_online(o);
  PERFORM fc_test.backdate(o, now() - interval '6 minutes');
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(o);
END $$;
-- Posiziona l'ordine rispetto a p_now: created_at = p_now - età; sigillo (se richiesto) con sealed_at = p_now - sealed_ago.
CREATE FUNCTION fc_test.place(p_o text, p_now timestamptz, p_order_age_s int, p_sealed_ago_s int, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.fx_replica(true);
  UPDATE public.kitchen_orders SET created_at = p_now - make_interval(secs => p_order_age_s) WHERE id = p_o;
  UPDATE public.kitchen_payments SET created_at = p_now - make_interval(secs => p_order_age_s) WHERE order_id = p_o;
  DELETE FROM public.food_club_release_seals WHERE order_id = p_o;
  IF p_sealed_ago_s IS NOT NULL THEN
    INSERT INTO public.food_club_release_seals (order_id, voucher_id, sealed_at, last_reason)
    SELECT p_o, v.id, p_now - make_interval(secs => p_sealed_ago_s), p_reason
      FROM public.food_club_vouchers v WHERE v.reserved_order_id = p_o AND v.status = 'reserved';
  END IF;
  PERFORM fc_test.fx_replica(false);
END $$;
-- Libera i buoni riservati delle prove precedenti (cosi' un solo buono alla volta pilota il criterio).
CREATE FUNCTION fc_test.reset_club() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_vouchers SET status = 'available', reserved_order_id = NULL, reserved_at = NULL WHERE status = 'reserved';
  PERFORM fc_test.fx_replica(false);
END $$;
-- Base per le esclusioni: buono eleggibile, ordine 1 h, sigillato 3 min fa rispetto a p_now.
CREATE FUNCTION fc_test.base(p_now timestamptz, OUT v uuid, OUT o text) LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();
  v := r.v; o := r.o;
  PERFORM fc_test.place(o, p_now, 3600, 180, NULL);
END $$;
CREATE FUNCTION fc_test.due(p_now timestamptz) RETURNS boolean LANGUAGE sql AS $$ SELECT public.food_club_release_tick_due(p_now) $$;
CREATE FUNCTION fc_test.mutate(p_sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.fx_replica(true); EXECUTE p_sql; PERFORM fc_test.fx_replica(false); END $$;

-- Secret Vault di PROVA (valore finto, solo transazione locale).
INSERT INTO vault.secrets (name, secret) VALUES ('kitchen_abandon_sweep_secret', 'valore-finto-solo-test-locale');

-- ---------------------------------------------------------------------------------------------------
-- Stato iniziale + T3 runtime: interruttore spento, permessi, job
-- ---------------------------------------------------------------------------------------------------
DO $$ BEGIN
  ASSERT public.food_club_release_tick_enabled() = false, 'T2 interruttore DB spento alla nascita';
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'kitchen-online-abandon-sweep') = 1, 'T1 un solo job con il nome esistente';
  ASSERT (SELECT schedule FROM cron.job WHERE jobname = 'kitchen-online-abandon-sweep') = '* * * * *', 'T1 stessa frequenza';
  ASSERT (SELECT command FROM cron.job WHERE jobname = 'kitchen-online-abandon-sweep')
    = 'SELECT COALESCE(public.kitchen_online_abandon_sweep_tick(), public.food_club_release_sweep_tick())', 'T1 comando del job';
  ASSERT (SELECT count(*) FROM cron.job WHERE command ILIKE '%food_club_release%') = 1, 'T1 nessun cron Club separato';
  RAISE NOTICE 'PASS T1/T2 interruttore DB spento, un solo job ri-schedulato (stesso nome, stessa frequenza, comando COALESCE)';
END $$;

DO $$ DECLARE f text; r text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.food_club_release_tick_enabled()', 'public.food_club_release_tick_due(timestamptz)',
                           'public.food_club_release_sweep_tick(text)'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'public'] LOOP
      ASSERT NOT has_function_privilege(r, f, 'EXECUTE'), format('T3 %s non deve poter eseguire %s', r, f);
    END LOOP;
    ASSERT has_function_privilege('postgres', f, 'EXECUTE'), format('T3 il proprietario esegue %s', f);
  END LOOP;
  RAISE NOTICE 'PASS T3 le tre funzioni Club: EXECUTE negato a PUBLIC/anon/authenticated/service_role, consentito al proprietario';
END $$;

DO $$ DECLARE t text := 'nessun errore'; BEGIN
  SET LOCAL ROLE service_role;
  BEGIN PERFORM public.food_club_release_sweep_tick(); EXCEPTION WHEN OTHERS THEN t := SQLERRM; END;
  RESET ROLE;
  ASSERT t LIKE '%permission denied%', 'T3 service_role non puo chiamare il tick: ' || t;
  t := 'nessun errore';
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.food_club_release_tick_due(now()); EXCEPTION WHEN OTHERS THEN t := SQLERRM; END;
  RESET ROLE;
  ASSERT t LIKE '%permission denied%', 'T3 authenticated non puo chiamare due(): ' || t;
  RAISE NOTICE 'PASS T3 tentativi reali con SET ROLE service_role/authenticated: permission denied';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T5 Kitchen invariata con Club spento (nessun buono, nessun POP / POP > 5 min / POP > 15 min)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE n0 bigint; n1 bigint; n2 bigint; k bigint; c bigint; BEGIN
  ASSERT fc_test.q() = 0, 'T5 coda vuota all''inizio';
  -- (a) nessun POP scaduto
  n0 := fc_test.q(); k := public.kitchen_online_abandon_sweep_tick(); n1 := fc_test.q(); c := fc_test.run_cron(); n2 := fc_test.q();
  ASSERT k IS NULL AND c IS NULL AND n2 = n0, format('T5a nessun POP: 0 chiamate (k=%s c=%s delta=%s)', k, c, n2 - n0);
  RAISE NOTICE 'PASS T5a nessun POP scaduto: il comando del cron fa 0 chiamate (come il solo tick Kitchen)';
END $$;

DO $$ DECLARE m uuid := fc_test.new_user(false); o public.kitchen_orders; n0 bigint; n1 bigint; n2 bigint; k bigint; c bigint; mn int; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = o.id) = 'pending_online_payment', 'T5 ordine POP aperto';
  -- (b) POP appena creato (< 5 min): nessuna chiamata
  n0 := fc_test.q(); c := fc_test.run_cron(); n1 := fc_test.q();
  ASSERT c IS NULL AND n1 = n0, 'T5b POP < 5 min: 0 chiamate';
  -- (c) POP > 5 min e < 15 min: 1 chiamata, identica al solo tick Kitchen
  PERFORM fc_test.backdate(o.id, now() - interval '6 minutes');
  n0 := fc_test.q(); k := public.kitchen_online_abandon_sweep_tick(); n1 := fc_test.q(); c := fc_test.run_cron(); n2 := fc_test.q();
  ASSERT k IS NOT NULL AND c IS NOT NULL AND (n1 - n0) = 1 AND (n2 - n1) = 1,
    format('T5c POP > 5 min: 1 chiamata dal cron (k=%s c=%s d1=%s d2=%s)', k, c, n1 - n0, n2 - n1);
  RAISE NOTICE 'PASS T5b/T5c POP < 5 min: 0 chiamate; POP > 5 min: 1 chiamata, identica al solo tick Kitchen';
  -- (d) POP > 15 min: solo al minuto multiplo di 10 (stessa regola, stessa espressione del tick Kitchen)
  PERFORM fc_test.backdate(o.id, now() - interval '16 minutes');
  mn := extract(minute FROM now())::int;
  n0 := fc_test.q(); k := public.kitchen_online_abandon_sweep_tick(); n1 := fc_test.q(); c := fc_test.run_cron(); n2 := fc_test.q();
  ASSERT ((n1 - n0) = 1) = (mn % 10 = 0) AND ((n2 - n1) = 1) = (mn % 10 = 0) AND (k IS NULL) = (c IS NULL),
    format('T5d POP > 15 min, minuto %s: kitchen d=%s cron d=%s', mn, n1 - n0, n2 - n1);
  RAISE NOTICE 'PASS T5d POP > 15 min (minuto corrente %): chiamata solo se minuto %% 10 = 0, cron identico al solo tick Kitchen', mn;
  -- ripulisce il POP (non piu' aperto) per i test seguenti
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET status = ''cancelled'' WHERE id = %L', o.id));
  DELETE FROM net.http_request_queue;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T6 interruttore spento + buono trattenuto eleggibile: 0 chiamate (anche se il criterio sarebbe vero)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; n0 bigint; c bigint; BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();
  PERFORM fc_test.place(r.o, now(), 1300, NULL);   -- 21 min, non sigillato
  ASSERT public.food_club_release_tick_due(now()) = true, 'T6 il criterio e'' vero (buono eleggibile)';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = r.v) = 'reserved', 'T6 buono trattenuto';
  n0 := fc_test.q();
  c := public.food_club_release_sweep_tick();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T6 tick Club spento: NULL e 0 chiamate';
  c := fc_test.run_cron();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T6 comando cron con Club spento: 0 chiamate';
  RAISE NOTICE 'PASS T6 interruttore false + buono trattenuto eleggibile (criterio vero): 0 chiamate dal tick e dal cron';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T7 interruttore acceso SOLO nel test: finestre e raffiche (p_now fissati, UTC)
-- ---------------------------------------------------------------------------------------------------
SELECT fc_test.tick_set(true);

DO $$ DECLARE r record; h timestamptz := timestamptz '2026-11-09 10:00:00+00'; mm int; BEGIN
  ASSERT public.food_club_release_tick_enabled() = true, 'T7 interruttore ridefinito true nel test';
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();

  -- non sigillato, ordine di 20 min (riferimento = minuto 17, 3 min fa): ogni minuto
  FOREACH mm IN ARRAY ARRAY[0, 3, 4, 15, 29, 30, 44, 59] LOOP
    PERFORM fc_test.place(r.o, h + make_interval(mins => mm), 1200, NULL);
    ASSERT fc_test.due(h + make_interval(mins => mm)), format('T7 non sigillato (20 min) a :%s dovrebbe essere true', mm);
  END LOOP;
  RAISE NOTICE 'PASS T7a buono idoneo non sigillato (ordine 20 min): due=true a ogni minuto provato';

  -- sigillato da 3 min: ogni minuto
  FOREACH mm IN ARRAY ARRAY[0, 4, 15, 29, 30, 44, 59] LOOP
    PERFORM fc_test.place(r.o, h + make_interval(mins => mm), 3600, 180, NULL);
    ASSERT fc_test.due(h + make_interval(mins => mm)), format('T7 sigillato 3 min a :%s dovrebbe essere true', mm);
  END LOOP;
  RAISE NOTICE 'PASS T7b sigillato da 3 min: due=true a ogni minuto provato';

  -- sigillato da 2 h: solo minuto % 30 < 4
  FOREACH mm IN ARRAY ARRAY[0, 1, 3, 30, 33] LOOP
    PERFORM fc_test.place(r.o, h + make_interval(mins => mm), 3 * 3600, 7200, NULL);
    ASSERT fc_test.due(h + make_interval(mins => mm)), format('T7 sigillato 2 h a :%s dovrebbe essere true', mm);
  END LOOP;
  FOREACH mm IN ARRAY ARRAY[4, 15, 29, 34, 45, 59] LOOP
    PERFORM fc_test.place(r.o, h + make_interval(mins => mm), 3 * 3600, 7200, NULL);
    ASSERT NOT fc_test.due(h + make_interval(mins => mm)), format('T7 sigillato 2 h a :%s dovrebbe essere false', mm);
  END LOOP;
  RAISE NOTICE 'PASS T7c sigillato da 2 h: true a :00 :01 :03 :30 :33, false a :04 :15 :29 :34 :45 :59';

  -- sigillato da 25 h: mai
  FOREACH mm IN ARRAY ARRAY[0, 1, 3, 15, 30, 33, 59] LOOP
    PERFORM fc_test.place(r.o, h + make_interval(mins => mm), 30 * 3600, 25 * 3600, NULL);
    ASSERT NOT fc_test.due(h + make_interval(mins => mm)), format('T7 sigillato 25 h a :%s dovrebbe essere false', mm);
  END LOOP;
  -- bordo: 23 h 59 min ancora dentro, 24 h 01 min fuori (al minuto :00)
  PERFORM fc_test.place(r.o, h, 30 * 3600, 24 * 3600 - 60, NULL);
  ASSERT fc_test.due(h), 'T7 sigillato da 23h59 a :00 true';
  PERFORM fc_test.place(r.o, h, 30 * 3600, 24 * 3600 + 60, NULL);
  ASSERT NOT fc_test.due(h), 'T7 sigillato da 24h01 a :00 false';
  RAISE NOTICE 'PASS T7d sigillato da 25 h: false a qualunque minuto; bordo 23h59 true, 24h01 false';

  -- non sigillato ma ordine vecchio (40 min): ref = minuto 17 -> 23 min fa; stessa regola della raffica; oltre 24 h stop
  PERFORM fc_test.place(r.o, h, 40 * 60, NULL);
  ASSERT fc_test.due(h), 'T7 non sigillato 40 min a :00 (raffica) true';
  PERFORM fc_test.place(r.o, h + interval '15 minutes', 40 * 60, NULL);
  ASSERT NOT fc_test.due(h + interval '15 minutes'), 'T7 non sigillato 40 min a :15 false (fuori raffica)';
  PERFORM fc_test.place(r.o, h, 30 * 3600, NULL);
  ASSERT NOT fc_test.due(h), 'T7 non sigillato con ordine di 30 h: stop (anche a :00)';
  RAISE NOTICE 'PASS T7e non sigillato ma vecchio: stessa regola a raffiche e stop oltre 24 h dal minuto 17 (scostamento dal piano, vedi report)';

  -- last_reason: terminali fermano le raffiche; incerti/NULL no
  FOREACH mm IN ARRAY ARRAY[0] LOOP
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'paid_evidence');
    ASSERT NOT fc_test.due(h), 'T7 last_reason paid_evidence: false';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'order_paid');
    ASSERT NOT fc_test.due(h), 'T7 last_reason order_paid: false';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'charge_succeeded');
    ASSERT NOT fc_test.due(h), 'T7 last_reason charge_succeeded: false';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'uncertain:list_not_verified');
    ASSERT fc_test.due(h), 'T7 last_reason uncertain:*: true';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'no_payment_proof');
    ASSERT fc_test.due(h), 'T7 last_reason no_payment_proof: true';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, 'release_cap_reached');
    ASSERT fc_test.due(h), 'T7 last_reason release_cap_reached: true';
    PERFORM fc_test.place(r.o, h, 3 * 3600, 7200, NULL);
    ASSERT fc_test.due(h), 'T7 last_reason NULL (mai controllato): true (NOT IN con NULL non deve nascondere il buono)';
  END LOOP;
  RAISE NOTICE 'PASS T7f last_reason: paid_evidence/order_paid/charge_succeeded fermano il controllo; incerti, cap e NULL no';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T8 esclusioni: ognuna rende il criterio falso partendo da una base vera (p_now :15, fuori raffica)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE b record; p timestamptz := timestamptz '2026-11-09 10:15:00+00'; BEGIN
  SELECT * INTO b FROM fc_test.base(p);
  ASSERT fc_test.due(p), 'T8 base: vero';

  -- ordine < 17 min
  PERFORM fc_test.place(b.o, p, 16 * 60, 60, NULL);
  ASSERT NOT fc_test.due(p), 'T8 ordine di 16 min: falso';
  PERFORM fc_test.place(b.o, p, 17 * 60 + 5, 60, NULL);
  ASSERT fc_test.due(p), 'T8 ordine di 17 min e 5 s: vero';
  RAISE NOTICE 'PASS T8a ordine < 17 min escluso (17:05 incluso)';

  -- ordine ancora aperto
  PERFORM fc_test.place(b.o, p, 3600, 180, NULL);
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET status = ''pending_online_payment'' WHERE id = %L', b.o));
  ASSERT NOT fc_test.due(p), 'T8 ordine aperto: falso';
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET status = ''payment_abandoned'' WHERE id = %L', b.o));
  ASSERT fc_test.due(p), 'T8 ordine payment_abandoned: vero';
  RAISE NOTICE 'PASS T8b ordine ancora aperto escluso (payment_abandoned incluso)';

  -- ordine pagato
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET payment_status = ''paid'' WHERE id = %L', b.o));
  ASSERT NOT fc_test.due(p), 'T8 ordine pagato: falso';
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET payment_status = NULL WHERE id = %L', b.o));
  ASSERT fc_test.due(p), 'T8 payment_status NULL: vero (come il sigillo)';
  RAISE NOTICE 'PASS T8c ordine pagato escluso';

  -- charge succeeded
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_payments SET status = ''succeeded'' WHERE order_id = %L AND direction = ''charge''', b.o));
  ASSERT NOT fc_test.due(p), 'T8 charge succeeded: falso';
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_payments SET status = ''failed'' WHERE order_id = %L AND direction = ''charge''', b.o));
  ASSERT fc_test.due(p), 'T8 charge failed: vero';
  RAISE NOTICE 'PASS T8d charge succeeded escluso';

  -- nessun evento hold
  PERFORM fc_test.mutate(format('DELETE FROM public.food_club_voucher_events WHERE voucher_id = %L AND event = ''held_until_checkout_expiry''', b.v));
  ASSERT NOT fc_test.due(p), 'T8 senza evento hold: falso';
  RAISE NOTICE 'PASS T8e nessun evento held_until_checkout_expiry: escluso';

  -- buono available / used / expired (non piu' riservato)
  SELECT * INTO b FROM fc_test.base(p);
  PERFORM fc_test.mutate(format('UPDATE public.food_club_vouchers SET status = ''available'', reserved_order_id = NULL, reserved_at = NULL WHERE id = %L', b.v));
  ASSERT NOT fc_test.due(p), 'T8 buono available: falso';
  SELECT * INTO b FROM fc_test.base(p);
  PERFORM fc_test.mutate(format('UPDATE public.food_club_vouchers SET status = ''used'', used_order_id = reserved_order_id, used_at = now(), reserved_order_id = NULL, reserved_at = NULL WHERE id = %L', b.v));
  ASSERT NOT fc_test.due(p), 'T8 buono used: falso';
  RAISE NOTICE 'PASS T8f buono available/used escluso';

  -- sigillo di un altro buono non conta; ordine/charge ancora a posto: base di nuovo vera
  SELECT * INTO b FROM fc_test.base(p);
  ASSERT fc_test.due(p), 'T8 base di nuovo vera';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T9 POP scaduto + buono eleggibile nello stesso minuto: UNA sola chiamata dal cron (COALESCE)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; m uuid := fc_test.new_user(false); pop public.kitchen_orders; n0 bigint; c bigint; kk bigint; BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();
  PERFORM fc_test.place(r.o, now(), 1300, NULL);           -- eleggibile adesso (non sigillato, 21 min)
  pop := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.backdate(pop.id, now() - interval '6 minutes');   -- POP scaduto (5-15 min: Kitchen chiama a ogni minuto)
  ASSERT public.food_club_release_tick_due(now()), 'T9 il Club sarebbe da chiamare';
  n0 := fc_test.q();
  c := fc_test.run_cron();
  ASSERT c IS NOT NULL AND fc_test.q() = n0 + 1, format('T9 una sola riga in coda (delta=%s)', fc_test.q() - n0);
  ASSERT (SELECT url FROM net.http_request_queue ORDER BY id DESC LIMIT 1) = 'https://walbox-from-zero-v2.vercel.app/api/kitchen-online-abandon-sweep', 'T9 URL della sweep';
  ASSERT (SELECT body FROM net.http_request_queue ORDER BY id DESC LIMIT 1) = '{}'::jsonb, 'T9 body {}';
  -- il Club da solo (Kitchen assente) produce una chiamata identica per forma
  n0 := fc_test.q();
  kk := public.food_club_release_sweep_tick();
  ASSERT kk IS NOT NULL AND fc_test.q() = n0 + 1, 'T9 il tick Club da solo fa una chiamata';
  ASSERT (SELECT headers ->> 'Authorization' FROM net.http_request_queue ORDER BY id DESC LIMIT 1) LIKE 'Bearer %', 'T9 header Authorization Bearer';
  RAISE NOTICE 'PASS T9 POP scaduto + buono eleggibile nello stesso minuto: il cron fa 1 sola chiamata (non 2)';
  PERFORM fc_test.mutate(format('UPDATE public.kitchen_orders SET status = ''cancelled'' WHERE id = %L', pop.id));
END $$;

-- T9b: piu' buoni trattenuti eleggibili nello stesso minuto -> 1 sola chiamata
DO $$ DECLARE r1 record; r2 record; r3 record; n0 bigint; c bigint; BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r1 FROM fc_test.held(); SELECT * INTO r2 FROM fc_test.held(); SELECT * INTO r3 FROM fc_test.held();
  PERFORM fc_test.place(r1.o, now(), 1300, NULL);
  PERFORM fc_test.place(r2.o, now(), 1300, 120, NULL);
  PERFORM fc_test.place(r3.o, now(), 3600, 60, 'uncertain:list_not_verified');
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE status = 'reserved') = 3, 'T9b tre buoni trattenuti';
  n0 := fc_test.q();
  c := fc_test.run_cron();
  ASSERT c IS NOT NULL AND fc_test.q() = n0 + 1, format('T9b tre buoni = una chiamata (delta=%s)', fc_test.q() - n0);
  RAISE NOTICE 'PASS T9b tre buoni trattenuti eleggibili nello stesso minuto: 1 sola chiamata';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T10 secret Vault assente: nessun errore, 0 chiamate (WARNING)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; n0 bigint; c bigint; BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();
  PERFORM fc_test.place(r.o, now(), 1300, NULL);
  DELETE FROM vault.secrets WHERE name = 'kitchen_abandon_sweep_secret';
  ASSERT public.food_club_release_tick_due(now()), 'T10 buono eleggibile';
  n0 := fc_test.q();
  c := public.food_club_release_sweep_tick();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T10 tick Club senza secret: NULL e 0 chiamate';
  c := fc_test.run_cron();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T10 cron senza secret: nessun errore, 0 chiamate';
  RAISE NOTICE 'PASS T10 secret Vault assente + interruttore true + buono eleggibile: nessun errore, 0 chiamate (WARNING)';
  INSERT INTO vault.secrets (name, secret) VALUES ('kitchen_abandon_sweep_secret', 'valore-finto-solo-test-locale');
END $$;

-- ---------------------------------------------------------------------------------------------------
-- T8bis oltre 24 h dal sigillo: stop, il buono resta RISERVATO e nessuna funzione lo tocca; query per lo staff
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; h timestamptz := now(); n0 bigint; v_before jsonb; v_after jsonb; v_ev0 bigint; mm int; c bigint; hits int; BEGIN
  PERFORM fc_test.reset_club();
  SELECT * INTO r FROM fc_test.held();
  PERFORM fc_test.place(r.o, now(), 30 * 3600, 25 * 3600, 'uncertain:list_not_verified');
  SELECT to_jsonb(v) INTO v_before FROM public.food_club_vouchers v WHERE id = r.v;
  SELECT count(*) INTO v_ev0 FROM public.food_club_voucher_events WHERE voucher_id = r.v;
  n0 := fc_test.q();
  FOREACH mm IN ARRAY ARRAY[0, 1, 2, 3, 4, 30, 31] LOOP
    ASSERT NOT public.food_club_release_tick_due(date_trunc('hour', now()) + make_interval(mins => mm)), format('T8bis due false a :%s', mm);
  END LOOP;
  c := public.food_club_release_sweep_tick();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T8bis oltre 24 h: 0 chiamate (tick Club)';
  c := fc_test.run_cron();
  ASSERT c IS NULL AND fc_test.q() = n0, 'T8bis oltre 24 h: 0 chiamate (cron)';
  SELECT to_jsonb(v) INTO v_after FROM public.food_club_vouchers v WHERE id = r.v;
  ASSERT v_before = v_after AND v_after ->> 'status' = 'reserved' AND v_after ->> 'reserved_order_id' = r.o, 'T8bis buono invariato e RISERVATO';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = r.v) = v_ev0, 'T8bis nessun nuovo evento sul buono';
  ASSERT (SELECT checks FROM public.food_club_release_seals WHERE order_id = r.o) = 0, 'T8bis sigillo non toccato dai tick';
  -- query per la futura schermata staff: buoni riservati su ordini chiusi, fermi da oltre 24 h
  SELECT count(*) INTO hits FROM (
    SELECT v.id, v.code, v.user_id, v.reserved_order_id, o.status AS order_status, o.created_at AS order_created_at,
           s.sealed_at, s.checks, s.last_check_at, s.last_reason
      FROM public.food_club_vouchers v
      JOIN public.kitchen_orders o ON o.id = v.reserved_order_id
      LEFT JOIN public.food_club_release_seals s ON s.order_id = o.id
     WHERE v.status = 'reserved'
       AND o.status IN ('cancelled', 'payment_abandoned')
       AND o.payment_status IS DISTINCT FROM 'paid'
       AND COALESCE(s.sealed_at, o.created_at + interval '17 minutes') <= now() - interval '24 hours'
     ORDER BY COALESCE(s.sealed_at, o.created_at) ) q;
  ASSERT hits = 1, 'T8bis la query "buoni fermi oltre 24 h" trova esattamente il buono: ' || hits;
  RAISE NOTICE 'PASS T8bis oltre 24 h: 0 chiamate, buono invariato e RISERVATO, nessun evento, identificabile con la query staff (1 riga)';
END $$;
