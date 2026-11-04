-- Coda notifiche: consenso per categoria, ambito sottoscrizione, fascia silenziosa, tetti.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- N01 sottoscrizione 'order' (vecchio testo "niente pubblicità") non riceve avvisi Club
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; n int; BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM public.food_club_push_subscribe('walrus-main', 'https://push.test/' || m, 'k', 'a', 'ua');
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  ASSERT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = m AND kind = 'stamp'), 'N01 messaggio in app creato';
  PERFORM fc_test.as_service();
  SELECT count(*) INTO n FROM public.food_club_push_claim_batch(50) WHERE user_id = m;
  ASSERT n = 0, 'N01 nessun invio push';
  ASSERT (SELECT push_skip_reason FROM public.food_club_messages WHERE user_id = m AND kind = 'stamp') = 'club_notifications_off', 'N01 motivo';
  RAISE NOTICE 'PASS N01 ambito order';
END $$;

-- N02 con tocco ATTIVA (scope club) il timbro parte anche in fascia silenziosa; secondo messaggio rinviato (1 al giorno)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; r record; n int; BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM public.food_club_push_subscribe('walrus-main', 'https://push.test/c' || m, 'k', 'a', 'ua', 'club', 'push-club-v1');
  ASSERT (SELECT notif_club_enabled FROM public.food_club_members WHERE user_id = m), 'N02 consenso tessera attivato dal tocco';
  ASSERT (SELECT consent_scope FROM public.kitchen_push_subscriptions WHERE customer_id = m) = 'club', 'N02 scope club';
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  PERFORM public.food_club_enqueue_message(m, 'referral_reward', 'x-' || m, 'T', 'B', '/kitchen/club');
  PERFORM fc_test.as_service();
  SELECT * INTO r FROM public.food_club_push_claim_batch(50) WHERE user_id = m AND kind = 'stamp';
  ASSERT r.message_id IS NOT NULL AND jsonb_array_length(r.subscriptions) = 1 AND r.url LIKE '/kitchen/club?n=%', 'N02 timbro inviato';
  PERFORM public.food_club_push_report(r.message_id, 1, '{}', NULL);
  ASSERT (SELECT push_status FROM public.food_club_messages WHERE id = r.message_id) = 'sent', 'N02 segnato inviato';
  SELECT count(*) INTO n FROM public.food_club_push_claim_batch(50) WHERE user_id = m;
  ASSERT n = 0, 'N02 tetto 1 al giorno';
  ASSERT (SELECT push_status = 'queued' AND push_after > now() FROM public.food_club_messages WHERE user_id = m AND kind = 'referral_reward'), 'N02 secondo rinviato';
  RAISE NOTICE 'PASS N02 consenso club e tetto giornaliero';
END $$;

-- N03 promo senza consenso marketing: mai inviata; endpoint scaduto (410) rimosso
DO $$ DECLARE m uuid := fc_test.new_member(); r record; n int; BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM public.food_club_push_subscribe('walrus-main', 'https://push.test/p' || m, 'k', 'a', 'ua', 'club');
  PERFORM public.food_club_enqueue_message(m, 'promo', 'p1', 'PROMO', 'x', '/kitchen');
  PERFORM fc_test.as_service();
  SELECT count(*) INTO n FROM public.food_club_push_claim_batch(50) WHERE user_id = m;
  ASSERT n = 0 AND (SELECT push_skip_reason FROM public.food_club_messages WHERE user_id = m AND kind = 'promo') = 'no_marketing_consent', 'N03 promo bloccata';
  PERFORM public.food_club_enqueue_message(m, 'referral_reward', 'rr', 'T', 'B', '/kitchen/club');
  UPDATE public.food_club_messages SET push_after = now() WHERE user_id = m;
  SELECT * INTO r FROM public.food_club_push_claim_batch(50) WHERE user_id = m;
  IF r.message_id IS NOT NULL THEN
    PERFORM public.food_club_push_report(r.message_id, 0, ARRAY['https://push.test/p' || m], 'gone');
    ASSERT NOT EXISTS (SELECT 1 FROM public.kitchen_push_subscriptions WHERE customer_id = m), 'N03 endpoint rimosso';
  END IF;
  RAISE NOTICE 'PASS N03 promo e pulizia endpoint';
END $$;

-- N04 claim solo service_role
DO $$ DECLARE m uuid := fc_test.new_member(); BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_push_claim_batch(1)$q$, 'service_role_only');
  RAISE NOTICE 'PASS N04 claim protetto';
END $$;

-- N05 track: eventi validi deduplicati, eventi sconosciuti rifiutati
DO $$ DECLARE m uuid := fc_test.new_member(); BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM public.food_club_track('install_cta_click', 'tessera', 'ios-safari');
  PERFORM public.food_club_track('install_cta_click', 'tessera', 'ios-safari');
  ASSERT (SELECT count(*) FROM public.food_club_events WHERE user_id = m) = 1, 'N05 deduplicato';
  PERFORM fc_test.expect_error($q$SELECT public.food_club_track('hack', NULL, NULL)$q$, 'invalid_event');
  RAISE NOTICE 'PASS N05 eventi';
END $$;
