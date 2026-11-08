-- P2 Pagamento tardivo: attempt failed/abandoned_timeout + PAID SumUp -> confirm.
-- Atteso (design D4, 20261012100000:259-264, :311-326): charge `succeeded` nel ledger, ordine resta
-- payment_abandoned (niente paid, niente cucina), log `payment_confirmed_after_abandon` con needs_manual_reconciliation.
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); o public.kitchen_orders; a public.kitchen_payments; r public.kitchen_payments;
  lg jsonb;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.abandon(o.id);
  r := kp_test.confirm(a.id);
  SELECT metadata INTO lg FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed_after_abandon';
  RAISE NOTICE 'EVID P2 confirm -> attempt %/%, charge succeeded=%, ordine %/%, log=%',
    r.status, r.failure_reason, kp_test.succeeded_charges(o.id), (kp_test.ord(o.id)).status,
    (kp_test.ord(o.id)).payment_status, lg;
  ASSERT r.id = a.id AND r.status = 'succeeded', 'P2 il charge SumUp entra nel ledger';
  ASSERT kp_test.succeeded_charges(o.id) = 1, 'P2 un solo charge';
  ASSERT (kp_test.ord(o.id)).status = 'payment_abandoned', 'P2 ordine resta PA';
  ASSERT (kp_test.ord(o.id)).payment_status IS DISTINCT FROM 'paid', 'P2 ordine non marcato paid';
  ASSERT (lg->>'needs_manual_reconciliation')::boolean AND lg->>'promoted_from_failure_reason' = 'abandoned_timeout',
    'P2 log back-office con riconciliazione manuale';
  ASSERT kp_test.log_count(o.id, 'payment_confirmed') = 0, 'P2 nessun payment_confirmed normale';
  RAISE NOTICE 'PASS P2 PAID tardivo dopo abbandono: charge nel ledger, ordine PA, log di riconciliazione';
END $$;
