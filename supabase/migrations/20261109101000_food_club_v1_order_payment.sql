-- WALRUS FOOD CLUB V1 — F2 logica ordini e pagamenti (buoni, timbri, inviti).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros.
-- Riferimenti: FASE3-piano-tecnico.md §3 (stati buono, matrice ordine x buono), audit-codice.md §3, §6, §7, §10.
--
-- Scelta architetturale: le RPC di pagamento esistenti (kitchen_payment_confirm, kitchen_payment_record_counter,
-- kitchen_order_cancel*, kitchen_order_mark_payment_abandoned, refund) NON vengono riscritte. Il Club si aggancia con
-- trigger su kitchen_orders, così OGNI percorso che cambia lo stato (RPC, API, UPDATE staff) passa dalle stesse regole
-- nella STESSA transazione:
--   * payment_status -> 'paid'  : buono RISERVATO -> UTILIZZATO, timbro, premio invito (solo se esiste un charge
--                                 'succeeded' con importo = total: un 'paid' scritto a mano dallo staff non conta).
--   * status -> cancelled / payment_abandoned senza 'paid': buono RISERVATO -> DISPONIBILE (o SCADUTO), stessa scadenza.
--   * payment_status -> 'refunded': timbro revocato; buono generato da quella tessera revocato se ancora non usato;
--                                 buono usato su quell'ordine riaccreditato solo se la campagna lo prevede (D-2).
--   * guardia BEFORE UPDATE: total / discount_amount / venue_id bloccati se l'ordine ha un buono riservato o usato.
-- Un errore del Club NON deve mai far fallire un pagamento: il blocco "paid" cattura le eccezioni, le registra in
-- kitchen_action_log ('food_club_error') e lascia il buono RISERVATO (stato sicuro: non riutilizzabile).
--
-- PASSO 1 C-T (2026-11-08, decisioni D-P1/D-P2/D-P3 approvate da Eros). Integra P1 FIX-1/2/3 e R-b.
--   * Consumo unico (food_club_consume_on_charge): il buono riservato diventa UTILIZZATO appena l'ordine ha un charge
--     'succeeded', anche se l'ordine è annullato/abbandonato (PAID tardivo K2/R3). Trigger anche su kitchen_payments.
--   * Trattenuta: annullo/abbandono di un ordine con una riga charge online -> buono resta RISERVATO
--     ('held_until_checkout_expiry'). Rilascio subito solo per il banco puro senza incasso. Il rilascio dopo la
--     verifica dei checkout NON è qui (Passi 2-3).
--   * Campagna spenta: nessuna nuova prenotazione ('voucher_campaign_inactive').
--   * Rimborso tardivo (D-P2): nessun riaccredito automatico del buono.
--   * Lock compatibile K4: righe charge (chiamante) -> riga ordine -> buono -> tessera. Nessuna funzione
--     kitchen_payment_* / kitchen_order_* / kitchen_reconciliation_* ridefinita (test testuale).
--   * Anomalie Club (D-P3): solo kitchen_action_log, mostrate dalla pagina staff Food Club; K6 invariato.

-- ---------------------------------------------------------------------------------------------------
-- 1) Utilità
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_active_campaign(p_venue_id text)
RETURNS public.food_club_campaigns
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.* FROM public.food_club_campaigns c
   WHERE c.venue_id = p_venue_id AND c.active
     AND (c.starts_at IS NULL OR c.starts_at <= now())
     AND (c.ends_at IS NULL OR c.ends_at > now())
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.food_club_new_voucher_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
BEGIN
  LOOP
    v_bytes := extensions.gen_random_bytes(6);
    v_code := 'WC-';
    FOR i IN 0..5 LOOP
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_log_voucher(p_voucher_id uuid, p_from text, p_to text, p_event text,
  p_order_id text, p_actor text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.food_club_voucher_events (voucher_id, from_status, to_status, event, order_id, actor, metadata)
  VALUES (p_voucher_id, p_from, p_to, p_event, p_order_id, COALESCE(p_actor, 'system'), COALESCE(p_metadata, '{}'::jsonb))
$$;

-- Messaggio in app (+ coda push). Idempotente su (utente, tipo, riferimento).
CREATE OR REPLACE FUNCTION public.food_club_enqueue_message(p_user_id uuid, p_kind text, p_ref text,
  p_title text, p_body text, p_url text, p_push_after timestamptz DEFAULT now())
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.food_club_messages (user_id, kind, category, ref, title, body, url, push_after)
  VALUES (p_user_id, p_kind, CASE WHEN p_kind IN ('promo', 'winback') THEN 'promo' ELSE 'club' END,
          p_ref, p_title, p_body, COALESCE(p_url, '/kitchen/club'), COALESCE(p_push_after, now()))
  ON CONFLICT (user_id, kind, ref) DO NOTHING
$$;

CREATE OR REPLACE FUNCTION public.food_club_fmt_date(p_ts timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT to_char(p_ts AT TIME ZONE 'Europe/Rome', 'DD/MM') $$;

-- Emette un buono (usato da tessera completata, invito, eventuale manuale).
CREATE OR REPLACE FUNCTION public.food_club_issue_voucher(p_user_id uuid, p_campaign public.food_club_campaigns,
  p_source text, p_source_ref text)
RETURNS public.food_club_vouchers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voucher public.food_club_vouchers;
BEGIN
  INSERT INTO public.food_club_vouchers (code, user_id, campaign_id, source, source_ref, value, min_food, expires_at)
  VALUES (public.food_club_new_voucher_code(), p_user_id, p_campaign.id, p_source, p_source_ref,
          p_campaign.voucher_value, p_campaign.voucher_min_food,
          now() + make_interval(days => p_campaign.voucher_valid_days))
  ON CONFLICT (source, source_ref) WHERE source_ref IS NOT NULL DO NOTHING
  RETURNING * INTO v_voucher;
  IF v_voucher.id IS NULL THEN
    SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE source = p_source AND source_ref = p_source_ref;
    RETURN v_voucher;
  END IF;
  PERFORM public.food_club_log_voucher(v_voucher.id, NULL, 'available', 'issued', NULL, 'system',
    jsonb_build_object('source', p_source, 'source_ref', p_source_ref));
  PERFORM public.food_club_enqueue_message(p_user_id,
    CASE WHEN p_source = 'referral' THEN 'referral_reward' ELSE 'voucher_unlocked' END, v_voucher.id::text,
    trim(to_char(v_voucher.value, 'FM990D00')) || ' € SBLOCCATI',
    'Il tuo buono è pronto fino al ' || public.food_club_fmt_date(v_voucher.expires_at)
      || '. Lo usi sul prossimo ordine con ' || trim(to_char(v_voucher.min_food, 'FM990')) || ' € di food.',
    '/kitchen/club/buoni');
  -- Promemoria scadenza: 3 giorni prima, finestra 17:00 Europe/Rome (la consegna push applica i limiti).
  IF v_voucher.expires_at - interval '3 days' > now() THEN
    PERFORM public.food_club_enqueue_message(p_user_id, 'voucher_expiring', v_voucher.id::text,
      'IL TUO BUONO SCADE IL ' || public.food_club_fmt_date(v_voucher.expires_at),
      trim(to_char(v_voucher.value, 'FM990D00')) || ' € ancora tuoi fino al ' || public.food_club_fmt_date(v_voucher.expires_at) || '.',
      '/kitchen/club/buoni',
      (date_trunc('day', (v_voucher.expires_at - interval '3 days') AT TIME ZONE 'Europe/Rome') + interval '17 hours')
        AT TIME ZONE 'Europe/Rome');
  END IF;
  RETURN v_voucher;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Assegnazione timbro (cuore delle regole visite)
-- ---------------------------------------------------------------------------------------------------
-- Ritorna jsonb con l'esito: {awarded, reason, card_id, stamps, voucher_id}.
CREATE OR REPLACE FUNCTION public.food_club_award_order_stamp(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order    public.kitchen_orders;
  v_member   public.food_club_members;
  v_campaign public.food_club_campaigns;
  v_food     numeric;
  v_night    date;
  v_card     public.food_club_cards;
  v_count    integer;
  v_voucher  public.food_club_vouchers;
  v_has_voucher boolean;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('awarded', false, 'reason', 'order_not_found'); END IF;
  IF v_order.source IS DISTINCT FROM 'customer_app' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'not_customer_app_order');
  END IF;
  IF v_order.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'order_not_paid');
  END IF;
  -- Pagamento vero: un charge riuscito con l'importo del totale (non basta payment_status scritto a mano).
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_payments p
                  WHERE p.order_id = v_order.id AND p.direction = 'charge' AND p.status = 'succeeded'
                    AND p.amount = v_order.total) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_succeeded_charge');
  END IF;
  SELECT * INTO v_member FROM public.food_club_members
   WHERE user_id = v_order.customer_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('awarded', false, 'reason', 'not_member'); END IF;
  -- Ordine creato prima dell'iscrizione: conta solo entro retroactive_days (D-13, default 0 = mai).
  v_campaign := public.food_club_active_campaign(v_order.venue_id);
  IF v_campaign.id IS NULL THEN RETURN jsonb_build_object('awarded', false, 'reason', 'no_active_campaign'); END IF;
  IF v_order.created_at < v_member.joined_at - make_interval(days => v_campaign.retroactive_days) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'order_before_join');
  END IF;
  IF v_campaign.starts_at IS NOT NULL AND v_order.created_at < v_campaign.starts_at THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'order_before_campaign');
  END IF;
  IF EXISTS (SELECT 1 FROM public.food_club_stamps WHERE order_id = v_order.id) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_stamped');
  END IF;

  -- P1: anche un buono RILASCIATO da questo ordine conta come "ordine con buono" (lo sconto è dentro total).
  v_has_voucher := EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE used_order_id = v_order.id
                                                                    OR reserved_order_id = v_order.id)
                   OR EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                               WHERE e.order_id = v_order.id AND e.event = 'reserved_on_order');
  IF v_has_voucher AND NOT v_campaign.stamp_on_voucher_order THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'voucher_order_no_stamp');
  END IF;

  -- Soglia sul food LORDO (prima dello sconto): le bevande non contano.
  v_food := public.food_club_order_food_amount(v_order.id);
  IF v_food < v_campaign.stamp_min_food THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'food_below_threshold', 'food', v_food);
  END IF;

  -- Serata dell'ordine = created_at (quando il cliente era al locale, D-7 proposta), 06:00 Europe/Rome.
  v_night := public.food_club_service_night(v_order.created_at);
  IF EXISTS (SELECT 1 FROM public.food_club_stamps
              WHERE user_id = v_member.user_id AND service_night = v_night AND kind = 'order' AND revoked_at IS NULL) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_stamped_tonight');
  END IF;

  -- Tessera aperta; se la finestra è scaduta la chiudiamo e ne apriamo una nuova da questa visita.
  SELECT * INTO v_card FROM public.food_club_cards
   WHERE user_id = v_member.user_id AND campaign_id = v_campaign.id AND status = 'open' FOR UPDATE;
  IF FOUND AND v_card.expires_at <= v_order.created_at THEN
    UPDATE public.food_club_cards SET status = 'expired' WHERE id = v_card.id;
    v_card := NULL;
  END IF;
  IF v_card.id IS NULL THEN
    INSERT INTO public.food_club_cards (user_id, campaign_id, opened_at, expires_at)
    VALUES (v_member.user_id, v_campaign.id, v_order.created_at,
            v_order.created_at + make_interval(days => v_campaign.window_days))
    RETURNING * INTO v_card;
  END IF;

  BEGIN
    INSERT INTO public.food_club_stamps (user_id, card_id, campaign_id, kind, order_id, service_night, food_amount)
    VALUES (v_member.user_id, v_card.id, v_campaign.id, 'order', v_order.id, v_night, v_food);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_stamped_race');
  END;

  SELECT count(*) INTO v_count FROM public.food_club_stamps
   WHERE card_id = v_card.id AND revoked_at IS NULL;

  IF v_count >= v_campaign.stamps_required THEN
    v_voucher := public.food_club_issue_voucher(v_member.user_id, v_campaign, 'card', v_card.id::text);
    UPDATE public.food_club_cards SET status = 'completed', completed_at = now(), voucher_id = v_voucher.id
     WHERE id = v_card.id;
  ELSE
    PERFORM public.food_club_enqueue_message(v_member.user_id, 'stamp', v_order.id,
      '+1 TIMBRO 🦭',
      'Visita contata. Torna entro il ' || public.food_club_fmt_date(v_card.expires_at)
        || ' e sblocchi ' || trim(to_char(v_campaign.voucher_value, 'FM990')) || ' €.',
      '/kitchen/club');
  END IF;

  RETURN jsonb_build_object('awarded', true, 'card_id', v_card.id, 'stamps', v_count,
                            'voucher_id', v_voucher.id, 'service_night', v_night);
END;
$$;

-- Premio invito: al primo ordine valido (pagato, app cliente, food >= referral_min_food) dell'invitato.
CREATE OR REPLACE FUNCTION public.food_club_try_referral_reward(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order    public.kitchen_orders;
  v_ref      public.food_club_referrals;
  v_campaign public.food_club_campaigns;
  v_recent   integer;
  v_voucher  public.food_club_vouchers;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.source IS DISTINCT FROM 'customer_app' OR v_order.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('rewarded', false, 'reason', 'order_not_eligible');
  END IF;
  SELECT * INTO v_ref FROM public.food_club_referrals WHERE invitee_id = v_order.customer_id FOR UPDATE;
  IF NOT FOUND OR v_ref.status <> 'pending' THEN
    RETURN jsonb_build_object('rewarded', false, 'reason', 'no_pending_referral');
  END IF;
  v_campaign := public.food_club_active_campaign(v_order.venue_id);
  IF v_campaign.id IS NULL OR NOT v_campaign.referral_enabled THEN
    RETURN jsonb_build_object('rewarded', false, 'reason', 'referral_disabled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_payments p WHERE p.order_id = v_order.id AND p.direction = 'charge'
                  AND p.status = 'succeeded' AND p.amount = v_order.total) THEN
    RETURN jsonb_build_object('rewarded', false, 'reason', 'no_succeeded_charge');
  END IF;
  IF public.food_club_order_food_amount(v_order.id) < v_campaign.referral_min_food THEN
    RETURN jsonb_build_object('rewarded', false, 'reason', 'food_below_threshold');
  END IF;
  -- Serializza i premi dello stesso invitante (tetto 5 / 30 giorni).
  PERFORM pg_advisory_xact_lock(hashtextextended('food_club_referral:' || v_ref.inviter_id::text, 0));
  SELECT count(*) INTO v_recent FROM public.food_club_referrals
   WHERE inviter_id = v_ref.inviter_id AND status = 'rewarded'
     AND rewarded_at > now() - make_interval(days => v_campaign.referral_cap_days);
  IF v_recent >= v_campaign.referral_inviter_cap THEN
    UPDATE public.food_club_referrals SET status = 'capped', qualified_order_id = v_order.id WHERE id = v_ref.id;
    RETURN jsonb_build_object('rewarded', false, 'reason', 'inviter_cap_reached');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = v_ref.inviter_id AND status = 'active') THEN
    UPDATE public.food_club_referrals SET status = 'void', qualified_order_id = v_order.id WHERE id = v_ref.id;
    RETURN jsonb_build_object('rewarded', false, 'reason', 'inviter_not_member');
  END IF;
  v_voucher := public.food_club_issue_voucher(v_ref.inviter_id, v_campaign, 'referral', v_ref.id::text);
  UPDATE public.food_club_referrals
     SET status = 'rewarded', rewarded_at = now(), qualified_order_id = v_order.id, reward_voucher_id = v_voucher.id
   WHERE id = v_ref.id;
  RETURN jsonb_build_object('rewarded', true, 'voucher_id', v_voucher.id);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Trigger sugli ordini
-- ---------------------------------------------------------------------------------------------------
-- 3a) Guardia: importi bloccati su ordini con buono riservato/usato.
CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.total IS DISTINCT FROM OLD.total OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
      OR NEW.venue_id IS DISTINCT FROM OLD.venue_id OR NEW.promo_code IS DISTINCT FROM OLD.promo_code)
     AND EXISTS (SELECT 1 FROM public.food_club_vouchers v
                  WHERE (v.status = 'reserved' AND v.reserved_order_id = OLD.id) OR v.used_order_id = OLD.id) THEN
    RAISE EXCEPTION 'food_club_voucher_locks_order_amount';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_food_club_guard ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_food_club_guard
  BEFORE UPDATE OF total, discount_amount, venue_id, promo_code ON public.kitchen_orders
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_orders_food_club_guard();

-- 3b) Consumo unico del buono (Passo 1 C-T: T2 + P1 FIX-1/FIX-2 + R-b). Regole:
--   * un buono RISERVATO su un ordine diventa UTILIZZATO quando l'ordine ha un charge 'succeeded', QUALUNQUE sia lo
--     stato dell'ordine (pagato, annullato, abbandonato, passato al banco): il PAID tardivo registrato da webhook,
--     reconcile o sweep R3 passa sempre da kitchen_payment_confirm (K2) e quindi da qui. L'importo non conta per il
--     consumo (in dubbio il buono non torna); conta per timbro e invito.
--   * già UTILIZZATO su questo ordine -> nulla (R-b, idempotente: webhook ripetuti, on_paid + on_charge).
--   * RILASCIATO prima dell'incasso (solo banco puro, vedi 3c) e ancora DISPONIBILE -> ri-consumato (FIX-1); se
--     intanto è riservato/usato altrove -> anomalia 'food_club_voucher_double_spend' (una volta per ordine).
--   * timbro e premio invito solo se l'ordine è 'paid' con un charge = total.
-- Lock (compatibile K4): il chiamante tiene già le righe charge (confirm, record_counter) o la riga ordine
-- (UPDATE ordine); qui: riga ordine FOR UPDATE -> buono FOR UPDATE -> tessera/timbri. Mai buono prima dell'ordine.
CREATE OR REPLACE FUNCTION public.food_club_consume_on_charge(p_order_id text, p_stage text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order    public.kitchen_orders;
  v_charge   public.kitchen_payments;
  v_voucher  public.food_club_vouchers;
  v_released public.food_club_vouchers;
  v_result   text := 'noop';
  v_stamp    jsonb;
  v_ref      jsonb;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result', 'order_not_found'); END IF;

  SELECT * INTO v_charge FROM public.kitchen_payments
   WHERE order_id = v_order.id AND direction = 'charge' AND status = 'succeeded'
   ORDER BY id LIMIT 1;

  IF v_charge.id IS NULL THEN
    -- 'paid' senza incasso (es. UPDATE manuale): il buono resta riservato, anomalia per lo staff (una volta).
    IF v_order.payment_status = 'paid'
       AND EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE reserved_order_id = v_order.id AND status = 'reserved')
       AND NOT EXISTS (SELECT 1 FROM public.kitchen_action_log
                        WHERE order_id = v_order.id AND action = 'food_club_paid_without_charge') THEN
      INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
      VALUES (v_order.id, v_order.venue_id, 'food_club_paid_without_charge', 'system',
              jsonb_build_object('stage', p_stage, 'needs_manual_reconciliation', true));
    END IF;
    RETURN jsonb_build_object('result', 'no_succeeded_charge');
  END IF;

  SELECT * INTO v_voucher FROM public.food_club_vouchers
   WHERE reserved_order_id = v_order.id AND status = 'reserved' FOR UPDATE;
  IF v_voucher.id IS NOT NULL THEN
    UPDATE public.food_club_vouchers
       SET status = 'used', used_order_id = v_order.id, used_at = now()
     WHERE id = v_voucher.id AND status = 'reserved';
    PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'used',
      CASE WHEN v_order.status IN ('cancelled', 'payment_abandoned') THEN 'consumed_on_late_charge'
           WHEN v_order.payment_status = 'paid' THEN 'order_paid'
           ELSE 'used_on_charge' END,
      v_order.id, 'system',
      jsonb_build_object('stage', p_stage, 'payment_id', v_charge.id, 'payment_method', v_charge.method,
                         'order_status', v_order.status, 'payment_status', v_order.payment_status));
    v_result := 'consumed';
  ELSIF EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE used_order_id = v_order.id) THEN
    v_result := 'already_used'; -- R-b
  ELSIF COALESCE(v_order.discount_amount, 0) > 0 THEN
    -- FIX-1: buono riservato su questo ordine, rilasciato, e ora l'ordine è stato incassato col totale scontato.
    SELECT v.* INTO v_released FROM public.food_club_vouchers v
     WHERE EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                    WHERE e.voucher_id = v.id AND e.order_id = v_order.id AND e.event = 'reserved_on_order')
     ORDER BY v.updated_at DESC LIMIT 1 FOR UPDATE;
    IF v_released.id IS NOT NULL THEN
      IF v_released.status = 'available' THEN
        UPDATE public.food_club_vouchers SET status = 'reserved', reserved_order_id = v_order.id, reserved_at = now()
         WHERE id = v_released.id AND status = 'available';
        UPDATE public.food_club_vouchers SET status = 'used', used_order_id = v_order.id, used_at = now()
         WHERE id = v_released.id AND status = 'reserved';
        PERFORM public.food_club_log_voucher(v_released.id, 'available', 'used', 'reclaimed_on_late_payment',
          v_order.id, 'system', jsonb_build_object('stage', p_stage, 'payment_id', v_charge.id));
        v_result := 'reclaimed';
      ELSIF v_released.status <> 'expired'
            AND NOT EXISTS (SELECT 1 FROM public.kitchen_action_log
                             WHERE order_id = v_order.id AND action = 'food_club_voucher_double_spend') THEN
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (v_order.id, v_order.venue_id, 'food_club_voucher_double_spend', 'system',
                jsonb_build_object('voucher_id', v_released.id, 'voucher_status', v_released.status,
                                   'other_order_id', COALESCE(v_released.used_order_id, v_released.reserved_order_id),
                                   'discount', v_order.discount_amount, 'stage', p_stage,
                                   'needs_manual_reconciliation', true));
        v_result := 'double_spend';
      END IF;
      -- 'expired': lo sconto è stato goduto una sola volta (su questo ordine), nulla da fare.
    END IF;
  END IF;

  IF v_order.payment_status = 'paid'
     AND EXISTS (SELECT 1 FROM public.kitchen_payments p WHERE p.order_id = v_order.id AND p.direction = 'charge'
                   AND p.status = 'succeeded' AND p.amount = v_order.total) THEN
    v_stamp := public.food_club_award_order_stamp(v_order.id);
    v_ref := public.food_club_try_referral_reward(v_order.id);
    IF v_order.source = 'customer_app' AND (p_stage = 'on_paid' OR (v_stamp->>'awarded')::boolean
                                             OR (v_ref->>'rewarded')::boolean OR v_result <> 'noop') THEN
      INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
      VALUES (v_order.id, v_order.venue_id, 'food_club_order_paid', 'system',
              jsonb_build_object('stamp', v_stamp, 'referral', v_ref, 'voucher_result', v_result, 'stage', p_stage));
    END IF;
  END IF;
  RETURN jsonb_build_object('result', v_result, 'stamp', v_stamp, 'referral', v_ref);
END;
$$;

-- Errore Club: log 'food_club_error' (needs_manual_reconciliation). Se anche il log fallisce: WARNING, mai errore
-- verso Kitchen. Il chiamante ha già annullato (subtransazione) le scritture Club: il buono resta RISERVATO.
CREATE OR REPLACE FUNCTION public.food_club_log_error(p_order_id text, p_stage text, p_sqlstate text, p_message text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    SELECT o.id, o.venue_id, 'food_club_error', 'system',
           jsonb_build_object('stage', p_stage, 'sqlstate', p_sqlstate, 'message', left(p_message, 300),
                              'needs_manual_reconciliation', true)
      FROM public.kitchen_orders o WHERE o.id = p_order_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'food_club_error_not_logged order=% stage=% sqlstate=% msg=%', p_order_id, p_stage, p_sqlstate,
      left(p_message, 200);
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public.food_club_consume_on_charge(NEW.id, 'on_paid');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.food_club_log_error(NEW.id, 'on_paid', SQLSTATE, SQLERRM);
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_food_club_on_paid ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_food_club_on_paid
  AFTER UPDATE OF payment_status ON public.kitchen_orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.kitchen_orders_food_club_on_paid();

-- T2: charge 'succeeded' (INSERT dal banco K4, UPDATE da confirm K2 anche su attempt annullato/abbandonato/passato
-- al banco). Uscita rapida per gli ordini senza buono e non ancora pagati (ordini Kitchen normali: nessun effetto).
CREATE OR REPLACE FUNCTION public.kitchen_payments_food_club_on_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v
                  WHERE (v.status = 'reserved' AND v.reserved_order_id = NEW.order_id) OR v.used_order_id = NEW.order_id)
     AND NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                      WHERE e.order_id = NEW.order_id AND e.event = 'reserved_on_order')
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_orders o WHERE o.id = NEW.order_id AND o.payment_status = 'paid') THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM public.food_club_consume_on_charge(NEW.order_id, 'on_charge');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.food_club_log_error(NEW.order_id, 'on_charge', SQLSTATE, SQLERRM);
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_payments_food_club_on_charge ON public.kitchen_payments;
CREATE TRIGGER kitchen_payments_food_club_on_charge
  AFTER INSERT OR UPDATE OF status ON public.kitchen_payments
  FOR EACH ROW
  WHEN (NEW.direction = 'charge' AND NEW.status = 'succeeded')
  EXECUTE FUNCTION public.kitchen_payments_food_club_on_charge();

-- 3c) Chiuso non pagato (T3). Stessa transazione dell'annullo/abbandono; riga ordine già bloccata dal chiamante.
--   * esiste un charge 'succeeded' -> consumo (regola 1, es. PAID tardivo arrivato prima dell'annullo);
--   * esiste una riga charge online (provider diverso da cash/manual, qualunque stato) -> il buono RESTA RISERVATO
--     (evento 'held_until_checkout_expiry', una volta): un checkout SumUp può essere ancora pagabile. Il rilascio
--     richiede la prova che nessun checkout sia pagabile: NON implementato nel Passo 1 (Passi 2-3);
--   * nessuna riga charge online e nessun incasso (banco puro) -> rilascio subito con la scadenza originale.
-- Errore: il buono resta RISERVATO (direzione sicura) e 'food_club_error' nel log; l'annullo Kitchen riesce.
CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_on_closed_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voucher public.food_club_vouchers;
  v_to text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE reserved_order_id = NEW.id AND status = 'reserved') THEN
    RETURN NULL;
  END IF;
  BEGIN
    IF EXISTS (SELECT 1 FROM public.kitchen_payments p
                WHERE p.order_id = NEW.id AND p.direction = 'charge' AND p.status = 'succeeded') THEN
      PERFORM public.food_club_consume_on_charge(NEW.id, 'on_closed');
      RETURN NULL;
    END IF;
    SELECT * INTO v_voucher FROM public.food_club_vouchers
     WHERE reserved_order_id = NEW.id AND status = 'reserved' FOR UPDATE;
    IF v_voucher.id IS NULL THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.kitchen_payments p
                WHERE p.order_id = NEW.id AND p.direction = 'charge'
                  AND p.provider IS DISTINCT FROM 'cash' AND p.provider IS DISTINCT FROM 'manual') THEN
      IF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                      WHERE e.voucher_id = v_voucher.id AND e.order_id = NEW.id AND e.event = 'held_until_checkout_expiry') THEN
        PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'reserved', 'held_until_checkout_expiry', NEW.id,
          'system', jsonb_build_object('order_status', NEW.status));
      END IF;
      RETURN NULL;
    END IF;
    v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
    UPDATE public.food_club_vouchers
       SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
     WHERE id = v_voucher.id AND status = 'reserved';
    PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'released', NEW.id, 'system',
      jsonb_build_object('order_status', NEW.status, 'reason', 'counter_only_no_collection'));
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.food_club_log_error(NEW.id, 'on_closed', SQLSTATE, SQLERRM);
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_food_club_on_closed_unpaid ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_food_club_on_closed_unpaid
  AFTER UPDATE OF status ON public.kitchen_orders
  FOR EACH ROW
  WHEN (NEW.status IN ('cancelled', 'payment_abandoned') AND OLD.status IS DISTINCT FROM NEW.status
        AND NEW.payment_status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.kitchen_orders_food_club_on_closed_unpaid();

-- 3d) Rimborsato: revoca timbro, revoca buono non usato generato dalla tessera, revoca premio invito non usato
--     (P1 FIX-3), riaccredito del buono usato secondo D-2 MA mai su un ordine annullato/abbandonato o consumato da
--     un incasso tardivo (D-P2: nessun ripristino automatico dopo un rimborso tardivo).
CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_on_refunded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stamp    public.food_club_stamps;
  v_card     public.food_club_cards;
  v_voucher  public.food_club_vouchers;
  v_campaign public.food_club_campaigns;
  v_ref      public.food_club_referrals;
BEGIN
  BEGIN
    SELECT * INTO v_stamp FROM public.food_club_stamps WHERE order_id = NEW.id AND revoked_at IS NULL FOR UPDATE;
    IF v_stamp.id IS NOT NULL THEN
      UPDATE public.food_club_stamps SET revoked_at = now(), revoke_reason = 'order_refunded' WHERE id = v_stamp.id;
      SELECT * INTO v_card FROM public.food_club_cards WHERE id = v_stamp.card_id FOR UPDATE;
      IF v_card.status = 'completed' AND v_card.voucher_id IS NOT NULL THEN
        SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = v_card.voucher_id FOR UPDATE;
        IF v_voucher.status = 'available' THEN
          UPDATE public.food_club_vouchers SET status = 'revoked' WHERE id = v_voucher.id;
          PERFORM public.food_club_log_voucher(v_voucher.id, 'available', 'revoked', 'source_order_refunded', NEW.id, 'system', '{}');
          UPDATE public.food_club_cards
             SET status = CASE WHEN expires_at > now() THEN 'open' ELSE 'expired' END, completed_at = NULL, voucher_id = NULL
           WHERE id = v_card.id
             AND NOT EXISTS (SELECT 1 FROM public.food_club_cards c2 WHERE c2.user_id = v_card.user_id
                               AND c2.campaign_id = v_card.campaign_id AND c2.status = 'open');
        ELSE
          INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
          VALUES (NEW.id, NEW.venue_id, 'food_club_refund_voucher_kept', 'system',
                  jsonb_build_object('voucher_id', v_voucher.id, 'voucher_status', v_voucher.status));
        END IF;
      END IF;
    END IF;
    -- P1 FIX-3: premio invito generato da questo ordine.
    SELECT * INTO v_ref FROM public.food_club_referrals
     WHERE qualified_order_id = NEW.id AND status = 'rewarded' FOR UPDATE;
    IF v_ref.id IS NOT NULL THEN
      SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = v_ref.reward_voucher_id FOR UPDATE;
      IF v_voucher.status = 'available' THEN
        UPDATE public.food_club_vouchers SET status = 'revoked' WHERE id = v_voucher.id;
        PERFORM public.food_club_log_voucher(v_voucher.id, 'available', 'revoked', 'referral_order_refunded', NEW.id, 'system', '{}');
        UPDATE public.food_club_referrals SET status = 'void' WHERE id = v_ref.id;
      ELSE
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (NEW.id, NEW.venue_id, 'food_club_refund_referral_voucher_kept', 'system',
                jsonb_build_object('referral_id', v_ref.id, 'voucher_id', v_voucher.id, 'voucher_status', v_voucher.status));
      END IF;
    END IF;
    v_voucher := NULL;
    SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE used_order_id = NEW.id AND status = 'used' FOR UPDATE;
    IF v_voucher.id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.food_club_campaigns WHERE id = v_voucher.campaign_id;
      IF v_campaign.refund_recredits_voucher
         AND NEW.status NOT IN ('cancelled', 'payment_abandoned')
         AND NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                          WHERE e.voucher_id = v_voucher.id AND e.order_id = NEW.id
                            AND e.event = 'consumed_on_late_charge') THEN
        UPDATE public.food_club_vouchers
           SET status = CASE WHEN expires_at > now() THEN 'available' ELSE 'expired' END,
               used_order_id = NULL, used_at = NULL, reserved_order_id = NULL, reserved_at = NULL
         WHERE id = v_voucher.id;
        PERFORM public.food_club_log_voucher(v_voucher.id, 'used', 'available', 'recredited_after_refund', NEW.id, 'system', '{}');
      ELSE
        PERFORM public.food_club_log_voucher(v_voucher.id, 'used', 'used', 'order_refunded_voucher_kept_used', NEW.id, 'system', '{}');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.food_club_log_error(NEW.id, 'on_refunded', SQLSTATE, SQLERRM);
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_food_club_on_refunded ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_food_club_on_refunded
  AFTER UPDATE OF payment_status ON public.kitchen_orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'refunded' AND OLD.payment_status IS DISTINCT FROM 'refunded')
  EXECUTE FUNCTION public.kitchen_orders_food_club_on_refunded();

-- Il voucher_events "used -> used" / "reserved -> reserved" è informativo: la guardia transizioni lo permette.

-- ---------------------------------------------------------------------------------------------------
-- 4) Creazione ordine cliente con buono (v4 = v3 + riserva atomica del buono)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order_v4(
  p_venue_id text, p_nickname text, p_customer_note text, p_items jsonb, p_fulfillment_type text,
  p_payment_lane text, p_client_request_id uuid DEFAULT NULL, p_pickup_slot text DEFAULT NULL,
  p_voucher_id uuid DEFAULT NULL)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order    public.kitchen_orders;
  v_voucher  public.food_club_vouchers;
  v_campaign public.food_club_campaigns;
  v_food     numeric;
  v_discount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'customer_session_required'; END IF;

  -- Controlli preliminari SENZA lock (errore chiaro prima di creare l'ordine; il controllo definitivo è sotto lock).
  IF p_voucher_id IS NOT NULL THEN
    IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'voucher_requires_client_request_id'; END IF;
    SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = p_voucher_id;
    IF NOT FOUND OR v_voucher.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = auth.uid() AND status = 'active') THEN
      RAISE EXCEPTION 'voucher_member_required';
    END IF;
    -- Passo 1 F4 (regola 7): campagna spenta = nessuna nuova prenotazione di buoni. D-P1: il buono emesso in una
    -- campagna precedente resta valido alle sue condizioni (valore/minimo/scadenza scritti sul buono).
    v_campaign := public.food_club_active_campaign(p_venue_id);
    IF v_campaign.id IS NULL THEN RAISE EXCEPTION 'voucher_campaign_inactive'; END IF;
  END IF;

  v_order := public.kitchen_customer_create_order_v3(p_venue_id, p_nickname, p_customer_note, p_items,
    p_fulfillment_type, p_payment_lane, p_client_request_id, p_pickup_slot);

  IF p_voucher_id IS NULL THEN RETURN v_order; END IF;

  -- Lock (Passo 1): ordine prima del buono, come ovunque. L'ordine è nuovo (invisibile agli altri) o è il replay.
  -- Due richieste concorrenti con lo stesso buono: la seconda attende qui, trova 'reserved' e fallisce con rollback
  -- del proprio ordine.
  SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = p_voucher_id FOR UPDATE;
  IF NOT FOUND OR v_voucher.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'voucher_not_found'; END IF;

  -- Replay idempotente (doppio tap / retry): se il buono è già su questo ordine, ritorna l'ordine così com'è.
  IF v_voucher.reserved_order_id = v_order.id OR v_voucher.used_order_id = v_order.id THEN
    RETURN v_order;
  END IF;
  -- Ordine già esistente da un tentativo precedente (stesso client_request_id): mai applicare il buono dopo.
  IF v_order.created_at <> now() OR EXISTS (SELECT 1 FROM public.kitchen_payments p WHERE p.order_id = v_order.id) THEN
    RAISE EXCEPTION 'voucher_order_already_exists';
  END IF;
  IF v_voucher.status <> 'available' THEN RAISE EXCEPTION 'voucher_not_available'; END IF;
  IF v_voucher.expires_at <= now() THEN RAISE EXCEPTION 'voucher_expired'; END IF;
  IF v_order.discount_amount > 0 OR v_order.promo_code IS NOT NULL THEN RAISE EXCEPTION 'voucher_not_combinable'; END IF;

  v_food := public.food_club_order_food_amount(v_order.id);
  IF v_food < v_voucher.min_food THEN RAISE EXCEPTION 'voucher_food_below_minimum'; END IF;
  v_discount := LEAST(v_voucher.value, v_order.total - 0.5);
  IF v_discount <= 0 THEN RAISE EXCEPTION 'voucher_food_below_minimum'; END IF;

  -- Sconto dentro total PRIMA di qualsiasi tentativo di pagamento (SumUp e banco leggono total).
  UPDATE public.kitchen_orders
     SET discount_amount = v_discount, total = total - v_discount
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  UPDATE public.food_club_vouchers
     SET status = 'reserved', reserved_order_id = v_order.id, reserved_at = now()
   WHERE id = v_voucher.id AND status = 'available';
  IF NOT FOUND THEN RAISE EXCEPTION 'voucher_not_available'; END IF;
  PERFORM public.food_club_log_voucher(v_voucher.id, 'available', 'reserved', 'reserved_on_order', v_order.id,
    'customer', jsonb_build_object('discount', v_discount, 'food', v_food, 'lane', p_payment_lane,
                                   'campaign_id', v_voucher.campaign_id, 'active_campaign_id', v_campaign.id));

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (v_order.id, v_order.venue_id, 'food_club_voucher_reserved', 'customer', auth.uid(),
          jsonb_build_object('voucher_id', v_voucher.id, 'voucher_code', v_voucher.code, 'discount', v_discount));
  RETURN v_order;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5) Scadenze (job giornaliero; le letture calcolano comunque lo stato effettivo)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_expire_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vouchers integer := 0;
  v_cards integer := 0;
  r record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  FOR r IN SELECT id FROM public.food_club_vouchers WHERE status = 'available' AND expires_at <= now() FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.food_club_vouchers SET status = 'expired' WHERE id = r.id AND status = 'available';
    PERFORM public.food_club_log_voucher(r.id, 'available', 'expired', 'expired', NULL, 'system', '{}');
    v_vouchers := v_vouchers + 1;
  END LOOP;
  -- RISERVATO non scade mai (invariante 1): nessun tocco ai riservati.
  UPDATE public.food_club_cards SET status = 'expired' WHERE status = 'open' AND expires_at <= now();
  GET DIAGNOSTICS v_cards = ROW_COUNT;
  -- Messaggi "in scadenza" per buoni non più disponibili: annullati.
  UPDATE public.food_club_messages m SET push_status = 'skipped', push_skip_reason = 'voucher_not_available'
   WHERE m.kind = 'voucher_expiring' AND m.push_status = 'queued'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v WHERE v.id::text = m.ref AND v.status = 'available');
  RETURN jsonb_build_object('vouchers_expired', v_vouchers, 'cards_expired', v_cards);
END;
$$;

-- Job pg_cron 06:10 Europe/Rome ≈ 05:10 UTC (solo segnalazione/scadenza; non annulla e non rilascia ordini).
SELECT cron.schedule('food-club-expire-sweep', '10 5 * * *', $cron$SELECT public.food_club_expire_sweep()$cron$);

-- ---------------------------------------------------------------------------------------------------
-- 6) Permessi
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_active_campaign(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_new_voucher_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_log_voucher(uuid, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_enqueue_message(uuid, text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_fmt_date(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_issue_voucher(uuid, public.food_club_campaigns, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_award_order_stamp(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_try_referral_reward(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_paid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_closed_unpaid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_refunded() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_expire_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_expire_sweep() TO service_role;
REVOKE ALL ON FUNCTION public.kitchen_customer_create_order_v4(text, text, text, jsonb, text, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order_v4(text, text, text, jsonb, text, text, uuid, text, uuid) TO authenticated, service_role;
-- Passo 1 C-T
REVOKE ALL ON FUNCTION public.food_club_consume_on_charge(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_log_error(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_payments_food_club_on_charge() FROM PUBLIC, anon, authenticated;

