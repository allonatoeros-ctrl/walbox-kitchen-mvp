-- WALRUS FOOD CLUB V1 — correzioni dalla revisione tecnica del 2026-11-04 (collaudo su Supabase locale).
-- STATO: PROPOSTA. File FUORI da supabase/migrations/ (area protetta): NON applicato a nessun DB remoto.
-- Per adottarlo (gate di Eros): spostarlo in supabase/migrations/ con questo nome, così gira DOPO le 4 migration
-- Food Club (oppure fonderlo nelle migration 20261105101000/100000, che non sono mai state applicate).
-- Verificato solo su stack Supabase locale (Postgres 17) con tests/db/food-club/50_review_fixes.sql.
--
-- FIX-1 (P1, doppio uso buono): ordine online con buono -> abbandono/annullo (buono RILASCIATO, total resta scontato)
--   -> pagamento SumUp tardivo -> staff porta l'ordine a 'paid'. Prima: cliente paga scontato E tiene il buono, e
--   prende anche il timbro. Ora: al pagamento il buono rilasciato viene ri-consumato su questo ordine se ancora
--   DISPONIBILE; se intanto è stato speso/riservato altrove -> anomalia 'food_club_voucher_double_spend' per lo staff;
--   l'ordine con sconto non dà timbro (se stamp_on_voucher_order = false).
-- FIX-2 (P2, buono bloccato in RISERVATO): se il charge 'succeeded' arriva DOPO che l'ordine è già 'paid'
--   (es. 'paid' messo a mano, poi kitchen_payment_record_counter), il trigger su payment_status non scattava più.
--   Ora un trigger su kitchen_payments esegue lo stesso regolamento (idempotente).
-- FIX-3 (P2): rimborso dell'ordine che ha qualificato un invito -> premio dell'invitante revocato se non usato.
-- FIX-4 (P2): FK da food_club_* verso kitchen_orders: ON DELETE SET NULL violava i CHECK (errore criptico);
--   ora RESTRICT, come kitchen_payments.
-- FIX-5 (P2): cambio prezzo di una combo -> la quota food segue la variazione (quota bevanda invariata).

-- ---------------------------------------------------------------------------------------------------
-- FIX-1/2: regolamento unico di un ordine pagato (idempotente)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_settle_paid_order(p_order_id text, p_stage text DEFAULT 'on_paid')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.kitchen_orders;
  v_voucher public.food_club_vouchers;
  v_released public.food_club_vouchers;
  v_charge_ok boolean;
  v_stamp jsonb;
  v_ref jsonb;
BEGIN
  BEGIN
    SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
    IF NOT FOUND OR v_order.payment_status IS DISTINCT FROM 'paid' THEN RETURN; END IF;
    v_charge_ok := EXISTS (SELECT 1 FROM public.kitchen_payments p
                            WHERE p.order_id = v_order.id AND p.direction = 'charge' AND p.status = 'succeeded'
                              AND p.amount = v_order.total);
    SELECT * INTO v_voucher FROM public.food_club_vouchers
     WHERE reserved_order_id = v_order.id AND status = 'reserved' FOR UPDATE;
    IF v_voucher.id IS NOT NULL THEN
      IF v_charge_ok THEN
        UPDATE public.food_club_vouchers
           SET status = 'used', used_order_id = v_order.id, used_at = now()
         WHERE id = v_voucher.id AND status = 'reserved';
        PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'used', 'order_paid', v_order.id, 'system',
          jsonb_build_object('payment_method', v_order.payment_method, 'stage', p_stage));
      ELSIF NOT EXISTS (SELECT 1 FROM public.kitchen_action_log
                         WHERE order_id = v_order.id AND action = 'food_club_paid_without_charge') THEN
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (v_order.id, v_order.venue_id, 'food_club_paid_without_charge', 'system',
                jsonb_build_object('voucher_id', v_voucher.id, 'needs_manual_reconciliation', true));
      END IF;
    ELSIF v_charge_ok AND COALESCE(v_order.discount_amount, 0) > 0
          AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers WHERE used_order_id = v_order.id) THEN
      -- FIX-1: buono riservato su questo ordine e poi rilasciato (abbandono/annullo), ma l'ordine è stato pagato
      -- col totale scontato.
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
            v_order.id, 'system', jsonb_build_object('stage', p_stage));
        ELSIF v_released.status <> 'expired' THEN
          -- Già riservato/usato su un altro ordine (o revocato): il cliente ha avuto lo sconto due volte.
          INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
          VALUES (v_order.id, v_order.venue_id, 'food_club_voucher_double_spend', 'system',
                  jsonb_build_object('voucher_id', v_released.id, 'voucher_status', v_released.status,
                                     'other_order_id', COALESCE(v_released.used_order_id, v_released.reserved_order_id),
                                     'discount', v_order.discount_amount, 'needs_manual_reconciliation', true));
        END IF;
        -- 'expired': lo sconto è stato goduto una sola volta (su questo ordine), nulla da fare.
      END IF;
    END IF;
    IF v_charge_ok THEN
      v_stamp := public.food_club_award_order_stamp(v_order.id);
      v_ref := public.food_club_try_referral_reward(v_order.id);
      IF v_order.source = 'customer_app' AND (p_stage = 'on_paid' OR (v_stamp->>'awarded')::boolean
                                               OR (v_ref->>'rewarded')::boolean OR v_voucher.id IS NOT NULL) THEN
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (v_order.id, v_order.venue_id, 'food_club_order_paid', 'system',
                jsonb_build_object('stamp', v_stamp, 'referral', v_ref, 'voucher_id', v_voucher.id, 'stage', p_stage));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (p_order_id, v_order.venue_id, 'food_club_error', 'system',
            jsonb_build_object('stage', p_stage, 'sqlstate', SQLSTATE, 'message', left(SQLERRM, 300),
                               'needs_manual_reconciliation', true));
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
  PERFORM public.food_club_settle_paid_order(NEW.id, 'on_paid');
  RETURN NULL;
END;
$$;

-- FIX-2: charge riuscito registrato quando l'ordine è GIÀ 'paid' (il trigger su payment_status non riscatta).
CREATE OR REPLACE FUNCTION public.kitchen_payments_food_club_on_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kitchen_orders WHERE id = NEW.order_id AND payment_status = 'paid') THEN
    PERFORM public.food_club_settle_paid_order(NEW.order_id, 'on_charge');
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_payments_food_club_on_charge ON public.kitchen_payments;
CREATE TRIGGER kitchen_payments_food_club_on_charge
  AFTER INSERT OR UPDATE OF status, amount ON public.kitchen_payments
  FOR EACH ROW
  WHEN (NEW.direction = 'charge' AND NEW.status = 'succeeded')
  EXECUTE FUNCTION public.kitchen_payments_food_club_on_charge();

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

  -- REVIEW-FIX: anche un buono RILASCIATO da questo ordine (abbandono/annullo, poi pagamento tardivo) conta come
  -- "ordine con buono": lo sconto è già dentro total.
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
    -- REVIEW-FIX: premio invito generato da questo ordine. Se il buono dell'invitante non è ancora usato si revoca
    -- e l'invito diventa 'void' (non si ri-qualifica); se è già riservato/usato resta, segnalazione allo staff.
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


-- ---------------------------------------------------------------------------------------------------
-- FIX-4: niente SET NULL verso kitchen_orders (violava i CHECK): RESTRICT, come kitchen_payments.
-- ---------------------------------------------------------------------------------------------------
ALTER TABLE public.food_club_stamps DROP CONSTRAINT IF EXISTS food_club_stamps_order_id_fkey,
  ADD CONSTRAINT food_club_stamps_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.kitchen_orders(id) ON DELETE RESTRICT;
ALTER TABLE public.food_club_vouchers DROP CONSTRAINT IF EXISTS food_club_vouchers_reserved_order_id_fkey,
  ADD CONSTRAINT food_club_vouchers_reserved_order_id_fkey FOREIGN KEY (reserved_order_id) REFERENCES public.kitchen_orders(id) ON DELETE RESTRICT;
ALTER TABLE public.food_club_vouchers DROP CONSTRAINT IF EXISTS food_club_vouchers_used_order_id_fkey,
  ADD CONSTRAINT food_club_vouchers_used_order_id_fkey FOREIGN KEY (used_order_id) REFERENCES public.kitchen_orders(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------------------------------
-- FIX-5: combo, la quota food segue la variazione di prezzo (quota bevanda costante), mai > prezzo né < 0.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_menu_items_food_amount_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.food_category = 'food' AND NEW.price IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.price IS DISTINCT FROM OLD.price OR NEW.food_unit_amount IS NULL) THEN
    NEW.food_unit_amount := NEW.price;
  ELSIF NEW.food_category = 'drink' THEN
    NEW.food_unit_amount := 0;
  ELSIF NEW.food_category = 'combo' AND TG_OP = 'UPDATE' AND NEW.price IS NOT NULL AND OLD.price IS NOT NULL
        AND NEW.price IS DISTINCT FROM OLD.price AND NEW.food_unit_amount IS NOT DISTINCT FROM OLD.food_unit_amount THEN
    NEW.food_unit_amount := GREATEST(LEAST(COALESCE(OLD.food_unit_amount, 0) + (NEW.price - OLD.price), NEW.price), 0);
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Permessi (funzioni interne: nessun EXECUTE a PUBLIC/anon/authenticated)
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_settle_paid_order(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_payments_food_club_on_charge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_paid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_refunded() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_award_order_stamp(text) FROM PUBLIC, anon, authenticated;
