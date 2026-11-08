-- Copia di walbox-food-club-v1/tests/db/food-club/00_helpers.sql adattata a main (senza schema Food Club):
-- ordine via kitchen_customer_create_order_v3 (stessi 8 parametri della v4, senza buono); tolti voucher_of/stamps.
-- Helper SOLO per test locali (schema fc_test, mai in una migration).
CREATE SCHEMA IF NOT EXISTS fc_test;

CREATE OR REPLACE FUNCTION fc_test.as_user(p_uid uuid, p_role text DEFAULT 'authenticated', p_anon boolean DEFAULT false)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', p_role, 'is_anonymous', p_anon)::text, false) $$;
CREATE OR REPLACE FUNCTION fc_test.as_service() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false) $$;

CREATE OR REPLACE FUNCTION fc_test.new_user(p_anon boolean DEFAULT true, p_phone text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO auth.users (id, is_anonymous, phone, phone_confirmed_at)
  VALUES (gen_random_uuid(), p_anon, p_phone, CASE WHEN p_phone IS NULL THEN NULL ELSE now() END) RETURNING id $$;

CREATE OR REPLACE FUNCTION fc_test.new_staff() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO auth.users (id, is_anonymous, email) VALUES (gen_random_uuid(), false, 'staff-' || gen_random_uuid() || '@test.local') RETURNING id INTO v;
  INSERT INTO public.kitchen_staff_members (user_id, venue_id, role) VALUES (v, 'walrus-main', 'staff');
  RETURN v;
END $$;

-- Iscritto diretto (senza passare dal flusso F3), per i test di F1/F2.
CREATE OR REPLACE FUNCTION fc_test.new_member(p_phone text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  v := fc_test.new_user(false, COALESCE(p_phone, '+3933' || lpad((random()*1e8)::bigint::text, 8, '0')));
  INSERT INTO public.food_club_members (user_id, terms_version, service_consent_at, joined_at)
  VALUES (v, 'test-v1', now(), now() - interval '60 days');
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION fc_test.activate_campaign(p_overrides jsonb DEFAULT '{}'::jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.food_club_campaigns SET active = true,
    stamp_on_voucher_order = COALESCE((p_overrides->>'stamp_on_voucher_order')::boolean, stamp_on_voucher_order),
    refund_recredits_voucher = COALESCE((p_overrides->>'refund_recredits_voucher')::boolean, refund_recredits_voucher),
    referral_enabled = COALESCE((p_overrides->>'referral_enabled')::boolean, referral_enabled),
    welcome_stamp_enabled = COALESCE((p_overrides->>'welcome_stamp_enabled')::boolean, welcome_stamp_enabled),
    retroactive_days = COALESCE((p_overrides->>'retroactive_days')::int, retroactive_days)
  WHERE id = 'visite-v1';
END $$;

-- items: '[{"item_id":"item-009","quantity":1}]'
CREATE OR REPLACE FUNCTION fc_test.order(p_uid uuid, p_items jsonb, p_lane text DEFAULT 'counter', p_voucher uuid DEFAULT NULL)
RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  PERFORM fc_test.as_user(p_uid);
  o := public.kitchen_customer_create_order_v3('walrus-main', 'Tester', NULL, p_items, 'eat_here', p_lane,
         gen_random_uuid(), NULL);
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION fc_test.staff_order(p_staff uuid, p_items jsonb) RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  PERFORM fc_test.as_user(p_staff);
  o := public.kitchen_customer_create_order('walrus-main', 'BANCO', 'ORDINE ASSISTITO', p_items);
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION fc_test.pay_online(p_order_id text) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders; a public.kitchen_payments;
BEGIN
  SELECT * INTO o FROM public.kitchen_orders WHERE id = p_order_id;
  PERFORM fc_test.as_user(o.customer_id);
  a := public.kitchen_payment_attempt_start(o.id, 'app', 'sumup', 'sumup_online', o.total, gen_random_uuid()::text);
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_confirm(a.id, 'sumup-' || a.id, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION fc_test.start_online(p_order_id text) RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  SELECT * INTO o FROM public.kitchen_orders WHERE id = p_order_id;
  PERFORM fc_test.as_user(o.customer_id);
  RETURN public.kitchen_payment_attempt_start(o.id, 'app', 'sumup', 'sumup_online', o.total, gen_random_uuid()::text);
END $$;

CREATE OR REPLACE FUNCTION fc_test.pay_counter(p_order_id text, p_staff uuid, p_method text DEFAULT 'cash')
RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_user(p_staff);
  RETURN public.kitchen_payment_record_counter(p_order_id, p_method);
END $$;

CREATE OR REPLACE FUNCTION fc_test.cancel(p_order_id text, p_staff uuid) RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_user(p_staff);
  RETURN public.kitchen_order_cancel_with_payment_attempt(p_order_id, 'test');
END $$;

CREATE OR REPLACE FUNCTION fc_test.refund(p_order_id text, p_staff uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r public.kitchen_payments;
BEGIN
  PERFORM fc_test.as_user(p_staff);
  r := public.kitchen_payment_refund(p_order_id, 'test');
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_refund_confirm(r.id, 'ref-' || r.id, '{}'::jsonb);
END $$;

-- Sposta un ordine indietro nel tempo (serate diverse).
CREATE OR REPLACE FUNCTION fc_test.backdate(p_order_id text, p_ts timestamptz) RETURNS void LANGUAGE sql AS $$
  UPDATE public.kitchen_orders SET created_at = p_ts WHERE id = p_order_id $$;

CREATE OR REPLACE FUNCTION fc_test.expect_error(p_sql text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(p_msg IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'atteso errore "%", ricevuto "%"', p_msg, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'atteso errore "%", nessun errore', p_msg;
END $$;
GRANT USAGE ON SCHEMA fc_test TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fc_test TO anon, authenticated;
