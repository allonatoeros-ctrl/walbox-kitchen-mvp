-- FOOD CLUB V1 — OPZIONE C: test scritti PRIMA dell'implementazione (RED atteso dove la logica manca).
-- Solo DB LOCALE. Harness: proposed/harness/run-oc-local.sh (ogni blocco "-- OC" gira da solo in BEGIN/ROLLBACK).
-- Base: migration Food Club + patch proposta 20261105104000 (FIX-1..5). OC10 (concorrenza) è in harness/oc10-concurrency.sh.
--
-- Decisioni di prodotto approvate da Eros (2026-11-05):
--  D1 pagamento SumUp incerto -> buono RISERVATO
--  D2 dopo 30 minuti -> avviso allo staff, nessuno sblocco automatico per solo timeout
--  D3 pagamento definitivamente fallito/annullato e tutti i tentativi chiusi -> buono restituito in automatico
--  D4 sblocco manuale: solo amministratore (role 'manager') e solo se nessun tentativo può più essere confermato
--  D5 testo cliente: «Buono temporaneamente riservato. Stiamo verificando il pagamento.» (UI, Fase 3: non testato qui)
--  D6 pagamento confermato -> buono consumato UNA sola volta, anche se l'ordine resta abbandonato
--
-- Contratto proposto (non esiste ancora: i test lo fissano):
--  attempt CONFERMABILE = initiated | pending | failed/sumup_failed | failed/abandoned_timeout (= kitchen_payment_confirm)
--  public.food_club_order_payment_state(order_id text) -> 'paid' | 'open' | 'closed'
--  evento voucher 'held_payment_open' quando l'ordine si chiude non pagato con attempt confermabili
--  charge 'succeeded' su ordine cancelled/payment_abandoned con buono riservato -> buono 'used' su quell'ordine
--  attempt che diventa definitivo + ordine chiuso + nessun attempt confermabile -> buono 'available' (o 'expired')
--  public.food_club_staff_vouchers_on_hold(p_venue_id text, p_min_minutes int DEFAULT 30)
--      -> righe (voucher_id, order_id, ...) dei buoni riservati su ordini chiusi creati da più di p_min_minutes (staff)
--  public.food_club_admin_release_voucher(p_order_id text, p_reason text) -> jsonb
--      manager_only · 'payment_still_confirmable' se esiste un attempt confermabile · idempotente se già liberato

-- OC1 abbandono con attempt SumUp ancora confermabile: buono resta RISERVATO e non riusabile (D1)
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC1');
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id);
  ASSERT (SELECT status || '/' || failure_reason FROM public.kitchen_payments WHERE id = a.id) = 'failed/abandoned_timeout', 'OC1 pre: attempt abandoned_timeout (confermabile)';
  ASSERT (SELECT status || '/' || COALESCE(reserved_order_id, '-') FROM public.food_club_vouchers WHERE id = v.id) = 'reserved/' || a.order_id,
         'OC1 buono resta riservato sull''ordine abbandonato';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_voucher_events WHERE voucher_id = v.id AND order_id = a.order_id AND event = 'held_payment_open'), 'OC1 evento held_payment_open';
  PERFORM fc_test.expect_error(format('SELECT fc_test.order(%L, %L, %L, %L)', m, '[{"item_id":"item-010","quantity":1}]', 'counter', v.id), 'voucher_not_available');
  ASSERT public.food_club_order_payment_state(a.order_id) = 'open', 'OC1 stato pagamento open';
  RAISE NOTICE 'PASS OC1 abbandono: buono riservato';
END $$;

-- OC2 webhook tardivo PAID dopo abbandono + webhook duplicato: buono usato una sola volta, ordine resta abbandonato (D6)
DO $$ DECLARE m uuid := fc_test.new_member(); v public.food_club_vouchers; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": false}');
  v := fc_test.oc_voucher(m, 'WC-OC2');
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_confirm(a.id, 'late-1', '{}'::jsonb);
  PERFORM public.kitchen_payment_confirm(a.id, 'late-1', '{}'::jsonb);  -- doppia consegna webhook
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = a.order_id) = 'payment_abandoned', 'OC2 pre: ordine resta abbandonato';
  ASSERT (SELECT status || '/' || COALESCE(used_order_id, '-') FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id,
         'OC2 buono usato su questo ordine senza intervento staff';
  ASSERT fc_test.oc_events(v.id, 'used') = 1, 'OC2 un solo evento used (idempotente)';
  ASSERT fc_test.oc_events(v.id, 'available') = 0, 'OC2 mai tornato disponibile';
  ASSERT NOT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = a.order_id AND action = 'food_club_voucher_double_spend'), 'OC2 nessun doppio uso';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id = a.order_id), 'OC2 nessun timbro (ordine non pagato)';
  RAISE NOTICE 'PASS OC2 webhook tardivo: buono consumato una volta';
END $$;

-- OC3 riconciliazione: SumUp ancora FAILED -> resta riservato; EXPIRED -> liberato con scadenza originale;
--     buono scaduto nel frattempo -> 'expired' (D1, D3)
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); m3 uuid := fc_test.new_member();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; v3 public.food_club_vouchers;
  a1 public.kitchen_payments; a2 public.kitchen_payments; a3 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v1 := fc_test.oc_voucher(m1, 'WC-OC3A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC3B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  v3 := fc_test.oc_voucher(m3, 'WC-OC3C'); a3 := fc_test.oc_online_with_attempt(m3, v3.id);
  PERFORM fc_test.oc_abandon(a1.order_id); PERFORM fc_test.oc_abandon(a2.order_id); PERFORM fc_test.oc_abandon(a3.order_id);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_fail(a1.id, 'sumup_failed', '{}'::jsonb);   -- checkout FAILED: il cliente può ancora riprovare
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC3 FAILED (ritentabile): resta riservato';
  PERFORM public.kitchen_payment_fail(a2.id, 'sumup_expired', '{}'::jsonb);  -- definitivo
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'available', 'OC3 EXPIRED: liberato';
  ASSERT (SELECT expires_at FROM public.food_club_vouchers WHERE id = v2.id) = v2.expires_at, 'OC3 scadenza originale';
  ASSERT (SELECT reserved_order_id FROM public.food_club_vouchers WHERE id = v2.id) IS NULL, 'OC3 non più legato all''ordine';
  UPDATE public.food_club_vouchers SET expires_at = now() - interval '1 minute' WHERE id = v3.id;
  PERFORM public.kitchen_payment_fail(a3.id, 'sumup_cancelled', '{}'::jsonb);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v3.id) = 'expired', 'OC3 scaduto mentre riservato: expired, non available';
  RAISE NOTICE 'PASS OC3 riconciliazione FAILED/EXPIRED/CANCELLED';
END $$;

-- OC4 annullamento: semplice (kitchen_order_cancel) con attempt vivo -> resta riservato;
--     annullo dello staff che chiude l'unico attempt -> resta riservato finché il server non attesta l'esito SumUp,
--     poi liberato (D1, D3). Regola cambiata il 2026-11-05 (OC12b): prima l'annullo dello staff liberava subito,
--     ma il DB non può sapere se l'API ha davvero verificato SumUp.
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; a1 public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v1 := fc_test.oc_voucher(m1, 'WC-OC4A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC4B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  PERFORM fc_test.as_user(s);
  PERFORM public.kitchen_order_cancel(a1.order_id, 'test semplice');
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a1.id) = 'initiated', 'OC4 pre: annullo semplice non chiude l''attempt';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC4 annullo semplice con attempt vivo: riservato';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_voucher_events WHERE voucher_id = v1.id AND event = 'held_payment_open'), 'OC4 evento held_payment_open';
  PERFORM fc_test.cancel(a2.order_id, s);
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a2.id) = 'cancelled', 'OC4 pre: annullo verificato chiude l''attempt';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC4 annullo dello staff: riservato finché il server non attesta';
  ASSERT public.food_club_order_payment_state(a2.order_id) = 'unverified', 'OC4 stato unverified';
  PERFORM fc_test.as_service();
  ASSERT (public.kitchen_payment_attest_closed(a2.id, 'CANCELLED', '{}'::jsonb)->>'attested')::boolean, 'OC4 attestazione server';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'available', 'OC4 annullo attestato dal server: liberato';
  RAISE NOTICE 'PASS OC4 annullamento semplice/verificato';
END $$;

-- OC5 doppio checkout: il checkout FAILED resta ritentabile; il secondo avvio riusa lo stesso attempt; l'annullo
--     verificato non chiude il FAILED -> buono riservato; PAID tardivo su quel checkout -> usato una volta (D1, D6)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers;
  a public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC5');
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_fail(a.id, 'sumup_failed', '{}'::jsonb);
  a2 := fc_test.start_online(a.order_id);
  ASSERT a2.id = a.id, 'OC5 pre: nessun secondo checkout mentre il primo è ritentabile';
  PERFORM fc_test.cancel(a.order_id, s);
  ASSERT (SELECT status || '/' || failure_reason FROM public.kitchen_payments WHERE id = a.id) = 'failed/sumup_failed', 'OC5 pre: FAILED resta confermabile dopo l''annullo';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC5 annullo con checkout ritentabile: riservato';
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late-retry', '{}'::jsonb);
  ASSERT (SELECT status || '/' || COALESCE(used_order_id, '-') FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id, 'OC5 PAID tardivo: usato';
  ASSERT fc_test.oc_events(v.id, 'used') = 1, 'OC5 un solo consumo';
  RAISE NOTICE 'PASS OC5 doppio checkout';
END $$;

-- OC6 rimborso del pagamento tardivo su ordine abbandonato: il buono era consumato (D6) e, con
--     refund_recredits_voucher = false, resta usato con evento dedicato (regola D-2 esistente)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign('{"refund_recredits_voucher": false}');
  v := fc_test.oc_voucher(m, 'WC-OC6');
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id);
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_confirm(a.id, 'late', '{}'::jsonb);
  PERFORM fc_test.refund(a.order_id, s);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = a.order_id) = 'refunded', 'OC6 pre: ordine rimborsato';
  ASSERT (SELECT status || '/' || COALESCE(used_order_id, '-') FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id,
         'OC6 buono resta usato dopo il rimborso (D-2 = false)';
  ASSERT EXISTS (SELECT 1 FROM public.food_club_voucher_events WHERE voucher_id = v.id AND event = 'order_refunded_voucher_kept_used'), 'OC6 evento rimborso';
  ASSERT fc_test.oc_events(v.id, 'available') = 0, 'OC6 mai tornato disponibile';
  RAISE NOTICE 'PASS OC6 rimborso dopo pagamento tardivo';
END $$;

-- OC7 oltre 30 minuti: avviso allo staff, nessuno sblocco automatico per solo timeout (D2)
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; a1 public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v1 := fc_test.oc_voucher(m1, 'WC-OC7A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC7B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  PERFORM fc_test.oc_abandon(a1.order_id, interval '40 minutes');
  PERFORM fc_test.oc_abandon(a2.order_id, interval '6 minutes');
  -- N2 (decisione 2026-11-05): i 30 minuti partono dal primo attempt rimasto in sospeso, non dalla creazione dell'ordine.
  UPDATE public.kitchen_payments SET created_at = now() - interval '40 minutes' WHERE id = a1.id;
  UPDATE public.kitchen_payments SET created_at = now() - interval '6 minutes' WHERE id = a2.id;
  PERFORM fc_test.as_service(); PERFORM public.food_club_expire_sweep();
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC7 oltre 30 min: ancora riservato (niente sblocco a tempo)';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC7 sotto 30 min: riservato';
  PERFORM fc_test.as_user(s);
  ASSERT EXISTS (SELECT 1 FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a1.order_id), 'OC7 avviso staff oltre 30 min';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a2.order_id), 'OC7 nessun avviso sotto 30 min';
  PERFORM fc_test.as_user(m1);
  PERFORM fc_test.expect_error('SELECT * FROM public.food_club_staff_vouchers_on_hold(''walrus-main'')', 'not_staff_for_venue');
  RAISE NOTICE 'PASS OC7 avviso 30 minuti';
END $$;

-- OC8 sblocco manuale: staff rifiutato; manager rifiutato finché un attempt è confermabile; dopo la chiusura
--     definitiva il buono torna da solo e lo sblocco manuale non lo libera due volte (D3, D4)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager();
  v public.food_club_vouchers; a public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC8');
  a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id, interval '40 minutes');
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC8 pre: riservato';
  PERFORM fc_test.as_user(s);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'test'), 'manager_only');
  PERFORM fc_test.as_user(mg);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'test'), 'payment_still_confirmable');
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC8 rifiuto: resta riservato';
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_fail(a.id, 'sumup_cancelled', '{}'::jsonb);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'available', 'OC8 chiusura definitiva: liberato in automatico';
  PERFORM fc_test.as_user(mg);
  PERFORM public.food_club_admin_release_voucher(a.order_id, 'test bis');
  ASSERT fc_test.oc_events(v.id, 'available') = 1, 'OC8 una sola liberazione';
  RAISE NOTICE 'PASS OC8 sblocco manuale solo manager';
END $$;

-- OC9 conferma staff (passaggio al banco): buono resta sull'ordine, consumato all'incasso una volta;
--     il webhook tardivo sul checkout chiuso è rifiutato; annullo dopo il passaggio -> liberato (tutti definitivi)
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; a1 public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign();
  v1 := fc_test.oc_voucher(m1, 'WC-OC9A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC9B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_order_switch_to_counter_system(a1.order_id, m1);
  PERFORM public.kitchen_order_switch_to_counter_system(a2.order_id, m2);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC9 al banco: riservato';
  PERFORM fc_test.pay_counter(a1.order_id, s);
  ASSERT (SELECT status || '/' || COALESCE(used_order_id, '-') FROM public.food_club_vouchers WHERE id = v1.id) = 'used/' || a1.order_id, 'OC9 incasso: usato';
  PERFORM fc_test.as_service();
  PERFORM fc_test.expect_error(format('SELECT public.kitchen_payment_confirm(%L::uuid, %L, %L::jsonb)', a1.id, 'late', '{}'), 'invalid_attempt_status');
  ASSERT fc_test.oc_events(v1.id, 'used') = 1, 'OC9 un solo consumo';
  PERFORM fc_test.as_user(s); PERFORM public.kitchen_order_cancel(a2.order_id, 'non è passato al banco');
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'available', 'OC9 annullo con attempt tutti definitivi: liberato';
  RAISE NOTICE 'PASS OC9 conferma staff al banco';
END $$;

-- OC11 importo anomalo (N1), PERCORSO REALE dell'API: SumUp dice PAID con importo ≠ attempt, e
--      api/_lib/sumupPaymentResolution.js chiama kitchen_payment_fail(attempt, 'sumup_amount_mismatch', checkout).
--      L'incasso esiste su SumUp ma l'attempt è 'failed': il buono NON deve tornare disponibile né essere consumato.
--      a1: ordine già abbandonato (webhook tardivo, consegnato 2 volte). a2: ordine ancora in attesa, poi lo sweep
--      dei 5 minuti lo abbandona (nessun attempt vivo resta). Sblocco manuale rifiutato.
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; a1 public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": true}');
  v1 := fc_test.oc_voucher(m1, 'WC-OC11A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC11B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  PERFORM fc_test.oc_abandon(a1.order_id);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_fail(a1.id, 'sumup_amount_mismatch', jsonb_build_object('status', 'PAID', 'amount', a1.amount + 1, 'id', 'mismatch-1'));
  PERFORM public.kitchen_payment_fail(a1.id, 'sumup_amount_mismatch', jsonb_build_object('status', 'PAID', 'amount', a1.amount + 1, 'id', 'mismatch-1'));
  PERFORM public.kitchen_payment_fail(a2.id, 'sumup_amount_mismatch', jsonb_build_object('status', 'PAID', 'amount', a2.amount + 1, 'id', 'mismatch-2'));
  ASSERT (SELECT status || '/' || failure_reason || '/' || (raw_last_event->>'status') FROM public.kitchen_payments WHERE id = a1.id)
         = 'failed/sumup_amount_mismatch/PAID', 'OC11 pre: evidenza dell''incasso preservata (PAID nel payload)';
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = a2.order_id) = 'pending_online_payment', 'OC11 pre: ordine in attesa non diventa paid';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC11 abbandonato: buono resta riservato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC11 in attesa: buono resta riservato';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v1.id AND event = 'held_amount_mismatch') = 1, 'OC11 un solo evento anomalia (idempotente)';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = a2.order_id AND action = 'food_club_voucher_amount_mismatch'), 'OC11 anomalia staff';
  -- passo successivo reale: lo sweep dei 5 minuti non vede attempt vivi e abbandona l'ordine a2
  PERFORM fc_test.oc_abandon(a2.order_id);
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = a2.order_id) = 'payment_abandoned', 'OC11 pre: a2 abbandonato dallo sweep';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC11 a2 abbandonato: buono resta riservato';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v2.id AND event = 'held_amount_mismatch') = 1, 'OC11 a2 un solo evento anomalia';
  ASSERT fc_test.oc_events(v1.id, 'available') + fc_test.oc_events(v2.id, 'available') + fc_test.oc_events(v1.id, 'used') + fc_test.oc_events(v2.id, 'used') = 0,
         'OC11 nessun rilascio e nessun consumo';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id IN (a1.order_id, a2.order_id)), 'OC11 nessun timbro';
  PERFORM fc_test.as_user(s);
  ASSERT (SELECT h.reason FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a1.order_id) = 'amount_mismatch', 'OC11 segnalato allo staff subito';
  ASSERT (SELECT h.reason FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a2.order_id) = 'amount_mismatch', 'OC11 a2 segnalato allo staff subito';
  PERFORM fc_test.as_user(mg);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_admin_release_voucher(%L, %L)', a1.order_id, 'test'), 'payment_succeeded_needs_reconciliation');
  PERFORM fc_test.expect_error(format('SELECT public.food_club_admin_release_voucher(%L, %L)', a2.order_id, 'test'), 'payment_succeeded_needs_reconciliation');
  RAISE NOTICE 'PASS OC11 importo anomalo (percorso reale)';
END $$;
-- OC11b importo anomalo, difesa in profondità: charge registrato succeeded con importo ≠ totale -> buono resta riservato, anomalia, niente timbro, sblocco
--      manuale rifiutato; vale sia su ordine abbandonato sia su ordine ancora in attesa. Webhook duplicato idempotente.
DO $$ DECLARE m1 uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager();
  v1 public.food_club_vouchers; v2 public.food_club_vouchers; a1 public.kitchen_payments; a2 public.kitchen_payments; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": true}');
  v1 := fc_test.oc_voucher(m1, 'WC-OC11A'); a1 := fc_test.oc_online_with_attempt(m1, v1.id);
  v2 := fc_test.oc_voucher(m2, 'WC-OC11B'); a2 := fc_test.oc_online_with_attempt(m2, v2.id);
  UPDATE public.kitchen_payments SET amount = amount + 1 WHERE id IN (a1.id, a2.id);  -- SumUp conferma un importo diverso
  PERFORM fc_test.oc_abandon(a1.order_id);
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_confirm(a1.id, 'mismatch-1', '{}'::jsonb);
  PERFORM public.kitchen_payment_confirm(a1.id, 'mismatch-1', '{}'::jsonb);
  PERFORM public.kitchen_payment_confirm(a2.id, 'mismatch-2', '{}'::jsonb);
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a1.id) = 'succeeded', 'OC11b pre: incasso preservato come succeeded';
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = a2.order_id) = 'pending_online_payment', 'OC11b pre: ordine in attesa non diventa paid';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v1.id) = 'reserved', 'OC11b abbandonato: buono resta riservato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC11b in attesa: buono resta riservato';
  ASSERT (SELECT count(*) FROM public.food_club_voucher_events WHERE voucher_id = v1.id AND event = 'held_amount_mismatch') = 1, 'OC11b un solo evento anomalia (idempotente)';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = a2.order_id AND action = 'food_club_voucher_amount_mismatch'), 'OC11b anomalia staff';
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id IN (a1.order_id, a2.order_id)), 'OC11b nessun timbro';
  PERFORM fc_test.as_user(s);
  ASSERT (SELECT h.reason FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a1.order_id) = 'amount_mismatch', 'OC11b segnalato allo staff subito';
  PERFORM fc_test.as_user(mg);
  PERFORM fc_test.expect_error(format('SELECT public.food_club_admin_release_voucher(%L, %L)', a1.order_id, 'test'), 'payment_succeeded_needs_reconciliation');
  RAISE NOTICE 'PASS OC11b importo anomalo (succeeded)';
END $$;

-- OC12 privilegi a runtime (ruoli Postgres reali anon/authenticated + claim): EXECUTE, SECURITY DEFINER, RLS
DO $$ DECLARE m uuid := fc_test.new_member(); x uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager();
  v public.food_club_vouchers; a public.kitchen_payments; f text; r text; n int;
  internal text[] := ARRAY['public.food_club_attempt_confirmable(public.kitchen_payments)', 'public.food_club_attempt_captured_mismatch(public.kitchen_payments)',
    'public.food_club_order_payment_state(text)', 'public.food_club_settle_unpaid_order(text,text)', 'public.food_club_settle_paid_order(text,text)',
    'public.kitchen_orders_food_club_on_closed_unpaid()', 'public.kitchen_payments_food_club_on_attempt_change()'];
  staff_rpc text[] := ARRAY['public.food_club_staff_vouchers_on_hold(text,integer)', 'public.food_club_admin_release_voucher(text,text)']; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC12'); a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.oc_abandon(a.order_id);
  -- 1) catalogo EXECUTE
  FOREACH f IN ARRAY internal LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'OC12 anon EXECUTE ' || f;
    ASSERT NOT has_function_privilege('authenticated', f, 'EXECUTE'), 'OC12 authenticated EXECUTE ' || f;
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) e
                        WHERE p.oid = f::regprocedure AND e.grantee = 0 AND e.privilege_type = 'EXECUTE'), 'OC12 PUBLIC EXECUTE ' || f;
  END LOOP;
  FOREACH f IN ARRAY staff_rpc LOOP
    ASSERT NOT has_function_privilege('anon', f, 'EXECUTE'), 'OC12 anon EXECUTE ' || f;
    ASSERT has_function_privilege('authenticated', f, 'EXECUTE'), 'OC12 authenticated deve poter chiamare ' || f;
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) e
                        WHERE p.oid = f::regprocedure AND e.grantee = 0 AND e.privilege_type = 'EXECUTE'), 'OC12 PUBLIC EXECUTE ' || f;
  END LOOP;
  -- 2) SECURITY DEFINER Food Club: owner postgres e search_path fissato
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prosecdef AND p.proname LIKE '%food_club%'
     AND (p.proowner <> 'postgres'::regrole OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  ASSERT n = 0, 'OC12 SECURITY DEFINER senza owner postgres o senza search_path: ' || n;
  -- 3) runtime anon
  FOREACH f IN ARRAY ARRAY[format('SELECT public.food_club_order_payment_state(%L)', a.order_id),
                           format('SELECT public.food_club_settle_unpaid_order(%L, %L)', a.order_id, 'x'),
                           'SELECT public.food_club_attempt_confirmable(NULL::public.kitchen_payments)',
                           format('SELECT * FROM public.food_club_staff_vouchers_on_hold(%L)', 'walrus-main'),
                           format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'test')] LOOP
    r := fc_test.oc_try('anon', NULL, f);
    ASSERT r LIKE 'permission denied%', 'OC12 anon: atteso permission denied, ottenuto ' || r || ' per ' || f;
  END LOOP;
  -- 4) runtime authenticated (cliente estraneo x e cliente proprietario m): funzioni interne negate
  FOREACH f IN ARRAY ARRAY[format('SELECT public.food_club_order_payment_state(%L)', a.order_id),
                           format('SELECT public.food_club_settle_unpaid_order(%L, %L)', a.order_id, 'x'),
                           'SELECT public.food_club_attempt_captured_mismatch(NULL::public.kitchen_payments)'] LOOP
    r := fc_test.oc_try('authenticated', x, f);  ASSERT r LIKE 'permission denied%', 'OC12 cliente x: ' || r;
    r := fc_test.oc_try('authenticated', m, f);  ASSERT r LIKE 'permission denied%', 'OC12 cliente m: ' || r;
  END LOOP;
  r := fc_test.oc_try('authenticated', m, format('SELECT * FROM public.food_club_staff_vouchers_on_hold(%L)', 'walrus-main'));
  ASSERT r <> 'OK', 'OC12 cliente non vede la lista staff';
  r := fc_test.oc_try('authenticated', m, format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'mio buono'));
  ASSERT r <> 'OK', 'OC12 cliente non sblocca il proprio buono';
  -- 5) RLS: il cliente non può liberare il buono né falsificare il ledger scrivendo le tabelle
  r := fc_test.oc_try('authenticated', m, format('UPDATE public.food_club_vouchers SET status = %L, reserved_order_id = NULL WHERE id = %L', 'available', v.id));
  r := r || ' | ' || fc_test.oc_try('authenticated', m, format('INSERT INTO public.food_club_voucher_events (voucher_id, from_status, to_status, event, order_id, actor) VALUES (%L, %L, %L, %L, %L, %L)', v.id, 'reserved', 'available', 'released', a.order_id, 'system'));
  r := r || ' | ' || fc_test.oc_try('authenticated', m, format('UPDATE public.kitchen_payments SET failure_reason = %L WHERE id = %L', 'sumup_expired', a.id));
  r := r || ' | ' || fc_test.oc_try('authenticated', m, format('SELECT public.kitchen_payment_fail(%L::uuid, %L)', a.id, 'sumup_expired'));
  RAISE NOTICE 'OC12 tentativi cliente su tabelle/ledger: %', r;
  ASSERT (SELECT status || '/' || reserved_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'reserved/' || a.order_id, 'OC12 buono intatto dopo i tentativi del cliente';
  ASSERT (SELECT failure_reason FROM public.kitchen_payments WHERE id = a.id) = 'abandoned_timeout', 'OC12 attempt intatto dopo i tentativi del cliente';
  ASSERT fc_test.oc_events(v.id, 'available') = 0, 'OC12 nessun evento available falsificato';
  -- 6) staff e manager
  r := fc_test.oc_try('authenticated', s, format('SELECT * FROM public.food_club_staff_vouchers_on_hold(%L, 0)', 'walrus-main'));
  ASSERT r = 'OK', 'OC12 staff legge la lista: ' || r;
  r := fc_test.oc_try('authenticated', s, format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'staff prova'));
  ASSERT r <> 'OK' AND r NOT LIKE 'payment_%', 'OC12 staff semplice rifiutato prima dei controlli di pagamento: ' || r;
  r := fc_test.oc_try('authenticated', s, format('SELECT * FROM public.food_club_staff_vouchers_on_hold(%L)', 'altro-locale'));
  ASSERT r <> 'OK', 'OC12 staff di walrus-main non legge un altro locale';
  r := fc_test.oc_try('authenticated', mg, format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'manager prova'));
  ASSERT r LIKE '%payment_still_confirmable%', 'OC12 manager rifiutato con attempt confermabile: ' || r;
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC12 buono ancora riservato';
  RAISE NOTICE 'PASS OC12 privilegi runtime anon/authenticated/staff/manager';
END $$;

-- OC12b staff NON manager su attempt ancora vivo: kitchen_payment_fail(..., 'sumup_expired') non deve aggirare D4 (sblocco solo manager)
DO $$ DECLARE m uuid := fc_test.new_member(); s uuid := fc_test.new_staff(); v public.food_club_vouchers; a public.kitchen_payments; r text; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC12B'); a := fc_test.oc_online_with_attempt(m, v.id);  -- attempt 'initiated', checkout SumUp aperto
  r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_fail(%L::uuid, %L)', a.id, 'sumup_expired'));
  RAISE NOTICE 'OC12b staff kitchen_payment_fail(sumup_expired) su attempt vivo: %', r;
  PERFORM fc_test.oc_abandon(a.order_id);
  RAISE NOTICE 'OC12b dopo lo sweep: attempt %, buono %', (SELECT status || '/' || COALESCE(failure_reason, '-') FROM public.kitchen_payments WHERE id = a.id),
    (SELECT status FROM public.food_club_vouchers WHERE id = v.id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved',
         'OC12b staff non-manager libera il buono con un checkout SumUp ancora pagabile (bypass di D4)';
  RAISE NOTICE 'PASS OC12b nessun bypass staff';
END $$;

-- OC13 linea del tempo: ordine con buono a T0, sweep a T+5 (abbandono), PAID a T+10, checkout valido fino a T+15.
--      Ramo A: pagato a T+10. Ramo B: mai pagato, SumUp FAILED a T+15, EXPIRED a T+17.
DO $$ DECLARE m uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v public.food_club_vouchers; w public.food_club_vouchers; a public.kitchen_payments; b public.kitchen_payments; o public.kitchen_orders; r text; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": true}');
  v := fc_test.oc_voucher(m, 'WC-OC13A'); a := fc_test.oc_online_with_attempt(m, v.id);
  w := fc_test.oc_voucher(m2, 'WC-OC13B'); b := fc_test.oc_online_with_attempt(m2, w.id);
  SELECT * INTO o FROM public.kitchen_orders WHERE id = a.order_id;
  ASSERT o.discount_amount = v.value AND a.amount = o.total, 'OC13 T0: sconto applicato e attempt = totale scontato';
  -- T+5: sweep
  UPDATE public.kitchen_payments SET created_at = now() - interval '5 minutes 1 second' WHERE id IN (a.id, b.id);
  PERFORM fc_test.oc_abandon(a.order_id, interval '5 minutes 1 second');
  PERFORM fc_test.oc_abandon(b.order_id, interval '5 minutes 1 second');
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id IN (v.id, w.id) GROUP BY status) = 'reserved', 'OC13 T+5: entrambi riservati';
  ASSERT public.food_club_order_payment_state(a.order_id) = 'open', 'OC13 T+5: stato open';
  -- T+10: il tempo passa (retrodato di altri 5 minuti)
  UPDATE public.kitchen_payments SET created_at = created_at - interval '5 minutes' WHERE id IN (a.id, b.id);
  UPDATE public.kitchen_orders SET created_at = created_at - interval '5 minutes' WHERE id IN (a.order_id, b.order_id);
  PERFORM fc_test.as_user(s);
  ASSERT NOT EXISTS (SELECT 1 FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id IN (a.order_id, b.order_id)), 'OC13 T+10: nessun avviso prima dei 30 min';
  ASSERT (SELECT h.reason || '/' || h.attempts_open FROM public.food_club_staff_vouchers_on_hold('walrus-main', 0) h WHERE h.order_id = a.order_id) = 'payment_pending/1', 'OC13 T+10: visibile come pending';
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_confirm(a.id, 'paid-t10', jsonb_build_object('status', 'PAID', 'amount', a.amount));
  -- Ramo A dopo il PAID
  ASSERT (SELECT status || '/' || COALESCE(payment_status, '-') FROM public.kitchen_orders WHERE id = a.order_id) LIKE 'payment_abandoned/%'
     AND (SELECT payment_status FROM public.kitchen_orders WHERE id = a.order_id) IS DISTINCT FROM 'paid', 'OC13 A: ordine resta abbandonato, non pagato';
  ASSERT (SELECT status || '/' || amount FROM public.kitchen_payments WHERE id = a.id) = 'succeeded/' || o.total, 'OC13 A: incasso registrato con importo scontato';
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id, 'OC13 A: buono consumato';
  ASSERT fc_test.stamps(m) = 0, 'OC13 A: nessun timbro finché l''ordine non è pagato';
  -- T+15/17: riverifiche tardive sul checkout già pagato non declassano nulla
  BEGIN PERFORM public.kitchen_payment_fail(a.id, 'sumup_expired', '{}'::jsonb); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  ASSERT r = 'invalid_attempt_status', 'OC13 A: fail dopo PAID rifiutato: ' || r;
  PERFORM public.kitchen_payment_confirm(a.id, 'paid-t10', '{}'::jsonb);
  ASSERT fc_test.oc_events(v.id, 'used') = 1 AND fc_test.oc_events(v.id, 'available') = 0, 'OC13 A: un solo used, mai available';
  -- lo staff rimette in coda l'ordine pagato: timbro una sola volta (D-3 acceso), buono invariato
  PERFORM fc_test.as_user(s); SET LOCAL ROLE authenticated;
  UPDATE public.kitchen_orders SET status = 'received', payment_status = 'paid' WHERE id = a.order_id;
  UPDATE public.kitchen_orders SET status = 'preparing' WHERE id = a.order_id;
  RESET ROLE;
  ASSERT fc_test.stamps(m) = 1, 'OC13 A: timbro dopo la regolarizzazione, una volta';
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id, 'OC13 A: buono invariato';
  -- Ramo B: T+15 SumUp FAILED (ancora pagabile), T+17 EXPIRED (definitivo)
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_fail(b.id, 'sumup_failed', '{}'::jsonb);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = w.id) = 'reserved', 'OC13 B T+15: FAILED, resta riservato';
  PERFORM public.kitchen_payment_fail(b.id, 'sumup_expired', '{}'::jsonb);
  ASSERT (SELECT status || '/' || COALESCE(reserved_order_id, '-') FROM public.food_club_vouchers WHERE id = w.id) = 'available/-', 'OC13 B T+17: EXPIRED, restituito';
  ASSERT (SELECT expires_at FROM public.food_club_vouchers WHERE id = w.id) = w.expires_at, 'OC13 B: scadenza originale';
  BEGIN PERFORM public.kitchen_payment_confirm(b.id, 'paid-after-expiry', '{}'::jsonb); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  ASSERT r = 'invalid_attempt_status', 'OC13 B: PAID dopo EXPIRED rifiutato dal ledger: ' || r;
  ASSERT fc_test.stamps(m2) = 0 AND fc_test.oc_events(w.id, 'used') = 0, 'OC13 B: niente timbro, niente consumo';
  RAISE NOTICE 'PASS OC13 linea del tempo 5/10/15';
END $$;

-- OC14 [OC12b] staff e manager con ruolo Postgres reale: nessun esito terminale dichiarabile, motivi falsificati inutili,
--      segnalazione senza effetti, annullo/chiusura diretti senza verifica SumUp -> buono trattenuto e incasso tardivo registrato,
--      incasso al banco preservato
DO $$ DECLARE m uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); m3 uuid := fc_test.new_member();
  s uuid := fc_test.new_staff(); mg uuid := fc_test.new_manager();
  v public.food_club_vouchers; v2 public.food_club_vouchers; v3 public.food_club_vouchers;
  a public.kitchen_payments; b public.kitchen_payments; c public.kitchen_payments; f text; r text; BEGIN
  PERFORM fc_test.activate_campaign('{"stamp_on_voucher_order": true}');
  v := fc_test.oc_voucher(m, 'WC-OC14A'); a := fc_test.oc_online_with_attempt(m, v.id);
  -- a) kitchen_payment_fail con ogni motivo, da staff e da manager: sempre rifiutata, attempt intatto
  FOREACH f IN ARRAY ARRAY['sumup_expired', 'sumup_cancelled', 'sumup_amount_mismatch', 'abandoned_timeout', 'sumup_failed',
                           'staff_closed_for_counter', 'SUMUP_EXPIRED', 'sumup_expired ', 'qualsiasi'] LOOP
    r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_fail(%L::uuid, %L)', a.id, f));
    ASSERT r LIKE '%staff_cannot_fail_payment_use_report%', 'OC14 staff fail(' || f || '): ' || r;
    r := fc_test.oc_try('authenticated', mg, format('SELECT public.kitchen_payment_fail(%L::uuid, %L, %L::jsonb)', a.id, f, '{"status":"EXPIRED"}'));
    ASSERT r LIKE '%staff_cannot_fail_payment_use_report%', 'OC14 manager fail(' || f || '): ' || r;
  END LOOP;
  ASSERT (SELECT status || '/' || COALESCE(failure_reason, '-') FROM public.kitchen_payments WHERE id = a.id) = 'initiated/-', 'OC14 attempt intatto';
  -- b) segnalazione: solo log
  r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_report_problem(%L::uuid, %L)', a.id, 'sumup_expired: cliente dice scaduto'));
  ASSERT r = 'OK', 'OC14 segnalazione staff: ' || r;
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a.id) = 'initiated', 'OC14 segnalazione non cambia l''attempt';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC14 segnalazione non tocca il buono';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE action = 'payment_problem_reported' AND (metadata->>'payment_id')::uuid = a.id
                   AND (metadata->>'untrusted_note')::boolean), 'OC14 segnalazione registrata come dato non attendibile';
  -- c) attestazione e tabella di provenienza fuori portata
  r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_attest_closed(%L::uuid, %L)', a.id, 'EXPIRED'));
  ASSERT r LIKE 'permission denied%', 'OC14 staff attest: ' || r;
  r := fc_test.oc_try('authenticated', mg, format('SELECT public.kitchen_payment_attest_closed(%L::uuid, %L)', a.id, 'CANCELLED'));
  ASSERT r LIKE 'permission denied%', 'OC14 manager attest: ' || r;
  FOREACH f IN ARRAY ARRAY['SELECT * FROM public.kitchen_payment_closure_attestations',
      format('INSERT INTO public.kitchen_payment_closure_attestations (payment_id, order_id, venue_id, from_status, to_status, attested_at, attested_provider_status) VALUES (%L, %L, %L, %L, %L, now(), %L)', a.id, a.order_id, 'walrus-main', 'initiated', 'cancelled', 'EXPIRED'),
      'UPDATE public.kitchen_payment_closure_attestations SET attested_at = now(), attested_provider_status = ''EXPIRED''',
      format('SELECT public.kitchen_payment_record_closure_provenance(p, p) FROM public.kitchen_payments p WHERE p.id = %L', a.id)] LOOP
    r := fc_test.oc_try('authenticated', mg, f);
    ASSERT r LIKE 'permission denied%', 'OC14 manager su provenienza: ' || r || ' per ' || left(f, 60);
  END LOOP;
  r := fc_test.oc_try('authenticated', s, format('UPDATE public.kitchen_payments SET status = %L, failure_reason = %L WHERE id = %L', 'failed', 'sumup_expired', a.id));
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a.id) = 'initiated', 'OC14 UPDATE diretto dello staff senza effetto (RLS): ' || r;
  -- d) annullo diretto dello staff (stessa RPC dell'API, ma senza verifica SumUp): buono trattenuto, sblocco negato
  r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_order_cancel_with_payment_attempt(%L, %L)', a.order_id, 'sumup_expired verificato'));
  ASSERT r = 'OK', 'OC14 annullo staff (contratto API invariato): ' || r;
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = a.id) = 'cancelled', 'OC14 pre: attempt cancelled';
  ASSERT (SELECT closed_role || '/' || closed_by || '/' || (attested_at IS NULL) FROM public.kitchen_payment_closure_attestations WHERE payment_id = a.id)
         = 'authenticated/' || s || '/true', 'OC14 provenienza registrata, non attestata';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC14 annullo staff: buono trattenuto';
  ASSERT public.food_club_order_payment_state(a.order_id) = 'unverified', 'OC14 stato unverified';
  PERFORM fc_test.expect_error(format('SELECT fc_test.order(%L, %L, %L, %L)', m, '[{"item_id":"item-010","quantity":1}]', 'counter', v.id), 'voucher_not_available');
  PERFORM fc_test.as_user(s);
  ASSERT (SELECT h.reason FROM public.food_club_staff_vouchers_on_hold('walrus-main') h WHERE h.order_id = a.order_id) = 'closure_unverified', 'OC14 lista staff subito';
  r := fc_test.oc_try('authenticated', mg, format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'manager prova'));
  ASSERT r LIKE '%payment_closure_unverified%', 'OC14 manager non sblocca senza verifica server: ' || r;
  -- e) il cliente paga lo stesso: l'incasso entra nel ledger, buono consumato una volta, ordine resta annullato
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_confirm(a.id, 'paid-after-staff-cancel', jsonb_build_object('status', 'PAID', 'amount', a.amount));
  PERFORM public.kitchen_payment_confirm(a.id, 'paid-after-staff-cancel', '{}'::jsonb);
  ASSERT (SELECT status || '/' || amount FROM public.kitchen_payments WHERE id = a.id) = 'succeeded/' || a.amount, 'OC14 incasso registrato';
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = a.order_id) = 'cancelled', 'OC14 ordine resta annullato (mai cancelled+paid)';
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = a.order_id AND action = 'payment_confirmed_after_cancel'), 'OC14 rimborso da gestire segnalato';
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v.id) = 'used/' || a.order_id, 'OC14 buono consumato';
  ASSERT fc_test.oc_events(v.id, 'used') = 1 AND fc_test.oc_events(v.id, 'available') = 0, 'OC14 un used, zero available';
  ASSERT fc_test.stamps(m) = 0, 'OC14 nessun timbro su ordine annullato';
  -- f) chiusura diretta per il banco senza verifica, poi sweep: buono trattenuto; PAID tardivo registrato
  v2 := fc_test.oc_voucher(m2, 'WC-OC14B'); b := fc_test.oc_online_with_attempt(m2, v2.id);
  r := fc_test.oc_try('authenticated', s, format('SELECT public.kitchen_payment_attempt_close_unpaid(%L::uuid, %L)', b.id, 'cliente dice annullato'));
  ASSERT r = 'OK', 'OC14 close_unpaid staff: ' || r;
  PERFORM fc_test.oc_abandon(b.order_id);
  ASSERT (SELECT status FROM public.kitchen_orders WHERE id = b.order_id) = 'payment_abandoned', 'OC14 pre: abbandonato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'reserved', 'OC14 chiusura staff + sweep: buono trattenuto';
  PERFORM public.kitchen_payment_confirm(b.id, 'paid-after-close', '{}'::jsonb);
  ASSERT (SELECT status FROM public.kitchen_payments WHERE id = b.id) = 'succeeded', 'OC14 PAID dopo close_unpaid registrato';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'used', 'OC14 buono consumato dopo close_unpaid';
  -- g) passaggio al banco legittimo: chiusura + incasso al banco = buono usato e timbro; un PAID SumUp tardivo resta evidente
  v3 := fc_test.oc_voucher(m3, 'WC-OC14C'); c := fc_test.oc_online_with_attempt(m3, v3.id);
  PERFORM fc_test.as_user(s); PERFORM public.kitchen_payment_attempt_close_unpaid(c.id, 'passa al banco');
  SET LOCAL ROLE authenticated;
  UPDATE public.kitchen_orders SET status = 'pending_counter_payment' WHERE id = c.order_id;  -- lo staff porta l'ordine al banco
  RESET ROLE;
  PERFORM fc_test.pay_counter(c.order_id, s);
  ASSERT (SELECT payment_status FROM public.kitchen_orders WHERE id = c.order_id) = 'paid', 'OC14 banco: ordine pagato';
  ASSERT (SELECT status || '/' || used_order_id FROM public.food_club_vouchers WHERE id = v3.id) = 'used/' || c.order_id, 'OC14 banco: buono usato';
  ASSERT fc_test.stamps(m3) = 1, 'OC14 banco: timbro';
  PERFORM fc_test.as_service();
  PERFORM public.kitchen_payment_confirm(c.id, 'sumup-late-double', '{}'::jsonb);
  ASSERT EXISTS (SELECT 1 FROM public.kitchen_action_log WHERE order_id = c.order_id AND action = 'payment_confirm_lost_race'
                   AND (metadata->>'losing_attempt_id')::uuid = c.id), 'OC14 doppio incasso SumUp+banco evidenziato, non ignorato';
  ASSERT (SELECT count(*) FROM public.kitchen_payments WHERE order_id = c.order_id AND direction = 'charge' AND status = 'succeeded') = 1, 'OC14 un solo charge succeeded';
  ASSERT fc_test.stamps(m3) = 1 AND fc_test.oc_events(v3.id, 'used') = 1, 'OC14 nessun doppio timbro/consumo';
  RAISE NOTICE 'PASS OC14 staff/manager: nessun esito terminale, buono trattenuto, incassi registrati, banco preservato';
END $$;

-- OC15 [OC12b] cliente e anon (ruoli Postgres reali): nessuna RPC di pagamento o di attestazione utilizzabile
DO $$ DECLARE m uuid := fc_test.new_member(); x uuid := fc_test.new_member(); v public.food_club_vouchers; a public.kitchen_payments; f text; r text; u uuid; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC15'); a := fc_test.oc_online_with_attempt(m, v.id);
  FOREACH f IN ARRAY ARRAY[
      format('SELECT public.kitchen_payment_fail(%L::uuid, %L)', a.id, 'sumup_expired'),
      format('SELECT public.kitchen_payment_fail(%L::uuid, %L)', a.id, 'sumup_cancelled'),
      format('SELECT public.kitchen_order_cancel_with_payment_attempt(%L, %L)', a.order_id, 'sumup_expired'),
      format('SELECT public.kitchen_payment_attempt_close_unpaid(%L::uuid, %L)', a.id, 'x'),
      format('SELECT public.kitchen_payment_report_problem(%L::uuid, %L)', a.id, 'sumup_expired'),
      format('SELECT public.kitchen_payment_attest_closed(%L::uuid, %L)', a.id, 'EXPIRED'),
      format('SELECT public.kitchen_payment_confirm(%L::uuid, %L)', a.id, 'fake'),
      format('SELECT public.food_club_admin_release_voucher(%L, %L)', a.order_id, 'mio buono'),
      'SELECT * FROM public.kitchen_payment_closure_attestations',
      format('INSERT INTO public.kitchen_payment_closure_attestations (payment_id, order_id, venue_id, from_status, to_status) VALUES (%L, %L, %L, %L, %L)', a.id, a.order_id, 'walrus-main', 'initiated', 'cancelled')] LOOP
    FOREACH u IN ARRAY ARRAY[m, x] LOOP
      r := fc_test.oc_try('authenticated', u, f);
      ASSERT r <> 'OK', 'OC15 cliente riuscito: ' || left(f, 70);
    END LOOP;
    r := fc_test.oc_try('anon', NULL, f);
    ASSERT r <> 'OK', 'OC15 anon riuscito: ' || left(f, 70);
  END LOOP;
  -- claim service_role falsificati con ruolo Postgres authenticated: l'attestazione resta negata dal GRANT
  r := fc_test.oc_try('authenticated', m, 'SELECT 1');
  PERFORM fc_test.as_user(m, 'service_role');
  BEGIN SET LOCAL ROLE authenticated;
    PERFORM public.kitchen_payment_attest_closed(a.id, 'EXPIRED'); r := 'OK';
  EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  RESET ROLE;
  ASSERT r LIKE 'permission denied%', 'OC15 claim falsificati: attest negata dal GRANT: ' || r;
  ASSERT (SELECT status || '/' || COALESCE(failure_reason, '-') FROM public.kitchen_payments WHERE id = a.id) = 'initiated/-', 'OC15 attempt intatto';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC15 buono intatto';
  ASSERT NOT EXISTS (SELECT 1 FROM public.kitchen_payment_closure_attestations WHERE payment_id = a.id), 'OC15 nessuna provenienza falsificata';
  RAISE NOTICE 'PASS OC15 cliente/anon negati';
END $$;

-- OC16 [OC12b] attestazione server: solo esiti SumUp terminali, idempotente; la ri-verifica server attesta;
--      chiusura senza claim (console/cron) = non verificata; dopo l'attestazione un PAID resta rifiutato come prima
DO $$ DECLARE m uuid := fc_test.new_member(); m2 uuid := fc_test.new_member(); m3 uuid := fc_test.new_member(); s uuid := fc_test.new_staff();
  v public.food_club_vouchers; v2 public.food_club_vouchers; v3 public.food_club_vouchers;
  a public.kitchen_payments; b public.kitchen_payments; c public.kitchen_payments; r text; f text; BEGIN
  PERFORM fc_test.activate_campaign();
  v := fc_test.oc_voucher(m, 'WC-OC16A'); a := fc_test.oc_online_with_attempt(m, v.id);
  PERFORM fc_test.as_service();
  BEGIN PERFORM public.kitchen_payment_attest_closed(a.id, 'EXPIRED'); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  ASSERT r = 'attempt_still_confirmable', 'OC16 attempt vivo non attestabile: ' || r;
  PERFORM fc_test.cancel(a.order_id, s);
  PERFORM fc_test.as_service();
  FOREACH f IN ARRAY ARRAY['FAILED', 'PAID', 'PENDING', 'expired', 'qualsiasi'] LOOP
    BEGIN PERFORM public.kitchen_payment_attest_closed(a.id, f); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
    ASSERT r = 'provider_status_not_terminal', 'OC16 attest ' || f || ': ' || r;
  END LOOP;
  BEGIN PERFORM public.kitchen_payment_attest_closed(a.id, NULL); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  ASSERT r = 'provider_status_not_terminal', 'OC16 attest NULL: ' || r;
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'reserved', 'OC16 ancora riservato';
  ASSERT (public.kitchen_payment_attest_closed(a.id, 'CANCELLED', '{"status":"CANCELLED"}'::jsonb)->>'attested')::boolean, 'OC16 attest CANCELLED';
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v.id) = 'available', 'OC16 attestato: restituito';
  ASSERT NOT (public.kitchen_payment_attest_closed(a.id, 'CANCELLED')->>'attested')::boolean, 'OC16 seconda attestazione: nulla da fare';
  ASSERT fc_test.oc_events(v.id, 'available') = 1, 'OC16 un solo rilascio';
  BEGIN PERFORM public.kitchen_payment_confirm(a.id, 'paid-after-attest', '{}'::jsonb); r := 'OK'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  ASSERT r = 'invalid_attempt_status', 'OC16 dopo attestazione SumUp CANCELLED un PAID resta rifiutato (comportamento esistente): ' || r;
  -- ri-verifica server su un attempt chiuso dallo staff: kitchen_payment_fail service_role attesta
  v2 := fc_test.oc_voucher(m2, 'WC-OC16B'); b := fc_test.oc_online_with_attempt(m2, v2.id);
  PERFORM fc_test.as_user(s); PERFORM public.kitchen_payment_attempt_close_unpaid(b.id, 'banco');
  PERFORM fc_test.as_service(); PERFORM public.kitchen_payment_fail(b.id, 'sumup_expired', '{"status":"EXPIRED"}'::jsonb);
  ASSERT (SELECT attested_provider_status FROM public.kitchen_payment_closure_attestations WHERE payment_id = b.id) = 'SERVER_RECHECK', 'OC16 ri-verifica server attesta';
  PERFORM fc_test.oc_abandon(b.order_id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v2.id) = 'available', 'OC16 attestato dal server + ordine chiuso: restituito';
  -- chiusura senza claim (console SQL, job senza JWT): trattata come non verificata
  v3 := fc_test.oc_voucher(m3, 'WC-OC16C'); c := fc_test.oc_online_with_attempt(m3, v3.id);
  PERFORM set_config('request.jwt.claims', '', false);
  UPDATE public.kitchen_payments SET status = 'cancelled', updated_at = now() WHERE id = c.id;
  ASSERT (SELECT closed_role FROM public.kitchen_payment_closure_attestations WHERE payment_id = c.id) = 'none', 'OC16 chiusura senza claim registrata';
  PERFORM fc_test.oc_abandon(c.order_id);
  ASSERT (SELECT status FROM public.food_club_vouchers WHERE id = v3.id) = 'reserved', 'OC16 chiusura senza claim: buono trattenuto';
  RAISE NOTICE 'PASS OC16 attestazione server';
END $$;
