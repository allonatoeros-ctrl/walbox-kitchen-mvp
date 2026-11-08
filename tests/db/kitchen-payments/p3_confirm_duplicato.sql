-- P3 Webhook ripetuto: due kitchen_payment_confirm sullo stesso attempt.
-- Atteso SICURO: un solo charge, seconda chiamata innocua (idempotente: ritorna la stessa riga, 20261012100000:254-256).
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); o public.kitchen_orders; a public.kitchen_payments;
  r1 public.kitchen_payments; r2 public.kitchen_payments; paid1 timestamptz;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  r1 := kp_test.confirm(a.id);
  paid1 := (kp_test.ord(o.id)).paid_at;
  r2 := kp_test.confirm(a.id);
  RAISE NOTICE 'EVID P3 1a confirm %, 2a confirm % (stessa riga=%), charge=%, log payment_confirmed=%, ordine %/%',
    r1.status, r2.status, r1.id = r2.id, kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirmed'),
    (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status;
  ASSERT r1.id = a.id AND r2.id = a.id AND r2.status = 'succeeded', 'P3 seconda chiamata idempotente';
  ASSERT kp_test.succeeded_charges(o.id) = 1, 'P3 un solo charge';
  ASSERT kp_test.log_count(o.id, 'payment_confirmed') = 1, 'P3 nessun log duplicato';
  ASSERT (kp_test.ord(o.id)).paid_at = paid1, 'P3 paid_at non riscritto';
  RAISE NOTICE 'PASS P3 confirm duplicato idempotente';
END $$;
