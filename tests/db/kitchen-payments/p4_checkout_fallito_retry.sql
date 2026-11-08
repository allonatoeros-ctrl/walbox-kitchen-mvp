-- P4 Checkout fallito e retry sullo stesso checkout: attempt failed/sumup_failed -> attempt_start restituisce lo
-- stesso attempt (20261012100000:470-488) -> PAID -> confirm accettato (promozione da failed/sumup_failed).
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); o public.kitchen_orders; a public.kitchen_payments; a2 public.kitchen_payments;
  r public.kitchen_payments; lg jsonb;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  a2 := fc_test.start_online(o.id);
  r := kp_test.confirm(a2.id);
  SELECT metadata INTO lg FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed';
  RAISE NOTICE 'EVID P4 retry attempt_start -> stesso attempt=% (status %/%), confirm -> %, ordine %/%, log=%',
    a2.id = a.id, a2.status, a2.failure_reason, r.status, (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status, lg;
  ASSERT a2.id = a.id, 'P4 attempt_start riusa l attempt sumup_failed';
  ASSERT r.id = a.id AND r.status = 'succeeded', 'P4 confirm accettato';
  ASSERT (kp_test.ord(o.id)).status = 'received' AND (kp_test.ord(o.id)).payment_status = 'paid', 'P4 ordine in cucina e pagato';
  ASSERT lg->>'promoted_from_failure_reason' = 'sumup_failed', 'P4 log promozione da sumup_failed';
  ASSERT kp_test.succeeded_charges(o.id) = 1, 'P4 un solo charge';
  RAISE NOTICE 'PASS P4 checkout fallito -> retry stesso attempt -> PAID';
END $$;
