-- P6d K2 affinamento (Passo 3B, 2026-11-08): classificazione del lost_race in kitchen_payment_confirm.
-- Regola di Eros: double_charge=true solo con due incassi economici distinti e provati
-- (provider_verified = SumUp con id checkout reale, staff_recorded = banco contanti/POS manuale).
-- Stesso provider_ref = duplicate_notification; prova insufficiente = unverified_collection.
-- needs_manual_reconciliation sempre true. Ogni blocco gira nella transazione del runner (ROLLBACK finale).
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.confirm_ref(p_attempt uuid, p_ref text) RETURNS public.kitchen_payments
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_confirm(p_attempt, p_ref, '{"status":"PAID"}'::jsonb);
END $$;

-- Due attempt SumUp distinti sullo stesso ordine (stessa costruzione di P7a): a1 scade (sumup_expired, cosi'
-- start crea un attempt nuovo a2), poi un FAILED tardivo lo porta a sumup_failed (di nuovo confermabile).
CREATE OR REPLACE FUNCTION pg_temp.two_attempts(OUT o public.kitchen_orders, OUT a1 public.kitchen_payments,
  OUT a2 public.kitchen_payments) LANGUAGE plpgsql AS $$
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a1 := fc_test.start_online(o.id);
  PERFORM kp_test.fail(a1.id, 'sumup_expired');
  a2 := fc_test.start_online(o.id);
  PERFORM kp_test.fail(a1.id, 'sumup_failed');
  ASSERT a1.id <> a2.id AND (kp_test.attempt(a1.id)).failure_reason = 'sumup_failed', 'setup: due attempt distinti';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.lr(p_order text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT metadata FROM public.kitchen_action_log WHERE order_id = p_order AND action = 'payment_confirm_lost_race' $$;

-- 1) banco (contanti) + SumUp con id checkout reale -> double_charge (staff_recorded + provider_verified)
DO $$ DECLARE
  s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments; c public.kitchen_payments; lr jsonb;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  c := fc_test.pay_counter(o.id, s);
  PERFORM pg_temp.confirm_ref(a.id, 'sumup-' || a.id);
  lr := pg_temp.lr(o.id);
  RAISE NOTICE 'EVID P6d-1 %', lr;
  ASSERT lr->>'classification' = 'double_charge' AND lr->>'double_charge' = 'true'
     AND lr->>'winning_evidence' = 'staff_recorded' AND lr->>'losing_evidence' = 'provider_verified'
     AND lr->>'needs_manual_reconciliation' = 'true' AND kp_test.succeeded_charges(o.id) = 1,
    'P6d-1 [DIFETTO] banco + SumUp verificato non classificato double_charge';
  RAISE NOTICE 'PASS P6d-1 banco + SumUp verificato = double_charge';
END $$;

-- 2) banco con POS manuale (card_counter_manual) + SumUp verificato -> double_charge
DO $$ DECLARE
  s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments; lr jsonb;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  PERFORM fc_test.pay_counter(o.id, s, 'card_counter_manual');
  PERFORM pg_temp.confirm_ref(a.id, 'sumup-' || a.id);
  lr := pg_temp.lr(o.id);
  ASSERT lr->>'classification' = 'double_charge' AND lr->>'winning_evidence' = 'staff_recorded'
     AND lr->>'winning_method' = 'card_counter_manual',
    'P6d-2 [DIFETTO] banco POS manuale + SumUp verificato non classificato double_charge';
  RAISE NOTICE 'PASS P6d-2 POS manuale + SumUp verificato = double_charge';
END $$;

-- 3) SumUp + SumUp, due checkout distinti e verificati -> double_charge (entrambi provider_verified)
DO $$ DECLARE t record; o public.kitchen_orders; a1 public.kitchen_payments; a2 public.kitchen_payments; lr jsonb;
BEGIN
  SELECT * INTO t FROM pg_temp.two_attempts(); o := t.o; a1 := t.a1; a2 := t.a2;
  PERFORM pg_temp.confirm_ref(a2.id, 'sumup-' || a2.id);
  PERFORM pg_temp.confirm_ref(a1.id, 'sumup-' || a1.id);
  lr := pg_temp.lr(o.id);
  RAISE NOTICE 'EVID P6d-3 %', lr;
  ASSERT lr->>'classification' = 'double_charge' AND lr->>'double_charge' = 'true'
     AND lr->>'winning_evidence' = 'provider_verified' AND lr->>'losing_evidence' = 'provider_verified'
     AND lr->>'winning_payment_id' = a2.id::text AND lr->>'losing_attempt_id' = a1.id::text,
    'P6d-3 [DIFETTO] due checkout SumUp distinti e verificati non classificati double_charge';
  RAISE NOTICE 'PASS P6d-3 SumUp + SumUp distinti = double_charge';
END $$;

-- 4) stesso provider_ref su vincente e perdente -> duplicate_notification, double_charge=false
--    + idempotenza: la stessa notifica ripetuta non crea un secondo log
DO $$ DECLARE t record; o public.kitchen_orders; a1 public.kitchen_payments; a2 public.kitchen_payments; lr jsonb; i int;
BEGIN
  SELECT * INTO t FROM pg_temp.two_attempts(); o := t.o; a1 := t.a1; a2 := t.a2;
  PERFORM pg_temp.confirm_ref(a2.id, 'sumup-' || a2.id);
  FOR i IN 1..3 LOOP PERFORM pg_temp.confirm_ref(a1.id, 'sumup-' || a2.id); END LOOP;
  lr := pg_temp.lr(o.id);
  RAISE NOTICE 'EVID P6d-4 %', lr;
  ASSERT lr->>'classification' = 'duplicate_notification' AND lr->>'double_charge' = 'false'
     AND lr->>'needs_manual_reconciliation' = 'true'
     AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 1 AND kp_test.succeeded_charges(o.id) = 1,
    'P6d-4 [DIFETTO] stessa transazione SumUp notificata due volte trattata come doppio incasso';
  RAISE NOTICE 'PASS P6d-4 stesso provider_ref = duplicate_notification, una sola segnalazione';
END $$;

-- 5) perdente con provider_ref = id attempt (fallback checkout.id ?? attempt.id) -> unverified_collection
DO $$ DECLARE s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments; lr jsonb;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  PERFORM fc_test.pay_counter(o.id, s);
  PERFORM pg_temp.confirm_ref(a.id, a.id::text);
  lr := pg_temp.lr(o.id);
  ASSERT lr->>'classification' = 'unverified_collection' AND lr->>'double_charge' = 'false'
     AND lr->>'losing_evidence' = 'unverified' AND lr->>'winning_evidence' = 'staff_recorded'
     AND lr->>'needs_manual_reconciliation' = 'true',
    'P6d-5 [DIFETTO] PAID senza id checkout SumUp reale dichiarato double_charge';
  RAISE NOTICE 'PASS P6d-5 provider_ref di fallback = unverified_collection';
END $$;

-- 6) perdente con provider_ref vuoto o NULL -> unverified_collection
DO $$ DECLARE s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments; lr jsonb; ref text;
BEGIN
  FOREACH ref IN ARRAY ARRAY['', '   ', NULL] LOOP
    o := kp_test.new_order(fc_test.new_user(), 'online');
    a := fc_test.start_online(o.id);
    PERFORM kp_test.switch_to_counter(o.id);
    PERFORM fc_test.pay_counter(o.id, s);
    PERFORM pg_temp.confirm_ref(a.id, ref);
    lr := pg_temp.lr(o.id);
    ASSERT lr->>'classification' = 'unverified_collection' AND lr->>'double_charge' = 'false',
      format('P6d-6 [DIFETTO] provider_ref %L dichiarato double_charge', ref);
  END LOOP;
  RAISE NOTICE 'PASS P6d-6 provider_ref vuoto/spazi/NULL = unverified_collection';
END $$;

-- 7) vincente SumUp con provider_ref = proprio id (fallback) + perdente verificato -> unverified_collection
DO $$ DECLARE t record; o public.kitchen_orders; a1 public.kitchen_payments; a2 public.kitchen_payments; lr jsonb;
BEGIN
  SELECT * INTO t FROM pg_temp.two_attempts(); o := t.o; a1 := t.a1; a2 := t.a2;
  PERFORM pg_temp.confirm_ref(a2.id, a2.id::text);
  PERFORM pg_temp.confirm_ref(a1.id, 'sumup-' || a1.id);
  lr := pg_temp.lr(o.id);
  ASSERT lr->>'classification' = 'unverified_collection' AND lr->>'double_charge' = 'false'
     AND lr->>'winning_evidence' = 'unverified' AND lr->>'losing_evidence' = 'provider_verified',
    'P6d-7 [DIFETTO] vincente SumUp senza id checkout reale dichiarato double_charge';
  RAISE NOTICE 'PASS P6d-7 vincente SumUp non verificato = unverified_collection';
END $$;

-- 8) vincente banco non economico (omaggio manual_comp, scritto a mano: nessuna RPC lo crea) -> unverified_collection
DO $$ DECLARE o public.kitchen_orders; a public.kitchen_payments; lr jsonb;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type)
  VALUES (o.id, o.venue_id, 'counter', 'manual', 'manual_comp', 'charge', 'succeeded', o.total, 'staff');
  PERFORM pg_temp.confirm_ref(a.id, 'sumup-' || a.id);
  lr := pg_temp.lr(o.id);
  ASSERT lr->>'classification' = 'unverified_collection' AND lr->>'double_charge' = 'false'
     AND lr->>'winning_evidence' = 'unverified',
    'P6d-8 [DIFETTO] omaggio al banco + SumUp dichiarato double_charge';
  RAISE NOTICE 'PASS P6d-8 vincente omaggio = unverified_collection';
END $$;

-- 9) percorsi normali invariati: confirm senza conflitto non scrive lost_race
DO $$ DECLARE o public.kitchen_orders; a public.kitchen_payments; r public.kitchen_payments;
BEGIN
  o := kp_test.new_order(fc_test.new_user(), 'online');
  a := fc_test.start_online(o.id);
  r := pg_temp.confirm_ref(a.id, 'sumup-' || a.id);
  ASSERT r.id = a.id AND r.status = 'succeeded' AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 0
     AND (kp_test.ord(o.id)).payment_status = 'paid',
    'P6d-9 [DIFETTO] percorso online normale cambiato';
  RAISE NOTICE 'PASS P6d-9 online normale invariato';
END $$;
