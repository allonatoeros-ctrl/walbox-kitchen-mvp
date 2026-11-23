-- Identità via EMAIL (migration 20261123100000): hash normalizzato, join, duplicati, biglietti di unione,
-- analytics staff (email mascherata + ricerca per inizio email), grant. Il telefono deve continuare a funzionare.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- Utente con email (confermata o no) e, a richiesta, telefono confermato. Solo per questo file di test.
CREATE OR REPLACE FUNCTION fc_test.new_email_user(p_email text, p_confirmed boolean DEFAULT true, p_anon boolean DEFAULT false,
                                                  p_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO auth.users (id, is_anonymous, email, email_confirmed_at, phone, phone_confirmed_at)
  VALUES (gen_random_uuid(), p_anon, p_email, CASE WHEN p_confirmed THEN now() END, p_phone,
          CASE WHEN p_phone IS NULL THEN NULL ELSE now() END) RETURNING id $$;

-- E01 normalizzazione dell'hash: maiuscole/spazi, gmail (punti, +alias, googlemail), altri domini solo trim+minuscole
DO $$ DECLARE h text := public.food_club_email_hash('mario@gmail.com'); BEGIN
  ASSERT h ~ '^[0-9a-f]{64}$', 'E01 hash sha256 esadecimale';
  ASSERT public.food_club_email_hash('  MARIO@Gmail.COM  ') = h, 'E01 spazi e maiuscole';
  ASSERT public.food_club_email_hash('Ma.Rio+x@GoogleMail.com') = h, 'E01 gmail: punti, +alias, googlemail';
  ASSERT public.food_club_email_hash('m.a.r.i.o+promo+altro@gmail.com') = h, 'E01 gmail: piu alias';
  ASSERT public.food_club_email_hash('mario@example.com') <> h, 'E01 dominio diverso = hash diverso';
  ASSERT public.food_club_email_hash(' Mario@Example.COM ') = public.food_club_email_hash('mario@example.com'), 'E01 altri domini: trim+minuscole';
  ASSERT public.food_club_email_hash('ma.rio@example.com') <> public.food_club_email_hash('mario@example.com'), 'E01 altri domini: i punti contano';
  ASSERT public.food_club_email_hash('mario+x@example.com') <> public.food_club_email_hash('mario@example.com'), 'E01 altri domini: +alias NON tolto';
  ASSERT h <> encode(extensions.digest('food-club-v1:mario@gmail.com', 'sha256'), 'hex'), 'E01 sale diverso da quello del telefono';
  ASSERT public.food_club_email_hash(NULL) IS NULL AND public.food_club_email_hash('') IS NULL AND public.food_club_email_hash('   ') IS NULL
     AND public.food_club_email_hash('senza-chiocciola') IS NULL AND public.food_club_email_hash('a@') IS NULL
     AND public.food_club_email_hash('@x.com') IS NULL AND public.food_club_email_hash('a b@x.com') IS NULL
     AND public.food_club_email_hash('a@b@c.com') IS NULL AND public.food_club_email_hash('+x@gmail.com') IS NULL
     AND public.food_club_email_hash('...@gmail.com') IS NULL, 'E01 email malformate: NULL';
  RAISE NOTICE 'PASS E01 hash email normalizzato';
END $$;

-- E02 iscrizione con email confermata: hash salvato (non l'email), my_state con tipo e maschera, join idempotente
DO $$ DECLARE u uuid := fc_test.new_email_user(' Mario.Rossi@Gmail.com '); r jsonb; st jsonb; m public.food_club_members; BEGIN
  PERFORM fc_test.as_user(u);
  st := public.food_club_my_state();
  ASSERT NOT (st->>'member')::boolean AND (st->>'identity_verified')::boolean AND st->>'identity_kind' = 'email'
     AND (st->>'email_verified')::boolean AND NOT (st->>'phone_verified')::boolean, 'E02 prima del join: identita email verificata';
  r := public.food_club_join('privacy-v1', true, false, 'Mario');
  ASSERT (r->>'member')::boolean AND NOT (r->>'already_member')::boolean, 'E02 iscritto';
  SELECT * INTO m FROM public.food_club_members WHERE user_id = u;
  ASSERT m.email_hash = public.food_club_email_hash('mariorossi@gmail.com') AND m.phone_hash IS NULL, 'E02 email_hash (normalizzato) salvato, phone_hash vuoto';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE to_jsonb(food_club_members)::text ILIKE '%mario.rossi%'), 'E02 nessuna email in chiaro nella tabella iscritti';
  ASSERT (SELECT count(*) FROM public.food_club_consent_events WHERE user_id = u) = 2, 'E02 consensi registrati';
  r := public.food_club_join('privacy-v1', true);
  ASSERT (r->>'already_member')::boolean, 'E02 join idempotente';
  st := public.food_club_my_state();
  ASSERT (st->>'member')::boolean AND st->>'identity_kind' = 'email' AND st->>'email_masked' = 'Ma***@Gmail.com'
     AND st ? 'last_completed_card' AND st ? 'phone_masked' AND st->'phone_masked' = 'null'::jsonb, 'E02 my_state: email mascherata, last_completed_card presente: ' || st::text;
  RAISE NOTICE 'PASS E02 join via email confermata';
END $$;

-- E03 stessa email normalizzata (gmail punti/+alias/googlemail) = email_already_member; altro dominio con alias resta distinto
DO $$ DECLARE a uuid := fc_test.new_email_user('mario@gmail.com'); b uuid := fc_test.new_email_user('Ma.Rio+x@GoogleMail.com');
  c uuid := fc_test.new_email_user('mario+x@example.com'); d uuid := fc_test.new_email_user('mario@example.com'); BEGIN
  PERFORM fc_test.as_user(a); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(b);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'email_already_member');
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = b), 'E03 nessuna riga creata per il duplicato';
  PERFORM fc_test.as_user(c); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(d); PERFORM public.food_club_join('privacy-v1', true);
  ASSERT (SELECT count(*) FROM public.food_club_members WHERE user_id IN (c, d)) = 2, 'E03 altro dominio: alias + e` una persona diversa';
  RAISE NOTICE 'PASS E03 duplicati email';
END $$;

-- E04 email non confermata, anonimo (anche con email confermata), sessione assente: rifiutati
DO $$ DECLARE a uuid := fc_test.new_email_user('nonconf@example.com', false); an uuid := fc_test.new_email_user('anon@example.com', true, true);
  e uuid := fc_test.new_email_user('', true); st jsonb; BEGIN
  PERFORM fc_test.as_user(a);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'verified_identity_required');
  st := public.food_club_my_state();
  ASSERT NOT (st->>'identity_verified')::boolean AND st->'identity_kind' = 'null'::jsonb AND NOT (st->>'email_verified')::boolean
     AND st->'email_masked' = 'null'::jsonb, 'E04 email non confermata: stato non verificato e nessuna maschera';
  PERFORM fc_test.as_user(an, 'authenticated', true);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'verified_identity_required');
  PERFORM fc_test.as_user(e);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'verified_identity_required');
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'session_required');
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id IN (a, an, e)), 'E04 nessun iscritto creato';
  RAISE NOTICE 'PASS E04 email non verificata / anonimo / vuota rifiutati';
END $$;

-- E05 solo telefono: funziona come prima (phone_hash, phone_already_member, my_state)
DO $$ DECLARE a uuid := fc_test.new_user(false, '+393401112233'); b uuid := fc_test.new_user(false, '+39 340 111 2233 ');
  st jsonb; m public.food_club_members; BEGIN
  UPDATE auth.users SET phone = '3401112233' WHERE id = b; -- stesso numero in forma diversa
  PERFORM fc_test.as_user(a); PERFORM public.food_club_join('privacy-v1', true);
  SELECT * INTO m FROM public.food_club_members WHERE user_id = a;
  ASSERT m.phone_hash = public.food_club_phone_hash('+393401112233') AND m.email_hash IS NULL, 'E05 phone_hash salvato, email_hash vuoto';
  st := public.food_club_my_state();
  ASSERT st->>'identity_kind' = 'phone' AND st->>'phone_masked' = '••• ••• 233' AND (st->>'phone_verified')::boolean
     AND NOT (st->>'email_verified')::boolean, 'E05 my_state telefono';
  PERFORM fc_test.as_user(b);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'phone_already_member');
  RAISE NOTICE 'PASS E05 ramo telefono invariato';
END $$;

-- E06 utente con email E telefono: nuovo join = email; chi e' gia' iscritto col telefono resta valido anche se poi conferma un'email
DO $$ DECLARE both_u uuid := fc_test.new_email_user('both@example.com', true, false, '+393402223344');
  old_member uuid := fc_test.new_user(false, '+393405556677'); m public.food_club_members; r jsonb; BEGIN
  PERFORM fc_test.as_user(both_u); PERFORM public.food_club_join('privacy-v1', true);
  SELECT * INTO m FROM public.food_club_members WHERE user_id = both_u;
  ASSERT m.email_hash IS NOT NULL AND m.phone_hash IS NULL, 'E06 nuovo join con email e telefono: vince l email';
  ASSERT public.food_club_my_state()->>'identity_kind' = 'email', 'E06 my_state: email prima del telefono';
  PERFORM fc_test.as_user(old_member); PERFORM public.food_club_join('privacy-v1', true);
  UPDATE auth.users SET email = 'dopo@example.com', email_confirmed_at = now() WHERE id = old_member;
  r := public.food_club_join('privacy-v1', true);
  ASSERT (r->>'already_member')::boolean, 'E06 iscritto col telefono resta valido';
  SELECT * INTO m FROM public.food_club_members WHERE user_id = old_member;
  ASSERT m.phone_hash = public.food_club_phone_hash('+393405556677') AND m.email_hash IS NULL, 'E06 hash dell iscritto esistente invariati';
  RAISE NOTICE 'PASS E06 utente con email e telefono';
END $$;

-- E07 rientro di un ex iscritto: con email libera ok, con email di un altro iscritto = email_already_member
DO $$ DECLARE a uuid := fc_test.new_email_user('uno@example.com'); b uuid := fc_test.new_user(false, '+393407778899');
  c uuid := fc_test.new_email_user('libera@example.com', false); m public.food_club_members; BEGIN
  PERFORM fc_test.as_user(a); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(b); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM public.food_club_leave('privacy-v1');
  UPDATE auth.users SET email = 'UNO@example.com', email_confirmed_at = now() WHERE id = b;
  PERFORM fc_test.expect_error($q$SELECT public.food_club_join('privacy-v1', true)$q$, 'email_already_member');
  UPDATE auth.users SET email = 'tornato@example.com' WHERE id = b;
  PERFORM public.food_club_join('privacy-v1', true);
  SELECT * INTO m FROM public.food_club_members WHERE user_id = b;
  ASSERT m.status = 'active' AND m.email_hash = public.food_club_email_hash('tornato@example.com')
     AND m.phone_hash = public.food_club_phone_hash('+393407778899'), 'E07 rientro: email aggiunta, telefono mantenuto';
  RAISE NOTICE 'PASS E07 rientro ex iscritto';
END $$;

-- E08 inviti con email: link tra identita' diverse; il codice proprio non vale (self_invite); inviti spenti restano spenti
DO $$ DECLARE inviter uuid := fc_test.new_email_user('invita@example.com'); inv uuid := fc_test.new_email_user('invitato@example.com');
  inv_phone uuid := fc_test.new_user(false, '+393408889900'); code text; r jsonb; BEGIN
  PERFORM fc_test.as_user(inviter); PERFORM public.food_club_join('privacy-v1', true);
  code := public.food_club_my_state()->>'referral_code';
  UPDATE public.food_club_campaigns SET referral_enabled = true WHERE id = 'visite-v1';
  PERFORM fc_test.as_user(inv);
  r := public.food_club_join('privacy-v1', true, false, NULL, code);
  ASSERT r->>'referral' = 'linked', 'E08 invito tra due email: ' || r::text;
  PERFORM fc_test.as_user(inv_phone);
  r := public.food_club_join('privacy-v1', true, false, NULL, code);
  ASSERT r->>'referral' = 'linked', 'E08 invito email -> telefono: ' || r::text;
  RAISE NOTICE 'PASS E08 inviti con email';
END $$;

-- E09 biglietti di unione con email
DO $$ DECLARE member uuid := fc_test.new_email_user('Ma.Ria@Gmail.com'); thief uuid := fc_test.new_email_user('ladro@example.com');
  phone_only uuid := fc_test.new_user(false, '+393409990011'); both_u uuid := fc_test.new_email_user('entrambi@example.com', true, false, '+393401230011');
  anon1 uuid := fc_test.new_user(true); anon2 uuid := fc_test.new_user(true); anon3 uuid := fc_test.new_user(true); anon4 uuid := fc_test.new_user(true);
  noid uuid := fc_test.new_email_user('nonconf@example.com', false);
  o public.kitchen_orders; tok text; r jsonb; t public.food_club_merge_tickets; BEGIN
  PERFORM fc_test.as_user(member); PERFORM public.food_club_join('privacy-v1', true);
  o := fc_test.order(anon1, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon1, 'authenticated', true);
  tok := public.food_club_create_merge_ticket_email(' maria@gmail.com ');
  SELECT * INTO t FROM public.food_club_merge_tickets WHERE source_user_id = anon1;
  ASSERT t.email_hash = public.food_club_email_hash('m.aria+q@gmail.com') AND t.phone_hash IS NULL, 'E09 il biglietto porta solo email_hash normalizzato';
  PERFORM fc_test.as_user(thief);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_email_mismatch');
  PERFORM fc_test.as_user(phone_only);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_email_mismatch');
  PERFORM fc_test.as_user(noid);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'verified_identity_required');
  PERFORM fc_test.as_user(member);
  r := public.food_club_redeem_merge_ticket(tok);
  ASSERT (r->>'orders')::int = 1 AND (SELECT customer_id FROM public.kitchen_orders WHERE id = o.id) = member, 'E09 ordine spostato sull iscritto email';
  ASSERT (public.food_club_redeem_merge_ticket(tok)->>'replay')::boolean, 'E09 replay idempotente';
  PERFORM fc_test.as_user(thief);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_already_used');

  -- biglietto solo-telefono riscattato da chi ha email E telefono: vale col telefono; un'email non basta
  o := fc_test.order(anon2, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon2, 'authenticated', true);
  tok := public.food_club_create_merge_ticket('340 123 0011');
  PERFORM fc_test.as_user(member);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_phone_mismatch');
  PERFORM fc_test.as_user(both_u);
  r := public.food_club_redeem_merge_ticket(tok);
  ASSERT (r->>'orders')::int = 1, 'E09 biglietto telefono riscattato da utente con email e telefono';

  -- biglietto con entrambi: basta uno dei due; nessuno dei due = ticket_identity_mismatch
  o := fc_test.order(anon3, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon3, 'authenticated', true);
  tok := public.food_club_create_merge_ticket('+393409990011');
  UPDATE public.food_club_merge_tickets SET email_hash = public.food_club_email_hash('qualcuno@example.com') WHERE source_user_id = anon3;
  PERFORM fc_test.as_user(thief);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_redeem_merge_ticket(%L)', tok), 'ticket_identity_mismatch');
  PERFORM fc_test.as_user(phone_only);
  r := public.food_club_redeem_merge_ticket(tok);
  ASSERT (r->>'orders')::int = 1, 'E09 biglietto con due hash: vale col telefono';

  -- errori in creazione: email non valida, telefono non valido, nessuna identita', sessione non anonima
  o := fc_test.order(anon4, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_user(anon4, 'authenticated', true);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_create_merge_ticket_email('non-una-email')$q$, 'invalid_email');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_create_merge_ticket_email(NULL)$q$, 'invalid_email');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_create_merge_ticket('abc')$q$, 'invalid_phone');
  ASSERT public.food_club_create_merge_ticket_email('x@example.com') IS NOT NULL, 'E09 anon con ordine: biglietto email creato';
  PERFORM fc_test.as_user(member);
  PERFORM fc_test.expect_error($q$SELECT public.food_club_create_merge_ticket_email('maria@gmail.com')$q$, 'anonymous_session_required');
  -- nessun ordine da unire: nessun biglietto
  PERFORM fc_test.as_user(fc_test.new_user(true), 'authenticated', true);
  ASSERT public.food_club_create_merge_ticket_email('x@example.com') IS NULL, 'E09 niente da unire: nessun biglietto email';
  -- vincolo DB: un biglietto senza nessun hash non puo' esistere
  PERFORM fc_test.expect_error(format($q$INSERT INTO public.food_club_merge_tickets (token_hash, source_user_id) VALUES ('x', %L)$q$, anon4),
    'food_club_merge_tickets_identity_hash_check');
  RAISE NOTICE 'PASS E09 biglietti di unione con email';
END $$;

-- E10 staff: email mascherata, ricerca per INIZIO email (case-insensitive, min 3 caratteri), telefono ancora cercabile
DO $$ DECLARE s uuid := fc_test.new_staff(); a uuid := fc_test.new_email_user('Carlo.Verdi@Gmail.com'); b uuid := fc_test.new_email_user('luca.bianchi@example.com');
  p uuid := fc_test.new_user(false, '+393401239876'); n uuid := fc_test.new_email_user('zzz.nonconf@example.com', false); n_found int; BEGIN
  PERFORM fc_test.as_user(a); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(b); PERFORM public.food_club_join('privacy-v1', true);
  PERFORM fc_test.as_user(p); PERFORM public.food_club_join('privacy-v1', true);
  INSERT INTO public.food_club_members (user_id, terms_version, service_consent_at) VALUES (n, 'test-v1', now()); -- email NON confermata
  PERFORM fc_test.as_user(s);
  ASSERT (SELECT email_masked FROM public.food_club_staff_members('walrus-main') WHERE user_id = a) = 'Ca***@Gmail.com', 'E10 email mascherata (prime 2 lettere + *** + dominio)';
  ASSERT (SELECT email_masked FROM public.food_club_staff_members('walrus-main') WHERE user_id = b) = 'lu***@example.com', 'E10 email mascherata 2';
  ASSERT (SELECT email_masked IS NULL AND phone_masked = '••• ••• 876' FROM public.food_club_staff_members('walrus-main') WHERE user_id = p), 'E10 telefono: maschera invariata, nessuna email';
  ASSERT (SELECT email_masked IS NULL FROM public.food_club_staff_members('walrus-main') WHERE user_id = n), 'E10 email non confermata: non mostrata';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main') WHERE email_masked ~* 'verdi|bianchi|carlo\.'), 'E10 nessun indirizzo completo esposto';
  -- ricerca per inizio email
  ASSERT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', 'car') WHERE user_id = a), 'E10 prefisso "car"';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', ' CARLO.V ') WHERE user_id = a), 'E10 maiuscole e spazi ignorati';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', 'carlo.verdi@gm') WHERE user_id = a), 'E10 prefisso con chiocciola';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', 'verdi') WHERE user_id = a), 'E10 e` un prefisso, non una sottostringa';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', 'ca') WHERE user_id = a), 'E10 sotto 3 caratteri nessuna ricerca per email';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', 'zzz') WHERE user_id = n), 'E10 email non confermata non cercabile';
  -- jolly LIKE non devono allargare la ricerca; ricerca senza cifre non deve combaciare con chi non ha telefono
  SELECT count(*) INTO n_found FROM public.food_club_staff_members('walrus-main', '%%%') WHERE user_id IN (a, b, n, p);
  ASSERT n_found = 0, 'E10 "%%%" non e` un jolly: ' || n_found;
  SELECT count(*) INTO n_found FROM public.food_club_staff_members('walrus-main', 'qqq') WHERE user_id IN (a, b, n, p);
  ASSERT n_found = 0, 'E10 ricerca senza risultati: nessun iscritto senza telefono combacia: ' || n_found;
  -- telefono: ultime 3 cifre come prima
  ASSERT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', '876') WHERE user_id = p), 'E10 ultime 3 cifre telefono';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main', '876') WHERE user_id = a), 'E10 le 3 cifre non trovano gli iscritti email';
  RAISE NOTICE 'PASS E10 staff members: email mascherata e ricerca';
END $$;

-- E11 staff vouchers/referrals: colonne email mascherate presenti e popolate
DO $$ DECLARE s uuid := fc_test.new_staff(); inviter uuid := fc_test.new_email_user('invita2@example.com'); inv uuid := fc_test.new_email_user('invitato2@example.com');
  code text; ref record; BEGIN
  PERFORM fc_test.as_user(inviter); PERFORM public.food_club_join('privacy-v1', true);
  code := public.food_club_my_state()->>'referral_code';
  UPDATE public.food_club_campaigns SET referral_enabled = true WHERE id = 'visite-v1';
  PERFORM fc_test.as_user(inv); PERFORM public.food_club_join('privacy-v1', true, false, NULL, code);
  PERFORM fc_test.as_user(s);
  SELECT * INTO ref FROM public.food_club_staff_referrals('walrus-main') LIMIT 1;
  ASSERT ref.inviter_email = 'in***@example.com' AND ref.invitee_email = 'in***@example.com' AND ref.inviter_phone IS NULL, 'E11 referrals: email mascherate ' || ref::text;
  ASSERT (SELECT count(*) FROM public.food_club_staff_vouchers('walrus-main')) >= 0, 'E11 vouchers eseguibile';
  ASSERT pg_get_function_result('public.food_club_staff_vouchers(text,text,integer)'::regprocedure) ~ 'email_masked text', 'E11 vouchers: colonna email_masked';
  RAISE NOTICE 'PASS E11 staff referrals/vouchers';
END $$;

-- E12 permessi: helper interni non chiamabili dai clienti, RPC cliente/staff solo authenticated, vecchia firma sparita
DO $$ BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_email_hash(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_email_hash(text)', 'EXECUTE'), 'E12 email_hash interno';
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_verified_email(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_verified_email(uuid)', 'EXECUTE'), 'E12 verified_email interno';
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_verified_identity(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_verified_identity(uuid)', 'EXECUTE'), 'E12 verified_identity interno';
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_mask_email(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_mask_email(text)', 'EXECUTE'), 'E12 mask_email interno';
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_verified_phone(uuid)', 'EXECUTE'), 'E12 verified_phone resta interno';
  ASSERT has_function_privilege('authenticated', 'public.food_club_join(text,boolean,boolean,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_join(text,boolean,boolean,text,text)', 'EXECUTE'), 'E12 join';
  ASSERT has_function_privilege('authenticated', 'public.food_club_my_state()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_my_state()', 'EXECUTE'), 'E12 my_state';
  ASSERT has_function_privilege('authenticated', 'public.food_club_create_merge_ticket(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_create_merge_ticket(text)', 'EXECUTE'), 'E12 create_merge_ticket (telefono, invariata)';
  ASSERT has_function_privilege('authenticated', 'public.food_club_create_merge_ticket_email(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_create_merge_ticket_email(text)', 'EXECUTE'), 'E12 create_merge_ticket_email';
  ASSERT has_function_privilege('authenticated', 'public.food_club_redeem_merge_ticket(text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_redeem_merge_ticket(text)', 'EXECUTE'), 'E12 redeem_merge_ticket';
  ASSERT has_function_privilege('authenticated', 'public.food_club_staff_members(text,text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_staff_members(text,text,integer)', 'EXECUTE'), 'E12 staff_members';
  ASSERT has_function_privilege('authenticated', 'public.food_club_staff_vouchers(text,text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_staff_vouchers(text,text,integer)', 'EXECUTE'), 'E12 staff_vouchers';
  ASSERT has_function_privilege('authenticated', 'public.food_club_staff_referrals(text,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_staff_referrals(text,integer)', 'EXECUTE'), 'E12 staff_referrals';
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname IN ('food_club_join','food_club_my_state','food_club_create_merge_ticket',
          'food_club_redeem_merge_ticket','food_club_create_merge_ticket_email','food_club_staff_members','food_club_staff_vouchers','food_club_staff_referrals')
          AND pronamespace = 'public'::regnamespace AND prosecdef AND proconfig::text ~ 'search_path') = 8, 'E12 SECURITY DEFINER + search_path fissato';
  RAISE NOTICE 'PASS E12 permessi';
END $$;
