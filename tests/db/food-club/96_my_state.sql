-- Fase C: food_club_my_state() restituisce `last_completed_card` (tessera dopo il 2 timbro). Sola lettura.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- M01 prima del 2 timbro: nessuna tessera completata; dopo il 2 timbro: 2 timbri + buono collegato; dopo l uso: stato usato
DO $$ DECLARE m uuid := fc_test.new_member(); other uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  a public.kitchen_orders; b public.kitchen_orders; c public.kitchen_orders; v public.food_club_vouchers; st jsonb; BEGIN
  PERFORM fc_test.as_user(m);
  st := public.food_club_my_state();
  ASSERT st ? 'last_completed_card' AND st->'last_completed_card' = 'null'::jsonb, 'M01 senza tessere completate: campo presente e null';
  a := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.backdate(a.id, now() - interval '2 days');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_switch_to_counter_system(a.id, m);
  PERFORM fc_test.pay_counter(a.id, s);
  PERFORM fc_test.as_user(m);
  st := public.food_club_my_state();
  ASSERT st->'last_completed_card' = 'null'::jsonb AND jsonb_array_length(st->'card'->'stamps') = 1, 'M01 dopo 1 timbro: card aperta con 1 timbro, nessuna completata';
  b := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(b.id);
  v := fc_test.voucher_of(m);
  PERFORM fc_test.as_user(m);
  st := public.food_club_my_state();
  ASSERT st->'card' = 'null'::jsonb, 'M01 dopo 2 timbri nessuna card aperta';
  ASSERT jsonb_array_length(st->'last_completed_card'->'stamps') = 2, 'M01 tessera completata con 2 timbri';
  ASSERT (st->'last_completed_card'->>'voucher_id')::uuid = v.id AND (st->'last_completed_card'->'voucher'->>'id')::uuid = v.id, 'M01 buono collegato';
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'available' AND (st->'last_completed_card'->'voucher'->>'value')::numeric = 5, 'M01 buono 5 euro disponibile';
  ASSERT st->'last_completed_card'->>'completed_at' IS NOT NULL, 'M01 completed_at valorizzato';
  -- buono scaduto: stato effettivo expired anche senza sweep
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 hour' WHERE id = v.id;
  PERFORM fc_test.as_user(m);
  ASSERT public.food_club_my_state()->'last_completed_card'->'voucher'->>'status' = 'expired', 'M01 buono scaduto -> expired';
  UPDATE public.food_club_vouchers SET expires_at = now() + interval '10 days' WHERE id = v.id;
  -- uso del buono: la tessera resta completata, buono usato
  c := fc_test.order(m, '[{"item_id":"item-010","quantity":2},{"item_id":"item-009","quantity":1}]', 'counter', v.id);
  PERFORM fc_test.pay_counter(c.id, s);
  PERFORM fc_test.as_user(m);
  st := public.food_club_my_state();
  ASSERT st->'last_completed_card'->'voucher'->>'status' = 'used', 'M01 buono usato: ' || COALESCE(st->'last_completed_card'->'voucher'->>'status', 'null');
  -- isolamento: un altro iscritto non vede la tessera di m
  PERFORM fc_test.as_user(other);
  ASSERT public.food_club_my_state()->'last_completed_card' = 'null'::jsonb, 'M01 altro utente: nessuna tessera altrui';
  RAISE NOTICE 'PASS M01 my_state last_completed_card';
END $$;

-- M02 permessi invariati: anon senza sessione ok (non membro), PUBLIC/anon senza EXECUTE
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.food_club_my_state()', 'EXECUTE'), 'M02 anon senza EXECUTE';
  ASSERT has_function_privilege('authenticated', 'public.food_club_my_state()', 'EXECUTE'), 'M02 authenticated con EXECUTE';
  RAISE NOTICE 'PASS M02 grant my_state invariati';
END $$;
