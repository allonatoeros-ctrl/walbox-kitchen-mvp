-- FOOD CLUB V1 — fase C: tessera dopo il 2 timbro. food_club_my_state() restituisce anche `last_completed_card`
-- (ultima tessera completata + stato del buono collegato). Solo lettura: stessa definizione di 20261109102000
-- piu' questo campo; nessun cambio a regole commerciali, tabelle, trigger. SECURITY/search_path/GRANT identici.
-- Il campo `totals` e le colonne staff della proposta in docs/ NON sono inclusi (fuori scope: decisione di Eros).

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
  v_last jsonb;
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
  -- NUOVO (sola lettura): ultima tessera completata, con lo stato del buono collegato.
  SELECT jsonb_build_object('id', c.id, 'completed_at', c.completed_at, 'opened_at', c.opened_at,
           'voucher_id', c.voucher_id,
           'stamps', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', s.kind, 'service_night', s.service_night,
                       'created_at', s.created_at) ORDER BY s.created_at), '[]'::jsonb)
                        FROM public.food_club_stamps s WHERE s.card_id = c.id AND s.revoked_at IS NULL),
           'voucher', (SELECT jsonb_build_object('id', v.id, 'code', v.code, 'value', v.value, 'min_food', v.min_food,
                         'status', CASE WHEN v.status = 'available' AND v.expires_at <= now() THEN 'expired' ELSE v.status END,
                         'issued_at', v.issued_at, 'expires_at', v.expires_at, 'used_at', v.used_at,
                         'used_order_code', (SELECT o.order_code FROM public.kitchen_orders o WHERE o.id = v.used_order_id))
                         FROM public.food_club_vouchers v WHERE v.id = c.voucher_id))
    INTO v_last
    FROM public.food_club_cards c
   WHERE c.user_id = v_uid AND c.status = 'completed'
   ORDER BY c.completed_at DESC NULLS LAST, c.opened_at DESC LIMIT 1;
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
    'last_completed_card', v_last,
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

REVOKE ALL ON FUNCTION public.food_club_my_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.food_club_my_state() TO authenticated;
