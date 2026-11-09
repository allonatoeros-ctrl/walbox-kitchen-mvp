-- Consegna push (migration 20261109110000): orari fissi via food_club_push_claim_batch_at, orfani, finestre,
-- consenso al momento dell'invio, esiti dell'invio, tick senza secret, cron, generatori promo/winback.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- Orario Europe/Rome tra p_days giorni (sempre nel futuro rispetto a now(): i messaggi creati ora sono già "dovuti").
CREATE OR REPLACE FUNCTION fc_test.rome(p_days int, p_time text) RETURNS timestamptz LANGUAGE sql AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Rome')::date + p_days + p_time::time) AT TIME ZONE 'Europe/Rome' $$;
-- Iscritto con avvisi tessera attivi e una sottoscrizione 'club'; p_promo = consenso marketing + "Promo e novità".
CREATE OR REPLACE FUNCTION fc_test.push_member(p_promo boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE m uuid := fc_test.new_member();
BEGIN
  PERFORM fc_test.as_user(m);
  PERFORM public.food_club_push_subscribe('walrus-main', 'https://push.test/' || m, 'k', 'a', 'ua', 'club', 'push-club-v1');
  IF p_promo THEN
    UPDATE public.food_club_members SET marketing_consent_at = now(), notif_promo_enabled = true WHERE user_id = m;
  END IF;
  PERFORM fc_test.as_service();
  RETURN m;
END $$;
CREATE OR REPLACE FUNCTION fc_test.mkvoucher(p_uid uuid, p_expires timestamptz, p_status text DEFAULT 'available') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at, status)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, p_expires, p_status) RETURNING id $$;
CREATE OR REPLACE FUNCTION fc_test.msg(p_uid uuid, p_kind text, p_ref text DEFAULT NULL) RETURNS public.food_club_messages LANGUAGE sql AS $$
  SELECT * FROM public.food_club_messages WHERE user_id = p_uid AND kind = p_kind AND (p_ref IS NULL OR ref = p_ref) $$;
-- Reclama SOLO i messaggi di p_uid: quelli degli altri utenti vengono parcheggiati di 100 anni e poi ripristinati.
CREATE OR REPLACE FUNCTION fc_test.claimed(p_uid uuid, p_at timestamptz) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  UPDATE public.food_club_messages SET push_after = push_after + interval '100 years'
   WHERE user_id <> p_uid AND push_status = 'queued';
  SELECT count(*)::int INTO n FROM public.food_club_push_claim_batch_at(200, p_at) c WHERE c.user_id = p_uid;
  UPDATE public.food_club_messages SET push_after = push_after - interval '100 years'
   WHERE user_id <> p_uid AND push_after > now() + interval '50 years';
  RETURN n;
END $$;

-- PD01 orfani: <3 tentativi tornano in coda e ripartono; al 3° tentativo 'failed' e non bloccano più il tetto giornaliero
DO $$ DECLARE a uuid := fc_test.push_member(); b uuid := fc_test.push_member(); t timestamptz := fc_test.rome(1, '12:00'); BEGIN
  PERFORM public.food_club_enqueue_message(a, 'referral_reward', 'ra', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(b, 'referral_reward', 'rb', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(b, 'voucher_unlocked', 'ub', 'T', 'B', '/kitchen/club');
  UPDATE public.food_club_messages SET push_status = 'sending', push_claimed_at = t - interval '11 minutes', push_attempts = 1
   WHERE user_id = a;
  UPDATE public.food_club_messages SET push_status = 'sending', push_claimed_at = t - interval '11 minutes', push_attempts = 3
   WHERE user_id = b AND kind = 'referral_reward';
  ASSERT fc_test.claimed(a, t) = 1, 'PD01 orfano con 1 tentativo reclamato di nuovo';
  ASSERT (fc_test.msg(a, 'referral_reward')).push_attempts = 2, 'PD01 tentativo contato';
  ASSERT (fc_test.msg(b, 'referral_reward')).push_status = 'failed'
     AND (fc_test.msg(b, 'referral_reward')).push_skip_reason = 'orphan_max_attempts', 'PD01 orfano al 3 tentativo failed';
  ASSERT fc_test.claimed(b, t) = 1, 'PD01 l orfano failed non blocca il tetto giornaliero';
  RAISE NOTICE 'PASS PD01 orfani recuperati o chiusi';
END $$;

-- PD02 orfano recente (<10 min) resta 'sending' e blocca il secondo messaggio dello stesso utente
DO $$ DECLARE a uuid := fc_test.push_member(); t timestamptz := fc_test.rome(1, '12:00'); BEGIN
  PERFORM public.food_club_enqueue_message(a, 'referral_reward', 'r1', 'T', 'B', '/kitchen/club');
  UPDATE public.food_club_messages SET push_status = 'sending', push_claimed_at = t - interval '3 minutes', push_attempts = 1 WHERE user_id = a;
  PERFORM public.food_club_enqueue_message(a, 'voucher_unlocked', 'u1', 'T', 'B', '/kitchen/club');
  ASSERT fc_test.claimed(a, t) = 0, 'PD02 nessun secondo invio';
  ASSERT (fc_test.msg(a, 'referral_reward')).push_status = 'sending', 'PD02 invio in corso non toccato';
  ASSERT (fc_test.msg(a, 'voucher_unlocked')).push_after >= t + interval '20 hours', 'PD02 secondo rinviato';
  RAISE NOTICE 'PASS PD02 invio in corso conta nel tetto';
END $$;

-- PD03 voucher_expiring: solo 17:00-20:00; prima delle 17 rinvio alle 17 dello stesso giorno, dopo le 20 al giorno dopo,
-- finestra persa prima della scadenza = saltato; 1 sola riga per buono
DO $$ DECLARE a uuid := fc_test.push_member(); b uuid := fc_test.push_member(); c uuid := fc_test.push_member();
  va uuid; vb uuid; vc uuid; BEGIN
  va := fc_test.mkvoucher(a, fc_test.rome(4, '12:00'));
  vb := fc_test.mkvoucher(b, fc_test.rome(4, '12:00'));
  vc := fc_test.mkvoucher(c, fc_test.rome(2, '09:00'));
  PERFORM public.food_club_enqueue_message(a, 'voucher_expiring', va::text, 'SCADE', 'B', '/kitchen/club/buoni');
  PERFORM public.food_club_enqueue_message(b, 'voucher_expiring', vb::text, 'SCADE', 'B', '/kitchen/club/buoni');
  PERFORM public.food_club_enqueue_message(c, 'voucher_expiring', vc::text, 'SCADE', 'B', '/kitchen/club/buoni');
  PERFORM public.food_club_enqueue_message(a, 'voucher_expiring', va::text, 'SCADE', 'B', '/kitchen/club/buoni');
  ASSERT (SELECT count(*) FROM public.food_club_messages WHERE user_id = a AND kind = 'voucher_expiring') = 1, 'PD03 dedup';
  ASSERT fc_test.claimed(a, fc_test.rome(1, '12:00')) = 0, 'PD03 alle 12 non parte';
  ASSERT (fc_test.msg(a, 'voucher_expiring')).push_after = fc_test.rome(1, '17:00'), 'PD03 rinvio alle 17 stesso giorno';
  ASSERT fc_test.claimed(a, fc_test.rome(1, '18:30')) = 1, 'PD03 alle 18:30 parte';
  ASSERT fc_test.claimed(b, fc_test.rome(1, '20:15')) = 0, 'PD03 alle 20:15 non parte';
  ASSERT (fc_test.msg(b, 'voucher_expiring')).push_after = fc_test.rome(2, '17:00'), 'PD03 rinvio al giorno dopo';
  ASSERT fc_test.claimed(c, fc_test.rome(1, '20:15')) = 0
     AND (fc_test.msg(c, 'voucher_expiring')).push_skip_reason = 'expiring_window_missed', 'PD03 finestra persa: saltato';
  RAISE NOTICE 'PASS PD03 voucher_expiring finestra 17-20 e una sola volta';
END $$;

-- PD04 campagna spenta: voucher_expiring saltato (il buono resta available, non si può usare finché è spenta)
DO $$ DECLARE a uuid := fc_test.push_member(); va uuid; BEGIN
  va := fc_test.mkvoucher(a, fc_test.rome(4, '12:00'));
  PERFORM public.food_club_enqueue_message(a, 'voucher_expiring', va::text, 'SCADE', 'B', '/kitchen/club/buoni');
  UPDATE public.food_club_campaigns SET active = false WHERE id = 'visite-v1';
  ASSERT fc_test.claimed(a, fc_test.rome(1, '18:00')) = 0, 'PD04 nessun invio';
  ASSERT (fc_test.msg(a, 'voucher_expiring')).push_skip_reason = 'campaign_off', 'PD04 motivo';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = va) = 'available', 'PD04 buono intatto';
  PERFORM fc_test.activate_campaign();
  RAISE NOTICE 'PASS PD04 promemoria scadenza spento a campagna OFF';
END $$;

-- PD05 buono non più disponibile (revocato/usato): 'voucher_unlocked' saltato; ref non-buono (es. invito senza buono) non è toccato dalla regola
DO $$ DECLARE a uuid := fc_test.push_member(); b uuid := fc_test.push_member(); va uuid; BEGIN
  va := fc_test.mkvoucher(a, fc_test.rome(20, '12:00'), 'revoked');
  PERFORM public.food_club_enqueue_message(a, 'voucher_unlocked', va::text, '5 € SBLOCCATI', 'B', '/kitchen/club/buoni');
  PERFORM public.food_club_enqueue_message(b, 'referral_reward', 'non-uuid', 'T', 'B', '/kitchen/club');
  ASSERT fc_test.claimed(a, fc_test.rome(1, '12:00')) = 0
     AND (fc_test.msg(a, 'voucher_unlocked')).push_skip_reason = 'voucher_not_available', 'PD05 buono usato: saltato';
  ASSERT fc_test.claimed(b, fc_test.rome(1, '12:00')) = 1, 'PD05 riferimento non-buono inviato';
  RAISE NOTICE 'PASS PD05 buono non disponibile';
END $$;

-- PD06 fascia silenziosa 22:30-10:00: timbro e buono sbloccato passano, il resto aspetta le 10:00
DO $$ DECLARE a uuid := fc_test.push_member(); b uuid := fc_test.push_member(); c uuid := fc_test.push_member(); BEGIN
  PERFORM public.food_club_enqueue_message(a, 'referral_reward', 'q', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(b, 'stamp', 'q', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(c, 'voucher_unlocked', 'q', 'T', 'B', '/kitchen/club');
  ASSERT fc_test.claimed(a, fc_test.rome(1, '23:00')) = 0, 'PD06 invito fermo alle 23';
  ASSERT (fc_test.msg(a, 'referral_reward')).push_after = fc_test.rome(2, '10:00'), 'PD06 rinvio alle 10';
  ASSERT fc_test.claimed(a, fc_test.rome(2, '09:59')) = 0, 'PD06 alle 9:59 ancora fermo';
  UPDATE public.food_club_messages SET created_at = fc_test.rome(1, '06:30') WHERE user_id IN (b, c); -- timbro fresco (<12 h)
  ASSERT fc_test.claimed(b, fc_test.rome(1, '07:00')) = 1 AND fc_test.claimed(c, fc_test.rome(1, '07:00')) = 1, 'PD06 timbro/buono passano';
  RAISE NOTICE 'PASS PD06 fascia silenziosa';
END $$;

-- PD07 promo: consenso marketing verificato al momento dell'invio; mai nell'ora di un ordine; tetto 7 giorni
DO $$ DECLARE a uuid := fc_test.push_member(true); b uuid := fc_test.push_member(true); c uuid := fc_test.push_member(true);
  o public.kitchen_orders; t timestamptz := fc_test.rome(1, '12:00'); n int; BEGIN
  n := public.food_club_promo_enqueue('walrus-main', 'promo-1', 'BURGER NIGHT', 'Solo per il Club: patatine in regalo.', '/kitchen', NULL);
  ASSERT n >= 3, 'PD07 promo creata per i consensi validi';
  -- a revoca il marketing DOPO la creazione: non riceve nulla
  UPDATE public.food_club_members SET marketing_revoked_at = now(), notif_promo_enabled = false WHERE user_id = a;
  ASSERT fc_test.claimed(a, t) = 0 AND (fc_test.msg(a, 'promo')).push_skip_reason = 'no_marketing_consent', 'PD07 revoca vale all invio';
  -- b ha ordinato 20 minuti prima dell'invio: rinvio a ordine + 1 h
  o := fc_test.order(b, '[{"item_id":"item-009","quantity":1}]');
  PERFORM fc_test.as_service();
  UPDATE public.kitchen_orders SET created_at = t - interval '20 minutes' WHERE id = o.id;
  ASSERT fc_test.claimed(b, t) = 0, 'PD07 niente promo nell ora dell ordine';
  ASSERT (fc_test.msg(b, 'promo')).push_after = t + interval '40 minutes', 'PD07 rinvio di 1 h dall ordine';
  -- c: inviata; una seconda promo entro 7 giorni è saltata
  ASSERT fc_test.claimed(c, t) = 1, 'PD07 promo inviata';
  PERFORM public.food_club_push_report((fc_test.msg(c, 'promo')).id, 1, '{}', NULL);
  UPDATE public.food_club_messages SET push_sent_at = t WHERE id = (fc_test.msg(c, 'promo')).id;
  PERFORM public.food_club_promo_enqueue('walrus-main', 'promo-2', 'ALTRA', 'Testo.', '/kitchen', NULL);
  ASSERT fc_test.claimed(c, t + interval '3 days') = 0
     AND (fc_test.msg(c, 'promo', 'promo-2')).push_skip_reason = 'promo_cap', 'PD07 max 1 promo ogni 7 giorni';
  RAISE NOTICE 'PASS PD07 promo consenso all invio, ora dell ordine, tetto';
END $$;

-- PD08 promo_enqueue: solo chi ha consenso valido; validazione; idempotente; non chiamabile dai client
DO $$ DECLARE a uuid := fc_test.push_member(false); b uuid := fc_test.push_member(true); n int; BEGIN
  n := public.food_club_promo_enqueue('walrus-main', 'promo-x', 'T', 'B', '/kitchen', NULL);
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = a AND kind = 'promo'), 'PD08 senza consenso nessun messaggio';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = b AND kind = 'promo' AND category = 'promo'), 'PD08 con consenso';
  ASSERT public.food_club_promo_enqueue('walrus-main', 'promo-x', 'T', 'B', '/kitchen', NULL) = 0, 'PD08 idempotente';
  PERFORM fc_test.expect_error($q$SELECT public.food_club_promo_enqueue('walrus-main', 'p', 'T', repeat('x', 91), '/kitchen', NULL)$q$, 'invalid_body');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_promo_enqueue('walrus-main', 'p', 'T', 'B', 'https://evil.test', NULL)$q$, 'invalid_url');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_promo_enqueue('walrus-main', 'p', 'T', 'B', '//evil.test', NULL)$q$, 'invalid_url');
  ASSERT NOT has_function_privilege('authenticated', 'public.food_club_promo_enqueue(text, text, text, text, text, timestamptz)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_winback_enqueue(timestamptz)', 'EXECUTE')
     AND NOT has_function_privilege('service_role', 'public.food_club_push_claim_batch_at(integer, timestamptz)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.food_club_push_claim_batch_at(integer, timestamptz)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.food_club_push_claim_batch(integer)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.food_club_push_report(uuid, integer, text[], text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.food_club_push_tick(text)', 'EXECUTE'), 'PD08 grant';
  RAISE NOTICE 'PASS PD08 promo_enqueue e permessi';
END $$;

-- PD09 esiti: time_budget non consuma tentativi; tutti gli endpoint 410 = skipped; 3 errori = failed; vapid = failed subito
DO $$ DECLARE a uuid := fc_test.push_member(); b uuid := fc_test.push_member(); c uuid := fc_test.push_member();
  d uuid := fc_test.push_member(); r public.food_club_messages; t timestamptz := fc_test.rome(1, '12:00'); BEGIN
  PERFORM public.food_club_enqueue_message(a, 'referral_reward', 'x', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(b, 'referral_reward', 'x', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(c, 'referral_reward', 'x', 'T', 'B', '/kitchen/club');
  PERFORM public.food_club_enqueue_message(d, 'referral_reward', 'x', 'T', 'B', '/kitchen/club');
  PERFORM fc_test.as_user(b);
  PERFORM public.food_club_push_subscribe('walrus-main', 'https://push.test/b2' || b, 'k', 'a', 'ua', 'club', 'push-club-v1');
  PERFORM fc_test.as_service();
  ASSERT fc_test.claimed(a, t) = 1 AND fc_test.claimed(b, t) = 1 AND fc_test.claimed(c, t) = 1 AND fc_test.claimed(d, t) = 1, 'PD09 reclamati';
  PERFORM public.food_club_push_report((fc_test.msg(a, 'referral_reward')).id, 0, '{}', 'time_budget');
  r := fc_test.msg(a, 'referral_reward');
  ASSERT r.push_status = 'queued' AND r.push_attempts = 0 AND r.push_after <= now(), 'PD09 time_budget: in coda subito, tentativo restituito';
  -- b: un endpoint morto su due -> resta in coda (l'altro è vivo); c: unico endpoint morto -> skipped
  PERFORM public.food_club_push_report((fc_test.msg(b, 'referral_reward')).id, 0, ARRAY['https://push.test/' || b], 'http_500');
  ASSERT (fc_test.msg(b, 'referral_reward')).push_status = 'queued'
     AND (SELECT count(*) FROM public.kitchen_push_subscriptions WHERE customer_id = b) = 1, 'PD09 endpoint morto rimosso, altro vivo';
  PERFORM public.food_club_push_report((fc_test.msg(c, 'referral_reward')).id, 0, ARRAY['https://push.test/' || c], 'all_endpoints_gone');
  r := fc_test.msg(c, 'referral_reward');
  ASSERT r.push_status = 'skipped' AND r.push_skip_reason = 'no_club_subscription', 'PD09 nessun endpoint: skipped, nessun retry';
  PERFORM public.food_club_push_report((fc_test.msg(d, 'referral_reward')).id, 0, '{}', 'vapid_not_configured');
  ASSERT (fc_test.msg(d, 'referral_reward')).push_status = 'failed', 'PD09 vapid mancante: failed';
  -- tre errori transitori consecutivi -> failed
  UPDATE public.food_club_messages SET push_status = 'queued', push_after = now(), push_attempts = 0, push_skip_reason = NULL
   WHERE user_id = b;
  FOR i IN 1..3 LOOP
    ASSERT fc_test.claimed(b, t + make_interval(mins => i * 6)) = 1, 'PD09 retry ' || i;
    PERFORM public.food_club_push_report((fc_test.msg(b, 'referral_reward')).id, 0, '{}', 'timeout');
  END LOOP;
  r := fc_test.msg(b, 'referral_reward');
  ASSERT r.push_status = 'failed' AND r.push_attempts = 3 AND r.push_skip_reason = 'timeout', 'PD09 failed dopo 3 tentativi';
  PERFORM public.food_club_push_report(r.id, 1, '{}', NULL);
  ASSERT (fc_test.msg(b, 'referral_reward')).push_status = 'failed', 'PD09 report tardivo su messaggio chiuso: ignorato';
  RAISE NOTICE 'PASS PD09 esiti invio';
END $$;

-- PD10 tick: coda vuota = nessuna chiamata; senza secret = WARNING e nessuna chiamata; con secret = 1 chiamata; orfani svegliano il tick
DO $$ DECLARE a uuid := fc_test.push_member(); n0 bigint; v bigint; BEGIN
  DELETE FROM vault.secrets WHERE name = 'food_club_push_secret';
  UPDATE public.food_club_messages SET push_status = 'skipped' WHERE push_status IN ('queued', 'sending');
  SELECT count(*) INTO n0 FROM net.http_request_queue;
  ASSERT public.food_club_push_tick('https://fn.test/send-food-club-push') IS NULL, 'PD10 coda vuota';
  PERFORM public.food_club_enqueue_message(a, 'referral_reward', 't', 'T', 'B', '/kitchen/club');
  ASSERT public.food_club_push_tick('https://fn.test/send-food-club-push') IS NULL, 'PD10 senza secret: NULL';
  ASSERT (SELECT count(*) FROM net.http_request_queue) = n0, 'PD10 senza secret: nessuna chiamata';
  INSERT INTO vault.secrets (name, secret) VALUES ('food_club_push_secret', 'test-secret');
  v := public.food_club_push_tick('https://fn.test/send-food-club-push');
  ASSERT v IS NOT NULL AND (SELECT count(*) FROM net.http_request_queue) = n0 + 1, 'PD10 con secret: una chiamata';
  ASSERT (SELECT headers->>'Authorization' FROM net.http_request_queue WHERE id = v) = 'Bearer test-secret', 'PD10 bearer';
  UPDATE public.food_club_messages SET push_status = 'sending', push_claimed_at = now() - interval '11 minutes', push_attempts = 1 WHERE user_id = a;
  ASSERT public.food_club_push_tick('https://fn.test/send-food-club-push') IS NOT NULL, 'PD10 solo orfani: il tick chiama';
  RAISE NOTICE 'PASS PD10 tick senza secret = nessuna chiamata';
END $$;

-- PD11 job pg_cron definiti dalla migration
DO $$ BEGIN
  ASSERT (SELECT schedule FROM cron.job WHERE jobname = 'food-club-push') = '*/5 * * * *', 'PD11 push ogni 5 minuti';
  ASSERT (SELECT command FROM cron.job WHERE jobname = 'food-club-push') LIKE '%food_club_push_tick(%/functions/v1/send-food-club-push%', 'PD11 comando push';
  ASSERT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'food-club-winback'), 'PD11 winback non schedulato (NEEDS_DECISION)';
  RAISE NOTICE 'PASS PD11 cron food-club-push (winback non schedulato)';
END $$;

-- PD12 winback: 21 giorni senza visite, consenso valido, campagna attiva; poi non prima di 60 giorni
DO $$ DECLARE a uuid := fc_test.push_member(true); b uuid := fc_test.push_member(true); c uuid := fc_test.push_member(false);
  s uuid := fc_test.new_staff(); o public.kitchen_orders; t timestamptz := now() + interval '30 days'; BEGIN
  -- new_member: iscrizione 60 giorni fa, nessun timbro/ordine. b ha un ordine pagato (e un timbro) 10 giorni prima di t.
  o := fc_test.order(b, '[{"item_id":"item-009","quantity":1}]'); PERFORM fc_test.pay_counter(o.id, s);
  PERFORM fc_test.as_service();
  PERFORM fc_test.backdate(o.id, t - interval '10 days');
  UPDATE public.food_club_stamps SET created_at = t - interval '10 days' WHERE user_id = b;
  PERFORM public.food_club_winback_enqueue(t);
  ASSERT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = a AND kind = 'winback' AND category = 'promo'), 'PD12 inattivo: winback';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = c AND kind = 'winback'), 'PD12 senza consenso: niente';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_messages WHERE user_id = b AND kind = 'winback'), 'PD12 visita recente: niente';
  PERFORM public.food_club_winback_enqueue(t + interval '10 days');
  ASSERT (SELECT count(*) FROM public.food_club_messages WHERE user_id = a AND kind = 'winback') = 1, 'PD12 non prima di 60 giorni';
  PERFORM public.food_club_winback_enqueue(t + interval '61 days');
  ASSERT (SELECT count(*) FROM public.food_club_messages WHERE user_id = a AND kind = 'winback') = 2, 'PD12 dopo 60 giorni di nuovo';
  UPDATE public.food_club_campaigns SET active = false WHERE id = 'visite-v1';
  ASSERT public.food_club_winback_enqueue(t + interval '200 days') = 0, 'PD12 campagna spenta: nessun winback';
  PERFORM fc_test.activate_campaign();
  RAISE NOTICE 'PASS PD12 winback';
END $$;

-- PD13 la firma della Edge Function (claim_batch con now()) funziona ancora e resta solo service_role
DO $$ DECLARE a uuid := fc_test.push_member(); n int; BEGIN
  PERFORM public.food_club_enqueue_message(a, 'stamp', 'w', 'T', 'B', '/kitchen/club');
  SELECT count(*) INTO n FROM public.food_club_push_claim_batch(200) c WHERE c.user_id = a;
  ASSERT n = 1, 'PD13 wrapper';
  PERFORM fc_test.as_user(a);
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_push_claim_batch_at(1, now())$q$, 'service_role_only');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_push_report(gen_random_uuid(), 1, '{}', NULL)$q$, 'service_role_only');
  RAISE NOTICE 'PASS PD13 wrapper e guardie';
END $$;
