-- P5c K1 (migration 20261108120000): regole complete di kitchen_payment_fail dopo la correzione.
-- 1) chiusure per il banco congelate anche per EXPIRED/CANCELLED: riga identica, nessun log nuovo;
-- 2) ritentabile `sumup_failed`: trattamento invariato (FAILED ripetuto idempotente, EXPIRED cambia motivo + log);
-- 3) `abandoned_timeout`: comportamento invariato rispetto a oggi (FAILED -> sumup_failed, PAID resta nel ledger);
-- 4) autorizzazioni invariate: staff su attempt `failed` -> not_authorized, staff su `initiated` -> ammesso.
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff();
  o public.kitchen_orders; a public.kitchen_payments; before public.kitchen_payments; after public.kitchen_payments;
  logs_before int; res text; r text;
BEGIN
  -- 1a) staff_closed_for_counter + EXPIRED e CANCELLED
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  before := kp_test.attempt(a.id);
  logs_before := kp_test.log_count(o.id, 'payment_failed');
  FOREACH r IN ARRAY ARRAY['sumup_expired', 'sumup_cancelled', 'sumup_failed'] LOOP
    after := kp_test.fail(a.id, r);
    ASSERT after.status = 'failed' AND after.failure_reason = 'staff_closed_for_counter',
      format('P5c staff_closed_for_counter sovrascritto da %s', r);
  END LOOP;
  after := kp_test.attempt(a.id);
  ASSERT after.updated_at = before.updated_at AND after.raw_last_event IS NOT DISTINCT FROM before.raw_last_event,
    'P5c attempt chiuso per il banco modificato (updated_at/raw_last_event)';
  ASSERT kp_test.log_count(o.id, 'payment_failed') = logs_before, 'P5c log payment_failed aggiunto su attempt congelato';
  ASSERT kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s)) = 'OK', 'P5c banco bloccato dopo EXPIRED/CANCELLED';
  RAISE NOTICE 'PASS P5c-1a staff_closed_for_counter congelato (EXPIRED, CANCELLED, FAILED), banco OK';

  -- 1b) customer_switched_to_counter + EXPIRED
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  after := kp_test.fail(a.id, 'sumup_expired');
  ASSERT after.failure_reason = 'customer_switched_to_counter', 'P5c customer_switched_to_counter sovrascritto da EXPIRED';
  ASSERT kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s)) = 'OK', 'P5c banco bloccato dopo switch + EXPIRED';
  RAISE NOTICE 'PASS P5c-1b customer_switched_to_counter congelato, banco OK';

  -- 2) sumup_failed ritentabile: FAILED ripetuto idempotente, poi EXPIRED cambia motivo con log
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  logs_before := kp_test.log_count(o.id, 'payment_failed');
  after := kp_test.fail(a.id, 'sumup_failed');
  ASSERT after.failure_reason = 'sumup_failed' AND kp_test.log_count(o.id, 'payment_failed') = logs_before,
    'P5c FAILED ripetuto su sumup_failed non idempotente';
  ASSERT kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s)) = 'ERR online_payment_in_progress',
    'P5c sumup_failed deve ancora bloccare il banco (checkout ritentabile)';
  after := kp_test.fail(a.id, 'sumup_expired');
  ASSERT after.failure_reason = 'sumup_expired', 'P5c sumup_failed -> sumup_expired non applicato';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log
                 WHERE order_id = o.id AND action = 'payment_failed' AND reason = 'sumup_expired'
                   AND metadata->>'recheck_reason_changed_from' = 'sumup_failed'),
    'P5c log del cambio motivo mancante';
  RAISE NOTICE 'PASS P5c-2 sumup_failed: idempotente su FAILED, EXPIRED applicato con log';

  -- 3) abandoned_timeout: invariato rispetto a prima di K1
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.abandon(o.id);
  ASSERT (kp_test.attempt(a.id)).failure_reason = 'abandoned_timeout', 'P5c setup abandoned_timeout';
  after := kp_test.fail(a.id, 'sumup_failed');
  ASSERT after.failure_reason = 'sumup_failed', 'P5c abandoned_timeout: comportamento cambiato rispetto a oggi';
  after := kp_test.confirm(a.id);
  ASSERT after.id = a.id AND after.status = 'succeeded' AND kp_test.succeeded_charges(o.id) = 1,
    'P5c abandoned_timeout -> FAILED -> PAID non entra nel ledger';
  ASSERT (kp_test.ord(o.id)).status = 'payment_abandoned', 'P5c ordine abbandonato modificato';
  RAISE NOTICE 'PASS P5c-3 abandoned_timeout invariato: FAILED -> sumup_failed, PAID nel ledger, ordine PA';

  -- 4) autorizzazioni invariate
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  PERFORM fc_test.as_user(s);
  res := kp_test.try(format('SELECT public.kitchen_payment_fail(%L::uuid, %L, %L::jsonb)', a.id, 'manual', '{}'));
  ASSERT res = 'ERR not_authorized', format('P5c staff su attempt failed: atteso not_authorized, ottenuto %s', res);
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM fc_test.as_user(s);
  res := kp_test.try(format('SELECT public.kitchen_payment_fail(%L::uuid, %L, %L::jsonb)', a.id, 'staff_manual', '{}'));
  ASSERT res = 'OK' AND (kp_test.attempt(a.id)).failure_reason = 'staff_manual',
    format('P5c staff su attempt initiated: atteso OK, ottenuto %s', res);
  RAISE NOTICE 'PASS P5c-4 autorizzazioni invariate';
END $$;
