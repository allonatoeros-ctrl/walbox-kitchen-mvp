-- RLS e permessi: cliente vede solo il suo, staff solo via funzioni, anon niente.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();
CREATE TEMP TABLE fc_ids AS SELECT fc_test.new_member('+393490000001') AS a, fc_test.new_member('+393490000002') AS b, fc_test.new_staff() AS s;
GRANT SELECT ON fc_ids TO authenticated, anon;
INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
SELECT 'WC-RLS' || n, CASE n WHEN 1 THEN a ELSE b END, 'visite-v1', 'manual', 5, 12, now() + interval '5 days' FROM fc_ids, generate_series(1, 2) n;

-- R01 cliente A vede solo i suoi buoni, non scrive
SELECT fc_test.as_user((SELECT a FROM fc_ids));
SET ROLE authenticated;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.food_club_vouchers) = 1, 'R01 solo il proprio buono';
  ASSERT (SELECT count(*) FROM public.food_club_members) = 1, 'R01 solo la propria iscrizione';
  PERFORM fc_test.expect_error($q$UPDATE public.food_club_vouchers SET status = 'available'$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$INSERT INTO public.food_club_stamps (user_id, card_id, campaign_id, kind, service_night) VALUES (auth.uid(), gen_random_uuid(), 'visite-v1', 'welcome', now()::date)$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_events$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_merge_tickets$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_award_order_stamp('x')$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_expire_sweep()$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_staff_overview('walrus-main')$q$, 'not_staff_for_venue');
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_staff_members('walrus-main')$q$, 'not_staff_for_venue');
  RAISE NOTICE 'PASS R01 cliente isolato';
END $$;
RESET ROLE;

-- R02 anon: nessuna lettura tabelle, nessuna RPC cliente, solo campagna pubblica
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SET ROLE anon;
DO $$ BEGIN
  PERFORM fc_test.expect_error($q$SELECT * FROM public.food_club_vouchers$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_my_state()$q$, 'permission denied');
  PERFORM fc_test.expect_error($q$SELECT * FROM public.kitchen_customer_create_order_v4('walrus-main','x',NULL,'[]','eat_here','online')$q$, 'permission denied');
  ASSERT (public.food_club_public_campaign('walrus-main')->>'active')::boolean, 'R02 campagna pubblica leggibile';
  RAISE NOTICE 'PASS R02 anon';
END $$;
RESET ROLE;

-- R03 staff: niente tabelle dirette, funzioni staff con telefono mascherato; manager per accendere campagne
SELECT fc_test.as_user((SELECT s FROM fc_ids));
SET ROLE authenticated;
DO $$ DECLARE j jsonb; BEGIN
  ASSERT (SELECT count(*) FROM public.food_club_vouchers) = 0, 'R03 staff non legge tabelle dirette';
  ASSERT (SELECT count(*) FROM public.food_club_staff_members('walrus-main')) >= 2, 'R03 elenco iscritti';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_members('walrus-main') WHERE phone_masked ~ '^\+?[0-9]{6,}'), 'R03 telefoni mascherati';
  ASSERT (SELECT count(*) FROM public.food_club_staff_vouchers('walrus-main', 'available')) >= 2, 'R03 buoni';
  j := public.food_club_staff_overview('walrus-main');
  ASSERT j->>'data_kind' = 'descriptive' AND (j->'members'->>'total_active')::int >= 2, 'R03 panoramica';
  PERFORM fc_test.expect_error($q$SELECT public.food_club_admin_set_campaign_active('visite-v1', false)$q$, 'manager_only');
  PERFORM fc_test.expect_error($q$SELECT public.food_club_staff_overview('altro-locale')$q$, 'not_staff_for_venue');
  RAISE NOTICE 'PASS R03 staff';
END $$;
RESET ROLE;
UPDATE public.kitchen_staff_members SET role = 'manager' WHERE user_id = (SELECT s FROM fc_ids);
SET ROLE authenticated;
DO $$ BEGIN
  ASSERT NOT (public.food_club_admin_set_campaign_active('visite-v1', false)).active, 'R04 manager spegne';
  ASSERT (public.food_club_admin_set_campaign_active('visite-v1', true)).active, 'R04 manager accende';
  RAISE NOTICE 'PASS R04 manager campagne';
END $$;
RESET ROLE;

-- R05 badge comanda e fine servizio
DO $$ DECLARE m uuid := (SELECT a FROM fc_ids); s uuid := (SELECT s FROM fc_ids); o public.kitchen_orders; v uuid; b record; n int; BEGIN
  SELECT id INTO v FROM public.food_club_vouchers WHERE user_id = m LIMIT 1;
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  PERFORM fc_test.backdate(o.id, now() - interval '2 days');
  PERFORM fc_test.as_user(s);
  SELECT * INTO b FROM public.food_club_staff_order_badges('walrus-main', ARRAY[o.id]);
  ASSERT b.voucher_code = 'WC-RLS1' AND b.total = 8.9 AND b.discount_amount = 5 AND b.food_amount = 13.9 AND b.source = 'customer_app', 'R05 badge buono e da incassare';
  SELECT count(*) INTO n FROM public.food_club_staff_unpaid_orders('walrus-main') u WHERE u.order_id = o.id AND u.older_than_tonight AND u.voucher_code = 'WC-RLS1';
  ASSERT n = 1, 'R05 ordine da pagare di una serata passata con buono';
  ASSERT (public.food_club_staff_overview('walrus-main')->'anomalies'->>'unpaid_with_voucher')::int >= 1, 'R05 anomalia contata';
  RAISE NOTICE 'PASS R05 badge staff e fine servizio';
END $$;

-- R06 grant EXECUTE: nessuna funzione interna food_club eseguibile da anon
DO $$ DECLARE bad text; BEGIN
  SELECT string_agg(p.proname, ', ') INTO bad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND (p.proname LIKE 'food_club_%' OR p.proname LIKE 'kitchen_orders_food_club%' OR p.proname = 'kitchen_customer_create_order_v4')
     AND p.proname <> 'food_club_public_campaign' AND has_function_privilege('anon', p.oid, 'EXECUTE');
  ASSERT bad IS NULL, 'R06 eseguibili da anon: ' || COALESCE(bad, '');
  SELECT string_agg(p.proname, ', ') INTO bad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('food_club_award_order_stamp','food_club_issue_voucher','food_club_push_claim_batch',
     'food_club_push_report','food_club_expire_sweep','food_club_try_referral_reward','food_club_enqueue_message','food_club_verified_phone','food_club_phone_hash')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  ASSERT bad IS NULL, 'R06 interne eseguibili da authenticated: ' || COALESCE(bad, '');
  SELECT string_agg(c.relname, ', ') INTO bad FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname LIKE 'food_club_%' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  ASSERT bad IS NULL, 'R06 tabelle senza RLS: ' || COALESCE(bad, '');
  RAISE NOTICE 'PASS R06 grant e RLS';
END $$;
