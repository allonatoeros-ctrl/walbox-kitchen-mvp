-- P1b Lo staff incassa al banco mentre l'attempt SumUp è ancora `initiated`.
-- Atteso SICURO: rifiutato con `online_payment_in_progress` (20260913120000:59-68), zero charge.
-- Due varianti: ordine online (POP) e ordine corsia banco (PCP) con checkout online aperto dall'app.
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff();
  o public.kitchen_orders; p public.kitchen_orders; a public.kitchen_payments; b public.kitchen_payments;
  r_pop text; r_pcp text;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  r_pop := kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s));
  p := kp_test.new_order(u, 'counter');
  ASSERT p.status = 'pending_counter_payment', 'P1b ordine PCP';
  b := fc_test.start_online(p.id);
  ASSERT b.status = 'initiated', 'P1b attempt online su ordine PCP';
  r_pcp := kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', p.id, s));
  RAISE NOTICE 'EVID P1b record_counter con attempt initiated -> POP: % | PCP: % | charge POP=% PCP=%',
    r_pop, r_pcp, kp_test.succeeded_charges(o.id), kp_test.succeeded_charges(p.id);
  ASSERT position('online_payment_in_progress' IN r_pop) > 0, 'P1b POP: banco deve essere rifiutato per attempt in corso';
  ASSERT position('online_payment_in_progress' IN r_pcp) > 0, 'P1b PCP: banco deve essere rifiutato per attempt in corso';
  ASSERT kp_test.succeeded_charges(o.id) = 0 AND kp_test.succeeded_charges(p.id) = 0, 'P1b nessun charge';
  RAISE NOTICE 'PASS P1b banco rifiutato con attempt SumUp initiated (online_payment_in_progress)';
END $$;
