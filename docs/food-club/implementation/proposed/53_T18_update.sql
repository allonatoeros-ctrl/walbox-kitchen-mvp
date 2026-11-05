-- PROPOSTA di aggiornamento minimo di T18 in tests/db/food-club/10_rules_payments.sql (file NON modificato qui).
--   (T18 sostituisce il blocco attuale: cambia SOLO la prima asserzione (la vecchia regola «staff annulla -> buono
-- liberato» è proprio il bypass OC12b) e ne aggiunge una (nessun riuso del buono). Le tre asserzioni originali sul
-- pagamento tardivo (ordine non pagato, nessun timbro, riconciliazione segnalata) restano identiche.
--   (T18b recupera la copertura «buono già rilasciato all'annullo» con il percorso ora legittimo: attestazione del server.
-- Nel file reale: aggiungere SELECT fc_test.activate_campaign() resta quello in testa al file (qui ripetuto nel blocco).

-- T18 pagamento SumUp arrivato dopo l'annullo dello staff: buono trattenuto (annullo non attestato), ordine non pagato, nessun timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST18', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T18 trattenuto all''annullo non attestato';  -- CAMBIATA
  -- l'attempt annullato non è confermabile: simuliamo il caso sumup_failed tardivo come fa lo sweep
  UPDATE public.kitchen_payments SET status = 'failed', failure_reason = 'sumup_failed' WHERE id = a.id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) IS DISTINCT FROM 'paid', 'T18 ordine non pagato';
  ASSERT fc_test.stamps(m) = 0, 'T18 nessun timbro';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed_after_cancel'), 'T18 riconciliazione manuale segnalata';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) <> 'available', 'T18 buono non riutilizzabile dopo l''incasso tardivo';  -- NUOVA
  RAISE NOTICE 'EVID T18 buono finale=%', (SELECT status FROM public.food_club_vouchers WHERE id = v.id);
  RAISE NOTICE 'PASS T18 pagamento tardivo dopo annullo';
END $$;

-- T18b annullo dello staff + attestazione del server (SumUp CANCELLED): buono rilasciato; poi pagamento tardivo come in T18
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST18B', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_attest_closed(a.id, 'CANCELLED', '{"status":"CANCELLED"}'::jsonb);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'available', 'T18b rilasciato all''annullo attestato';
  UPDATE public.kitchen_payments SET status = 'failed', failure_reason = 'sumup_failed' WHERE id = a.id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) IS DISTINCT FROM 'paid', 'T18b ordine non pagato';
  ASSERT fc_test.stamps(m) = 0, 'T18b nessun timbro';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed_after_cancel'), 'T18b riconciliazione manuale segnalata';
  RAISE NOTICE 'EVID T18b buono finale=% (pagamento tardivo dopo un CANCELLED attestato: incoerenza SumUp, resta alla riconciliazione)',
    (SELECT status FROM public.food_club_vouchers WHERE id = v.id);
  RAISE NOTICE 'PASS T18b rilascio attestato + pagamento tardivo';
END $$;
