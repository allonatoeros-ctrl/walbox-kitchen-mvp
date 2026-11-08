-- Scenari F1/F2: regole economiche/temporali e matrice ordine x buono (FASE3 §3.2). Gira in una transazione con ROLLBACK.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- T01 classificazione food autorevole: birra non conta, MENU con quota food
DO $$ DECLARE u uuid := fc_test.new_user(); o public.kitchen_orders; BEGIN
  o := fc_test.order(u, '[{"item_id":"item-012","quantity":1},{"item_id":"item-051","quantity":2}]');
  ASSERT public.food_club_order_food_amount(o.id) = 8, 'T01 food = 8 (birre escluse)';
  ASSERT o.total = 20, 'T01 totale invariato 20';
  o := fc_test.order(u, '[{"item_id":"item-040","quantity":1}]');
  ASSERT public.food_club_order_food_amount(o.id) = 13, 'T01 MENU birra: quota food 13';
  RAISE NOTICE 'PASS T01 classificazione food';
END $$;

-- T02 provenienza: ordine staff = staff, ordine cliente = customer_app, source immutabile
DO $$ DECLARE s uuid := fc_test.new_staff(); u uuid := fc_test.new_user(); o public.kitchen_orders; c public.kitchen_orders; BEGIN
  o := fc_test.staff_order(s, '[{"item_id":"item-009","quantity":1}]');
  ASSERT o.source = 'staff', 'T02 ordine staff marcato staff';
  c := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]');
  ASSERT c.source = 'customer_app', 'T02 ordine cliente marcato customer_app';
  PERFORM fc_test.expect_error(format('UPDATE public.kitchen_orders SET source = %L WHERE id = %L', 'customer_app', o.id), 'order_source_immutable');
  RAISE NOTICE 'PASS T02 provenienza ordine';
END $$;

-- T03 ordine staff pagato: nessun timbro, anche se il cliente fosse iscritto
DO $$ DECLARE s uuid := fc_test.new_staff(); o public.kitchen_orders; n int; BEGIN
  o := fc_test.staff_order(s, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(o.id, s);
  SELECT count(*) INTO n FROM public.food_club_stamps WHERE order_id = o.id;
  ASSERT n = 0, 'T03 nessun timbro per ordine staff';
  RAISE NOTICE 'PASS T03 ordini staff esclusi';
END $$;

-- T04 due serate diverse entro 30 giorni -> buono 5 €, max 1 timbro per serata
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; c public.kitchen_orders; v public.food_club_vouchers; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.backdate(a.id, now() - interval '2 days');
  -- attempt_start rifiuta POP oltre 4:30: per l'ordine retrodatato si paga al banco
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_switch_to_counter_system(a.id, m);
  PERFORM fc_test.pay_counter(a.id, s);
  ASSERT fc_test.stamps(m) = 1, 'T04 primo timbro';
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = m) = 0, 'T04 nessun buono dopo 1 timbro';
  b := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(b.id);
  ASSERT fc_test.stamps(m) = 2, 'T04 secondo timbro altra serata';
  v := fc_test.voucher_of(m);
  ASSERT v.status = 'available' AND v.value = 5 AND v.min_food = 12, 'T04 buono 5 € disponibile';
  ASSERT abs(extract(epoch FROM (v.expires_at - (now() + interval '30 days')))) < 5, 'T04 validità 30 giorni';
  ASSERT (SELECT status FROM public.food_club_cards WHERE voucher_id = v.id) = 'completed', 'T04 tessera completata';
  c := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(c.id);
  ASSERT fc_test.stamps(m) = 2, 'T04 stessa serata: niente secondo timbro';
  ASSERT (SELECT count(*) FROM public.food_club_messages WHERE user_id = m AND kind = 'voucher_unlocked') = 1, 'T04 messaggio buono sbloccato';
  RAISE NOTICE 'PASS T04 due serate -> buono, 1 timbro per serata';
END $$;

-- T05 finestra di 30 giorni scaduta: la tessera riparte dalla visita successiva
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.backdate(a.id, now() - interval '40 days');
  PERFORM fc_test.pay_counter(a.id, s);
  ASSERT fc_test.stamps(m) = 1, 'T05 primo timbro (40 gg fa)';
  b := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(b.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = m) = 0, 'T05 nessun buono oltre 30 gg';
  ASSERT (SELECT count(*) FROM public.food_club_cards WHERE user_id = m AND status = 'expired') = 1, 'T05 vecchia tessera scaduta';
  ASSERT (SELECT count(*) FROM public.food_club_cards WHERE user_id = m AND status = 'open') = 1, 'T05 nuova tessera aperta';
  RAISE NOTICE 'PASS T05 finestra 30 giorni';
END $$;

-- T05b confine: 29 giorni = dentro la finestra
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.backdate(a.id, now() - interval '29 days 23 hours');
  PERFORM fc_test.pay_counter(a.id, s);
  b := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(b.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = m) = 1, 'T05b buono entro 30 gg';
  RAISE NOTICE 'PASS T05b confine finestra';
END $$;

-- T06 soglia food 10 €: 8 € di food + birre = niente timbro; 10 € esatti = timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-012","quantity":1},{"item_id":"item-051","quantity":3}]');
  PERFORM fc_test.pay_counter(a.id, s);
  ASSERT fc_test.stamps(m) = 0, 'T06 food 8 € (totale 26 €): nessun timbro';
  b := fc_test.order(m, '[{"item_id":"item-045","quantity":1}]');
  PERFORM fc_test.pay_counter(b.id, s);
  ASSERT fc_test.stamps(m) = 1, 'T06 food 10 € esatti: timbro';
  RAISE NOTICE 'PASS T06 soglia food';
END $$;

-- T07 non iscritto / campagna spenta / ordine non pagato
DO $$ DECLARE u uuid := fc_test.new_user(); m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; BEGIN
  a := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(a.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_stamps WHERE order_id = a.id) = 0, 'T07 non iscritto: niente timbro';
  UPDATE public.food_club_campaigns SET active = false WHERE id = 'visite-v1';
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(a.id, s);
  ASSERT fc_test.stamps(m) = 0, 'T07 campagna spenta: niente timbro';
  PERFORM fc_test.activate_campaign();
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  UPDATE public.kitchen_orders SET status = 'delivered' WHERE id = a.id;
  ASSERT fc_test.stamps(m) = 0, 'T07 consegnato ma non pagato: niente timbro';
  RAISE NOTICE 'PASS T07 esclusioni';
END $$;

-- T08 buono: riserva alla creazione, totale scontato, consumo al pagamento online, timbro sul food lordo
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; o public.kitchen_orders; p public.kitchen_payments; n_before int; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST08', m, 'visite-v1', 'manual', 5, 12, now() + interval '30 days') RETURNING * INTO v;
  SELECT count(*) INTO n_before FROM public.kitchen_orders WHERE customer_id = m;
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.order(%L, '[{"item_id":"item-012","quantity":1},{"item_id":"item-051","quantity":2}]', 'online', %L)$q$, m, v.id), 'voucher_food_below_minimum');
  ASSERT (SELECT count(*) FROM public.kitchen_orders WHERE customer_id = m) = n_before, 'T08 buono rifiutato: nessun ordine creato';
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  ASSERT o.total = 8.9 AND o.discount_amount = 5, 'T08 totale scontato 8,90';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T08 buono riservato';
  p := fc_test.pay_online(o.id);
  ASSERT p.amount = 8.9 AND p.status = 'succeeded', 'T08 SumUp incassa il totale scontato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'T08 buono utilizzato al pagamento';
  ASSERT (SELECT used_order_id FROM public.food_club_vouchers WHERE id = v.id) = o.id, 'T08 legato all''ordine';
  ASSERT fc_test.stamps(m) = 1, 'T08 timbro sul food lordo 13,90 (D-3 proposta)';
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.order(%L, '[{"item_id":"item-009","quantity":1}]', 'online', %L)$q$, m, v.id), 'voucher_not_available');
  RAISE NOTICE 'PASS T08 riserva/consumo buono online';
END $$;

-- T09 annullo staff di un ordine al banco con buono: rilascio con scadenza originale, riuso possibile
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; o2 public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST09', m, 'visite-v1', 'manual', 5, 12, now() + interval '10 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'available', 'T09 rilasciato';
  ASSERT (SELECT expires_at FROM public.food_club_vouchers WHERE id = v.id) = v.expires_at, 'T09 stessa scadenza';
  ASSERT (SELECT total FROM public.kitchen_orders WHERE id = o.id) = 8.9, 'T09 totale dell''ordine annullato non riscritto';
  o2 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  ASSERT (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = v.id) = o2.id, 'T09 riusabile su nuovo ordine';
  RAISE NOTICE 'PASS T09 rilascio su annullo';
END $$;

-- T10 abbandono online (5 min): rilascio; rilascio dopo la scadenza -> SCADUTO
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST10', m, 'visite-v1', 'manual', 5, 12, now() + interval '1 day') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  PERFORM fc_test.backdate(o.id, now() - interval '6 minutes');
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 minute' WHERE id = v.id;
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(o.id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'expired', 'T10 rilasciato dopo scadenza -> scaduto';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'released') = 1, 'T10 evento rilascio';
  RAISE NOTICE 'PASS T10 rilascio su abbandono';
END $$;

-- T11 RISERVATO non scade: sweep non lo tocca, pagamento dopo la scadenza -> UTILIZZATO
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST11', m, 'visite-v1', 'manual', 5, 12, now() + interval '1 day') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 hour' WHERE id = v.id;
  PERFORM fc_test.as_service(); PERFORM public.food_club_expire_sweep();
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T11 riservato non scade';
  PERFORM fc_test.pay_counter(o.id, s, 'card_counter_manual');
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'T11 pagato dopo scadenza -> usato';
  ASSERT (SELECT amount FROM public.kitchen_payments WHERE order_id = o.id AND status = 'succeeded') = 8.9, 'T11 banco incassa 8,90';
  RAISE NOTICE 'PASS T11 riservato non scade';
END $$;

-- T12 sweep scadenze: disponibile scaduto -> SCADUTO, non più usabile
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST12', m, 'visite-v1', 'manual', 5, 12, now() - interval '1 minute') RETURNING * INTO v;
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.order(%L, '[{"item_id":"item-009","quantity":1}]', 'online', %L)$q$, m, v.id), 'voucher_expired');
  PERFORM fc_test.as_service(); PERFORM public.food_club_expire_sweep();
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'expired', 'T12 scaduto';
  RAISE NOTICE 'PASS T12 scadenza';
END $$;

-- T13 guardia importi: staff non cambia total/discount su ordine con buono; promo non cumulabile
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; u uuid := fc_test.new_user(); o2 public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST13', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.expect_error(format('UPDATE public.kitchen_orders SET total = 13.9 WHERE id = %L', o.id), 'food_club_voucher_locks_order_amount');
  PERFORM fc_test.expect_error(format('UPDATE public.kitchen_orders SET discount_amount = 0 WHERE id = %L', o.id), 'food_club_voucher_locks_order_amount');
  -- Ordine senza buono: lo staff può ancora modificarlo come oggi (nessuna regressione)
  o2 := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]');
  UPDATE public.kitchen_orders SET total = 13 WHERE id = o2.id;
  RAISE NOTICE 'PASS T13 guardia importi';
END $$;

-- T14 buono di un altro utente / non iscritto / senza client_request_id
DO $$ DECLARE m uuid := fc_test.new_member(); other uuid := fc_test.new_member(); v public.food_club_vouchers; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST14', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.order(%L, '[{"item_id":"item-009","quantity":1}]', 'online', %L)$q$, other, v.id), 'voucher_not_found');
  PERFORM fc_test.as_user(m);
  PERFORM fc_test.expect_error(format($q$SELECT public.kitchen_customer_create_order_v4('walrus-main','T',NULL,'[{"item_id":"item-009","quantity":1}]','eat_here','online',NULL,NULL,%L)$q$, v.id), 'voucher_requires_client_request_id');
  RAISE NOTICE 'PASS T14 proprietà del buono';
END $$;

-- T15 retry idempotente: stesso client_request_id + buono -> stesso ordine, sconto una volta sola
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; o1 public.kitchen_orders; o2 public.kitchen_orders; k uuid := gen_random_uuid(); BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST15', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  PERFORM fc_test.as_user(m);
  o1 := public.kitchen_customer_create_order_v4('walrus-main','T',NULL,'[{"item_id":"item-009","quantity":1}]','eat_here','online',k,NULL,v.id);
  o2 := public.kitchen_customer_create_order_v4('walrus-main','T',NULL,'[{"item_id":"item-009","quantity":1}]','eat_here','online',k,NULL,v.id);
  ASSERT o1.id = o2.id AND o2.total = 8.9, 'T15 replay: stesso ordine, sconto unico';
  RAISE NOTICE 'PASS T15 retry idempotente';
END $$;

-- T16 rimborso: timbro revocato, buono della tessera revocato se non usato; buono usato resta usato (D-2 default)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; v public.food_club_vouchers; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.backdate(a.id, now() - interval '3 days');
  PERFORM fc_test.pay_counter(a.id, s);
  b := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.pay_counter(b.id, s);
  v := fc_test.voucher_of(m);
  ASSERT v.status = 'available', 'T16 buono emesso';
  PERFORM fc_test.refund(b.id, s);
  ASSERT (SELECT revoked_at IS NOT NULL FROM public.food_club_stamps WHERE order_id = b.id), 'T16 timbro revocato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'revoked', 'T16 buono non usato revocato';
  ASSERT (SELECT status FROM public.food_club_cards WHERE user_id = m ORDER BY created_at LIMIT 1) = 'open', 'T16 tessera riaperta con 1 timbro';
  ASSERT fc_test.stamps(m) = 1, 'T16 resta 1 timbro';
  RAISE NOTICE 'PASS T16 rimborso';
END $$;

DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST16B', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.pay_counter(o.id, s);
  PERFORM fc_test.refund(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'T16b D-2 default: resta usato';
  UPDATE public.food_club_campaigns SET refund_recredits_voucher = true WHERE id = 'visite-v1';
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST16C', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.pay_counter(o.id, s);
  PERFORM fc_test.refund(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'available', 'T16c D-2 attiva: riaccreditato';
  UPDATE public.food_club_campaigns SET refund_recredits_voucher = false WHERE id = 'visite-v1';
  RAISE NOTICE 'PASS T16b/c rimborso con buono usato';
END $$;

-- T17 'paid' scritto a mano dallo staff (nessun charge): niente timbro, buono resta riservato, anomalia loggata
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST17', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  UPDATE public.kitchen_orders SET payment_status = 'paid', status = 'received' WHERE id = o.id;
  ASSERT fc_test.stamps(m) = 0, 'T17 niente timbro senza charge';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T17 buono resta riservato';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'food_club_paid_without_charge'), 'T17 anomalia loggata';
  RAISE NOTICE 'PASS T17 paid senza charge';
END $$;

-- T18 pagamento SumUp arrivato dopo l'annullo: buono TRATTENUTO (checkout SumUp potenzialmente pagabile), poi consumato dal
-- charge tardivo; ordine non pagato, nessun timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; a public.kitchen_payments; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST18', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T18 trattenuto all''annullo (attempt SumUp)';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'held_until_checkout_expiry') = 1, 'T18 evento held';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'released') = 0, 'T18 nessun rilascio';
  -- l'attempt annullato non è confermabile: simuliamo il caso sumup_failed tardivo come fa lo sweep
  UPDATE public.kitchen_payments SET status = 'failed', failure_reason = 'sumup_failed' WHERE id = a.id;
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) IS DISTINCT FROM 'paid', 'T18 ordine non pagato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'T18 buono consumato dal charge tardivo';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'consumed_on_late_charge') = 1, 'T18 evento consumed_on_late_charge';
  ASSERT fc_test.stamps(m) = 0, 'T18 nessun timbro';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'payment_confirmed_after_cancel'), 'T18 riconciliazione manuale segnalata';
  RAISE NOTICE 'PASS T18 pagamento tardivo dopo annullo';
END $$;

-- T19 POP -> paga al banco: il buono resta riservato e il banco incassa il totale scontato
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; p public.kitchen_payments; BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST19', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_switch_to_counter_system(o.id, m);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'T19 resta riservato';
  p := fc_test.pay_counter(o.id, s);
  ASSERT p.amount = 8.9, 'T19 banco 8,90';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'T19 usato';
  RAISE NOTICE 'PASS T19 switch al banco';
END $$;

-- T20 inviti: spenti di default (D-14); accesi -> premio all'invitante al primo ordine valido, tetto 5 / 30 gg
DO $$ DECLARE inviter uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); inv uuid; o public.kitchen_orders; i int; BEGIN
  inv := fc_test.new_member();
  INSERT INTO public.food_club_referrals (inviter_id, invitee_id, campaign_id) VALUES (inviter, inv, 'visite-v1');
  o := fc_test.order(inv, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = inviter) = 0, 'T20 inviti spenti: nessun premio';
  PERFORM fc_test.activate_campaign('{"referral_enabled": true}');
  o := fc_test.order(inv, '[{"item_id":"item-010","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = inviter AND source = 'referral') = 1, 'T20 premio invitante';
  o := fc_test.order(inv, '[{"item_id":"item-011","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = inviter AND source = 'referral') = 1, 'T20 un solo premio per invitato';
  FOR i IN 1..5 LOOP
    inv := fc_test.new_member();
    INSERT INTO public.food_club_referrals (inviter_id, invitee_id, campaign_id) VALUES (inviter, inv, 'visite-v1');
    o := fc_test.order(inv, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  END LOOP;
  ASSERT (SELECT count(*) FROM public.food_club_vouchers WHERE user_id = inviter AND source = 'referral') = 5, 'T20 tetto 5 premi';
  ASSERT (SELECT count(*) FROM public.food_club_referrals WHERE inviter_id = inviter AND status = 'capped') = 1, 'T20 sesto invito oltre il tetto';
  UPDATE public.food_club_campaigns SET referral_enabled = false WHERE id = 'visite-v1';
  RAISE NOTICE 'PASS T20 inviti';
END $$;

-- T21 serata 06:00 Europe/Rome
DO $$ BEGIN
  ASSERT public.food_club_service_night('2026-11-06 04:59:00+00') = '2026-11-05', 'T21 05:59 Roma = serata precedente';
  ASSERT public.food_club_service_night('2026-11-06 05:00:00+00') = '2026-11-06', 'T21 06:00 Roma = nuova serata';
  ASSERT public.food_club_service_night('2026-07-06 03:59:00+00') = '2026-07-05', 'T21 ora legale 05:59';
  RAISE NOTICE 'PASS T21 serata di servizio';
END $$;

-- T22 ordine 23:50 e 00:30 della stessa serata = 1 solo timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); a public.kitchen_orders; b public.kitchen_orders; BEGIN
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.backdate(a.id, '2026-10-01 21:50:00+00'); -- 23:50 Roma
  b := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]');
  PERFORM fc_test.backdate(b.id, '2026-10-01 22:30:00+00'); -- 00:30 Roma
  PERFORM fc_test.pay_counter(a.id, s); PERFORM fc_test.pay_counter(b.id, s);
  ASSERT fc_test.stamps(m) = 1, 'T22 stessa serata a cavallo di mezzanotte';
  RAISE NOTICE 'PASS T22 mezzanotte';
END $$;

-- T23 D-3 spenta: ordine con buono non dà timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  UPDATE public.food_club_campaigns SET stamp_on_voucher_order = false WHERE id = 'visite-v1';
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-TEST23', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.stamps(m) = 0, 'T23 niente timbro su ordine col buono';
  UPDATE public.food_club_campaigns SET stamp_on_voucher_order = true WHERE id = 'visite-v1';
  RAISE NOTICE 'PASS T23 D-3 configurabile';
END $$;
