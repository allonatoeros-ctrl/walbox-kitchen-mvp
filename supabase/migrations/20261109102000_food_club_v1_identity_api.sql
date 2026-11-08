-- WALRUS FOOD CLUB V1 — F3 identità e consensi + API cliente + coda notifiche (F6 lato DB).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros.
-- Riferimenti: F0-rapporto.md §1 (P1-P8), §3; PWA-NOTIFICHE-spec.md §4, §5, §6.
--
-- Identità: tessera = telefono verificato (D-6 chiusa). L'iscrizione richiede una sessione NON anonima con
-- auth.users.phone e phone_confirmed_at valorizzati (OTP verificato da Supabase Auth). Precondizione di produzione
-- ancora aperta: "Confirm phone" attivo (P1 di F0) — senza, il numero non è davvero verificato.
-- Unione dispositivi: biglietto legato all'hash del numero (risolve P4: chi lo intercetta non può riscattarlo con un
-- numero diverso).

-- ---------------------------------------------------------------------------------------------------
-- 1) Utilità identità
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_phone_hash(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  -- Normalizzazione minima: solo cifre, prefisso implicito 39 se manca (numeri italiani).
  SELECT CASE WHEN p_phone IS NULL OR regexp_replace(p_phone, '\D', '', 'g') = '' THEN NULL
    ELSE encode(extensions.digest('food-club-v1:' ||
      CASE WHEN length(regexp_replace(p_phone, '\D', '', 'g')) <= 10 AND left(regexp_replace(p_phone, '\D', '', 'g'), 1) = '3'
           THEN '39' || regexp_replace(p_phone, '\D', '', 'g')
           ELSE regexp_replace(p_phone, '\D', '', 'g') END, 'sha256'), 'hex') END
$$;

CREATE OR REPLACE FUNCTION public.food_club_verified_phone(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.phone FROM auth.users u
   WHERE u.id = p_uid AND NOT COALESCE(u.is_anonymous, false)
     AND u.phone IS NOT NULL AND u.phone <> '' AND u.phone_confirmed_at IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.food_club_mask_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT CASE WHEN p_phone IS NULL THEN NULL ELSE '••• ••• ' || right(regexp_replace(p_phone, '\D', '', 'g'), 3) END $$;

CREATE OR REPLACE FUNCTION public.food_club_new_referral_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text; v_bytes bytea;
BEGIN
  LOOP
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    FOR i IN 0..5 LOOP v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE referral_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Timbri retroattivi (D-13): ordini propri pagati entro retroactive_days (0 = spento, nessun effetto).
CREATE OR REPLACE FUNCTION public.food_club_award_retroactive(p_uid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.food_club_campaigns;
  v_member public.food_club_members;
  v_n integer := 0;
  r record;
  v_res jsonb;
BEGIN
  SELECT * INTO v_member FROM public.food_club_members WHERE user_id = p_uid AND status = 'active';
  IF NOT FOUND THEN RETURN 0; END IF;
  v_campaign := public.food_club_active_campaign(v_member.venue_id);
  IF v_campaign.id IS NULL OR v_campaign.retroactive_days = 0 THEN RETURN 0; END IF;
  FOR r IN SELECT o.id FROM public.kitchen_orders o
            WHERE o.customer_id = p_uid AND o.payment_status = 'paid' AND o.source = 'customer_app'
              AND o.created_at >= v_member.joined_at - make_interval(days => v_campaign.retroactive_days)
              AND NOT EXISTS (SELECT 1 FROM public.food_club_stamps s WHERE s.order_id = o.id)
            ORDER BY o.created_at LOOP
    v_res := public.food_club_award_order_stamp(r.id);
    IF (v_res->>'awarded')::boolean THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Iscrizione, uscita, preferenze e consensi
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_join(
  p_terms_version text, p_service_consent boolean, p_marketing_consent boolean DEFAULT false,
  p_display_name text DEFAULT NULL, p_referral_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text;
  v_hash text;
  v_member public.food_club_members;
  v_campaign public.food_club_campaigns;
  v_inviter public.food_club_members;
  v_card public.food_club_cards;
  v_referral_status text := 'none';
  v_retro integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  v_phone := public.food_club_verified_phone(v_uid);
  IF v_phone IS NULL THEN RAISE EXCEPTION 'verified_phone_required'; END IF;
  IF p_service_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'service_consent_required'; END IF;
  IF p_terms_version IS NULL OR btrim(p_terms_version) = '' OR char_length(p_terms_version) > 40 THEN
    RAISE EXCEPTION 'terms_version_required';
  END IF;
  IF p_display_name IS NOT NULL AND char_length(btrim(p_display_name)) > 30 THEN RAISE EXCEPTION 'display_name_too_long'; END IF;
  v_hash := public.food_club_phone_hash(v_phone);

  SELECT * INTO v_member FROM public.food_club_members WHERE user_id = v_uid FOR UPDATE;
  IF FOUND AND v_member.status = 'active' THEN
    RETURN jsonb_build_object('member', true, 'already_member', true);
  END IF;

  IF FOUND THEN
    -- Rientro di un ex iscritto: nessun invito, nessun benvenuto.
    UPDATE public.food_club_members
       SET status = 'active', left_at = NULL, joined_at = now(), terms_version = p_terms_version,
           service_consent_at = now(), phone_hash = v_hash,
           marketing_consent_at = CASE WHEN p_marketing_consent THEN now() ELSE NULL END,
           marketing_revoked_at = NULL, display_name = NULLIF(btrim(p_display_name), ''), updated_at = now()
     WHERE user_id = v_uid RETURNING * INTO v_member;
  ELSE
    -- Stesso numero già usato da un altro account (es. numero riassegnato): rifiuto, lo gestisce lo staff (D-15).
    IF EXISTS (SELECT 1 FROM public.food_club_members WHERE phone_hash = v_hash) THEN
      RAISE EXCEPTION 'phone_already_member';
    END IF;
    INSERT INTO public.food_club_members (user_id, terms_version, service_consent_at, marketing_consent_at,
      display_name, referral_code, phone_hash)
    VALUES (v_uid, p_terms_version, now(), CASE WHEN p_marketing_consent THEN now() ELSE NULL END,
      NULLIF(btrim(p_display_name), ''), public.food_club_new_referral_code(), v_hash)
    RETURNING * INTO v_member;

    -- Invito (solo nuovi iscritti, solo con inviti accesi: D-14).
    IF p_referral_code IS NOT NULL AND btrim(p_referral_code) <> '' THEN
      v_campaign := public.food_club_active_campaign(v_member.venue_id);
      SELECT * INTO v_inviter FROM public.food_club_members
       WHERE referral_code = upper(btrim(p_referral_code)) AND status = 'active';
      IF v_campaign.id IS NULL OR NOT v_campaign.referral_enabled THEN
        v_referral_status := 'referral_disabled';
      ELSIF v_inviter.user_id IS NULL THEN
        v_referral_status := 'invalid_code';
      ELSIF v_inviter.user_id = v_uid OR v_inviter.phone_hash = v_hash THEN
        v_referral_status := 'self_invite';
      ELSIF EXISTS (SELECT 1 FROM public.kitchen_orders o WHERE o.customer_id = v_uid AND o.payment_status = 'paid') THEN
        v_referral_status := 'not_new_customer';
      ELSE
        INSERT INTO public.food_club_referrals (inviter_id, invitee_id, campaign_id)
        VALUES (v_inviter.user_id, v_uid, v_campaign.id);
        UPDATE public.food_club_members SET referred_by = v_inviter.user_id WHERE user_id = v_uid;
        v_referral_status := 'linked';
        -- Timbro di benvenuto (D-4, spento di default): apre la finestra dall'iscrizione.
        IF v_campaign.welcome_stamp_enabled THEN
          INSERT INTO public.food_club_cards (user_id, campaign_id, opened_at, expires_at)
          VALUES (v_uid, v_campaign.id, now(), now() + make_interval(days => v_campaign.window_days))
          RETURNING * INTO v_card;
          INSERT INTO public.food_club_stamps (user_id, card_id, campaign_id, kind, service_night)
          VALUES (v_uid, v_card.id, v_campaign.id, 'welcome', public.food_club_service_night(now()));
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.food_club_consent_events (user_id, kind, granted, text_version)
  VALUES (v_uid, 'service', true, p_terms_version),
         (v_uid, 'marketing', COALESCE(p_marketing_consent, false), p_terms_version);
  INSERT INTO public.food_club_events (user_id, event_name, context) VALUES (v_uid, 'join_done', NULL)
  ON CONFLICT DO NOTHING;
  v_retro := public.food_club_award_retroactive(v_uid);
  RETURN jsonb_build_object('member', true, 'already_member', false, 'referral', v_referral_status,
                            'retroactive_stamps', v_retro);
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_set_preferences(
  p_text_version text, p_notif_club boolean DEFAULT NULL, p_notif_promo boolean DEFAULT NULL,
  p_marketing boolean DEFAULT NULL)
RETURNS public.food_club_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.food_club_members;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  IF p_text_version IS NULL OR btrim(p_text_version) = '' THEN RAISE EXCEPTION 'terms_version_required'; END IF;
  SELECT * INTO v_m FROM public.food_club_members WHERE user_id = v_uid AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF;
  IF p_marketing IS NOT NULL AND p_marketing IS DISTINCT FROM (v_m.marketing_consent_at IS NOT NULL) THEN
    UPDATE public.food_club_members
       SET marketing_consent_at = CASE WHEN p_marketing THEN now() ELSE NULL END,
           marketing_revoked_at = CASE WHEN p_marketing THEN NULL ELSE now() END,
           -- Revoca marketing = niente promo push, con effetto immediato.
           notif_promo_enabled = CASE WHEN p_marketing THEN notif_promo_enabled ELSE false END
     WHERE user_id = v_uid;
    INSERT INTO public.food_club_consent_events (user_id, kind, granted, text_version) VALUES (v_uid, 'marketing', p_marketing, p_text_version);
  END IF;
  IF p_notif_club IS NOT NULL AND p_notif_club IS DISTINCT FROM v_m.notif_club_enabled THEN
    UPDATE public.food_club_members SET notif_club_enabled = p_notif_club WHERE user_id = v_uid;
    INSERT INTO public.food_club_consent_events (user_id, kind, granted, text_version) VALUES (v_uid, 'notif_club', p_notif_club, p_text_version);
  END IF;
  IF p_notif_promo IS NOT NULL THEN
    IF p_notif_promo AND NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = v_uid AND marketing_consent_at IS NOT NULL) THEN
      RAISE EXCEPTION 'marketing_consent_required';
    END IF;
    IF p_notif_promo IS DISTINCT FROM v_m.notif_promo_enabled THEN
      UPDATE public.food_club_members SET notif_promo_enabled = p_notif_promo WHERE user_id = v_uid;
      INSERT INTO public.food_club_consent_events (user_id, kind, granted, text_version) VALUES (v_uid, 'notif_promo', p_notif_promo, p_text_version);
    END IF;
  END IF;
  UPDATE public.food_club_members SET updated_at = now() WHERE user_id = v_uid RETURNING * INTO v_m;
  RETURN v_m;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_leave(p_text_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  UPDATE public.food_club_members
     SET status = 'left', left_at = now(), notif_club_enabled = false, notif_promo_enabled = false,
         marketing_revoked_at = CASE WHEN marketing_consent_at IS NOT NULL THEN now() ELSE marketing_revoked_at END,
         marketing_consent_at = NULL, updated_at = now()
   WHERE user_id = v_uid AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_member'; END IF;
  INSERT INTO public.food_club_consent_events (user_id, kind, granted, text_version)
  VALUES (v_uid, 'leave', false, COALESCE(p_text_version, 'n/d'));
  UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'member_left'
   WHERE user_id = v_uid AND push_status = 'queued';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Lettura stato per l'app cliente
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_public_campaign(p_venue_id text DEFAULT 'walrus-main')
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN c.id IS NULL THEN jsonb_build_object('active', false)
    ELSE jsonb_build_object('active', true, 'id', c.id, 'name', c.name,
      'stamp_min_food', c.stamp_min_food, 'stamps_required', c.stamps_required, 'window_days', c.window_days,
      'voucher_value', c.voucher_value, 'voucher_min_food', c.voucher_min_food,
      'voucher_valid_days', c.voucher_valid_days, 'referral_enabled', c.referral_enabled,
      'welcome_stamp_enabled', c.welcome_stamp_enabled, 'stamp_on_voucher_order', c.stamp_on_voucher_order) END
  FROM (SELECT (public.food_club_active_campaign(p_venue_id)).*) c
$$;

CREATE OR REPLACE FUNCTION public.food_club_my_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.food_club_members;
  v_card jsonb;
  v_vouchers jsonb;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('session', false, 'member', false, 'campaign', public.food_club_public_campaign('walrus-main'));
  END IF;
  SELECT * INTO v_m FROM public.food_club_members WHERE user_id = v_uid;
  v_phone := public.food_club_verified_phone(v_uid);
  IF NOT FOUND OR v_m.status <> 'active' THEN
    RETURN jsonb_build_object('session', true, 'member', false, 'left', FOUND AND v_m.status = 'left',
      'phone_verified', v_phone IS NOT NULL, 'phone_masked', public.food_club_mask_phone(v_phone),
      'campaign', public.food_club_public_campaign('walrus-main'));
  END IF;
  SELECT jsonb_build_object('id', c.id, 'opened_at', c.opened_at, 'expires_at', c.expires_at,
           'expired', c.expires_at <= now(),
           'stamps', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'service_night', s.service_night,
                       'created_at', s.created_at) ORDER BY s.created_at), '[]'::jsonb)
                        FROM public.food_club_stamps s WHERE s.card_id = c.id AND s.revoked_at IS NULL))
    INTO v_card
    FROM public.food_club_cards c
   WHERE c.user_id = v_uid AND c.status = 'open'
   ORDER BY c.opened_at DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', v.id, 'code', v.code, 'value', v.value, 'min_food', v.min_food,
           'status', CASE WHEN v.status = 'available' AND v.expires_at <= now() THEN 'expired' ELSE v.status END,
           'source', v.source, 'issued_at', v.issued_at, 'expires_at', v.expires_at,
           'reserved_order_id', v.reserved_order_id,
           'reserved_order_code', (SELECT o.order_code FROM public.kitchen_orders o WHERE o.id = v.reserved_order_id),
           'used_order_code', (SELECT o.order_code FROM public.kitchen_orders o WHERE o.id = v.used_order_id),
           'used_at', v.used_at,
           'last_event', (SELECT e.event FROM public.food_club_voucher_events e WHERE e.voucher_id = v.id ORDER BY e.id DESC LIMIT 1))
           ORDER BY v.issued_at DESC), '[]'::jsonb)
    INTO v_vouchers
    FROM public.food_club_vouchers v WHERE v.user_id = v_uid AND v.issued_at > now() - interval '120 days';
  RETURN jsonb_build_object(
    'session', true, 'member', true, 'phone_verified', v_phone IS NOT NULL,
    'phone_masked', public.food_club_mask_phone(v_phone),
    'joined_at', v_m.joined_at, 'display_name', v_m.display_name,
    'prefs', jsonb_build_object('notif_club', v_m.notif_club_enabled, 'notif_promo', v_m.notif_promo_enabled,
                                'marketing', v_m.marketing_consent_at IS NOT NULL,
                                'marketing_consent_at', v_m.marketing_consent_at, 'terms_version', v_m.terms_version),
    'referral_code', v_m.referral_code,
    'campaign', public.food_club_public_campaign(v_m.venue_id),
    'card', v_card,
    'vouchers', v_vouchers,
    'unread_messages', (SELECT count(*) FROM public.food_club_messages WHERE user_id = v_uid AND read_at IS NULL),
    'stamped_tonight', EXISTS (SELECT 1 FROM public.food_club_stamps WHERE user_id = v_uid AND kind = 'order'
                                AND revoked_at IS NULL AND service_night = public.food_club_service_night(now())),
    'referrals', jsonb_build_object(
      'pending', (SELECT count(*) FROM public.food_club_referrals WHERE inviter_id = v_uid AND status = 'pending'),
      'rewarded', (SELECT count(*) FROM public.food_club_referrals WHERE inviter_id = v_uid AND status = 'rewarded'))
  );
END;
$$;

-- Stato Club di un ordine proprio (pagina stato ordine): buono applicato, timbro ottenuto o motivo.
CREATE OR REPLACE FUNCTION public.food_club_order_status(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_o public.kitchen_orders;
  v_v public.food_club_vouchers;
  v_s public.food_club_stamps;
BEGIN
  SELECT * INTO v_o FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_o.customer_id IS DISTINCT FROM auth.uid() THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO v_v FROM public.food_club_vouchers WHERE reserved_order_id = v_o.id OR used_order_id = v_o.id LIMIT 1;
  SELECT * INTO v_s FROM public.food_club_stamps WHERE order_id = v_o.id;
  RETURN jsonb_build_object('found', true,
    'food_amount', public.food_club_order_food_amount(v_o.id),
    'discount_amount', v_o.discount_amount,
    'voucher', CASE WHEN v_v.id IS NULL THEN NULL ELSE jsonb_build_object('code', v_v.code, 'status', v_v.status, 'value', v_v.value) END,
    'stamp', CASE WHEN v_s.id IS NULL THEN NULL ELSE jsonb_build_object('revoked', v_s.revoked_at IS NOT NULL, 'service_night', v_s.service_night) END,
    'member', EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = auth.uid() AND status = 'active'));
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_my_messages(p_limit integer DEFAULT 30)
RETURNS SETOF public.food_club_messages
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.food_club_messages WHERE user_id = auth.uid()
   ORDER BY created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
$$;

CREATE OR REPLACE FUNCTION public.food_club_message_mark(p_message_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  IF p_action = 'read' THEN
    UPDATE public.food_club_messages SET read_at = COALESCE(read_at, now())
     WHERE user_id = auth.uid() AND (p_message_id IS NULL OR id = p_message_id);
  ELSIF p_action = 'opened' THEN
    UPDATE public.food_club_messages SET opened_at = COALESCE(opened_at, now()), read_at = COALESCE(read_at, now())
     WHERE user_id = auth.uid() AND id = p_message_id;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4) Unione anonimo -> iscritto su altro dispositivo (biglietto legato al numero)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_create_merge_ticket(p_phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND is_anonymous) THEN RAISE EXCEPTION 'anonymous_session_required'; END IF;
  IF public.food_club_phone_hash(p_phone) IS NULL THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  -- Niente da unire: nessun biglietto.
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_orders WHERE customer_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_push_subscriptions WHERE customer_id = v_uid) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.food_club_merge_tickets WHERE source_user_id = v_uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'merge_ticket_rate_limited';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.food_club_merge_tickets (token_hash, source_user_id, phone_hash)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid, public.food_club_phone_hash(p_phone));
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_redeem_merge_ticket(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t public.food_club_merge_tickets;
  v_phone text;
  v_orders integer := 0;
  v_push integer := 0;
  v_retro integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  v_phone := public.food_club_verified_phone(v_uid);
  IF v_phone IS NULL THEN RAISE EXCEPTION 'verified_phone_required'; END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_ticket'; END IF;
  SELECT * INTO v_t FROM public.food_club_merge_tickets
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ticket'; END IF;
  IF v_t.redeemed_at IS NOT NULL THEN
    IF v_t.redeemed_by = v_uid THEN RETURN jsonb_build_object('merged', true, 'replay', true); END IF;
    RAISE EXCEPTION 'ticket_already_used';
  END IF;
  IF v_t.expires_at <= now() THEN RAISE EXCEPTION 'ticket_expired'; END IF;
  -- P4: il biglietto vale solo per il numero per cui è stato creato.
  IF v_t.phone_hash IS DISTINCT FROM public.food_club_phone_hash(v_phone) THEN RAISE EXCEPTION 'ticket_phone_mismatch'; END IF;
  IF v_t.source_user_id = v_uid THEN RAISE EXCEPTION 'ticket_same_user'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_t.source_user_id AND is_anonymous) THEN RAISE EXCEPTION 'ticket_source_not_anonymous'; END IF;

  UPDATE public.kitchen_orders SET customer_id = v_uid WHERE customer_id = v_t.source_user_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;
  UPDATE public.kitchen_push_subscriptions SET customer_id = v_uid, last_seen_at = now()
   WHERE customer_id = v_t.source_user_id;
  GET DIAGNOSTICS v_push = ROW_COUNT;
  UPDATE public.kitchen_promo_passes p SET customer_id = v_uid
   WHERE p.customer_id = v_t.source_user_id
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_promo_passes q WHERE q.customer_id = v_uid AND q.campaign = p.campaign);
  UPDATE public.food_club_merge_tickets SET redeemed_at = now(), redeemed_by = v_uid WHERE id = v_t.id;
  INSERT INTO public.kitchen_action_log (venue_id, action, actor_type, actor_id, metadata)
  VALUES ('walrus-main', 'food_club_merge', 'customer', v_uid,
          jsonb_build_object('source_user_id', v_t.source_user_id, 'orders', v_orders, 'push', v_push));
  v_retro := public.food_club_award_retroactive(v_uid);
  RETURN jsonb_build_object('merged', true, 'orders', v_orders, 'push', v_push, 'retroactive_stamps', v_retro);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5) Push: sottoscrizione con ambito di consenso + touch (corregge last_seen_at, A10)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_push_subscribe(p_venue_id text, p_endpoint text, p_p256dh text,
  p_auth_key text, p_user_agent text DEFAULT NULL, p_scope text DEFAULT NULL, p_text_version text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.kitchen_push_subscriptions;
  v_scope text;
BEGIN
  IF p_scope IS NOT NULL AND p_scope NOT IN ('order', 'club') THEN RAISE EXCEPTION 'invalid_scope'; END IF;
  -- Claim esistente: stesse guardie, riassegna l'endpoint all'uid corrente e aggiorna last_seen_at.
  v_row := public.kitchen_push_subscription_claim(p_venue_id, p_endpoint, p_p256dh, p_auth_key, p_user_agent);
  v_scope := v_row.consent_scope;
  IF p_scope = 'club' THEN
    IF NOT EXISTS (SELECT 1 FROM public.food_club_members WHERE user_id = v_uid AND status = 'active') THEN
      RAISE EXCEPTION 'not_member';
    END IF;
    UPDATE public.kitchen_push_subscriptions SET consent_scope = 'club' WHERE id = v_row.id;
    v_scope := 'club';
    -- Tocco esplicito su ATTIVA NOTIFICHE = consenso agli avvisi tessera/premi (D-18 proposta).
    PERFORM public.food_club_set_preferences(COALESCE(p_text_version, 'push-club-v1'), true, NULL, NULL);
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'scope', v_scope, 'last_seen_at', now());
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6) Misura (eventi interni deduplicati)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_track(p_event text, p_context text DEFAULT NULL, p_platform text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO public.food_club_events (user_id, event_name, context, platform)
  VALUES (auth.uid(), p_event, left(p_context, 40), left(p_platform, 30))
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'invalid_event';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 7) Consegna notifiche (usata dalla Edge Function send-food-club-push, service_role)
-- ---------------------------------------------------------------------------------------------------
-- Regole (PWA-NOTIFICHE-spec §4.2, D-19 valori proposti): categoria club solo con notif_club_enabled e almeno
-- una sottoscrizione 'club'; promo solo con marketing valido AL MOMENTO dell'invio + notif_promo_enabled;
-- fascia silenziosa 22:30-10:00 (tranne timbro e buono sbloccato, che seguono un pagamento appena fatto);
-- max 1 push Club per utente al giorno; promo max 1 ogni 7 giorni e 2 al mese; timbro più vecchio di 12 h = saltato.
CREATE OR REPLACE FUNCTION public.food_club_push_claim_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (message_id uuid, user_id uuid, kind text, title text, body text, url text, subscriptions jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.food_club_messages;
  v_m public.food_club_members;
  v_local timestamp;
  v_quiet boolean;
  v_subs jsonb;
  v_next10 timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'; END IF;
  -- Ripristina invii rimasti 'sending' da più di 10 minuti (funzione caduta a metà).
  UPDATE public.food_club_messages SET push_status = 'queued'
   WHERE push_status = 'sending' AND push_claimed_at < now() - interval '10 minutes' AND push_attempts < 3;
  v_local := now() AT TIME ZONE 'Europe/Rome';
  v_quiet := v_local::time >= time '22:30' OR v_local::time < time '10:00';
  v_next10 := (date_trunc('day', v_local) + CASE WHEN v_local::time >= time '10:00' THEN interval '1 day 10 hours' ELSE interval '10 hours' END)
              AT TIME ZONE 'Europe/Rome';
  FOR r IN SELECT * FROM public.food_club_messages m
            WHERE m.push_status = 'queued' AND m.push_after <= now()
            ORDER BY m.push_after LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
            FOR UPDATE SKIP LOCKED LOOP
    SELECT * INTO v_m FROM public.food_club_members WHERE food_club_members.user_id = r.user_id;
    IF v_m.user_id IS NULL OR v_m.status <> 'active' THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'not_member' WHERE id = r.id; CONTINUE;
    END IF;
    IF r.category = 'promo' AND (v_m.marketing_consent_at IS NULL OR v_m.marketing_revoked_at IS NOT NULL OR NOT v_m.notif_promo_enabled) THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'no_marketing_consent' WHERE id = r.id; CONTINUE;
    END IF;
    IF r.category = 'club' AND NOT v_m.notif_club_enabled THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'club_notifications_off' WHERE id = r.id; CONTINUE;
    END IF;
    IF r.kind = 'stamp' AND r.created_at < now() - interval '12 hours' THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'stale' WHERE id = r.id; CONTINUE;
    END IF;
    IF r.kind = 'voucher_expiring' AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v WHERE v.id::text = r.ref AND v.status = 'available' AND v.expires_at > now()) THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'voucher_not_available' WHERE id = r.id; CONTINUE;
    END IF;
    IF v_quiet AND r.kind NOT IN ('stamp', 'voucher_unlocked') THEN
      UPDATE public.food_club_messages SET push_after = v_next10 WHERE id = r.id; CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.food_club_messages x
                WHERE x.user_id = r.user_id AND x.id <> r.id
                  AND ((x.push_status = 'sent' AND x.push_sent_at > now() - interval '20 hours')
                       OR x.push_status = 'sending')) THEN
      IF r.kind = 'stamp' THEN
        UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'daily_cap' WHERE id = r.id;
      ELSE
        UPDATE public.food_club_messages SET push_after = GREATEST(v_next10, now() + interval '20 hours') WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;
    IF r.category = 'promo' AND (
         EXISTS (SELECT 1 FROM public.food_club_messages x WHERE x.user_id = r.user_id AND x.category = 'promo'
                   AND x.push_status = 'sent' AND x.push_sent_at > now() - interval '7 days')
      OR (SELECT count(*) FROM public.food_club_messages x WHERE x.user_id = r.user_id AND x.category = 'promo'
            AND x.push_status = 'sent' AND x.push_sent_at > now() - interval '30 days') >= 2) THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'promo_cap' WHERE id = r.id; CONTINUE;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth_key)), '[]'::jsonb)
      INTO v_subs FROM public.kitchen_push_subscriptions s
     WHERE s.customer_id = r.user_id AND s.consent_scope = 'club';
    IF jsonb_array_length(v_subs) = 0 THEN
      UPDATE public.food_club_messages SET push_status = 'skipped', push_skip_reason = 'no_club_subscription' WHERE id = r.id; CONTINUE;
    END IF;
    UPDATE public.food_club_messages SET push_status = 'sending', push_claimed_at = now(), push_attempts = push_attempts + 1 WHERE id = r.id;
    message_id := r.id; user_id := r.user_id; kind := r.kind; title := r.title; body := r.body;
    url := r.url || CASE WHEN position('?' IN r.url) > 0 THEN '&' ELSE '?' END || 'n=' || r.id::text;
    subscriptions := v_subs;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_push_report(p_message_id uuid, p_delivered integer, p_gone_endpoints text[] DEFAULT '{}', p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'; END IF;
  IF COALESCE(array_length(p_gone_endpoints, 1), 0) > 0 THEN
    DELETE FROM public.kitchen_push_subscriptions s
     USING public.food_club_messages m
     WHERE m.id = p_message_id AND s.customer_id = m.user_id AND s.endpoint = ANY (p_gone_endpoints);
  END IF;
  UPDATE public.food_club_messages
     SET push_status = CASE WHEN COALESCE(p_delivered, 0) > 0 THEN 'sent'
                            WHEN push_attempts >= 3 OR p_error = 'vapid_not_configured' THEN 'failed'
                            ELSE 'queued' END,
         push_sent_at = CASE WHEN COALESCE(p_delivered, 0) > 0 THEN now() ELSE push_sent_at END,
         push_after = CASE WHEN COALESCE(p_delivered, 0) > 0 THEN push_after ELSE now() + interval '5 minutes' END,
         push_skip_reason = left(p_error, 80)
   WHERE id = p_message_id AND push_status = 'sending';
END;
$$;

-- Job: ogni 5 minuti chiama la Edge Function SOLO se ci sono messaggi in coda (stesso schema Vault del tick
-- di abbandono). Senza secret in Vault il tick non parte (nessun invio reale finché Eros non configura).
CREATE OR REPLACE FUNCTION public.food_club_push_tick(p_url text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_club_messages WHERE push_status = 'queued' AND push_after <= now()) THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'food_club_push_secret' LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE WARNING 'food_club_push_tick: secret food_club_push_secret assente in Vault, invio saltato';
    RETURN NULL;
  END IF;
  RETURN net.http_post(url := p_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000);
END;
$$;
-- Il job pg_cron NON è schedulato qui: richiede URL della funzione e secret in Vault (gate di Eros, runbook).

-- ---------------------------------------------------------------------------------------------------
-- 8) Retention privacy: gli ex iscritti restano finché non chiedono la cancellazione; i biglietti scaduti si puliscono.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_retention_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_t integer; v_e integer; v_m integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  DELETE FROM public.food_club_merge_tickets WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_t = ROW_COUNT;
  DELETE FROM public.food_club_events WHERE created_at < now() - interval '400 days';
  GET DIAGNOSTICS v_e = ROW_COUNT;
  DELETE FROM public.food_club_messages WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_m = ROW_COUNT;
  RETURN jsonb_build_object('tickets', v_t, 'events', v_e, 'messages', v_m);
END;
$$;
SELECT cron.schedule('food-club-retention-sweep', '20 3 * * *', $cron$SELECT public.food_club_retention_sweep()$cron$);

-- ---------------------------------------------------------------------------------------------------
-- 9) Permessi
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_phone_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_verified_phone(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_mask_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_new_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_award_retroactive(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_push_claim_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_push_report(uuid, integer, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_push_tick(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_retention_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_push_claim_batch(integer), public.food_club_push_report(uuid, integer, text[], text),
  public.food_club_retention_sweep() TO service_role;

REVOKE ALL ON FUNCTION public.food_club_join(text, boolean, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_set_preferences(text, boolean, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_leave(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_my_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_order_status(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_my_messages(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_message_mark(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_create_merge_ticket(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_redeem_merge_ticket(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_push_subscribe(text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_track(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_public_campaign(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.food_club_join(text, boolean, boolean, text, text),
  public.food_club_set_preferences(text, boolean, boolean, boolean),
  public.food_club_leave(text),
  public.food_club_my_state(),
  public.food_club_order_status(text),
  public.food_club_my_messages(integer),
  public.food_club_message_mark(uuid, text),
  public.food_club_create_merge_ticket(text),
  public.food_club_redeem_merge_ticket(text),
  public.food_club_push_subscribe(text, text, text, text, text, text, text),
  public.food_club_track(text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_public_campaign(text) TO anon, authenticated;
