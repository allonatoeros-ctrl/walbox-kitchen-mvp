-- P5a Sovrascrittura motivo: attempt failed/staff_closed_for_counter (PASSA AL BANCO dello staff) + webhook SumUp
-- FAILED -> kitchen_payment_fail(attempt,'sumup_failed') service_role (api/_lib/sumupPaymentResolution.js:80-86).
-- Atteso SICURO: il motivo resta staff_closed_for_counter e l'incasso al banco resta possibile.
-- Se il motivo diventa sumup_failed, record_counter è bloccato da online_payment_in_progress: [DIFETTO].
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  reason_after text; counter_res text; start_res text; counter_after_reclose text;
BEGIN
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  ASSERT (kp_test.attempt(a.id)).failure_reason = 'staff_closed_for_counter', 'P5a chiuso per il banco';
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  reason_after := (kp_test.attempt(a.id)).failure_reason;
  counter_res := kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s));
  start_res := kp_test.try(format('SELECT fc_test.start_online(%L)', o.id));
  -- mitigazione manuale: lo staff ripreme PASSA AL BANCO e riprova
  counter_after_reclose := kp_test.try(format('SELECT kp_test.close_unpaid(%L, %L), fc_test.pay_counter(%L, %L)', a.id, s, o.id, s));
  RAISE NOTICE 'EVID P5a motivo staff_closed_for_counter -> % | record_counter -> % | attempt_start cliente -> % | log payment_failed recheck=% | dopo un secondo PASSA AL BANCO: record_counter -> %',
    reason_after, counter_res, start_res,
    (SELECT metadata FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_failed' ORDER BY created_at DESC LIMIT 1),
    counter_after_reclose;
  ASSERT reason_after = 'staff_closed_for_counter',
    'P5a [DIFETTO] webhook FAILED sovrascrive staff_closed_for_counter con sumup_failed (attempt di nuovo retry-eligible/confermabile)';
  ASSERT counter_res = 'OK',
    'P5a [DIFETTO] incasso al banco bloccato (online_payment_in_progress) dopo PASSA AL BANCO + webhook FAILED';
  RAISE NOTICE 'PASS P5a motivo non sovrascritto, banco possibile';
END $$;
