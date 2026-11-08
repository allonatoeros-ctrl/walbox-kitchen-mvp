-- P1 Doppio incasso banco + SumUp (#259 lato DB), percorso "abbandono":
-- ordine online (POP) con attempt SumUp initiated -> sweep 5 min (PA, attempt failed/abandoned_timeout)
-- -> lo staff prova a incassare al banco -> arriva il PAID SumUp residuo (confirm service_role).
-- Comportamento SICURO atteso: mai due incassi registrati, e se il banco ha incassato il PAID SumUp
-- non deve sparire in un lost_race silenzioso. Esiti reali stampati come EVID.
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff();
  o public.kitchen_orders; a public.kitchen_payments; r public.kitchen_payments; counter_res text;
BEGIN
  o := kp_test.new_order(u, 'online');
  ASSERT o.status = 'pending_online_payment', 'P1 ordine nasce POP';
  a := fc_test.start_online(o.id);
  ASSERT a.status = 'initiated' AND a.provider = 'sumup', 'P1 attempt SumUp initiated';

  PERFORM kp_test.abandon(o.id);
  ASSERT (kp_test.ord(o.id)).status = 'payment_abandoned', 'P1 ordine PA dopo lo sweep';
  ASSERT (kp_test.attempt(a.id)).status = 'failed' AND (kp_test.attempt(a.id)).failure_reason = 'abandoned_timeout',
    'P1 attempt failed/abandoned_timeout';

  counter_res := kp_test.try(format('SELECT fc_test.pay_counter(%L, %L)', o.id, s));
  RAISE NOTICE 'EVID P1 record_counter su ordine payment_abandoned -> %', counter_res;

  r := kp_test.confirm(a.id);
  RAISE NOTICE 'EVID P1 confirm(attempt abbandonato) -> riga % (attempt=%), status=%, charge succeeded=%, lost_race_log=%, after_abandon_log=%, attempt ora %/%, ordine %/%',
    CASE WHEN r.id = a.id THEN 'propria' ELSE 'VINCENTE ALTRA' END, a.id = r.id, r.status,
    kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirm_lost_race'),
    kp_test.log_count(o.id, 'payment_confirmed_after_abandon'),
    (kp_test.attempt(a.id)).status, (kp_test.attempt(a.id)).failure_reason,
    (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status;

  -- Asserzioni di sicurezza
  ASSERT kp_test.succeeded_charges(o.id) = 1, 'P1 un solo charge succeeded';
  ASSERT NOT (counter_res = 'OK' AND r.id <> a.id),
    'P1 [DIFETTO] banco incassato E PAID SumUp finito in lost_race: soldi presi due volte, il secondo fuori ledger';
  RAISE NOTICE 'PASS P1 abbandono -> banco -> PAID tardivo: nessun doppio incasso registrato (banco=%)', counter_res;
END $$;
