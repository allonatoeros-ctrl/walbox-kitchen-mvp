-- Helper SOLO per i test Opzione C su DB LOCALE (schema fc_test, mai in una migration).
-- Si caricano DOPO tests/db/food-club/00_helpers.sql.

CREATE OR REPLACE FUNCTION fc_test.new_manager() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO auth.users (id, is_anonymous, email) VALUES (gen_random_uuid(), false, 'mgr-' || gen_random_uuid() || '@test.local') RETURNING id INTO v;
  INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) VALUES (v, 'walrus-main', 'manager');
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION fc_test.oc_voucher(p_uid uuid, p_code text) RETURNS public.food_club_vouchers LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (p_code, p_uid, 'visite-v1', 'manual', 5, 12, now() + interval '5 days') RETURNING * $$;

-- Ordine online con buono + attempt SumUp avviato (stato reale prima del redirect a SumUp).
CREATE OR REPLACE FUNCTION fc_test.oc_online_with_attempt(p_uid uuid, p_voucher uuid)
RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  o := fc_test.order(p_uid, '[{"item_id":"item-009","quantity":1}]', 'online', p_voucher);
  RETURN fc_test.start_online(o.id);
END $$;

-- Sweep dei 5 minuti: ordine retrodatato e marcato abbandonato (attempt -> failed/abandoned_timeout).
CREATE OR REPLACE FUNCTION fc_test.oc_abandon(p_order_id text, p_age interval DEFAULT interval '6 minutes')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.backdate(p_order_id, now() - p_age);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(p_order_id);
END $$;

CREATE OR REPLACE FUNCTION fc_test.oc_events(p_voucher uuid, p_to text) RETURNS integer LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_voucher AND to_status = p_to $$;

-- Esegue p_sql con il ruolo Postgres REALE (anon/authenticated) e i claim JWT dell'utente: verifica EXECUTE/RLS a runtime.
-- Ritorna 'OK' oppure il messaggio d'errore. Il ruolo viene sempre ripristinato.
CREATE OR REPLACE FUNCTION fc_test.oc_try(p_role text, p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text := 'OK';
BEGIN
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claims', jsonb_build_object('role', p_role)::text, false);
  ELSE PERFORM fc_test.as_user(p_uid, p_role); END IF;
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', p_role);
    EXECUTE p_sql;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN v := SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fc_test TO anon, authenticated;
