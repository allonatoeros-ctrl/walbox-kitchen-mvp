-- P6a PAID SumUp su attempt `cancelled` (ordine annullato dallo staff con kitchen_order_cancel_with_payment_attempt,
-- 20260921100000:166-247). Il webhook ignora già a monte gli attempt cancelled (api/kitchen-sumup-webhook.js:89).
-- Atteso SICURO: un incasso reale non sparisce dal ledger (charge succeeded + log needs_manual_reconciliation, come il
-- ramo `payment_confirmed_after_cancel`). Oggi confirm rifiuta con invalid_attempt_status: [DIFETTO].
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  res text;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT (kp_test.attempt(a.id)).status = 'cancelled' AND (kp_test.ord(o.id)).status = 'cancelled', 'P6a attempt e ordine annullati';
  res := kp_test.try(format('SELECT kp_test.confirm(%L)', a.id));
  RAISE NOTICE 'EVID P6a confirm su attempt cancelled -> % | charge=% | log after_cancel=% | attempt %',
    res, kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirmed_after_cancel'), (kp_test.attempt(a.id)).status;
  ASSERT kp_test.succeeded_charges(o.id) = 1 OR kp_test.log_count(o.id, 'payment_confirmed_after_cancel') = 1,
    'P6a [DIFETTO] PAID reale su attempt cancelled rifiutato (invalid_attempt_status): incasso fuori dal ledger, nessuna traccia';
  RAISE NOTICE 'PASS P6a PAID su attempt cancelled tracciato';
END $$;
