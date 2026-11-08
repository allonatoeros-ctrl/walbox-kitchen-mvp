-- P6b PAID SumUp su attempt failed/customer_switched_to_counter DOPO che lo staff ha già incassato al banco.
-- Atteso SICURO: il secondo incasso reale (SumUp) resta visibile nel ledger o in un log di riconciliazione.
-- Oggi confirm rifiuta con invalid_attempt_status (20261012100000:258-264): doppio incasso, il secondo fuori ledger. [DIFETTO]
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  c public.kitchen_payments; res text; logs int; lr jsonb;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  c := fc_test.pay_counter(o.id, s);
  ASSERT c.status = 'succeeded', 'P6b incasso al banco riuscito';
  res := kp_test.try(format('SELECT kp_test.confirm(%L)', a.id));
  SELECT count(*) INTO logs FROM public.kitchen_action_log
   WHERE order_id = o.id AND action IN ('payment_confirm_lost_race', 'payment_confirmed_after_cancel', 'payment_confirmed_after_abandon');
  RAISE NOTICE 'EVID P6b confirm su failed/customer_switched_to_counter dopo banco -> % | charge=% (solo banco) | log riconciliazione=% | attempt %/% | ordine %/%',
    res, kp_test.succeeded_charges(o.id), logs, (kp_test.attempt(a.id)).status, (kp_test.attempt(a.id)).failure_reason,
    (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status;
  ASSERT res = 'OK' AND logs >= 1,
    'P6b [DIFETTO] PAID reale dopo switch+banco rifiutato (invalid_attempt_status): soldi presi due volte, il secondo senza traccia nel DB';
  -- D4 (Eros, 2026-11-08): non basta una traccia qualsiasi. Il secondo incasso deve essere il lost_race
  -- con double_charge + needs_manual_reconciliation e i riferimenti dei due incassi; il ledger resta a 1 charge.
  SELECT metadata INTO lr FROM public.kitchen_action_log
   WHERE order_id = o.id AND action = 'payment_confirm_lost_race';
  RAISE NOTICE 'EVID P6b log lost_race: %', lr;
  ASSERT kp_test.succeeded_charges(o.id) = 1 AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 1
     AND lr->>'double_charge' = 'true' AND lr->>'needs_manual_reconciliation' = 'true'
     AND lr->>'losing_attempt_id' = a.id::text AND lr->>'winning_payment_id' = c.id::text
     AND lr->>'losing_failure_reason_before' = 'customer_switched_to_counter',
    'P6b [DIFETTO] doppio incasso switch + banco + SumUp non segnalato come double_charge';
  RAISE NOTICE 'PASS P6b doppio incasso registrato e segnalato';
END $$;
