-- P6c K2 (Passo 2, 2026-11-08): regole di kitchen_payment_confirm sugli attempt chiusi per il banco/annullati.
-- Decisioni di Eros: D1 = PAID SumUp prima dell'incasso al banco -> ordine pagato online, il banco non incassa di
-- nuovo; D4 = PAID SumUp dopo l'incasso al banco -> doppio incasso registrato e segnalato, un solo charge nel ledger.
-- Ogni blocco gira nella stessa transazione del runner (ROLLBACK finale). Se un blocco fallisce: [DIFETTO].
\set ON_ERROR_STOP 1

-- 1) D1 cliente: "Paga al banco" (customer_switched_to_counter), poi PAID SumUp prima dell'incasso.
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  r public.kitchen_payments; c public.kitchen_payments; st_before text;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  ASSERT (kp_test.attempt(a.id)).failure_reason = 'customer_switched_to_counter', 'P6c-1 attempt chiuso dal cliente';
  st_before := (kp_test.ord(o.id)).status;
  r := kp_test.confirm(a.id);
  c := fc_test.pay_counter(o.id, s);
  RAISE NOTICE 'EVID P6c-1 ordine % -> %/% | confirm restituisce attempt SumUp=% | banco restituisce % (canale %) | charge=% | lost_race=% | log confirmed sistema=% banco=%',
    st_before, (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status, r.id = a.id,
    CASE WHEN c.id = a.id THEN 'il charge SumUp' ELSE 'un NUOVO charge' END, c.channel,
    kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirm_lost_race'),
    (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed' AND actor_type = 'system'),
    (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed' AND actor_type = 'staff');
  ASSERT r.id = a.id AND r.status = 'succeeded', 'P6c-1 [DIFETTO] PAID SumUp su attempt customer_switched_to_counter non registrato';
  ASSERT (kp_test.ord(o.id)).payment_status = 'paid' AND (kp_test.ord(o.id)).payment_method = 'sumup_online',
    'P6c-1 [DIFETTO] ordine non pagato online dopo PAID SumUp';
  ASSERT c.id = a.id AND kp_test.succeeded_charges(o.id) = 1,
    'P6c-1 [DIFETTO] D1: il banco ha incassato di nuovo invece di restituire il charge SumUp';
  ASSERT kp_test.log_count(o.id, 'payment_confirm_lost_race') = 0
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed' AND actor_type = 'staff'),
    'P6c-1 nessun doppio incasso, nessun incasso staff registrato';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed'
                 AND actor_type = 'system' AND metadata->>'promoted_from_failure_reason' = 'customer_switched_to_counter'),
    'P6c-1 log payment_confirmed con il motivo di partenza';
  -- 3) idempotenza: stesso PAID consegnato di nuovo
  r := kp_test.confirm(a.id);
  ASSERT r.id = a.id AND kp_test.succeeded_charges(o.id) = 1
     AND (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed' AND actor_type = 'system') = 1,
    'P6c-3 [DIFETTO] confirm ripetuto dopo D1 non idempotente';
  RAISE NOTICE 'PASS P6c-1 D1 cliente: pagato online, il banco non incassa di nuovo; P6c-3 confirm ripetuto idempotente';
END $$;

-- 2) D1 staff: "PASSA AL BANCO" (staff_closed_for_counter) su ordine corsia banco, PAID SumUp prima dell'incasso.
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  r public.kitchen_payments; c public.kitchen_payments;
BEGIN
  o := kp_test.new_order(u, 'counter');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.close_unpaid(a.id, s);
  r := kp_test.confirm(a.id);
  c := fc_test.pay_counter(o.id, s);
  RAISE NOTICE 'EVID P6c-2 ordine %/% | banco restituisce charge SumUp=% | charge=%',
    (kp_test.ord(o.id)).status, (kp_test.ord(o.id)).payment_status, c.id = a.id, kp_test.succeeded_charges(o.id);
  ASSERT r.id = a.id AND c.id = a.id AND kp_test.succeeded_charges(o.id) = 1
     AND (kp_test.ord(o.id)).payment_status = 'paid' AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 0,
    'P6c-2 [DIFETTO] D1 staff: PAID SumUp prima del banco non impedisce il secondo incasso';
  RAISE NOTICE 'PASS P6c-2 D1 staff: pagato online, il banco non incassa di nuovo';
END $$;

-- 4) D4 + webhook duplicati: switch -> banco -> PAID consegnato 3 volte.
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  c public.kitchen_payments; r public.kitchen_payments; i int;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM kp_test.switch_to_counter(o.id);
  c := fc_test.pay_counter(o.id, s);
  FOR i IN 1..3 LOOP
    r := kp_test.confirm(a.id);
    ASSERT r.id = c.id, 'P6c-4 ogni consegna restituisce il charge del banco';
  END LOOP;
  RAISE NOTICE 'EVID P6c-4 3 consegne PAID: charge=% lost_race=% attempt %/%',
    kp_test.succeeded_charges(o.id), kp_test.log_count(o.id, 'payment_confirm_lost_race'),
    (kp_test.attempt(a.id)).status, (kp_test.attempt(a.id)).failure_reason;
  ASSERT kp_test.succeeded_charges(o.id) = 1 AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 1,
    'P6c-4 [DIFETTO] webhook duplicati: segnalazione doppio incasso duplicata o charge in piu''';
  RAISE NOTICE 'PASS P6c-4 webhook duplicati: un solo charge, una sola segnalazione double_charge';
END $$;

-- 5) Stati che restano NON confermabili: nessun effetto collaterale (riga, ordine, log invariati).
DO $$ DECLARE
  u uuid := fc_test.new_user(); o public.kitchen_orders; a public.kitchen_payments; res text; reason text;
  before_row public.kitchen_payments; before_ord public.kitchen_orders; logs_before int;
BEGIN
  FOREACH reason IN ARRAY ARRAY['sumup_expired', 'sumup_cancelled', 'sumup_amount_mismatch'] LOOP
    o := kp_test.new_order(u, 'online');
    a := fc_test.start_online(o.id);
    PERFORM kp_test.fail(a.id, reason);
    before_row := kp_test.attempt(a.id); before_ord := kp_test.ord(o.id);
    SELECT count(*) INTO logs_before FROM public.kitchen_action_log WHERE order_id = o.id;
    res := kp_test.try(format('SELECT kp_test.confirm(%L)', a.id));
    RAISE NOTICE 'EVID P6c-5 confirm su failed/% -> %', reason, res;
    ASSERT res LIKE 'ERR invalid_attempt_status%', format('P6c-5 [DIFETTO] failed/%s ora confermabile', reason);
    ASSERT kp_test.attempt(a.id) = before_row AND kp_test.ord(o.id) = before_ord
       AND (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = o.id) = logs_before,
      format('P6c-5 [DIFETTO] confirm rifiutato su %s ha lasciato effetti', reason);
  END LOOP;
  RAISE NOTICE 'PASS P6c-5 expired/cancelled/amount_mismatch restano non confermabili, nessun effetto';
END $$;

-- 6) Attempt cancelled (ordine annullato): soldi nel ledger, ordine resta annullato e non pagato, flag; idempotente.
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  r public.kitchen_payments; lg jsonb;
BEGIN
  o := kp_test.new_order(u, 'online');
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  r := kp_test.confirm(a.id);
  r := kp_test.confirm(a.id);
  SELECT metadata INTO lg FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed_after_cancel';
  RAISE NOTICE 'EVID P6c-6 attempt % | ordine %/% | log after_cancel=% %',
    (kp_test.attempt(a.id)).status, (kp_test.ord(o.id)).status, coalesce((kp_test.ord(o.id)).payment_status, '-'),
    kp_test.log_count(o.id, 'payment_confirmed_after_cancel'), lg;
  ASSERT r.id = a.id AND (kp_test.attempt(a.id)).status = 'succeeded', 'P6c-6 [DIFETTO] PAID su cancelled fuori ledger';
  ASSERT (kp_test.ord(o.id)).status = 'cancelled' AND (kp_test.ord(o.id)).payment_status IS DISTINCT FROM 'paid',
    'P6c-6 [DIFETTO] falsa conferma: ordine annullato diventato pagato';
  ASSERT kp_test.log_count(o.id, 'payment_confirmed_after_cancel') = 1 AND lg->>'needs_manual_reconciliation' = 'true',
    'P6c-6 [DIFETTO] PAID dopo annullo non segnalato o segnalato due volte';
  RAISE NOTICE 'PASS P6c-6 cancelled: soldi nel ledger, ordine annullato, flag, idempotente';
END $$;

-- 7) Errori SQL: un errore dentro confirm annulla TUTTO (nessun charge mezzo scritto, nessun ordine pagato).
--    Simulato con un trigger temporaneo (solo in questa transazione di test) che fa fallire l'INSERT del log.
CREATE FUNCTION pg_temp.kp_fail_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'simulated_log_failure'; END $$;
CREATE TRIGGER kp_test_fail_log BEFORE INSERT ON public.kitchen_action_log
  FOR EACH ROW WHEN (NEW.action IN ('payment_confirm_lost_race', 'payment_confirmed') AND NEW.actor_type = 'system')
  EXECUTE FUNCTION pg_temp.kp_fail_log();
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff();
  o1 public.kitchen_orders; a1 public.kitchen_payments; o2 public.kitchen_orders; a2 public.kitchen_payments;
  c2 public.kitchen_payments; b1 public.kitchen_payments; b2 public.kitchen_payments; ob1 public.kitchen_orders;
  res1 text; res2 text;
BEGIN
  -- D1 con errore: nessuna falsa conferma
  o1 := kp_test.new_order(u, 'online'); a1 := fc_test.start_online(o1.id); PERFORM kp_test.switch_to_counter(o1.id);
  b1 := kp_test.attempt(a1.id); ob1 := kp_test.ord(o1.id);
  res1 := kp_test.try(format('SELECT kp_test.confirm(%L)', a1.id));
  -- D4 con errore: nessuna segnalazione persa in silenzio (errore propagato al chiamante, SumUp ripete)
  o2 := kp_test.new_order(u, 'online'); a2 := fc_test.start_online(o2.id); PERFORM kp_test.switch_to_counter(o2.id);
  c2 := fc_test.pay_counter(o2.id, s); b2 := kp_test.attempt(a2.id);
  res2 := kp_test.try(format('SELECT kp_test.confirm(%L)', a2.id));
  RAISE NOTICE 'EVID P6c-7 errore nel ramo D1 -> % | ordine %/% | errore nel ramo D4 -> % | charge=%',
    res1, (kp_test.ord(o1.id)).status, coalesce((kp_test.ord(o1.id)).payment_status, '-'), res2, kp_test.succeeded_charges(o2.id);
  ASSERT res1 LIKE 'ERR simulated_log_failure%' AND kp_test.attempt(a1.id) = b1 AND kp_test.ord(o1.id) = ob1
     AND kp_test.succeeded_charges(o1.id) = 0,
    'P6c-7 [DIFETTO] errore nel confirm D1 ha lasciato una conferma parziale';
  ASSERT res2 LIKE 'ERR simulated_log_failure%' AND kp_test.attempt(a2.id) = b2 AND kp_test.succeeded_charges(o2.id) = 1
     AND kp_test.log_count(o2.id, 'payment_confirm_lost_race') = 0,
    'P6c-7 [DIFETTO] errore nel ramo lost_race inghiottito: il chiamante crederebbe registrato il doppio incasso';
  RAISE NOTICE 'PASS P6c-7 errori SQL: rollback completo ed errore propagato (nessuna falsa conferma, nessuna perdita silenziosa)';
END $$;
DROP TRIGGER kp_test_fail_log ON public.kitchen_action_log;

-- 8) Percorsi normali invariati: online puro e banco puro.
DO $$ DECLARE
  u uuid := fc_test.new_user(); s uuid := fc_test.new_staff(); o public.kitchen_orders; a public.kitchen_payments;
  r public.kitchen_payments; o2 public.kitchen_orders; c public.kitchen_payments;
BEGIN
  o := kp_test.new_order(u, 'online'); a := fc_test.start_online(o.id); r := kp_test.confirm(a.id);
  ASSERT r.id = a.id AND (kp_test.ord(o.id)).status = 'received' AND (kp_test.ord(o.id)).payment_status = 'paid'
     AND kp_test.log_count(o.id, 'payment_confirmed') = 1 AND kp_test.log_count(o.id, 'payment_confirm_lost_race') = 0,
    'P6c-8 [DIFETTO] pagamento online normale cambiato';
  o2 := kp_test.new_order(u, 'counter'); c := fc_test.pay_counter(o2.id, s);
  ASSERT c.channel = 'counter' AND c.status = 'succeeded' AND (kp_test.ord(o2.id)).status = 'received'
     AND kp_test.succeeded_charges(o2.id) = 1,
    'P6c-8 [DIFETTO] incasso al banco normale cambiato';
  RAISE NOTICE 'PASS P6c-8 online puro e banco puro invariati';
END $$;
