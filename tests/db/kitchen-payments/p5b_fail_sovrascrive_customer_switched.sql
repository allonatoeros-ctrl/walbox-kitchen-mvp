-- P5b Come P5a ma l'attempt è failed/customer_switched_to_counter (il cliente ha scelto "Paga al banco",
-- kitchen_order_switch_to_counter_system, 20261012100000:593-685) e poi arriva il webhook SumUp FAILED.
-- Atteso SICURO: motivo invariato e incasso al banco possibile; altrimenti [DIFETTO].
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  reason_after text; counter_res text;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  ASSERT (kp_test.attempt(a.id)).failure_reason = 'customer_switched_to_counter', 'P5b attempt chiuso dallo switch';
  ASSERT (kp_test.ord(o.id)).status = 'pending_counter_payment', 'P5b ordine PCP';
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  reason_after := (kp_test.attempt(a.id)).failure_reason;
  counter_res := kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s));
  RAISE NOTICE 'EVID P5b motivo customer_switched_to_counter -> % | record_counter -> % | charge=%',
    reason_after, counter_res, kp_test.succeeded_charges(o.id);
  ASSERT reason_after = 'customer_switched_to_counter',
    'P5b [DIFETTO] webhook FAILED sovrascrive customer_switched_to_counter con sumup_failed';
  ASSERT counter_res = 'OK',
    'P5b [DIFETTO] incasso al banco bloccato (online_payment_in_progress) dopo Paga al banco + webhook FAILED';
  RAISE NOTICE 'PASS P5b motivo non sovrascritto, banco possibile';
END $$;
