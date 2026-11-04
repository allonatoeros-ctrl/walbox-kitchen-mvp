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

  v_has_voucher := EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE used_order_id = v_order.id
                                                                    OR reserved_order_id = v_order.id);
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

-- 3b) Pagato: consumo buono + timbro + invito (mai far fallire il pagamento).
CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_voucher public.food_club_vouchers;
  v_charge_ok boolean;
  v_stamp jsonb;
  v_ref jsonb;
BEGIN
  BEGIN
    v_charge_ok := EXISTS (SELECT 1 FROM public.kitchen_payments p
                            WHERE p.order_id = NEW.id AND p.direction = 'charge' AND p.status = 'succeeded'
                              AND p.amount = NEW.total);
    SELECT * INTO v_voucher FROM public.food_club_vouchers
     WHERE reserved_order_id = NEW.id AND status = 'reserved' FOR UPDATE;
    IF v_voucher.id IS NOT NULL THEN
      IF v_charge_ok THEN
        -- Invariante: un buono RISERVATO non scade mentre è riservato; se l'ordine si paga, è UTILIZZATO.
        UPDATE public.food_club_vouchers
           SET status = 'used', used_order_id = NEW.id, used_at = now()
         WHERE id = v_voucher.id AND status = 'reserved';
        PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'used', 'order_paid', NEW.id, 'system',
          jsonb_build_object('payment_method', NEW.payment_method));
      ELSE
        -- 'paid' senza charge corrispondente (es. UPDATE manuale): il buono resta riservato, anomalia per lo staff.
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (NEW.id, NEW.venue_id, 'food_club_paid_without_charge', 'system',
                jsonb_build_object('voucher_id', v_voucher.id, 'needs_manual_reconciliation', true));
      END IF;
    END IF;
    IF v_charge_ok THEN
      v_stamp := public.food_club_award_order_stamp(NEW.id);
      v_ref := public.food_club_try_referral_reward(NEW.id);
      IF NEW.source = 'customer_app' THEN
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (NEW.id, NEW.venue_id, 'food_club_order_paid', 'system',
                jsonb_build_object('stamp', v_stamp, 'referral', v_ref, 'voucher_id', v_voucher.id));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (NEW.id, NEW.venue_id, 'food_club_error', 'system',
            jsonb_build_object('stage', 'on_paid', 'sqlstate', SQLSTATE, 'message', left(SQLERRM, 300),
                               'needs_manual_reconciliation', true));
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

-- 3c) Chiuso non pagato: rilascio del buono con la scadenza originale (stessa transazione dell'annullo/abbandono).
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
  SELECT * INTO v_voucher FROM public.food_club_vouchers
   WHERE reserved_order_id = NEW.id AND status = 'reserved' FOR UPDATE;
  IF v_voucher.id IS NULL THEN RETURN NULL; END IF;
  v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
  UPDATE public.food_club_vouchers
     SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
   WHERE id = v_voucher.id AND status = 'reserved';
  PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'released', NEW.id, 'system',
    jsonb_build_object('order_status', NEW.status));
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

-- 3d) Rimborsato: revoca timbro, revoca buono non usato generato dalla tessera, riaccredito secondo D-2.
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
          -- La tessera torna aperta col timbro rimasto (se la finestra è ancora valida).
          UPDATE public.food_club_cards
             SET status = CASE WHEN expires_at > now() THEN 'open' ELSE 'expired' END, completed_at = NULL, voucher_id = NULL
           WHERE id = v_card.id
             AND NOT EXISTS (SELECT 1 FROM public.food_club_cards c2 WHERE c2.user_id = v_card.user_id
                               AND c2.campaign_id = v_card.campaign_id AND c2.status = 'open');
        ELSE
          -- Buono già riservato/usato: lo si lascia (decisione D11 fase 2), segnalazione allo staff.
          INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
          VALUES (NEW.id, NEW.venue_id, 'food_club_refund_voucher_kept', 'system',
                  jsonb_build_object('voucher_id', v_voucher.id, 'voucher_status', v_voucher.status));
        END IF;
      END IF;
    END IF;
    -- Buono usato su questo ordine: riaccredito solo se previsto (D-2), con la scadenza originale.
    SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE used_order_id = NEW.id AND status = 'used' FOR UPDATE;
    IF v_voucher.id IS NOT NULL THEN
      SELECT * INTO v_campaign FROM public.food_club_campaigns WHERE id = v_voucher.campaign_id;
      IF v_campaign.refund_recredits_voucher THEN
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
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (NEW.id, NEW.venue_id, 'food_club_error', 'system',
            jsonb_build_object('stage', 'on_refunded', 'sqlstate', SQLSTATE, 'message', left(SQLERRM, 300),
                               'needs_manual_reconciliation', true));
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

-- Il voucher_events "used -> used" è un evento informativo: la guardia transizioni lo permette (stato invariato).

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
  v_order   public.kitchen_orders;
  v_voucher public.food_club_vouchers;
  v_food    numeric;
  v_discount numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'customer_session_required'; END IF;

  -- Il buono si valida PRIMA di creare l'ordine (errore = nessun ordine creato, il cliente riprova senza).
  IF p_voucher_id IS NOT NULL THEN
    IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'voucher_requires_client_request_id'; END IF;
    SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = p_voucher_id FOR UPDATE;
    IF NOT FOUND OR v_voucher.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'voucher_not_found'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = auth.uid() AND status = 'active') THEN
      RAISE EXCEPTION 'voucher_member_required';
    END IF;
  END IF;

  v_order := public.kitchen_customer_create_order_v3(p_venue_id, p_nickname, p_customer_note, p_items,
    p_fulfillment_type, p_payment_lane, p_client_request_id, p_pickup_slot);

  IF p_voucher_id IS NULL THEN RETURN v_order; END IF;

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
    'customer', jsonb_build_object('discount', v_discount, 'food', v_food, 'lane', p_payment_lane));

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
