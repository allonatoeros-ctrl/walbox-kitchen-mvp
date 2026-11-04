-- F3: iscrizione con telefono verificato, consensi, unione dispositivi, inviti.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- I01 anonimo / telefono non verificato non può iscriversi
DO $$ DECLARE a uuid := fc_test.new_user(true); u uuid; BEGIN
  PERFORM fc_test.as_user(a, 'authenticated', true);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'verified_phone_required');
  INSERT INTO auth.users (is_anonymous, phone) VALUES (false, '+393331112223') RETURNING id INTO u; -- phone senza conferma
  PERFORM fc_test.as_user(u);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'verified_phone_required');
  RAISE NOTICE 'PASS I01 serve telefono verificato';
END $$;

-- I02 iscrizione: consenso servizio obbligatorio, marketing separato e tracciato
DO $$ DECLARE u uuid := fc_test.new_user(false, '+393401234567'); r jsonb; st jsonb; BEGIN
  PERFORM fc_test.as_user(u);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', false)$q$, 'service_consent_required');
  r := public.food_club_join('privacy-v1', true, false, 'Ale');
  ASSERT (r->>'member')::boolean, 'I02 iscritto';
  ASSERT (SELECT marketing_consent_at IS NULL FROM public.food_club_members WHERE user_id = u), 'I02 marketing spento di default';
  ASSERT (SELECT count(*) FROM public.food_club_consent_events WHERE user_id = u) = 2, 'I02 due consensi registrati (servizio, marketing=no)';
  r := public.food_club_join('privacy-v1', true);
  ASSERT (r->>'already_member')::boolean, 'I02 join idempotente';
  st := public.food_club_my_state();
  ASSERT (st->>'member')::boolean AND st->>'phone_masked' = '••• ••• 567', 'I02 stato con telefono mascherato';
  PERFORM public.food_club_set_preferences('privacy-v1', NULL, NULL, true);
  ASSERT (SELECT marketing_consent_at IS NOT NULL FROM public.food_club_members WHERE user_id = u), 'I02 marketing attivato';
  PERFORM public.food_club_set_preferences('privacy-v1', NULL, true, NULL);
  PERFORM public.food_club_set_preferences('privacy-v1', NULL, NULL, false);
  ASSERT (SELECT NOT notif_promo_enabled AND marketing_revoked_at IS NOT NULL FROM public.food_club_members WHERE user_id = u), 'I02 revoca marketing spegne promo';
  PERFORM fc_test.expect_error($q$SELECT public.food_club_set_preferences('privacy-v1', NULL, true, NULL)$q$, 'marketing_consent_required');
  ASSERT (SELECT count(*) FROM public.food_club_consent_events WHERE user_id = u AND kind = 'marketing') = 3, 'I02 storico marketing';
  RAISE NOTICE 'PASS I02 consensi separati';
END $$;

-- I03 conversione anonimo -> telefono (stesso uid): ordini restano, nessun timbro retroattivo (D-13 spenta)
DO $$ DECLARE a uuid := fc_test.new_user(true); s uuid := fc_test.new_staff(); o public.kitchen_orders; BEGIN
  o := fc_test.order(a, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  UPDATE auth.users SET is_anonymous = false, phone = '+393409990001', phone_confirmed_at = now() WHERE id = a;
  PERFORM fc_test.as_user(a);
  PERFORM public.food_club_join('privacy-v1', true);
  ASSERT fc_test.stamps(a) = 0, 'I03 D-13 spenta: nessun timbro retroattivo';
  ASSERT (SELECT count(*) FROM public.kitchen_orders WHERE customer_id = a) = 1, 'I03 ordine ancora suo';
  RAISE NOTICE 'PASS I03 stesso uid';
END $$;

-- I03b D-13 accesa (7 giorni): ordine pagato prima dell'iscrizione dà il timbro
DO $$ DECLARE a uuid := fc_test.new_user(true); s uuid := fc_test.new_staff(); o public.kitchen_orders; BEGIN
  PERFORM fc_test.activate_campaign('{"retroactive_days": 7}');
  o := fc_test.order(a, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  UPDATE auth.users SET is_anonymous = false, phone = '+393409990002', phone_confirmed_at = now() WHERE id = a;
  PERFORM fc_test.as_user(a); PERFORM public.food_club_join('privacy-v1', true);
  ASSERT fc_test.stamps(a) = 1, 'I03b timbro retroattivo';
  PERFORM fc_test.activate_campaign('{"retroactive_days": 0}');
  RAISE NOTICE 'PASS I03b retroattivo configurabile';
END $$;

-- I04 secondo dispositivo: biglietto di unione legato al numero (P4)
DO $$ DECLARE member uuid := fc_test.new_user(false, '+393475550001'); anon2 uuid := fc_test.new_user(true);
  thief uuid := fc_test.new_user(false, '+393475550099'); o public.kitchen_orders; tok text; r jsonb; BEGIN
  PERFORM fc_test.as_user(member); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(thief); PERFORM public.food_club_join('privacy-v1', true);
  o := fc_test.order(anon2, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon2, 'authenticated', true);
  tok := public.food_club_create_merge_ticket('347 555 0001');
  ASSERT tok ~ '^[0-9a-f]{64}$', 'I04 biglietto creato';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_merge_tickets WHERE token_hash = tok), 'I04 token salvato solo come hash';
  PERFORM fc_test.as_user(thief);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_phone_mismatch');
  PERFORM fc_test.as_user(member);
  r := public.food_club_redeem_merge_ticket(tok);
  ASSERT (r->>'orders')::int = 1, 'I04 ordine spostato';
  ASSERT (SELECT customer_id FROM public.kitchen_orders WHERE id = o.id) = member, 'I04 ordine ora del membro';
  r := public.food_club_redeem_merge_ticket(tok);
  ASSERT (r->>'replay')::boolean, 'I04 replay idempotente';
  PERFORM fc_test.as_user(thief);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_already_used');
  RAISE NOTICE 'PASS I04 biglietto di unione';
END $$;

-- I05 biglietto scaduto / sessione non anonima / niente da unire
DO $$ DECLARE member uuid := fc_test.new_user(false, '+393475550011'); anon2 uuid := fc_test.new_user(true); tok text; BEGIN
  PERFORM fc_test.as_user(member);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_create_merge_ticket('3475550011')$q$, 'anonymous_session_required');
  PERFORM fc_test.as_user(anon2, 'authenticated', true);
  ASSERT public.food_club_create_merge_ticket('3475550011') IS NULL, 'I05 niente da unire: nessun biglietto';
  PERFORM fc_test.order(anon2, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon2, 'authenticated', true);
  tok := public.food_club_create_merge_ticket('3475550011');
  UPDATE public.food_club_merge_tickets SET expires_at = now() - interval '1 second';
  PERFORM fc_test.as_user(member);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_expired');
  RAISE NOTICE 'PASS I05 biglietto scaduto';
END $$;

-- I06 inviti: codice, auto-invito, inviti spenti, benvenuto
DO $$ DECLARE inviter uuid := fc_test.new_user(false, '+393480000001'); inv uuid := fc_test.new_user(false, '+393480000002');
  inv2 uuid := fc_test.new_user(false, '+393480000003'); code text; r jsonb; BEGIN
  PERFORM fc_test.as_user(inviter); PERFORM public.food_club_join('privacy-v1', true);
  SELECT referral_code INTO code FROM public.food_club_members WHERE user_id = inviter;
  PERFORM fc_test.as_user(inv);
  r := public.food_club_join('privacy-v1', true, false, NULL, code);
  ASSERT r->>'referral' = 'referral_disabled', 'I06 inviti spenti (D-14)';
  PERFORM fc_test.activate_campaign('{"referral_enabled": true, "welcome_stamp_enabled": true}');
  PERFORM fc_test.as_user(inv2);
  r := public.food_club_join('privacy-v1', true, false, NULL, lower(code));
  ASSERT r->>'referral' = 'linked', 'I06 invito collegato';
  ASSERT (SELECT count(*) FROM public.food_club_stamps WHERE user_id = inv2 AND kind = 'welcome') = 1, 'I06 timbro di benvenuto';
  PERFORM fc_test.as_user(inviter);
  ASSERT (public.food_club_my_state()->'referrals'->>'pending')::int = 1, 'I06 invitante vede 1 invito in attesa';
  PERFORM fc_test.activate_campaign('{"referral_enabled": false, "welcome_stamp_enabled": false}');
  RAISE NOTICE 'PASS I06 inviti';
END $$;

-- I07 uscita dal Club: consensi revocati, coda push svuotata
DO $$ DECLARE u uuid := fc_test.new_user(false, '+393480000010'); BEGIN
  PERFORM fc_test.as_user(u); PERFORM public.food_club_join('privacy-v1', true, true);
  PERFORM public.food_club_leave('privacy-v1');
  ASSERT (SELECT status = 'left' AND marketing_consent_at IS NULL FROM public.food_club_members WHERE user_id = u), 'I07 uscito';
  ASSERT NOT (public.food_club_my_state()->>'member')::boolean, 'I07 stato non membro';
  RAISE NOTICE 'PASS I07 uscita';
END $$;
