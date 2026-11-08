-- P6e K2: PAID SumUp su un attempt `cancelled` (annullo staff). Prova il comportamento reale di
-- kitchen_payment_confirm (migration 20261108130000): ordine annullato -> payment_confirmed_after_cancel;
-- banco gia' incassato -> payment_confirm_lost_race (double_charge); idempotenza; provider non sumup rifiutato.
-- Ogni blocco gira nella transazione del runner (ROLLBACK finale). Se un assert fallisce lo script esce con errore.
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.confirm_ref(p_attempt uuid, p_ref text) RETURNS public.kitchen_payments
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_confirm(p_attempt, p_ref, '{"status":"PAID"}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.lr(p_order text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT metadata FROM public.kitchen_action_log WHERE order_id = p_order AND action = 'payment_confirm_lost_race' $$;

-- Stato persistente tra i blocchi (stessa transazione): ordine annullato di P6e-1, riusato da P6e-4.
CREATE TEMP TABLE p6e_ctx (k text PRIMARY KEY, v text);

-- P6e-1: ordine annullato dallo staff + attempt SumUp cancelled + PAID con id checkout diverso dall'id attempt
DO $$ DECLARE
  s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments; r public.kitchen_payments;
  ref text; o2 public.kitchen_orders;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ref := 'co-' || gen_random_uuid();
  UPDATE public.kitchen_payments SET provider_ref = ref WHERE id = a.id;
  ASSERT (kp_test.attempt(a.id)).status = 'cancelled' AND (kp_test.ord(o.id)).status = 'cancelled', 'P6e-1 setup: attempt e ordine annullati';
  o2 := kp_test.ord(o.id);
  r := pg_temp.confirm_ref(a.id, 'sumup-' || a.id);
  ASSERT r.id = a.id AND r.status = 'succeeded', 'P6e-1 attempt non diventato succeeded';
  ASSERT (kp_test.attempt(a.id)).status = 'succeeded' AND kp_test.succeeded_charges(o.id) = 1,
    'P6e-1 deve esserci esattamente 1 charge succeeded';
  ASSERT kp_test.log_count(o.id, 'payment_confirmed_after_cancel') = 1, 'P6e-1 log payment_confirmed_after_cancel atteso 1';
  ASSERT kp_test.log_count(o.id, 'payment_confirmed') = 0 AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 0,
    'P6e-1 nessun payment_confirmed / lost_race';
  ASSERT (kp_test.ord(o.id)).status = 'cancelled' AND (kp_test.ord(o.id)).payment_status IS NOT DISTINCT FROM o2.payment_status
     AND (kp_test.ord(o.id)).payment_status IS DISTINCT FROM 'paid', 'P6e-1 ordine annullato non deve diventare paid';
  ASSERT (SELECT (metadata->>'needs_manual_reconciliation') FROM public.kitchen_action_log
          WHERE order_id = o.id AND action = 'payment_confirmed_after_cancel') = 'true', 'P6e-1 needs_manual_reconciliation true';
  INSERT INTO p6e_ctx VALUES ('o1', o.id), ('a1', a.id::text);
  RAISE NOTICE 'PASS P6e-1 PAID su attempt cancelled: 1 charge succeeded, log after_cancel, ordine resta cancelled/%', o2.payment_status;
END $$;

-- Helper P6e-2/3/5: ordine online con attempt SumUp, passato al banco e incassato in contanti; poi attempt forzato a cancelled.
CREATE OR REPLACE FUNCTION pg_temp.banco_poi_cancelled(OUT o public.kitchen_orders, OUT a public.kitchen_payments,
  OUT c public.kitchen_payments) LANGUAGE plpgsql AS $$
DECLARE s uuid := fc_test.new_staff();
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  c := fc_test.pay_counter(o.id, s);
  UPDATE public.kitchen_payments SET status = 'cancelled', failure_reason = NULL, provider_ref = 'co-' || gen_random_uuid()
   WHERE id = a.id;
  ASSERT (kp_test.attempt(a.id)).status = 'cancelled' AND kp_test.succeeded_charges(o.id) = 1, 'setup: banco incassato + attempt cancelled';
END $$;

-- P6e-2: banco gia' incassato (contanti) + attempt SumUp cancelled + PAID -> lost_race double_charge
DO $$ DECLARE t record; lr jsonb;
BEGIN
  SELECT * INTO t FROM pg_temp.banco_poi_cancelled();
  PERFORM pg_temp.confirm_ref((t.a).id, 'sumup-' || (t.a).id);
  lr := pg_temp.lr((t.o).id);
  RAISE NOTICE 'EVID P6e-2 %', lr;
  ASSERT kp_test.succeeded_charges((t.o).id) = 1
     AND (SELECT channel FROM public.kitchen_payments WHERE order_id = (t.o).id AND status = 'succeeded') = 'counter',
    'P6e-2 il ledger deve avere 1 solo charge succeeded: quello del banco';
  ASSERT (kp_test.attempt((t.a).id)).status = 'cancelled', 'P6e-2 attempt SumUp deve restare cancelled';
  ASSERT kp_test.log_count((t.o).id, 'payment_confirm_lost_race') = 1, 'P6e-2 atteso 1 log lost_race';
  ASSERT lr->>'classification' = 'double_charge' AND lr->>'double_charge' = 'true'
     AND lr->>'needs_manual_reconciliation' = 'true' AND lr->>'losing_status_before' = 'cancelled'
     AND lr->>'losing_attempt_id' = (t.a).id::text AND lr->>'winning_payment_id' = (t.c).id::text,
    'P6e-2 lost_race non classificato double_charge / needs_manual_reconciliation';
  RAISE NOTICE 'PASS P6e-2 banco + SumUp su cancelled = lost_race double_charge, 1 charge';
END $$;

-- P6e-3: stesso caso, confirm ripetuta 3 volte -> un solo lost_race, nessun secondo charge
DO $$ DECLARE t record; i int;
BEGIN
  SELECT * INTO t FROM pg_temp.banco_poi_cancelled();
  FOR i IN 1..3 LOOP PERFORM pg_temp.confirm_ref((t.a).id, 'sumup-' || (t.a).id); END LOOP;
  ASSERT kp_test.log_count((t.o).id, 'payment_confirm_lost_race') = 1, 'P6e-3 lost_race duplicato dopo 3 confirm';
  ASSERT kp_test.succeeded_charges((t.o).id) = 1 AND (kp_test.attempt((t.a).id)).status = 'cancelled',
    'P6e-3 secondo charge o attempt cambiato';
  RAISE NOTICE 'PASS P6e-3 3 confirm = 1 lost_race, 1 charge';
END $$;

-- P6e-4: confirm ripetuta sull'attempt gia' succeeded di P6e-1 -> no-op
DO $$ DECLARE oid text; aid uuid; before_row public.kitchen_payments; r public.kitchen_payments; logs_before int; i int;
BEGIN
  SELECT v INTO oid FROM p6e_ctx WHERE k = 'o1'; SELECT v::uuid INTO aid FROM p6e_ctx WHERE k = 'a1';
  before_row := kp_test.attempt(aid);
  SELECT count(*) INTO logs_before FROM public.kitchen_action_log WHERE order_id = oid;
  FOR i IN 1..2 LOOP r := pg_temp.confirm_ref(aid, 'sumup-altro-ref'); END LOOP;
  ASSERT r = before_row AND kp_test.attempt(aid) = before_row, 'P6e-4 la riga e'' cambiata';
  ASSERT (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = oid) = logs_before
     AND kp_test.log_count(oid, 'payment_confirmed_after_cancel') = 1 AND kp_test.succeeded_charges(oid) = 1,
    'P6e-4 nuovi log o charge su confirm ripetuta';
  RAISE NOTICE 'PASS P6e-4 confirm ripetuta su succeeded = no-op';
END $$;

-- P6e-5: attempt cancelled di provider NON sumup -> invalid_attempt_status
DO $$ DECLARE o public.kitchen_orders; a public.kitchen_payments; res text; pid uuid;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  UPDATE public.kitchen_payments SET status = 'cancelled', provider = 'manual', failure_reason = NULL WHERE id = a.id;
  ASSERT (kp_test.attempt(a.id)).provider = 'manual' AND (kp_test.attempt(a.id)).status = 'cancelled', 'P6e-5 setup';
  res := kp_test.try(format('SELECT pg_temp.confirm_ref(%L, %L)', a.id, 'sumup-x'));
  RAISE NOTICE 'EVID P6e-5 %', res;
  ASSERT res LIKE '%invalid_attempt_status%', format('P6e-5 atteso invalid_attempt_status, ottenuto %s', res);
  ASSERT (kp_test.attempt(a.id)).status = 'cancelled' AND kp_test.succeeded_charges(o.id) = 0, 'P6e-5 stato cambiato';
  RAISE NOTICE 'PASS P6e-5 cancelled non-sumup = invalid_attempt_status';
END $$;
