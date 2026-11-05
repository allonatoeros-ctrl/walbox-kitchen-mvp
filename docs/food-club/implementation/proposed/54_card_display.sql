-- Scenari per 20261105107000_food_club_v1_card_display.sql (PROPOSTA). Richiede la patch applicata al DB LOCALE.
-- Auto-contenuto: carica gli helper dentro la transazione e fa ROLLBACK a fine file (nessun residuo).
-- Esecuzione (dalla root del worktree):
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f docs/food-club/implementation/proposed/54_card_display.sql
BEGIN;
\ir ../../../../tests/db/food-club/00_helpers.sql

-- Ordine pagato al banco in una serata passata (age) per un iscritto, opzionalmente con buono.
CREATE OR REPLACE FUNCTION fc_test.cd_paid(p_uid uuid, p_staff uuid, p_age interval, p_voucher uuid DEFAULT NULL)
RETURNS public.kitchen_orders LANGUAGE plpgsql AS $$
DECLARE o public.kitchen_orders;
BEGIN
  o := fc_test.order(p_uid, '[{"item_id":"item-009","quantity":1}]', 'counter', p_voucher);
  PERFORM fc_test.backdate(o.id, now() - p_age);
  PERFORM fc_test.pay_counter(o.id, p_staff);
  RETURN o;
END $$;

CREATE OR REPLACE FUNCTION fc_test.cd_state(p_uid uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN PERFORM fc_test.as_user(p_uid); RETURN public.food_club_my_state(); END $$;

-- CD0: 0 timbri
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); st jsonb; r record; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false, "welcome_stamp_enabled": false}');
  st := fc_test.cd_state(m);
  ASSERT st->'card' = 'null'::jsonb OR st->'card' IS NULL, 'CD0 nessuna card open';
  ASSERT st->'last_completed_card' = 'null'::jsonb OR st->'last_completed_card' IS NULL, 'CD0 nessuna card completata';
  ASSERT (st->'totals'->>'visits')::int = 0 AND (st->'totals'->>'cards_completed')::int = 0, 'CD0 totali a zero';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_stamps = 0 AND r.cycle_completed = false AND r.total_visits = 0, 'CD0 staff 0/0/non completato';
  RAISE NOTICE 'PASS CD0 zero timbri';
END $$;

-- CD1: 1 timbro
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); st jsonb; r record; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false, "welcome_stamp_enabled": false}');
  PERFORM fc_test.cd_paid(m, s, interval '3 days');
  st := fc_test.cd_state(m);
  ASSERT jsonb_array_length(st->'card'->'stamps') = 1, 'CD1 card open con 1 timbro';
  ASSERT st->'last_completed_card' = 'null'::jsonb OR st->'last_completed_card' IS NULL, 'CD1 nessuna card completata';
  ASSERT (st->'totals'->>'visits')::int = 1 AND (st->'totals'->>'cards_completed')::int = 0, 'CD1 totali 1/0';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_stamps = 1 AND r.stamps_open = 1 AND r.cycle_completed = false AND r.total_visits = 1, 'CD1 staff giro 1, non completato, visite 1';
  RAISE NOTICE 'PASS CD1 un timbro';
END $$;

-- CD2: 2 timbri -> card completed + buono available; card open assente
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); st jsonb; r record; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false, "welcome_stamp_enabled": false}');
  PERFORM fc_test.cd_paid(m, s, interval '3 days');
  PERFORM fc_test.cd_paid(m, s, interval '2 days');
  st := fc_test.cd_state(m);
  ASSERT st->'card' = 'null'::jsonb OR st->'card' IS NULL, 'CD2 nessuna card open (e'' il caso del bug)';
  ASSERT jsonb_array_length(st->'last_completed_card'->'stamps') = 2, 'CD2 last_completed_card con 2 timbri';
  ASSERT st->'last_completed_card'->>'completed_at' IS NOT NULL, 'CD2 completed_at presente';
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'available', 'CD2 buono available';
  ASSERT (st->'last_completed_card'->'voucher'->>'value')::numeric = 5, 'CD2 buono da 5';
  ASSERT st->'last_completed_card'->>'voucher_id' = st->'last_completed_card'->'voucher'->>'id', 'CD2 voucher_id coerente';
  ASSERT (st->'totals'->>'visits')::int = 2 AND (st->'totals'->>'cards_completed')::int = 1, 'CD2 totali 2/1';
  ASSERT jsonb_array_length(st->'vouchers') = 1, 'CD2 vouchers invariato (1 buono)';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_stamps = 0 AND r.stamps_open = 0 AND r.cycle_completed = true AND r.total_visits = 2 AND r.vouchers_available = 1,
         'CD2 staff giro 0, completato, visite 2';
  RAISE NOTICE 'PASS CD2 due timbri, premio disponibile';
END $$;

-- CD3: buono riservato e poi usato; nuovo ciclo (card open con 1 timbro + una completed)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); st jsonb; r record; v public.food_club_vouchers; o public.kitchen_orders; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false, "welcome_stamp_enabled": false}');
  PERFORM fc_test.cd_paid(m, s, interval '5 days');
  PERFORM fc_test.cd_paid(m, s, interval '4 days');
  v := fc_test.voucher_of(m);
  -- riservato: ordine al banco con buono, non ancora incassato
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  st := fc_test.cd_state(m);
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'reserved', 'CD3 buono reserved';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_completed = true, 'CD3 staff: ancora premio in corso (reserved)';
  -- usato: incasso al banco
  PERFORM fc_test.pay_counter(o.id, s);
  st := fc_test.cd_state(m);
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'used', 'CD3 buono used';
  ASSERT st->'last_completed_card'->'voucher'->>'used_at' IS NOT NULL, 'CD3 used_at presente';
  ASSERT st->'last_completed_card'->'voucher'->>'used_order_code' = (SELECT order_code FROM public.kitchen_orders WHERE id = o.id), 'CD3 used_order_code';
  ASSERT st->'card' = 'null'::jsonb OR st->'card' IS NULL, 'CD3 ancora nessuna card open (buono D-3 spento: nessun timbro)';
  ASSERT (st->'totals'->>'visits')::int = 2, 'CD3 il buono non ha aggiunto visite';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_completed = false AND r.vouchers_used = 1, 'CD3 staff: premio usato, non piu'' in corso';
  -- nuovo ciclo
  PERFORM fc_test.cd_paid(m, s, interval '1 day');
  st := fc_test.cd_state(m);
  ASSERT jsonb_array_length(st->'card'->'stamps') = 1, 'CD3 nuovo giro: card open con 1 timbro';
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'used', 'CD3 la completata resta, buono used';
  ASSERT (st->'totals'->>'visits')::int = 3 AND (st->'totals'->>'cards_completed')::int = 1, 'CD3 totali 3/1';
  PERFORM fc_test.as_user(s);
  SELECT * INTO r FROM public.food_club_staff_members('walrus-main', NULL, 500) WHERE user_id = m;
  ASSERT r.cycle_stamps = 1 AND r.cycle_completed = false AND r.total_visits = 3, 'CD3 staff nuovo giro 1, visite 3';
  RAISE NOTICE 'PASS CD3 reserved/used e nuovo ciclo';
END $$;

-- CD4: permessi invariati (anon non esegue my_state, un cliente non esegue la vista staff)
DO $$ DECLARE m uuid := fc_test.new_member(); v_err text; BEGIN
  v_err := 'OK';
  BEGIN
    PERFORM fc_test.as_user(m); SET LOCAL ROLE authenticated;
    PERFORM * FROM public.food_club_staff_members('walrus-main', NULL, 10);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  RESET ROLE;
  ASSERT v_err <> 'OK', 'CD4 un cliente non deve leggere la vista staff';
  v_err := 'OK';
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', false); SET LOCAL ROLE anon;
    PERFORM public.food_club_my_state();
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  RESET ROLE;
  ASSERT v_err LIKE '%permission denied%', 'CD4 anon non esegue my_state: ' || v_err;
  RAISE NOTICE 'PASS CD4 permessi';
END $$;

ROLLBACK;
