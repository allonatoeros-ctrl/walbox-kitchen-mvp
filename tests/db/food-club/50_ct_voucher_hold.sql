-- Passo 1 C-T: consumo unico del buono, trattenuta, errori Club isolati (VT1-VT13, FIX-1/4/5, D-P2).
-- Gira in una transazione con ROLLBACK (run-food-club-sql.sh). Chiama le RPC Kitchen REALI.
-- Rinviati ai Passi 2-3 (food_club_finalize_hold non esiste ancora): VT3, VT4, VT8, VT10, C1, C5 e la parte "rilascio
-- dopo verifica checkout" di VT1.
\set ON_ERROR_STOP 1
SELECT fc_test.activate_campaign();

-- Helper locali (spariscono col ROLLBACK).
CREATE FUNCTION fc_test.mkv(p_uid uuid, p_expires interval DEFAULT interval '10 days') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_uid, 'visite-v1', 'manual', 5, 12, now() + p_expires) RETURNING id $$;
CREATE FUNCTION fc_test.vstatus(p_v uuid) RETURNS text LANGUAGE sql AS $$ SELECT status FROM public.food_club_vouchers WHERE id = p_v $$;
CREATE FUNCTION fc_test.vev(p_v uuid, p_event text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND event = p_event $$;
CREATE FUNCTION fc_test.vto(p_v uuid, p_to text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.food_club_voucher_events WHERE voucher_id = p_v AND to_status = p_to AND from_status <> to_status $$;
CREATE FUNCTION fc_test.alog(p_o text, p_action text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.kitchen_action_log WHERE order_id = p_o AND action = p_action $$;
CREATE FUNCTION fc_test.ostatus(p_o text) RETURNS text LANGUAGE sql AS $$
  SELECT status || '|' || COALESCE(payment_status, '-') FROM public.kitchen_orders WHERE id = p_o $$;
CREATE FUNCTION fc_test.abandon(p_o text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.backdate(p_o, now() - interval '6 minutes');
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_mark_payment_abandoned(p_o);
END $$;
CREATE FUNCTION fc_test.confirm(p_att uuid, p_ref text DEFAULT 'sumup-late') RETURNS public.kitchen_payments LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fc_test.as_service();
  RETURN public.kitchen_payment_confirm(p_att, p_ref, '{}'::jsonb);
END $$;
CREATE FUNCTION fc_test.counter_charge(p_o text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.kitchen_payments (order_id, venue_id, channel, provider, method, direction, status, amount, initiated_by_actor_type)
  SELECT o.id, o.venue_id, 'counter', 'cash', 'cash', 'charge', 'succeeded', o.total, 'staff' FROM public.kitchen_orders o WHERE o.id = p_o $$;

-- VT1 online con buono + attempt SumUp + abbandono: il buono resta RISERVATO, un solo evento held, nessun rilascio;
-- ripetere abbandono/annullo non duplica l'evento. (Il rilascio dopo la verifica dei checkout = Passi 2-3.)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.abandon(o.id);
  ASSERT fc_test.ostatus(o.id) LIKE 'payment_abandoned|%', 'VT1 ordine abbandonato';
  ASSERT fc_test.vstatus(v) = 'reserved', 'VT1 buono trattenuto';
  ASSERT fc_test.vev(v, 'held_until_checkout_expiry') = 1, 'VT1 un evento held';
  ASSERT fc_test.vev(v, 'released') = 0, 'VT1 nessun rilascio';
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a.id) = 'failed', 'VT1 attempt chiuso';
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_mark_payment_abandoned(o.id); -- sweep doppio
  ASSERT fc_test.vev(v, 'held_until_checkout_expiry') = 1, 'VT1 abbandono ripetuto: nessun duplicato';
  PERFORM fc_test.cancel(o.id, s); -- annullo staff dopo l'abbandono: il trigger scatta di nuovo
  ASSERT fc_test.ostatus(o.id) LIKE 'cancelled|%', 'VT1 annullato';
  ASSERT fc_test.vstatus(v) = 'reserved' AND fc_test.vev(v, 'held_until_checkout_expiry') = 1 AND fc_test.vev(v, 'released') = 0,
    'VT1 annullo dopo abbandono: ancora trattenuto, evento unico';
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vev(v, 'held_until_checkout_expiry') = 1, 'VT1 annullo ripetuto: nessun duplicato';
  RAISE NOTICE 'PASS VT1 online+attempt+abbandono: trattenuto, evento unico';
END $$;

-- VT1b buono scaduto durante la trattenuta: resta RISERVATO (non expired), lo sweep non lo tocca, il charge tardivo lo consuma.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.abandon(o.id);
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 hour' WHERE id = v;
  PERFORM fc_test.as_service(); PERFORM public.food_club_expire_sweep();
  ASSERT fc_test.vstatus(v) = 'reserved', 'VT1b scaduto durante trattenuta: resta reserved';
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.vstatus(v) = 'used', 'VT1b charge tardivo dopo la scadenza: usato';
  RAISE NOTICE 'PASS VT1b scadenza durante trattenuta';
END $$;

-- VT2 come VT1 + confirm sull'attempt: buono used UNA volta (consumed_on_late_charge), ordine resta payment_abandoned,
-- 0 timbri, log K2 payment_confirmed_after_abandon. Webhook ripetuto: nessun secondo evento.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.abandon(o.id);
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.vstatus(v) = 'used', 'VT2 buono usato';
  ASSERT fc_test.vev(v, 'consumed_on_late_charge') = 1 AND fc_test.vto(v, 'used') = 1, 'VT2 un solo consumo, evento late';
  ASSERT fc_test.ostatus(o.id) LIKE 'payment_abandoned|%' AND fc_test.ostatus(o.id) NOT LIKE '%|paid', 'VT2 ordine resta abbandonato, non pagato';
  ASSERT fc_test.stamps(m) = 0, 'VT2 nessun timbro';
  ASSERT fc_test.alog(o.id, 'payment_confirmed_after_abandon') = 1, 'VT2 log K2 after_abandon';
  ASSERT (SELECT used_order_id FROM public.food_club_vouchers WHERE id = v) = o.id, 'VT2 legato all''ordine';
  PERFORM fc_test.confirm(a.id); -- webhook ripetuto
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.vto(v, 'used') = 1 AND fc_test.alog(o.id, 'food_club_voucher_double_spend') = 0, 'VT2 webhook ripetuto: nessun doppio consumo';
  RAISE NOTICE 'PASS VT2 abbandono + confirm tardivo';
END $$;

-- VT2 variante annullato: payment_confirmed_after_cancel.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v) = 'reserved', 'VT2c trattenuto dopo annullo';
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vev(v, 'consumed_on_late_charge') = 1 AND fc_test.vto(v, 'used') = 1, 'VT2c usato una volta, late';
  ASSERT fc_test.ostatus(o.id) LIKE 'cancelled|%' AND fc_test.ostatus(o.id) NOT LIKE '%|paid', 'VT2c ordine resta annullato non pagato';
  ASSERT fc_test.stamps(m) = 0, 'VT2c nessun timbro';
  ASSERT fc_test.alog(o.id, 'payment_confirmed_after_cancel') = 1, 'VT2c log K2 after_cancel';
  RAISE NOTICE 'PASS VT2c annullo + confirm tardivo';
END $$;

-- K2 amount mismatch: charge succeeded con importo diverso, ordine NON paid -> buono usato, nessun timbro.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  UPDATE public.kitchen_payments SET amount = 5 WHERE id = a.id;
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.alog(o.id, 'payment_confirmed_amount_mismatch') = 1, 'AM log amount mismatch';
  ASSERT fc_test.ostatus(o.id) NOT LIKE '%|paid', 'AM ordine non paid';
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vto(v, 'used') = 1, 'AM buono usato (in dubbio non torna)';
  ASSERT fc_test.stamps(m) = 0, 'AM nessun timbro';
  RAISE NOTICE 'PASS AM amount mismatch K2';
END $$;

-- VT5 annullo staff con attempt / chiusura per banco / switch / kitchen_payment_fail -> buono resta reserved.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v1 uuid := fc_test.mkv(m); v2 uuid := fc_test.mkv(m); v3 uuid := fc_test.mkv(m); v4 uuid := fc_test.mkv(m);
  o public.kitchen_orders; a public.kitchen_payments; BEGIN
  -- (a) annullo staff con attempt vivo
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v1); a := fc_test.start_online(o.id);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v1) = 'reserved' AND fc_test.vev(v1, 'held_until_checkout_expiry') = 1, 'VT5a annullo con attempt: trattenuto';
  -- (b) chiusura per banco (close_unpaid): ordine invariato, buono riservato; poi annullo -> trattenuto (esiste riga SumUp)
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v2); a := fc_test.start_online(o.id);
  PERFORM fc_test.as_user(s); PERFORM public.kitchen_payment_attempt_close_unpaid(a.id, 'banco');
  ASSERT fc_test.vstatus(v2) = 'reserved' AND fc_test.vev(v2, 'held_until_checkout_expiry') = 0, 'VT5b close_unpaid: riservato, ordine non chiuso';
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v2) = 'reserved' AND fc_test.vev(v2, 'held_until_checkout_expiry') = 1 AND fc_test.vev(v2, 'released') = 0,
    'VT5b annullo dopo chiusura per banco: attempt SumUp esistito -> trattenuto';
  -- (c) switch al banco (cliente) poi annullo
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v3); a := fc_test.start_online(o.id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_switch_to_counter_system(o.id, m);
  ASSERT fc_test.vstatus(v3) = 'reserved', 'VT5c switch: riservato';
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v3) = 'reserved' AND fc_test.vev(v3, 'released') = 0, 'VT5c annullo dopo switch: riservato';
  -- (d) kitchen_payment_fail sull'attempt, poi abbandono
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v4); a := fc_test.start_online(o.id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_fail(a.id, 'sumup_failed', '{}'::jsonb);
  ASSERT fc_test.vstatus(v4) = 'reserved' AND fc_test.ostatus(o.id) LIKE 'pending_online_payment|%', 'VT5d fail: riservato, ordine invariato';
  PERFORM fc_test.abandon(o.id);
  ASSERT fc_test.vstatus(v4) = 'reserved' AND fc_test.vev(v4, 'released') = 0, 'VT5d abbandono dopo fail: riservato';
  RAISE NOTICE 'PASS VT5 trattenuta su annullo/close_unpaid/switch/fail';
END $$;

-- VT6 banco puro: record_counter -> used + timbro; altro ordine banco puro annullato -> available subito.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v1 uuid := fc_test.mkv(m); v2 uuid := fc_test.mkv(m, interval '9 days');
  o public.kitchen_orders; exp_before timestamptz; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v1);
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.vstatus(v1) = 'used' AND fc_test.vto(v1, 'used') = 1, 'VT6 buono usato una volta';
  ASSERT fc_test.vev(v1, 'used_on_charge') = 1, 'VT6 evento used_on_charge (charge prima dell''ordine paid)';
  ASSERT fc_test.stamps(m) = 1, 'VT6 timbro';
  ASSERT fc_test.ostatus(o.id) LIKE '%|paid', 'VT6 ordine pagato';
  SELECT expires_at INTO exp_before FROM public.food_club_vouchers WHERE id = v2;
  o := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]', 'counter', v2);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v2) = 'available' AND fc_test.vev(v2, 'released') = 1 AND fc_test.vev(v2, 'held_until_checkout_expiry') = 0, 'VT6 banco puro annullato: rilascio subito';
  ASSERT (SELECT expires_at FROM public.food_club_vouchers WHERE id = v2) = exp_before, 'VT6 scadenza originale';
  RAISE NOTICE 'PASS VT6 banco puro';
END $$;

-- VT7 online -> banco -> record_counter -> confirm SumUp tardivo (lost_race): un solo evento used, nessun evento verso available.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_order_switch_to_counter_system(o.id, m);
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.vstatus(v) = 'used', 'VT7 usato al banco';
  PERFORM fc_test.confirm(a.id, 'sumup-checkout-late');
  PERFORM fc_test.confirm(a.id, 'sumup-checkout-late'); -- webhook ripetuto
  ASSERT fc_test.alog(o.id, 'payment_confirm_lost_race') = 1, 'VT7 log lost_race (una volta)';
  ASSERT fc_test.vto(v, 'used') = 1, 'VT7 un solo evento verso used';
  ASSERT fc_test.vto(v, 'available') = 0 AND fc_test.vev(v, 'released') = 0, 'VT7 nessun evento verso available';
  ASSERT fc_test.alog(o.id, 'food_club_voucher_double_spend') = 0, 'VT7 nessuna anomalia double_spend';
  ASSERT fc_test.stamps(m) = 1, 'VT7 un solo timbro';
  ASSERT (SELECT count(*) FROM public.kitchen_payments WHERE order_id = o.id AND status = 'succeeded') = 1, 'VT7 un solo charge succeeded';
  RAISE NOTICE 'PASS VT7 lost_race dopo banco';
END $$;

-- VT9 errore Club forzato: le operazioni Kitchen riescono, food_club_error loggato, il buono NON viene rilasciato.
CREATE TEMP TABLE vt9 (k text PRIMARY KEY, order_id text, voucher_id uuid, attempt_id uuid, member uuid, staff uuid);
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid; o public.kitchen_orders; a public.kitchen_payments; BEGIN
  v := fc_test.mkv(m); o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  INSERT INTO vt9 VALUES ('cancel', o.id, v, NULL, m, s);
  v := fc_test.mkv(m); o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  INSERT INTO vt9 VALUES ('abandon', o.id, v, NULL, m, s);
  v := fc_test.mkv(m); o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  INSERT INTO vt9 VALUES ('counter', o.id, v, NULL, m, s);
  v := fc_test.mkv(m); o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  INSERT INTO vt9 VALUES ('confirm', o.id, v, a.id, m, s);
  v := fc_test.mkv(m); o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  INSERT INTO vt9 VALUES ('nolog', o.id, v, NULL, m, s);
END $$;
CREATE FUNCTION fc_test.boom() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'boom_test_club'; END $f$;
CREATE TRIGGER vt9_boom BEFORE INSERT ON public.food_club_voucher_events FOR EACH ROW EXECUTE FUNCTION fc_test.boom();
DO $$ DECLARE r vt9; s uuid; BEGIN
  SELECT * INTO r FROM vt9 WHERE k = 'cancel'; s := r.staff;
  PERFORM fc_test.cancel(r.order_id, s);
  ASSERT fc_test.ostatus(r.order_id) LIKE 'cancelled|%', 'VT9 annullo riuscito nonostante l''errore Club';
  ASSERT fc_test.vstatus(r.voucher_id) = 'reserved', 'VT9 annullo: buono NON rilasciato';
  ASSERT fc_test.alog(r.order_id, 'food_club_error') = 1, 'VT9 annullo: food_club_error loggato';
  ASSERT (SELECT metadata->>'needs_manual_reconciliation' FROM public.kitchen_action_log WHERE order_id = r.order_id AND action = 'food_club_error') = 'true', 'VT9 needs_manual_reconciliation';

  SELECT * INTO r FROM vt9 WHERE k = 'abandon';
  PERFORM fc_test.abandon(r.order_id);
  ASSERT fc_test.ostatus(r.order_id) LIKE 'payment_abandoned|%', 'VT9 abbandono riuscito';
  ASSERT fc_test.vstatus(r.voucher_id) = 'reserved' AND fc_test.alog(r.order_id, 'food_club_error') = 1, 'VT9 abbandono: riservato + errore loggato';

  SELECT * INTO r FROM vt9 WHERE k = 'counter';
  PERFORM fc_test.pay_counter(r.order_id, r.staff);
  ASSERT fc_test.ostatus(r.order_id) LIKE '%|paid', 'VT9 record_counter riuscito: ordine pagato';
  ASSERT (SELECT count(*) FROM public.kitchen_payments WHERE order_id = r.order_id AND status = 'succeeded') = 1, 'VT9 charge registrato';
  ASSERT fc_test.vstatus(r.voucher_id) = 'reserved', 'VT9 record_counter: buono resta riservato (sistemazione manuale)';
  ASSERT fc_test.alog(r.order_id, 'food_club_error') >= 1, 'VT9 record_counter: errore loggato';

  SELECT * INTO r FROM vt9 WHERE k = 'confirm';
  PERFORM fc_test.confirm(r.attempt_id, 'sumup-ok');
  ASSERT fc_test.ostatus(r.order_id) LIKE '%|paid', 'VT9 confirm riuscito: ordine pagato';
  ASSERT fc_test.vstatus(r.voucher_id) = 'reserved' AND fc_test.alog(r.order_id, 'food_club_error') >= 1, 'VT9 confirm: riservato + errore loggato';
  RAISE NOTICE 'PASS VT9 errore Club isolato (annullo, abbandono, record_counter, confirm)';
END $$;
-- Caso estremo: fallisce anche l'INSERT del log food_club_error -> solo WARNING, l'operazione Kitchen riesce.
CREATE FUNCTION fc_test.boom_log() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'boom_test_log'; END $f$;
CREATE TRIGGER vt9_boom_log BEFORE INSERT ON public.kitchen_action_log FOR EACH ROW WHEN (NEW.action = 'food_club_error') EXECUTE FUNCTION fc_test.boom_log();
DO $$ DECLARE r vt9; BEGIN
  SELECT * INTO r FROM vt9 WHERE k = 'nolog';
  PERFORM fc_test.cancel(r.order_id, r.staff);
  ASSERT fc_test.ostatus(r.order_id) LIKE 'cancelled|%', 'VT9x annullo riuscito anche se il log errore fallisce';
  ASSERT fc_test.vstatus(r.voucher_id) = 'reserved', 'VT9x buono non rilasciato';
  ASSERT fc_test.alog(r.order_id, 'food_club_error') = 0, 'VT9x log errore non scritto (solo WARNING)';
  RAISE NOTICE 'PASS VT9x doppio errore: solo WARNING';
END $$;
DROP TRIGGER vt9_boom_log ON public.kitchen_action_log;
DROP TRIGGER vt9_boom ON public.food_club_voucher_events;

-- VT11 confirm ripetuto, on_paid + on_charge nella stessa transazione, consume chiamato a mano due volte: un solo used.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; p public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  p := fc_test.pay_online(o.id);
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vev(v, 'order_paid') + fc_test.vev(v, 'used_on_charge') = 1, 'VT11 un solo evento di consumo';
  PERFORM fc_test.confirm(p.id, 'sumup-' || p.id);
  PERFORM fc_test.confirm(p.id, 'sumup-' || p.id);
  PERFORM fc_test.as_service();
  PERFORM public.food_club_consume_on_charge(o.id, 'manuale');
  PERFORM public.food_club_consume_on_charge(o.id, 'manuale');
  ASSERT fc_test.vto(v, 'used') = 1, 'VT11 un solo evento verso used';
  ASSERT fc_test.alog(o.id, 'food_club_voucher_double_spend') = 0 AND fc_test.alog(o.id, 'food_club_error') = 0, 'VT11 nessuna anomalia';
  ASSERT fc_test.stamps(m) = 1, 'VT11 un solo timbro';
  RAISE NOTICE 'PASS VT11 idempotenza consumo';
END $$;

-- VT12 campagna spenta: create_order_v4 col buono rifiutato (nessun ordine); buoni già riservati seguono le regole.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v0 uuid := fc_test.mkv(m);
  v1 uuid := fc_test.mkv(m); v2 uuid := fc_test.mkv(m); v3 uuid := fc_test.mkv(m);
  o1 public.kitchen_orders; o2 public.kitchen_orders; o3 public.kitchen_orders; n int; x public.kitchen_orders; BEGIN
  o1 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v1);
  o2 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v2); PERFORM fc_test.start_online(o2.id);
  o3 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v3);
  UPDATE public.food_club_campaigns SET active = false WHERE id = 'visite-v1';
  SELECT count(*) INTO n FROM public.kitchen_orders WHERE customer_id = m;
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.order(%L, '[{"item_id":"item-009","quantity":1}]', 'online', %L)$q$, m, v0), 'voucher_campaign_inactive');
  ASSERT (SELECT count(*) FROM public.kitchen_orders WHERE customer_id = m) = n, 'VT12 nessun ordine creato';
  ASSERT fc_test.vstatus(v0) = 'available', 'VT12 buono intatto';
  x := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter'); -- ordine senza buono: ok
  ASSERT x.id IS NOT NULL AND x.discount_amount = 0, 'VT12 ordine senza buono funziona';
  PERFORM fc_test.pay_counter(o1.id, s);
  ASSERT fc_test.vstatus(v1) = 'used', 'VT12 reserved + campagna spenta: consumato al pagamento';
  PERFORM fc_test.cancel(o2.id, s);
  ASSERT fc_test.vstatus(v2) = 'reserved' AND fc_test.vev(v2, 'held_until_checkout_expiry') = 1, 'VT12 annullo con attempt: trattenuto';
  PERFORM fc_test.cancel(o3.id, s);
  ASSERT fc_test.vstatus(v3) = 'available', 'VT12 annullo banco puro: rilasciato';
  UPDATE public.food_club_campaigns SET active = true WHERE id = 'visite-v1';
  RAISE NOTICE 'PASS VT12 campagna spenta';
END $$;

-- VT13 ordini normali senza buono: nessun evento voucher e nessun log di errore/anomalia Club.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); u uuid := fc_test.new_user();
  o1 public.kitchen_orders; o2 public.kitchen_orders; o3 public.kitchen_orders; o4 public.kitchen_orders; a public.kitchen_payments; n0 int; BEGIN
  SELECT count(*) INTO n0 FROM public.food_club_voucher_events;
  o1 := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'online'); PERFORM fc_test.pay_online(o1.id);          -- confirm (non iscritto)
  o2 := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'counter'); PERFORM fc_test.pay_counter(o2.id, s);    -- record_counter
  o3 := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'online'); a := fc_test.start_online(o3.id); PERFORM fc_test.cancel(o3.id, s); -- annullo
  o4 := fc_test.order(u, '[{"item_id":"item-009","quantity":1}]', 'online'); PERFORM fc_test.start_online(o4.id); PERFORM fc_test.abandon(o4.id);   -- abbandono
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events) = n0, 'VT13 nessun evento voucher';
  ASSERT (SELECT count(*) FROM public.kitchen_action_log WHERE order_id IN (o1.id, o2.id, o3.id, o4.id)
            AND action LIKE 'food_club_%' AND action <> 'food_club_order_paid') = 0, 'VT13 nessun log food_club_* (errori/anomalie)';
  ASSERT (SELECT count(*) FROM public.kitchen_action_log WHERE order_id IN (o3.id, o4.id) AND action LIKE 'food_club_%') = 0, 'VT13 annullo/abbandono: nessun log Club';
  -- Ordine di un iscritto senza buono, pagato: nessun evento voucher (il timbro è un altro mondo).
  o1 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online'); PERFORM fc_test.pay_online(o1.id);
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events) = n0, 'VT13 iscritto senza buono: nessun evento voucher';
  ASSERT (SELECT count(*) FROM public.kitchen_action_log WHERE order_id = o1.id AND action = 'food_club_order_paid') = 1,
    'VT13b ordine app pagato di un iscritto: un solo log food_club_order_paid (noto: viene scritto anche per i non iscritti, vedi report)';
  RAISE NOTICE 'PASS VT13 ordine senza buono';
END $$;

-- FIX-1 (RPC reali): online con buono, senza attempt (banco puro) -> abbandono rilascia. record_counter su
-- payment_abandoned e' bloccato dalla guardia Kitchen (online_order_paid_status_conflict): il caso NON e' raggiungibile
-- con le RPC reali; il reclaim si testa con INSERT diretto di un charge succeeded.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  PERFORM fc_test.abandon(o.id);
  ASSERT fc_test.vstatus(v) = 'available' AND fc_test.vev(v, 'released') = 1, 'FIX1a rilasciato (nessun checkout creato)';
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.pay_counter(%L, %L)$q$, o.id, s), 'online_order_paid_status_conflict');
  ASSERT fc_test.vstatus(v) = 'available' AND (SELECT count(*) FROM public.kitchen_payments WHERE order_id = o.id AND status = 'succeeded') = 0,
    'FIX1a record_counter su abbandonato rifiutato: nulla cambia';
  PERFORM fc_test.counter_charge(o.id); -- charge tardivo scritto fuori dalle RPC (es. riconciliazione manuale)
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vev(v, 'reclaimed_on_late_payment') = 1 AND fc_test.vto(v, 'used') = 1, 'FIX1a ri-consumato';
  ASSERT (SELECT used_order_id FROM public.food_club_vouchers WHERE id = v) = o.id, 'FIX1a legato all''ordine';
  ASSERT fc_test.stamps(m) = 0, 'FIX1a nessun timbro (ordine non paid)';
  RAISE NOTICE 'PASS FIX1a reclaim su payment_abandoned (INSERT diretto)';
END $$;

-- FIX-1 (INSERT diretto: record_counter rifiuta 'cancelled', il caso non e' raggiungibile con le RPC reali).
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  PERFORM fc_test.cancel(o.id, s);
  ASSERT fc_test.vstatus(v) = 'available', 'FIX1b rilasciato';
  PERFORM fc_test.expect_error(format($q$SELECT fc_test.pay_counter(%L, %L)$q$, o.id, s), 'order_cancelled');
  PERFORM fc_test.counter_charge(o.id);
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.vev(v, 'reclaimed_on_late_payment') = 1, 'FIX1b ri-consumato';
  ASSERT fc_test.ostatus(o.id) LIKE 'cancelled|%' AND fc_test.ostatus(o.id) NOT LIKE '%|paid', 'FIX1b ordine resta annullato';
  ASSERT fc_test.stamps(m) = 0, 'FIX1b nessun timbro';
  RAISE NOTICE 'PASS FIX1b reclaim su ordine annullato';
END $$;
-- FIX-1 variante: buono nel frattempo riservato su un altro ordine -> double_spend loggato UNA volta, buono non toccato.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o1 public.kitchen_orders; o2 public.kitchen_orders; BEGIN
  o1 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  PERFORM fc_test.cancel(o1.id, s);
  o2 := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  ASSERT fc_test.vstatus(v) = 'reserved' AND (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = v) = o2.id, 'FIX1c riservato su altro ordine';
  PERFORM fc_test.counter_charge(o1.id);
  ASSERT fc_test.alog(o1.id, 'food_club_voucher_double_spend') = 1, 'FIX1c double_spend loggato';
  ASSERT fc_test.vstatus(v) = 'reserved' AND (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = v) = o2.id, 'FIX1c buono non toccato';
  PERFORM fc_test.as_service();
  PERFORM public.food_club_consume_on_charge(o1.id, 'manuale');
  PERFORM public.food_club_consume_on_charge(o1.id, 'manuale');
  ASSERT fc_test.alog(o1.id, 'food_club_voucher_double_spend') = 1, 'FIX1c double_spend una volta sola';
  RAISE NOTICE 'PASS FIX1c double_spend una volta';
END $$;

-- D-P2: buono consumato con consumed_on_late_charge, poi rimborso -> resta used anche con refund_recredits_voucher.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  UPDATE public.food_club_campaigns SET refund_recredits_voucher = true WHERE id = 'visite-v1';
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  PERFORM fc_test.abandon(o.id);
  PERFORM fc_test.confirm(a.id);
  ASSERT fc_test.vev(v, 'consumed_on_late_charge') = 1, 'DP2 consumato in ritardo';
  UPDATE public.kitchen_orders SET payment_status = 'refunded' WHERE id = o.id;
  ASSERT fc_test.vstatus(v) = 'used', 'DP2 resta used dopo il rimborso';
  ASSERT fc_test.vev(v, 'recredited_after_refund') = 0, 'DP2 nessun riaccredito';
  ASSERT fc_test.alog(o.id, 'food_club_error') = 0, 'DP2 nessun errore Club';
  UPDATE public.food_club_campaigns SET refund_recredits_voucher = false WHERE id = 'visite-v1';
  RAISE NOTICE 'PASS DP2 nessun riaccredito dopo rimborso tardivo';
END $$;

-- FIX-4: DELETE di un ordine con buono/timbro -> errore FK (RESTRICT), nessuno SET NULL silenzioso.
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v uuid := fc_test.mkv(m); o public.kitchen_orders; p public.kitchen_orders; BEGIN
  ASSERT (SELECT count(*) FROM pg_constraint WHERE confdeltype = 'r' AND conname IN
    ('food_club_vouchers_reserved_order_id_fkey', 'food_club_vouchers_used_order_id_fkey', 'food_club_stamps_order_id_fkey')) = 3,
    'FIX4 le tre FK sono RESTRICT';
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter', v);
  PERFORM fc_test.expect_error(format('DELETE FROM public.kitchen_orders WHERE id = %L', o.id), 'violates foreign key constraint');
  PERFORM fc_test.pay_counter(o.id, s);
  ASSERT fc_test.vstatus(v) = 'used' AND fc_test.stamps(m) = 1, 'FIX4 precondizione: usato + timbro';
  PERFORM fc_test.expect_error(format('DELETE FROM public.kitchen_orders WHERE id = %L', o.id), 'violates foreign key constraint');
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_orders WHERE id = o.id) AND fc_test.vstatus(v) = 'used'
         AND (SELECT used_order_id FROM public.food_club_vouchers WHERE id = v) = o.id, 'FIX4 nulla modificato';
  p := fc_test.order(m, '[{"item_id":"item-010","quantity":1}]', 'counter');
  PERFORM fc_test.pay_counter(p.id, s); -- stessa serata: nessun secondo timbro; l'ordine senza buono resta cancellabile (se non ha altri vincoli)
  RAISE NOTICE 'PASS FIX4 FK RESTRICT';
END $$;

-- FIX-5: combo, la quota food segue la variazione di prezzo (quota bevanda costante), mai > prezzo né < 0.
DO $$ DECLARE p0 numeric; f0 numeric; BEGIN
  SELECT price, food_unit_amount INTO p0, f0 FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_category FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = 'combo', 'FIX5 item-040 e'' un combo';
  UPDATE public.kitchen_menu_items SET price = p0 + 2 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_unit_amount FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = f0 + 2, 'FIX5 prezzo +2 -> food +2';
  UPDATE public.kitchen_menu_items SET price = p0 - 1 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_unit_amount FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = f0 - 1, 'FIX5 prezzo -1 -> food -1';
  UPDATE public.kitchen_menu_items SET price = 3 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_unit_amount FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = 0, 'FIX5 sotto la quota bevanda: food = 0, mai negativo';
  UPDATE public.kitchen_menu_items SET price = p0, food_unit_amount = f0 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  UPDATE public.kitchen_menu_items SET price = p0 + 1, food_unit_amount = 5 WHERE venue_id = 'walrus-main' AND item_id = 'item-040';
  ASSERT (SELECT food_unit_amount FROM public.kitchen_menu_items WHERE venue_id = 'walrus-main' AND item_id = 'item-040') = 5, 'FIX5 valore esplicito dell''admin rispettato';
  RAISE NOTICE 'PASS FIX5 combo segue il prezzo';
END $$;

-- R1.6 (Passo 2): ordine online con buono oltre created_at + 4:30 -> nessun attempt nuovo e nessuna claim del checkout
-- (online_payment_expired). Prima del limite l'attempt nasce e la claim riesce; dopo, la claim e un secondo attempt_start rifiutano.
DO $$ DECLARE m uuid := fc_test.new_member(); v uuid := fc_test.mkv(m); o public.kitchen_orders; a public.kitchen_payments; BEGIN
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', v);
  a := fc_test.start_online(o.id);
  ASSERT fc_test.ostatus(o.id) LIKE 'pending_online_payment|%', 'R16 precondizione: ordine online in attesa';
  -- 4:20 dopo la creazione: la claim riesce
  PERFORM fc_test.backdate(o.id, now() - interval '4 minutes 20 seconds');
  PERFORM fc_test.as_service();
  ASSERT (public.kitchen_payment_attempt_claim_checkout(a.id)).id = a.id, 'R16 claim ok prima di 4:30';
  -- 4:40 dopo la creazione: claim e nuovo attempt rifiutati
  PERFORM fc_test.backdate(o.id, now() - interval '4 minutes 40 seconds');
  UPDATE public.kitchen_payments SET checkout_claim_at = NULL WHERE id = a.id;
  PERFORM fc_test.expect_error(format('SELECT public.kitchen_payment_attempt_claim_checkout(%L::uuid)', a.id), 'online_payment_expired');
  ASSERT (SELECT checkout_claim_at FROM public.kitchen_payments WHERE id = a.id) IS NULL, 'R16 nessuna claim scritta dopo 4:30';
  PERFORM fc_test.as_user(m);
  PERFORM fc_test.expect_error(
    format('SELECT public.kitchen_payment_attempt_start(%L, %L, %L, %L, %s, %L)', o.id, 'app', 'sumup', 'sumup_online', o.total, gen_random_uuid()::text),
    'online_payment_expired');
  PERFORM fc_test.as_service();
  ASSERT fc_test.vstatus(v) = 'reserved', 'R16 il buono non cambia stato';
  RAISE NOTICE 'PASS R16 nessun checkout/attempt dopo created_at+4:30';
END $$;
