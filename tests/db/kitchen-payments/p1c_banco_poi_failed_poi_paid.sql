-- P1c Doppio incasso banco + SumUp con `payment_confirm_lost_race` (il percorso #259 che oggi il DB lascia passare).
-- Ordine corsia banco (PCP), il cliente apre un checkout SumUp dall'app (attempt initiated); lo staff preme
-- PASSA AL BANCO (close_unpaid -> failed/staff_closed_for_counter) e incassa al banco (record_counter OK).
-- Poi arriva il webhook SumUp FAILED (carta rifiutata) -> kitchen_payment_fail(sumup_failed) sovrascrive il motivo
-- (20260830101227:238-316); il cliente riprova sullo STESSO checkout e SumUp dice PAID -> kitchen_payment_confirm.
-- Atteso SICURO (aggiornato con D4 di Eros, 2026-11-08): il webhook FAILED non riapre l'attempt (K1); il PAID
-- successivo e' un secondo incasso reale: un solo charge nel ledger (il banco) e lost_race con double_charge +
-- needs_manual_reconciliation e i riferimenti dei due incassi (K2). Se fallisce: [DIFETTO].
\set ON_ERROR_STOP 1
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff();
  o public.kitchen_orders; a public.kitchen_payments; c public.kitchen_payments; r public.kitchen_payments;
  reason_after_fail text; lr jsonb;
BEGIN
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  ASSERT (kp_test.attempt(a.id)).failure_reason = 'staff_closed_for_counter', 'P1c attempt chiuso per il banco';
  c := fc_test.pay_counter(o.id, s);
  ASSERT c.status = 'succeeded' AND c.channel = 'counter', 'P1c incasso al banco riuscito';
  PERFORM kp_test.fail(a.id, 'sumup_failed');
  reason_after_fail := (kp_test.attempt(a.id)).failure_reason;
  r := kp_test.confirm(a.id);
  RAISE NOTICE 'EVID P1c motivo dopo webhook FAILED: staff_closed_for_counter -> % | confirm PAID restituisce % (canale %), charge succeeded=%, lost_race_log=%, attempt SumUp resta %/%, ordine %/%',
    reason_after_fail, CASE WHEN r.id = a.id THEN 'attempt SumUp' ELSE 'il charge del BANCO' END, r.channel,
    kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirm_lost_race'),
    (kp_test.attempt(a.id)).status, (kp_test.attempt(a.id)).failure_reason,
    (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status;
  ASSERT kp_test.succeeded_charges(o.id) = 1, 'P1c un solo charge succeeded nel ledger';
  ASSERT reason_after_fail = 'staff_closed_for_counter',
    'P1c [DIFETTO] il webhook FAILED riapre un attempt chiuso per il banco (motivo sovrascritto in sumup_failed)';
  -- D4 (Eros, 2026-11-08): dopo un incasso al banco il PAID SumUp e' un secondo incasso reale. Il ledger ne
  -- ammette uno solo (one_succeeded_charge_per_order): il confirm restituisce il charge del banco e il doppio
  -- incasso deve essere REGISTRATO e SEGNALATO nel log, con i riferimenti di entrambi i soldi.
  -- Sostituisce l'asserzione originale `r.id = a.id` (attempt SumUp vincente), impossibile da soddisfare.
  SELECT metadata INTO lr FROM public.kitchen_action_log
   WHERE order_id = o.id AND action = 'payment_confirm_lost_race';
  RAISE NOTICE 'EVID P1c log lost_race: %', lr;
  ASSERT r.id = c.id AND r.channel = 'counter',
    'P1c [DIFETTO] PAID SumUp dopo incasso al banco: confirm deve restituire il charge del banco, unico nel ledger';
  ASSERT kp_test.log_count(o.id, 'payment_confirm_lost_race') = 1
     AND lr->>'double_charge' = 'true' AND lr->>'needs_manual_reconciliation' = 'true'
     AND lr->>'losing_attempt_id' = a.id::text AND lr->>'winning_payment_id' = c.id::text
     AND lr->>'winning_channel' = 'counter' AND lr->>'losing_provider' = 'sumup'
     AND lr->>'losing_provider_ref' = 'sumup-' || a.id AND (lr->>'losing_amount')::numeric = a.amount,
    'P1c [DIFETTO] doppio incasso banco + SumUp non registrato o non segnalato (double_charge/needs_manual_reconciliation)';
  ASSERT (kp_test.attempt(a.id)).status = 'failed' AND (kp_test.attempt(a.id)).failure_reason = 'staff_closed_for_counter'
     AND (kp_test.ord(o.id)).payment_status = 'paid',
    'P1c stato finale coerente: attempt SumUp resta chiuso per il banco, ordine pagato una volta';
  RAISE NOTICE 'PASS P1c doppio incasso registrato e segnalato';
END $$;
