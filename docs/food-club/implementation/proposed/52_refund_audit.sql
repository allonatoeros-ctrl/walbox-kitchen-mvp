-- FOOD CLUB V1 — AUDIT FINALE PAGAMENTI E RIMBORSI (2026-11-05). STATO: PROPOSTA, solo stack locale.
-- Test negativi: ogni blocco afferma il comportamento SICURO. Sul codice attuale i blocchi RA1/RA2/RA3/RA4 devono
-- FALLIRE (bypass riprodotto); con proposed/20261105106000_payments_refund_least_privilege.sql devono PASSARE.
--   (RA5 e RA6 sono controlli positivi: devono passare in entrambi i casi.
-- Ruoli Postgres reali via fc_test.oc_try (SET LOCAL ROLE + claim JWT). Righe "EVID" = effetti osservati, non asserzioni.
-- Runner: harness/run-ra-local.sh (ogni blocco in BEGIN/ROLLBACK).

-- RA1 rimborso SumUp: staff e manager NON possono dichiarare FALLITO un rimborso già reclamato dal server
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); g uuid := fc_test.new_manager();
  o public.kitchen_orders; r public.kitchen_payments; v text; w text; BEGIN
  PERFORM fc_test.activate_campaign();
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(o.id);
  ASSERT fc_test.stamps(m) = 1, 'RA1 precondizione: timbro sull''ordine pagato';
  -- API: kitchen_payment_refund (JWT staff) -> claim (service_role) -> POST SumUp refund -> 204 (soldi restituiti).
  PERFORM fc_test.as_user(s); r := public.kitchen_payment_refund(o.id, 'cliente scontento');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_refund_claim_provider_call(r.id);
  -- Finestra tra il 204 di SumUp e la conferma (o dopo un esito "unknown"): lo staff chiama la RPC a mano.
  v := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_refund_fail(%L, %L)', r.id, 'sumup_refund_rejected_400'));
  w := fc_test.oc_try('authenticated', g, format('SELECT public.kitchen_payment_refund_fail(%L, %L)', r.id, 'manager_says_failed'));
  RAISE NOTICE 'EVID RA1 staff fail=% | manager fail=% | refund ora=%', v, w,
    (SELECT status || '/' || coalesce(failure_reason, '-') FROM public.kitchen_payments WHERE id = r.id);
  BEGIN
    PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_refund_confirm(r.id, 'txn-ra1', '{"sumup_status":204}'::jsonb);
    RAISE NOTICE 'EVID RA1 conferma server dopo il 204: OK';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'EVID RA1 conferma server dopo il 204: RIFIUTATA (%)', SQLERRM; END;
  RAISE NOTICE 'EVID RA1 ordine=% | timbri attivi=% | drift rimborso visibile=%',
    (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id), fc_test.stamps(m),
    (SELECT count(*) FROM public.kitchen_payments WHERE order_id = o.id AND direction = 'refund' AND status IN ('initiated','pending'));
  ASSERT v <> 'OK', 'RA1 staff ha dichiarato fallito un rimborso reclamato dal server';
  ASSERT w <> 'OK', 'RA1 manager ha dichiarato fallito un rimborso reclamato dal server';
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = r.id) = 'succeeded', 'RA1 rimborso reale non registrato';
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'refunded', 'RA1 ordine non rimborsato nel ledger';
  ASSERT fc_test.stamps(m) = 0, 'RA1 timbro non revocato dopo il rimborso reale';
  RAISE NOTICE 'PASS RA1 staff/manager non dichiarano fallito un rimborso reclamato dal server';
END $$;

-- RA2 rimborso SumUp: lo staff non dichiara FALLITO neppure un rimborso appena aperto (mai usato dall'app; solo service_role)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; r public.kitchen_payments; v text; BEGIN
  PERFORM fc_test.activate_campaign();
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(o.id);
  PERFORM fc_test.as_user(s); r := public.kitchen_payment_refund(o.id, 'test');
  v := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_refund_fail(%L, %L)', r.id, 'x'));
  RAISE NOTICE 'EVID RA2 staff fail su rimborso non reclamato=%', v;
  ASSERT v <> 'OK', 'RA2 staff ha chiuso un rimborso: solo il server può';
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = r.id) = 'initiated', 'RA2 rimborso modificato';
  -- il server può ancora chiudere l'attempt (rifiuto SumUp 4xx): percorso API invariato
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_refund_fail(r.id, 'sumup_refund_rejected_409', '{}'::jsonb);
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = r.id) = 'failed', 'RA2 service_role deve poter chiudere';
  RAISE NOTICE 'PASS RA2 chiusura rimborso solo service_role';
END $$;

-- RA3 rimborso FALSO: staff UPDATE diretto payment_status='refunded' senza alcun rimborso (SumUp non ha restituito nulla)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); vo public.food_club_vouchers; o public.kitchen_orders; v text; c text; BEGIN
  PERFORM fc_test.activate_campaign('{"refund_recredits_voucher":true}');
  vo := fc_test.oc_voucher(m, 'WC-RA3');
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online', vo.id);
  PERFORM fc_test.pay_online(o.id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = vo.id) = 'used', 'RA3 precondizione: buono usato';
  v := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_orders SET payment_status = %L WHERE id = %L', 'refunded', o.id));
  c := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_order_cancel(%L, %L)', o.id, 'dopo finto rimborso'));
  RAISE NOTICE 'EVID RA3 update=% | ordine=% | buono=% | annullo successivo=% | stato=% | charge=% | righe rimborso=%', v,
    (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id), (SELECT status FROM public.food_club_vouchers WHERE id = vo.id),
    c, (SELECT status FROM public.kitchen_orders WHERE id = o.id),
    (SELECT status FROM public.kitchen_payments WHERE order_id = o.id AND direction = 'charge'),
    (SELECT count(*) FROM public.kitchen_payments WHERE order_id = o.id AND direction = 'refund');
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'paid', 'RA3 ordine marcato rimborsato senza rimborso';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = vo.id) = 'used', 'RA3 buono riaccreditato senza rimborso';
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = o.id) <> 'cancelled', 'RA3 ordine pagato annullato dopo finto rimborso';
  RAISE NOTICE 'PASS RA3 nessun rimborso dichiarabile con UPDATE diretto';
END $$;

-- RA4 rimborso annullato a mano (refunded->paid) e importi modificati a mano: rifiutati; update operativi permessi
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; p public.kitchen_orders;
  a text; b text; c text; t text; ok text; BEGIN
  PERFORM fc_test.activate_campaign();
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(o.id);
  PERFORM fc_test.refund(o.id, s);   -- rimborso reale e confermato dal server
  ASSERT fc_test.stamps(m) = 0, 'RA4 precondizione: timbro revocato';
  a := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_orders SET payment_status = %L WHERE id = %L', 'paid', o.id));
  RAISE NOTICE 'EVID RA4 refunded->paid=% | ordine=% | timbri=%', a, (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id), fc_test.stamps(m);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'refunded', 'RA4 rimborso annullato a mano';
  p := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(p.id);
  t := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_orders SET total = 0.01 WHERE id = %L', p.id));
  ok := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_orders SET staff_note = %L, status = %L WHERE id = %L', 'nota', 'preparing', p.id));
  RAISE NOTICE 'EVID RA4 total=% | ordine=%/%  | update operativo=%', t,
    (SELECT payment_status FROM public.kitchen_orders WHERE id = p.id), (SELECT total FROM public.kitchen_orders WHERE id = p.id), ok;
  -- paid->NULL resta possibile con la correzione minima: solo evidenza (decisione aperta D-RA1), nessuna asserzione.
  ASSERT (SELECT total FROM public.kitchen_orders WHERE id = p.id) = p.total, 'RA4 totale modificato a mano';
  ASSERT ok = 'OK', 'RA4 l''update operativo dello staff (stato, nota) deve restare permesso: ' || ok;
  b := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_orders SET payment_status = NULL, paid_at = NULL WHERE id = %L', p.id));
  c := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_order_cancel(%L, %L)', p.id, 'dopo paid->NULL'));
  RAISE NOTICE 'EVID RA4 [D-RA1] paid->NULL=% | annullo dopo=% | ordine=%/% | charge=%', b, c,
    (SELECT status FROM public.kitchen_orders WHERE id = p.id), coalesce((SELECT payment_status FROM public.kitchen_orders WHERE id = p.id), 'NULL'),
    (SELECT status FROM public.kitchen_payments WHERE order_id = p.id AND direction = 'charge');
  RAISE NOTICE 'PASS RA4 campi di pagamento solo via RPC, update operativi invariati';
END $$;

-- RA5 controllo positivo: conferma e claim del rimborso solo service_role; cliente/anon fuori da ogni RPC di rimborso
DO $$ DECLARE m uuid := fc_test.new_member(); x uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); g uuid := fc_test.new_manager();
  o public.kitchen_orders; r public.kitchen_payments; who record; v text; BEGIN
  PERFORM fc_test.activate_campaign();
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(o.id);
  PERFORM fc_test.as_user(s); r := public.kitchen_payment_refund(o.id, 'test');
  FOR who IN SELECT * FROM (VALUES ('authenticated', s), ('authenticated', g), ('authenticated', m), ('authenticated', x), ('anon', NULL::uuid)) t(rl, uid) LOOP
    v := fc_test.oc_try(who.rl, who.uid, format('SELECT public.kitchen_payment_refund_confirm(%L, %L)', r.id, 'fake'));
    ASSERT v <> 'OK', 'RA5 refund_confirm accettata da ' || who.rl;
    v := fc_test.oc_try(who.rl, who.uid, format('SELECT public.kitchen_payment_refund_claim_provider_call(%L)', r.id));
    ASSERT v <> 'OK', 'RA5 claim accettato da ' || who.rl;
  END LOOP;
  -- claim JWT service_role falsificato con ruolo Postgres reale authenticated: decide il GRANT
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', false);
  BEGIN EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM public.kitchen_payment_refund_confirm(r.id, 'fake'); v := 'OK';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM; END;
  RESET ROLE;
  RAISE NOTICE 'EVID RA5 refund_confirm con claim service_role falsato e ruolo authenticated=%', v;
  ASSERT v <> 'OK', 'RA5 refund_confirm con claim falsato';
  BEGIN EXECUTE 'SET LOCAL ROLE authenticated'; PERFORM public.kitchen_payment_refund_fail(r.id, 'fake'); v := 'OK';
  EXCEPTION WHEN OTHERS THEN v := SQLERRM; END;
  RESET ROLE;
  RAISE NOTICE 'EVID RA5 refund_fail con claim service_role falsato e ruolo authenticated=%', v;
  ASSERT v <> 'OK', 'RA5 refund_fail con claim falsato: solo il GRANT protegge';
  FOR who IN SELECT * FROM (VALUES ('authenticated', m), ('authenticated', x), ('anon', NULL::uuid)) t(rl, uid) LOOP
    v := fc_test.oc_try(who.rl, who.uid, format('SELECT public.kitchen_payment_refund(%L, %L)', o.id, 'x'));
    ASSERT v <> 'OK', 'RA5 cliente/anon apre un rimborso';
    v := fc_test.oc_try(who.rl, who.uid, format('SELECT public.kitchen_payment_refund_fail(%L, %L)', r.id, 'x'));
    ASSERT v <> 'OK', 'RA5 cliente/anon chiude un rimborso';
    v := fc_test.oc_try(who.rl, who.uid, format('UPDATE public.kitchen_orders SET payment_status = %L WHERE id = %L', 'refunded', o.id));
    ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'paid', 'RA5 cliente/anon cambia lo stato di pagamento';
  END LOOP;
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = r.id) = 'initiated', 'RA5 rimborso alterato';
  ASSERT fc_test.stamps(m) = 1, 'RA5 timbro alterato';
  RAISE NOTICE 'PASS RA5 conferma/claim solo server; cliente e anon esclusi';
END $$;

-- RA6 controllo positivo: flussi legittimi invariati (rimborso server completo, banco, nuovo rimborso dopo rifiuto SumUp)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); o public.kitchen_orders; q public.kitchen_orders;
  r public.kitchen_payments; r2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  o := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'counter');
  PERFORM fc_test.pay_counter(o.id, s, 'cash');
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'paid', 'RA6 incasso al banco';
  PERFORM fc_test.refund(o.id, s);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = o.id) = 'refunded', 'RA6 rimborso contanti';
  q := fc_test.order(m, '[{"item_id":"item-009","quantity":1}]', 'online');
  PERFORM fc_test.pay_online(q.id);
  PERFORM fc_test.as_user(s); r := public.kitchen_payment_refund(q.id, 'primo');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_refund_claim_provider_call(r.id);
  PERFORM public.kitchen_payment_refund_fail(r.id, 'sumup_refund_rejected_400', '{}'::jsonb);
  PERFORM fc_test.as_user(s); r2 := public.kitchen_payment_refund(q.id, 'secondo');
  ASSERT r2.id <> r.id AND r2.status = 'initiated', 'RA6 nuovo rimborso dopo rifiuto SumUp';
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_refund_claim_provider_call(r2.id);
  PERFORM public.kitchen_payment_refund_confirm(r2.id, 'txn-ra6', '{}'::jsonb);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = q.id) = 'refunded', 'RA6 rimborso SumUp confermato';
  RAISE NOTICE 'PASS RA6 flussi legittimi di rimborso invariati';
END $$;
