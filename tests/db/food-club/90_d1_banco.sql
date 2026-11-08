-- FIX D1 (2026-11-08): dal pagamento SumUp non riuscito al pagamento al banco, sullo STESSO ordine, con buono Food Club.
-- Gira in una transazione con ROLLBACK (run-food-club-sql.sh). RPC Kitchen e Club REALI (nessuna funzione sostituita);
-- l'orologio si sposta solo retrodatando (fixture come in 60_release.sql). Gli esiti SumUp (chiusura riuscita, gia'
-- chiuso, errore, timeout) sono simulati come li vede il DB: l'endpoint S4 chiama la RPC di switch solo se TUTTI gli
-- attempt risultano chiusi; con esito incerto non scrive nulla (tests/unit/customer-switch-to-counter.test.mjs).
-- Scenari D1-01..D1-12 del brief + D1-S1..S6 sul sigillo. La concorrenza vera (due sessioni) sta in p90_d1_concorrenza.sh.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- ---------------------------------------------------------------------------------------------------
-- Helper locali (spariscono col ROLLBACK). Copia di quelli di 60_release.sql che servono qui.
-- ---------------------------------------------------------------------------------------------------
CREATE FUNCTION fc_test.mkv(p_uid uuid, p_expires interval DEFAULT interval '10 days') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + p_expires) RETURNING id $$;
CREATE FUNCTION fc_test.vstatus(p_v uuid) RETURNS text LANGUAGE sql AS $$ SELECT status FROM public.food_club_vouchers WHERE id = p_v $$;
CREATE FUNCTION fc_test.vused_on(p_v uuid) RETURNS text LANGUAGE sql AS $$ SELECT used_order_id FROM public.food_club_vouchers WHERE id = p_v $$;
CREATE FUNCTION fc_test.vev(p_v uuid, p_event text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND event = p_event $$;
CREATE FUNCTION fc_test.vev_to_used(p_v uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND to_status = 'used' $$;
CREATE FUNCTION fc_test.alog(p_o text, p_action text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_action_log WHERE order_id = p_o AND action = p_action $$;
CREATE FUNCTION fc_test.ostatus(p_o text) RETURNS text LANGUAGE sql AS $$
  SELECT status || '|' || COALESCE(payment_status, '-') FROM public.kitchen_orders WHERE id = p_o $$;
CREATE FUNCTION fc_test.try(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN 'OK'; EXCEPTION WHEN OTHERS THEN RETURN 'ERR ' || SQLERRM; END $$;
CREATE FUNCTION fc_test.fx_replica(p_on boolean) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('session_replication_role', CASE WHEN p_on THEN 'replica' ELSE 'origin' END, true) $$;
-- incassi registrati (charge succeeded) e totale incassato per ordine
CREATE FUNCTION fc_test.ok_charges(p_o text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_payments WHERE order_id = p_o AND direction = 'charge' AND status = 'succeeded' $$;
CREATE FUNCTION fc_test.ok_charge_methods(p_o text) RETURNS text LANGUAGE sql AS $$
  SELECT string_agg(provider || '/' || method, ',' ORDER BY id) FROM public.kitchen_payments
   WHERE order_id = p_o AND direction = 'charge' AND status = 'succeeded' $$;
-- "comanda": identita' dell'ordine e righe (devono restare identiche prima/dopo il passaggio al banco)
CREATE FUNCTION fc_test.comanda(p_o text) RETURNS text LANGUAGE sql AS $$
  SELECT o.id || '|' || o.order_code || '|' || COALESCE(o.service_sequence::text, '-') || '|' || o.total || '|'
         || COALESCE(o.discount_amount, 0) || '|' ||
         COALESCE((SELECT string_agg(i.id::text || ':' || to_jsonb(i)::text, ';' ORDER BY i.id::text)
                     FROM public.kitchen_order_items i WHERE i.order_id = o.id), '')
    FROM public.kitchen_orders o WHERE o.id = p_o $$;
CREATE FUNCTION fc_test.n_orders_of(p_uid uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_orders WHERE customer_id = p_uid $$;

CREATE FUNCTION fc_test.svc(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM fc_test.as_service();
  BEGIN
    EXECUTE 'SET LOCAL ROLE service_role';
    EXECUTE p_sql INTO r;
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN EXECUTE 'RESET ROLE'; RAISE; END;
  RETURN r;
END $$;
CREATE FUNCTION fc_test.seal(p_o text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT fc_test.svc(format('SELECT public.food_club_seal_order_for_release(%L)::text', p_o))::jsonb $$;
CREATE FUNCTION fc_test.release(p_o text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT fc_test.svc(format('SELECT public.food_club_release_voucher_after_evidence(%L)::text', p_o))::jsonb $$;
CREATE FUNCTION fc_test.evidence(p_a uuid, p_fields jsonb) RETURNS bigint LANGUAGE sql AS $$
  SELECT fc_test.svc(format('SELECT public.food_club_record_checkout_evidence(%L, %L, %L)::text', p_a, 'get', p_fields))::bigint $$;

-- Passi del flusso Kitchen reale.
CREATE FUNCTION fc_test.fail_sumup(p_att uuid) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.as_service(); RETURN public.kitchen_payment_fail(p_att, 'sumup_failed', '{}'::jsonb); END $$;
-- Quello che fa l'endpoint S4 DOPO aver chiuso/verificato ogni checkout SumUp: la RPC service role di switch.
CREATE FUNCTION fc_test.switch(p_o text) RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  SELECT * INTO o FROM public.kitchen_orders WHERE id = p_o;
  PERFORM fc_test.as_service();
  RETURN public.kitchen_order_switch_to_counter_system(p_o, o.customer_id);
END $$;
CREATE FUNCTION fc_test.confirm(p_att uuid, p_ref text DEFAULT 'sumup-late') RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.as_service(); RETURN public.kitchen_payment_confirm(p_att, p_ref, '{}'::jsonb); END $$;
CREATE FUNCTION fc_test.abandon(p_o text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.backdate(p_o, now() - interval '6 minutes');
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(p_o);
END $$;
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

-- Ordine online con buono + attempt SumUp. p_claim: checkout richiesto a SumUp (claim + provider_ref).
CREATE FUNCTION fc_test.mk_online(p_claim boolean DEFAULT true, OUT m uuid, OUT v uuid, OUT o text, OUT a uuid)
LANGUAGE plpgsql AS $$
DECLARE ord public.kitchen_orders;
BEGIN
  m := fc_test.new_member(); v := fc_test.mkv(m);
  ord := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  o := ord.id;
  a := (fc_test.start_online(o)).id;
  IF p_claim THEN
    PERFORM fc_test.as_service();
    PERFORM public.kitchen_payment_attempt_claim_checkout(a);
    PERFORM fc_test.as_service();
    PERFORM public.kitchen_payment_attempt_set_provider_ref(a, 'co-' || a);
    UPDATE public.kitchen_payments SET checkout_claim_at = now() - interval '2 minutes' WHERE id = a;
  END IF;
END $$;
-- Ordine online con buono, pagamento non riuscito e mai passato al banco: abbandonato, buono trattenuto, sigillato.
CREATE FUNCTION fc_test.mk_sealed(p_claim boolean DEFAULT true, OUT m uuid, OUT v uuid, OUT o text, OUT a uuid)
LANGUAGE plpgsql AS $$
DECLARE s jsonb;
BEGIN
  SELECT x.m, x.v, x.o, x.a INTO m, v, o, a FROM fc_test.mk_online(p_claim) x;
  PERFORM fc_test.fail_sumup(a);
  PERFORM fc_test.abandon(o);
  PERFORM fc_test.set_ages(o, 1300);
  s := fc_test.seal(o);
  IF (s ->> 'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'mk_sealed: sigillo rifiutato %', s; END IF;
  PERFORM fc_test.set_sealed(o, 600);
END $$;

-- Ordine sigillato riportato "da pagare al banco" (PA -> PCP con online disattivato: transizione I3 consentita dal guard
-- Kitchen; nessuna RPC Kitchen di oggi la fa, e' il caso S15 di 60_release.sql). UPDATE reale, trigger tutti attivi.
-- E' l'unico modo in cui un incasso al banco arriva al trigger del sigillo senza essere gia' rifiutato da Kitchen.
CREATE FUNCTION fc_test.reopen_counter(p_o text) RETURNS void LANGUAGE sql AS $$
  UPDATE public.kitchen_orders SET status = 'pending_counter_payment', online_payment_disabled = true WHERE id = p_o $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-01/02/03/11: SumUp fallito -> "Pago al banco" (checkout chiuso) -> banco -> incasso; stesso ordine e comanda
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); before text; after text; sw public.kitchen_orders;
  pay public.kitchen_payments; n_before int; BEGIN
  SELECT * INTO r FROM fc_test.mk_online(true);
  n_before := fc_test.n_orders_of(r.m);
  before := fc_test.comanda(r.o);
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'D1-01 buono riservato sull''ordine online';
  PERFORM fc_test.fail_sumup(r.a);
  ASSERT (SELECT failure_reason FROM public.kitchen_payments WHERE id = r.a) = 'sumup_failed', 'D1-01 pagamento SumUp non riuscito';
  -- Prima della chiusura il banco e' bloccato da Kitchen (checkout ancora riattivabile): protezione invariata.
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s)) LIKE '%online_payment_in_progress%',
    'D1-01 banco bloccato finche'' il checkout non e'' chiuso';
  sw := fc_test.switch(r.o);
  ASSERT sw.id = r.o AND sw.status = 'pending_counter_payment' AND sw.online_payment_disabled,
    'D1-01 switch: stesso ordine in PCP, online disattivato ' || sw.status;
  ASSERT (SELECT status || '/' || failure_reason FROM public.kitchen_payments WHERE id = r.a) = 'failed/customer_switched_to_counter',
    'D1-01 attempt chiuso dallo switch';
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'D1-01 buono ancora riservato dopo lo switch';
  pay := fc_test.pay_counter(r.o, s);
  ASSERT pay.order_id = r.o AND pay.status = 'succeeded' AND pay.channel = 'counter', 'D1-11 incasso al banco registrato';
  ASSERT fc_test.ostatus(r.o) = 'received|paid', 'D1-11 ordine in cucina e pagato: ' || fc_test.ostatus(r.o);
  ASSERT fc_test.ok_charges(r.o) = 1, 'D1-11 un solo incasso';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vused_on(r.v) = r.o AND fc_test.vev_to_used(r.v) = 1,
    'D1-11 buono consumato una sola volta su questo ordine';
  after := fc_test.comanda(r.o);
  ASSERT before = after, format('D1-03 stessa comanda e stessi articoli: %s vs %s', before, after);
  ASSERT fc_test.n_orders_of(r.m) = n_before, 'D1-02 nessun ordine nuovo';
  RAISE NOTICE 'PASS D1-01 SumUp fallito -> switch (checkout chiuso) -> banco riuscito';
  RAISE NOTICE 'PASS D1-02 stesso ID ordine prima e dopo (%), nessun ordine nuovo', r.o;
  RAISE NOTICE 'PASS D1-03 stessa comanda, stessi articoli, stesso totale scontato';
  RAISE NOTICE 'PASS D1-11 incasso al banco e consumo unico del buono (eventi -> used: %)', fc_test.vev_to_used(r.v);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-04 checkout gia' chiuso (EXPIRED/CANCELLED: l'endpoint non manda DELETE e chiama subito lo switch)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); BEGIN
  SELECT * INTO r FROM fc_test.mk_online(true);   -- attempt ancora initiated: SumUp lo dice gia' chiuso
  PERFORM fc_test.switch(r.o);
  PERFORM fc_test.pay_counter(r.o, s, 'card_counter_manual');
  ASSERT fc_test.ostatus(r.o) = 'received|paid' AND fc_test.ok_charges(r.o) = 1
     AND fc_test.ok_charge_methods(r.o) = 'manual/card_counter_manual', 'D1-04 banco con carta al banco';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-04 buono consumato una volta';
  RAISE NOTICE 'PASS D1-04 checkout gia'' chiuso -> switch diretto -> banco, buono usato una volta';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-05/06 chiusura SumUp in errore o in timeout: l'endpoint risponde 409 retryable e NON scrive nulla.
-- Stato verificabile: ordine POP, buono riservato, banco ancora bloccato. Recupero sicuro col percorso esistente:
-- (a) il cliente riprova e la chiusura riesce -> banco; (b) nessuno riprova -> abbandono -> buono trattenuto -> sigillo
-- -> lo staff incassa al banco LO STESSO ordine (fix D1), buono consumato una volta.
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; r2 record; s uuid := fc_test.new_staff(); res_s text; res_g text; BEGIN
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.fail_sumup(r.a);
  -- errore/timeout della DELETE: nessuna RPC chiamata (vedi test API), quindi qui nessuna scrittura.
  ASSERT fc_test.ostatus(r.o) = 'pending_online_payment|' || COALESCE((SELECT payment_status FROM public.kitchen_orders WHERE id = r.o), '-'),
    'D1-05 ordine ancora POP';
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'D1-05 buono NON restituito';
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s)) LIKE '%online_payment_in_progress%',
    'D1-05 nessun secondo incasso autorizzato in automatico';
  -- (a) riprova riuscita
  PERFORM fc_test.switch(r.o);
  PERFORM fc_test.pay_counter(r.o, s);
  ASSERT fc_test.ok_charges(r.o) = 1 AND fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-05 riprova -> banco';
  RAISE NOTICE 'PASS D1-05 chiusura SumUp in errore: nessuna scrittura, buono trattenuto; la riprova porta al banco';

  -- (b) timeout e nessuna riprova: dopo 5 min lo sweep Kitchen abbandona l'ordine (PA), il buono resta trattenuto, poi
  -- il sigillo. Kitchen (produzione, guard I2 dal 20261009140000) non incassa al banco un ordine PA: lo stesso esito
  -- deve valere con e senza sigillo (il Club non aggiunge blocchi). Recupero esistente: PAID tardivo -> confirm.
  SELECT * INTO r2 FROM fc_test.mk_sealed(true);
  ASSERT fc_test.vstatus(r2.v) = 'reserved' AND fc_test.vev(r2.v, 'held_until_checkout_expiry') = 1, 'D1-06 buono trattenuto';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_release_seals WHERE order_id = r2.o), 'D1-06 ordine sigillato';
  SELECT * INTO r FROM fc_test.mk_online(true);                       -- gemello Club NON sigillato, stessa storia
  PERFORM fc_test.fail_sumup(r.a); PERFORM fc_test.abandon(r.o);
  res_s := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r2.o, s));
  res_g := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s));
  ASSERT res_s = res_g AND res_s LIKE '%online_order_paid_status_conflict%',
    format('D1-06 banco su PA: stesso esito Kitchen con e senza sigillo (sigillato=%s, gemello=%s)', res_s, res_g);
  ASSERT fc_test.ok_charges(r2.o) = 0 AND fc_test.vstatus(r2.v) = 'reserved', 'D1-06 nessun incasso, buono trattenuto';
  PERFORM fc_test.confirm(r2.a, 'co-' || r2.a);                       -- recupero esistente: PAID tardivo verificato
  -- K2: l'incasso tardivo e' registrato, l'ordine resta PA e va in "Da riconciliare" (payment_confirmed_after_abandon).
  ASSERT fc_test.ok_charges(r2.o) = 1 AND fc_test.alog(r2.o, 'payment_confirmed_after_abandon') = 1,
    'D1-06 PAID tardivo registrato una volta: ' || fc_test.ostatus(r2.o);
  ASSERT fc_test.vstatus(r2.v) = 'used' AND fc_test.vev_to_used(r2.v) = 1, 'D1-06 buono consumato una volta';
  ASSERT (fc_test.pay_counter(r2.o, s)).provider = 'sumup' AND fc_test.ok_charges(r2.o) = 1, 'D1-06 INCASSA dopo: nessun secondo incasso';
  RAISE NOTICE 'PASS D1-06 timeout della chiusura: nessuna scrittura; su PA il banco ha lo stesso esito Kitchen con e senza sigillo (%); PAID tardivo -> un incasso, buono usato una volta', left(res_s, 45);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-07 PAID SumUp concorrente alla transizione (sequenziale nei due ordini; due sessioni vere in p90)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); res text; pay public.kitchen_payments; BEGIN
  -- PAID prima: lo switch e' rifiutato, il banco restituisce l'incasso online esistente.
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);
  res := fc_test.try(format('SELECT fc_test.switch(%L)', r.o));
  ASSERT res LIKE '%order_has_succeeded_charge%' OR res LIKE '%order_not_pending_online_payment%', 'D1-07a switch dopo PAID: ' || res;
  pay := fc_test.pay_counter(r.o, s);
  ASSERT pay.provider = 'sumup' AND fc_test.ok_charges(r.o) = 1, 'D1-07a banco idempotente sull''incasso online';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-07a buono usato una volta';
  -- Switch prima, PAID subito dopo (prima dell'incasso al banco): confirm K2 incassa online, il banco non duplica.
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.switch(r.o);
  PERFORM fc_test.confirm(r.a, 'co-' || r.a);
  pay := fc_test.pay_counter(r.o, s);
  ASSERT fc_test.ok_charges(r.o) = 1 AND pay.provider = 'sumup', 'D1-07b un solo incasso: ' || fc_test.ok_charge_methods(r.o);
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-07b buono usato una volta';
  RAISE NOTICE 'PASS D1-07 PAID concorrente alla transizione: un solo incasso, buono usato una volta';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-08 PAID SumUp tardivo DOPO l'incasso al banco (ordine passato al banco e ordine sigillato)
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); res text; BEGIN
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.fail_sumup(r.a);
  PERFORM fc_test.switch(r.o);
  PERFORM fc_test.pay_counter(r.o, s);
  res := fc_test.try(format('SELECT fc_test.confirm(%L, %L)', r.a, 'co-' || r.a));
  ASSERT fc_test.ok_charges(r.o) = 1 AND fc_test.ok_charge_methods(r.o) = 'cash/cash', 'D1-08a resta un solo incasso (banco): ' || fc_test.ok_charge_methods(r.o);
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-08a buono usato una volta';
  RAISE NOTICE 'PASS D1-08a PAID tardivo dopo il banco (ordine PCP): un solo incasso registrato [confirm: %]', left(res, 60);

  -- sigillato e riportato al banco (unico caso in cui il banco passa su un ordine sigillato): PAID tardivo dopo l'incasso
  SELECT * INTO r FROM fc_test.mk_sealed(true);
  PERFORM fc_test.reopen_counter(r.o);
  PERFORM fc_test.pay_counter(r.o, s);
  res := fc_test.try(format('SELECT fc_test.confirm(%L, %L)', r.a, 'co-' || r.a));
  ASSERT fc_test.ok_charges(r.o) = 1 AND fc_test.ok_charge_methods(r.o) = 'cash/cash', 'D1-08b resta un solo incasso (banco)';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-08b buono usato una volta';
  RAISE NOTICE 'PASS D1-08b PAID tardivo dopo il banco (ordine sigillato): un solo incasso registrato [confirm: %]', left(res, 60);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-09 doppio click su "Pago al banco" (switch ripetuto) e doppio INCASSA
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); p1 public.kitchen_payments; p2 public.kitchen_payments;
  res text; n_logs int; BEGIN
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.fail_sumup(r.a);
  PERFORM fc_test.switch(r.o);
  n_logs := (SELECT count(*)::int FROM public.kitchen_action_log WHERE order_id = r.o);
  res := fc_test.try(format('SELECT fc_test.switch(%L)', r.o));
  ASSERT fc_test.ostatus(r.o) LIKE 'pending_counter_payment|%', 'D1-09 secondo switch non cambia l''ordine: ' || res;
  p1 := fc_test.pay_counter(r.o, s);
  p2 := fc_test.pay_counter(r.o, s);
  ASSERT p1.id = p2.id AND fc_test.ok_charges(r.o) = 1, 'D1-09 doppio INCASSA idempotente';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vev_to_used(r.v) = 1, 'D1-09 buono usato una volta';
  -- sigillato riportato al banco: doppio INCASSA
  SELECT * INTO r FROM fc_test.mk_sealed(true);
  PERFORM fc_test.reopen_counter(r.o);
  p1 := fc_test.pay_counter(r.o, s);
  p2 := fc_test.pay_counter(r.o, s);
  ASSERT p1.id = p2.id AND fc_test.ok_charges(r.o) = 1 AND fc_test.vev_to_used(r.v) = 1, 'D1-09 doppio INCASSA su sigillato';
  RAISE NOTICE 'PASS D1-09 doppio click: switch ripetuto [%], INCASSA idempotente, un solo incasso', left(res, 50);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-12 ordine Kitchen normale senza Food Club: stesso flusso, nessun effetto Club, mai sigillabile
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a uuid; before text; BEGIN
  o := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'online');
  before := fc_test.comanda(o.id);
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.fail_sumup(a);
  PERFORM fc_test.switch(o.id);
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.ostatus(o.id) = 'received|paid' AND fc_test.ok_charges(o.id) = 1, 'D1-12 Kitchen normale: banco ok';
  ASSERT fc_test.comanda(o.id) = before, 'D1-12 stessa comanda';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events WHERE order_id = o.id), 'D1-12 nessun evento Club';
  -- abbandonato senza buono: il sigillo non nasce; il banco su PA resta rifiutato da Kitchen come in produzione
  o := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'online');
  a := (fc_test.start_online(o.id)).id;
  PERFORM fc_test.abandon(o.id);
  PERFORM fc_test.set_ages(o.id, 1300);
  ASSERT (fc_test.seal(o.id)) ->> 'reason' = 'no_reserved_voucher', 'D1-12 nessun sigillo senza buono';
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s)) LIKE '%online_order_paid_status_conflict%',
    'D1-12 Kitchen normale abbandonato: banco rifiutato come in produzione';
  RAISE NOTICE 'PASS D1-12 ordine Kitchen senza Food Club: flusso invariato, nessun sigillo, nessun evento Club';
END $$;

-- ---------------------------------------------------------------------------------------------------
-- D1-S: il sigillo resta una protezione. L'unica eccezione e' l'incasso al banco dello stesso ordine finche' il buono
-- del sigillo e' ancora RISERVATO su quell'ordine.
-- ---------------------------------------------------------------------------------------------------
DO $$ DECLARE r record; s uuid := fc_test.new_staff(); res text; rel jsonb; BEGIN
  -- S1 buono restituito (P-A: checkout mai richiesto) -> banco rifiutato: niente doppio sconto
  SELECT * INTO r FROM fc_test.mk_sealed(false);
  rel := fc_test.release(r.o);
  ASSERT (rel ->> 'released')::boolean AND fc_test.vstatus(r.v) = 'available', 'D1-S1 buono restituito ' || rel::text;
  PERFORM fc_test.reopen_counter(r.o);
  res := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s));
  ASSERT res LIKE '%food_club_order_sealed%', 'D1-S1 banco rifiutato dopo la restituzione: ' || res;
  ASSERT fc_test.ok_charges(r.o) = 0 AND fc_test.vstatus(r.v) = 'available', 'D1-S1 nessun incasso, buono invariato';
  RAISE NOTICE 'PASS D1-S1 buono gia'' restituito: incasso al banco rifiutato (food_club_order_sealed)';

  -- S2 buono riservato altrove/usato su un altro ordine: rifiutato (fixture: il buono del sigillo e' stato riassegnato)
  SELECT * INTO r FROM fc_test.mk_sealed(true);
  PERFORM fc_test.fx_replica(true);
  UPDATE public.food_club_vouchers SET status = 'used', used_order_id = 'altro-ordine', reserved_order_id = NULL WHERE id = r.v;
  PERFORM fc_test.fx_replica(false);
  PERFORM fc_test.reopen_counter(r.o);
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s)) LIKE '%food_club_order_sealed%', 'D1-S2 buono non piu'' su questo ordine';
  RAISE NOTICE 'PASS D1-S2 buono non piu'' riservato su questo ordine: banco rifiutato';

  -- S3 prova SumUp PAID registrata sull'ordine sigillato: banco rifiutato (mai un secondo incasso)
  SELECT * INTO r FROM fc_test.mk_sealed(true);
  PERFORM fc_test.evidence(r.a, jsonb_build_object('http_status', 200, 'checkout_id', 'co-' || r.a,
                           'checkout_reference', r.a::text, 'sumup_status', 'PAID', 'amount', 1, 'currency', 'EUR'));
  PERFORM fc_test.reopen_counter(r.o);
  res := fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s));
  ASSERT res LIKE '%food_club_order_paid_evidence%', 'D1-S3 banco rifiutato con prova PAID: ' || res;
  ASSERT fc_test.ok_charges(r.o) = 0 AND fc_test.vstatus(r.v) = 'reserved', 'D1-S3 nessun incasso, buono trattenuto';
  RAISE NOTICE 'PASS D1-S3 prova SumUp PAID sul sigillato: banco rifiutato, buono trattenuto';

  -- S4 sul sigillato restano vietati: nuovi charge SumUp, nuove claim, charge non "incasso riuscito al banco"
  SELECT * INTO r FROM fc_test.mk_sealed(true);
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'app', 'sumup', 'sumup_online', 'charge', 'initiated', 1, 'customer')$q$, r.o), 'food_club_order_sealed');
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'app', 'sumup', 'sumup_online', 'charge', 'succeeded', 1, 'customer')$q$, r.o), 'food_club_order_sealed');
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'counter', 'cash', 'cash', 'charge', 'failed', 1, 'staff')$q$, r.o), 'food_club_order_sealed');
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
    VALUES (%L, 'walrus-main', 'counter', 'cash', 'cash', 'charge', 'pending', 1, 'staff')$q$, r.o), 'food_club_order_sealed');
  -- la claim del checkout sul sigillato resta rifiutata: coperta da 60_release.sql S4 (trigger claim non toccato)
  ASSERT fc_test.ok_charges(r.o) = 0 AND fc_test.vstatus(r.v) = 'reserved', 'D1-S4 nulla scritto';
  RAISE NOTICE 'PASS D1-S4 sigillo: charge SumUp e charge banco non riusciti restano rifiutati';

  -- S5 ordine annullato e sigillato: Kitchen rifiuta il banco come sempre (order_cancelled), buono trattenuto
  SELECT * INTO r FROM fc_test.mk_online(true);
  PERFORM fc_test.fail_sumup(r.a);
  PERFORM fc_test.cancel(r.o, s);
  PERFORM fc_test.set_ages(r.o, 1300);
  ASSERT ((fc_test.seal(r.o)) ->> 'ok')::boolean, 'D1-S5 sigillo su annullato';
  ASSERT fc_test.try(format('SELECT fc_test.pay_counter(%L, %L)', r.o, s)) LIKE '%order_cancelled%', 'D1-S5 annullato: order_cancelled';
  ASSERT fc_test.vstatus(r.v) = 'reserved', 'D1-S5 buono trattenuto';
  RAISE NOTICE 'PASS D1-S5 ordine annullato e sigillato: banco rifiutato da Kitchen come prima';

  -- S6 dopo l'incasso al banco sul sigillato il rilascio manuale/automatico non puo'' piu'' restituire il buono
  SELECT * INTO r FROM fc_test.mk_sealed(false);
  PERFORM fc_test.reopen_counter(r.o);
  PERFORM fc_test.pay_counter(r.o, s);
  ASSERT fc_test.ostatus(r.o) = 'received|paid' AND fc_test.ok_charges(r.o) = 1, 'D1-S6 banco sullo stesso ordine sigillato';
  ASSERT fc_test.vstatus(r.v) = 'used' AND fc_test.vused_on(r.v) = r.o AND fc_test.vev_to_used(r.v) = 1, 'D1-S6 buono usato una volta';
  rel := fc_test.release(r.o);
  ASSERT rel ->> 'result' = 'already_used' AND fc_test.vstatus(r.v) = 'used' AND fc_test.vev(r.v, 'released_after_checkout_evidence') = 0,
    'D1-S6 rilascio dopo il banco: ' || rel::text;
  RAISE NOTICE 'PASS D1-S6 incasso al banco su sigillato P-A, poi rilascio: already_used, nessuna restituzione';
END $$;
