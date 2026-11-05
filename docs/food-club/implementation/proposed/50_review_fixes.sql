-- Scenari per 20261105104000_food_club_v1_review_fixes.sql (PROPOSTA). Richiede la patch applicata al DB LOCALE.
-- Nota 2026-11-05: gli scenari RF1 e RF1b seguono la regola Opzione C: richiedono ANCHE 20261105105000_food_club_v1_option_c.sql
-- (suite 3 di harness/run-oc-local.sh). Con la sola patch P1 falliscono per costruzione.
-- Esecuzione: vedi docs/food-club/implementation/REVIEW-2026-11-04.md. Ogni blocco gira dentro BEGIN/ROLLBACK.

-- RF1 [Opzione C] abbandono -> webhook tardivo PAID (consegnato 2 volte) -> staff porta a 'paid': buono consumato UNA volta su quell'ordine, mai disponibile, niente timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false}');
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-RF1', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.backdate(o.id, now() - interval '6 minutes');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_mark_payment_abandoned(o.id);
  ASSERT (SELECT status || '/' || COALESCE(reserved_order_id, '-') FROM public.food_club_vouchers WHERE id = v.id) = 'reserved/' || o.id,
         'RF1 Opzione C: all''abbandono resta riservato (attempt ancora confermabile)';
  PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);  -- webhook tardivo consegnato due volte
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || o.id, 'RF1 consumato dal webhook tardivo';
  PERFORM fc_test.as_user(s); SET LOCAL ROLE authenticated;
  UPDATE public.kitchen_orders SET status = 'received', payment_status = 'paid' WHERE id = o.id;
  RESET ROLE;
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || o.id, 'RF1 buono usato su questo ordine';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND to_status = 'used') = 1, 'RF1 un solo evento used';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND to_status = 'available') = 0, 'RF1 mai tornato disponibile';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'reclaimed_on_late_payment'), 'RF1 nessun recupero FIX-1 (non serve più)';
  ASSERT NOT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = o.id AND action = 'food_club_voucher_double_spend'), 'RF1 nessun doppio uso';
  ASSERT fc_test.stamps(m) = 0, 'RF1 ordine con buono e D-3 spento: nessun timbro';
  RAISE NOTICE 'PASS RF1 buono consumato una volta su pagamento tardivo (Opzione C)';
END $$;

-- RF1b [Opzione C] doppio utilizzo: (A) buono bloccato -> riuso rifiutato prima e dopo il webhook tardivo; (B) checkout scaduto -> buono restituito e speso altrove -> PAID tardivo rifiutato dal ledger; incasso al banco sul vecchio ordine -> anomalia, niente timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; o2 public.kitchen_orders; a public.kitchen_payments;
  m2 uuid := fc_test.new_member(); w public.food_club_vouchers; p public.kitchen_orders; p2 public.kitchen_orders; b public.kitchen_payments; v_err text; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false}');
  -- (A)
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-RF1B', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v.id);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.backdate(o.id, now() - interval '6 minutes');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_mark_payment_abandoned(o.id);
  PERFORM fc_test.expect_error(format('SELECT fc_test.order(%L, %L, %L, %L)', m, '[{"item_id":"item-010","quantity":1}]', 'counter', v.id), 'voucher_not_available');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  PERFORM fc_test.expect_error(format('SELECT fc_test.order(%L, %L, %L, %L)', m, '[{"item_id":"item-010","quantity":1}]', 'counter', v.id), 'voucher_not_available');
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || o.id, 'RF1b(A) usato una volta sull''ordine pagato';
  ASSERT (SELECT count(DISTINCT order_id) FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'reserved_on_order') = 1, 'RF1b(A) riservato su un solo ordine';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id = o.id), 'RF1b(A) nessun timbro';
  -- (B)
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-RF1C', m2, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO w;
  p := fc_test.order(m2, '[{"item_id":"item-009","quantity":1}]', 'online', w.id);
  b := fc_test.start_online(p.id);
  PERFORM fc_test.backdate(p.id, now() - interval '6 minutes');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_mark_payment_abandoned(p.id);
  PERFORM public.kitchen_payment_fail(b.id, 'sumup_expired', '{}'::jsonb);  -- checkout scaduto: definitivo
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = w.id) = 'available', 'RF1b(B) scaduto: restituito';
  p2 := fc_test.order(m2, '[{"item_id":"item-010","quantity":1}]', 'counter', w.id);
  PERFORM fc_test.pay_counter(p2.id, s);
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = w.id) = 'used/' || p2.id, 'RF1b(B) speso sul secondo ordine';
  PERFORM fc_test.as_service();
  PERFORM fc_test.expect_error(format('SELECT public.kitchen_payment_confirm(%L::uuid, %L, %L::jsonb)', b.id, 'late-expired', '{}'), 'invalid_attempt_status');
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = b.id) = 'failed', 'RF1b(B) attempt scaduto non diventa succeeded';
  -- Incasso al banco sul vecchio ordine scontato (staff lo riapre): FIX-1 segnala il doppio sconto, il buono non si muove.
  BEGIN
    PERFORM fc_test.as_user(s); SET LOCAL ROLE authenticated;
    UPDATE public.kitchen_orders SET status = 'received' WHERE id = p.id;
    RESET ROLE;
    PERFORM fc_test.pay_counter(p.id, s);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; v_err := SQLERRM;
  END;
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = w.id) = 'used/' || p2.id, 'RF1b(B) resta usato sull''altro ordine';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = w.id AND to_status = 'used') = 1, 'RF1b(B) un solo evento used';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id = p.id), 'RF1b(B) nessun timbro sull''ordine scontato';
  ASSERT v_err IS NOT NULL OR EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = p.id AND action = 'food_club_voucher_double_spend'),
         'RF1b(B) incasso tardivo al banco: anomalia doppio uso (oppure riapertura rifiutata)';
  RAISE NOTICE 'PASS RF1b doppio utilizzo impedito o segnalato (Opzione C) [riapertura: %]', COALESCE(v_err, 'consentita, anomalia registrata');
END $$;

-- RF2 'paid' a mano (buono resta riservato), poi incasso al banco: il buono passa a UTILIZZATO e arriva il timbro dovuto
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": true}');
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-RF2', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1},{"item_id":"item-010","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.as_user(s); SET LOCAL ROLE authenticated;
  UPDATE public.kitchen_orders SET payment_status = 'paid', payment_method = 'cash' WHERE id = o.id;
  RESET ROLE;
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'RF2 paid senza charge: riservato';
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'used', 'RF2 charge dopo paid: usato';
  ASSERT fc_test.stamps(m) = 1, 'RF2 timbro dopo il charge';
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.stamps(m) = 1, 'RF2 idempotente';
  RAISE NOTICE 'PASS RF2 regolamento al charge tardivo';
END $$;

-- RF3 rimborso dell'ordine che ha qualificato un invito: premio dell'invitante revocato, invito void
DO $$ DECLARE inviter uuid := fc_test.new_member(); inv uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; BEGIN
  PERFORM fc_test.activate_campaign('{"referral_enabled": true}');
  INSERT INTO public.food_club_referrals (inviter_id, invitee_id, campaign_id) VALUES (inviter, inv, 'visite-v1');
  o := fc_test.order(inv, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(o.id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE user_id = inviter AND source = 'referral') = 'available', 'RF3 premio emesso';
  PERFORM fc_test.refund(o.id, s);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE user_id = inviter AND source = 'referral') = 'revoked', 'RF3 premio revocato';
  ASSERT (SELECT status FROM public.food_club_referrals WHERE invitee_id = inv) = 'void', 'RF3 invito void';
  RAISE NOTICE 'PASS RF3 rimborso revoca premio invito';
END $$;

-- RF4 cancellare un ordine con timbro/buono: errore FK chiaro (RESTRICT), nessuna violazione di CHECK
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; v public.food_club_vouchers; BEGIN
  PERFORM fc_test.activate_campaign();
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES ('WC-RF4', m, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * INTO v;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  BEGIN
    DELETE FROM public.kitchen_orders WHERE id = o.id;
    RAISE EXCEPTION 'RF4 delete doveva fallire';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  RAISE NOTICE 'PASS RF4 FK RESTRICT';
END $$;

-- RF5 combo: cambio prezzo -> quota food segue la variazione
DO $$ DECLARE f0 numeric; p0 numeric; BEGIN
  SELECT food_unit_amount, price INTO f0, p0 FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  UPDATE public.kitchen_menu_items SET price = price - 2 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_unit_amount FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = GREATEST(f0 - 2, 0), 'RF5 quota food';
  RAISE NOTICE 'PASS RF5 combo food sync';
END $$;
