-- FOOD CLUB V1 — visualizzazione tessera dopo il 2° timbro (PROPOSTA, non e' una migration).
-- Solo letture: nessuna scrittura, nessun cambio di logica su timbri, buoni, pagamenti.
-- 1) food_club_my_state(): `card` resta il ciclo corrente (open). Aggiunti `last_completed_card` e `totals`.
-- 2) food_club_staff_members(): aggiunti cycle_stamps, cycle_completed, total_visits in coda (campi esistenti invariati).
--    Cambia il tipo di ritorno (TABLE): serve DROP + CREATE, poi REVOKE/GRANT identici a prima.
-- Applicare SOLO dopo la decisione di Eros. Locale: psql -h 127.0.0.1 -p 54322 -f <questo file>.

BEGIN;

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
  v_totals jsonb;
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
  v_totals := jsonb_build_object(
    'visits', (SELECT count(*) FROM public.food_club_stamps s
                WHERE s.user_id = v_uid AND s.kind = 'order' AND s.revoked_at IS NULL),
    'cards_completed', (SELECT count(*) FROM public.food_club_cards c WHERE c.user_id = v_uid AND c.status = 'completed'));
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
    'totals', v_totals,
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

-- Staff ISCRITTI: stesso corpo di prima + 3 colonne in coda.
DROP FUNCTION IF EXISTS public.food_club_staff_members(text, text, integer);
CREATE FUNCTION public.food_club_staff_members(p_venue_id text, p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (user_id uuid, display_name text, phone_masked text, status text, joined_at timestamptz,
               stamps_open integer, card_expires_at timestamptz, vouchers_available integer, vouchers_used integer,
               marketing boolean, notif_club boolean, last_order_at timestamptz,
               cycle_stamps integer, cycle_completed boolean, total_visits integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT m.user_id, m.display_name, public.food_club_mask_phone(u.phone), m.status, m.joined_at,
         (SELECT count(*)::int FROM public.food_club_stamps s JOIN public.food_club_cards c ON c.id = s.card_id
           WHERE c.user_id = m.user_id AND c.status = 'open' AND s.revoked_at IS NULL),
         (SELECT c.expires_at FROM public.food_club_cards c WHERE c.user_id = m.user_id AND c.status = 'open' LIMIT 1),
         (SELECT count(*)::int FROM public.food_club_vouchers v WHERE v.user_id = m.user_id AND v.status = 'available' AND v.expires_at > now()),
         (SELECT count(*)::int FROM public.food_club_vouchers v WHERE v.user_id = m.user_id AND v.status = 'used'),
         m.marketing_consent_at IS NOT NULL, m.notif_club_enabled,
         (SELECT max(o.created_at) FROM public.kitchen_orders o WHERE o.customer_id = m.user_id),
         -- NUOVO: giro attuale = timbri della card open (come stamps_open)
         (SELECT count(*)::int FROM public.food_club_stamps s JOIN public.food_club_cards c ON c.id = s.card_id
           WHERE c.user_id = m.user_id AND c.status = 'open' AND s.revoked_at IS NULL),
         -- NUOVO: nessuna card open, ultima completed e buono non ancora usato (ne' scaduto/annullato)
         (NOT EXISTS (SELECT 1 FROM public.food_club_cards c WHERE c.user_id = m.user_id AND c.status = 'open')
          AND COALESCE((SELECT v.status IN ('available', 'reserved') AND NOT (v.status = 'available' AND v.expires_at <= now())
                          FROM public.food_club_cards c JOIN public.food_club_vouchers v ON v.id = c.voucher_id
                         WHERE c.user_id = m.user_id AND c.status = 'completed'
                         ORDER BY c.completed_at DESC NULLS LAST, c.opened_at DESC LIMIT 1), false)),
         -- NUOVO: visite totali = timbri d'ordine non revocati
         (SELECT count(*)::int FROM public.food_club_stamps s
           WHERE s.user_id = m.user_id AND s.kind = 'order' AND s.revoked_at IS NULL)
    FROM public.food_club_members m
    LEFT JOIN auth.users u ON u.id = m.user_id
   WHERE m.venue_id = p_venue_id
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR m.display_name ILIKE '%' || btrim(p_search) || '%'
          OR right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 3) = regexp_replace(p_search, '\D', '', 'g'))
   ORDER BY m.joined_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

REVOKE ALL ON FUNCTION public.food_club_staff_members(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.food_club_staff_members(text, text, integer) TO authenticated;

COMMIT;
