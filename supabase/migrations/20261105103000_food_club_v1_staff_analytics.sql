-- WALRUS FOOD CLUB V1 — F5 viste staff + F7 statistiche.
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros.
-- Tutte le funzioni: SECURITY DEFINER, solo staff del locale (is_staff_for_venue), numero di telefono sempre
-- mascherato, nessun dato sintetico: i numeri sono conteggi sulle tabelle reali (vuote finché il Club è spento).
-- Indicatori DESCRITTIVI: non misurano l'effetto causale del Club (D-8 aperta).

CREATE OR REPLACE FUNCTION public.food_club_require_staff(p_venue_id text, p_manager boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.kitchen_staff_members s
        WHERE s.user_id = auth.uid() AND s.venue_id = p_venue_id
          AND (NOT p_manager OR s.role = 'manager')) THEN
    IF p_manager THEN RAISE EXCEPTION 'manager_only'; END IF;
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;
END;
$$;

-- Badge per le comande: buono, sconto, totale da incassare, provenienza, food.
CREATE OR REPLACE FUNCTION public.food_club_staff_order_badges(p_venue_id text, p_order_ids text[])
RETURNS TABLE (order_id text, source text, food_amount numeric, discount_amount numeric, total numeric,
               voucher_code text, voucher_status text, stamp boolean, member boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT o.id, o.source, public.food_club_order_food_amount(o.id), o.discount_amount, o.total,
         v.code, v.status,
         EXISTS (SELECT 1 FROM public.food_club_stamps s WHERE s.order_id = o.id AND s.revoked_at IS NULL),
         EXISTS (SELECT 1 FROM public.food_club_members mm WHERE mm.user_id = o.customer_id AND mm.status = 'active')
    FROM public.kitchen_orders o
    LEFT JOIN public.food_club_vouchers v ON (v.reserved_order_id = o.id AND v.status = 'reserved') OR v.used_order_id = o.id
   WHERE o.venue_id = p_venue_id AND o.id = ANY (p_order_ids[1:200]);
END;
$$;

-- Fine servizio: ordini al banco ancora da pagare (qualsiasi serata), con buono riservato evidenziato.
CREATE OR REPLACE FUNCTION public.food_club_staff_unpaid_orders(p_venue_id text)
RETURNS TABLE (order_id text, order_code text, nickname text, status text, created_at timestamptz,
               service_night date, total numeric, discount_amount numeric, voucher_code text, source text,
               older_than_tonight boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT o.id, o.order_code, o.nickname, o.status, o.created_at, public.food_club_service_night(o.created_at),
         o.total, o.discount_amount, v.code, o.source,
         public.food_club_service_night(o.created_at) < public.food_club_service_night(now())
    FROM public.kitchen_orders o
    LEFT JOIN public.food_club_vouchers v ON v.reserved_order_id = o.id AND v.status = 'reserved'
   WHERE o.venue_id = p_venue_id
     AND o.status NOT IN ('cancelled', 'payment_abandoned', 'pending_online_payment')
     AND o.payment_status IS DISTINCT FROM 'paid' AND o.payment_status IS DISTINCT FROM 'refunded'
     AND o.created_at > now() - interval '30 days'
   ORDER BY o.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_staff_campaigns(p_venue_id text)
RETURNS SETOF public.food_club_campaigns
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY SELECT * FROM public.food_club_campaigns WHERE venue_id = p_venue_id ORDER BY created_at;
END;
$$;

-- Accensione/spegnimento campagna: solo manager. I premi già emessi restano validi.
CREATE OR REPLACE FUNCTION public.food_club_admin_set_campaign_active(p_campaign_id text, p_active boolean)
RETURNS public.food_club_campaigns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.food_club_campaigns;
BEGIN
  SELECT * INTO v_c FROM public.food_club_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  PERFORM public.food_club_require_staff(v_c.venue_id, true);
  IF p_active AND EXISTS (SELECT 1 FROM public.food_club_campaigns WHERE venue_id = v_c.venue_id AND active AND id <> v_c.id) THEN
    RAISE EXCEPTION 'another_campaign_active';
  END IF;
  UPDATE public.food_club_campaigns SET active = p_active, updated_at = now(),
         starts_at = CASE WHEN p_active AND starts_at IS NULL THEN now() ELSE starts_at END
   WHERE id = v_c.id RETURNING * INTO v_c;
  INSERT INTO public.kitchen_action_log (venue_id, action, actor_type, actor_id, metadata)
  VALUES (v_c.venue_id, 'food_club_campaign_' || CASE WHEN p_active THEN 'on' ELSE 'off' END, 'staff', auth.uid(),
          jsonb_build_object('campaign_id', v_c.id));
  RETURN v_c;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_staff_members(p_venue_id text, p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (user_id uuid, display_name text, phone_masked text, status text, joined_at timestamptz,
               stamps_open integer, card_expires_at timestamptz, vouchers_available integer, vouchers_used integer,
               marketing boolean, notif_club boolean, last_order_at timestamptz)
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
         (SELECT max(o.created_at) FROM public.kitchen_orders o WHERE o.customer_id = m.user_id)
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

CREATE OR REPLACE FUNCTION public.food_club_staff_vouchers(p_venue_id text, p_status text DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE (voucher_id uuid, code text, status text, value numeric, source text, issued_at timestamptz,
               expires_at timestamptz, member_name text, phone_masked text, order_code text, order_status text,
               order_paid boolean, used_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT v.id, v.code,
         CASE WHEN v.status = 'available' AND v.expires_at <= now() THEN 'expired' ELSE v.status END,
         v.value, v.source, v.issued_at, v.expires_at, m.display_name, public.food_club_mask_phone(u.phone),
         o.order_code, o.status, o.payment_status = 'paid', v.used_at
    FROM public.food_club_vouchers v
    JOIN public.food_club_campaigns c ON c.id = v.campaign_id AND c.venue_id = p_venue_id
    LEFT JOIN public.food_club_members m ON m.user_id = v.user_id
    LEFT JOIN auth.users u ON u.id = v.user_id
    LEFT JOIN public.kitchen_orders o ON o.id = COALESCE(v.reserved_order_id, v.used_order_id)
   WHERE p_status IS NULL
      OR (CASE WHEN v.status = 'available' AND v.expires_at <= now() THEN 'expired' ELSE v.status END) = p_status
   ORDER BY v.issued_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_staff_referrals(p_venue_id text, p_limit integer DEFAULT 200)
RETURNS TABLE (referral_id uuid, status text, created_at timestamptz, rewarded_at timestamptz,
               inviter_name text, inviter_phone text, invitee_name text, invitee_phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT r.id, r.status, r.created_at, r.rewarded_at,
         mi.display_name, public.food_club_mask_phone(ui.phone),
         me.display_name, public.food_club_mask_phone(ue.phone)
    FROM public.food_club_referrals r
    JOIN public.food_club_campaigns c ON c.id = r.campaign_id AND c.venue_id = p_venue_id
    LEFT JOIN public.food_club_members mi ON mi.user_id = r.inviter_id
    LEFT JOIN auth.users ui ON ui.id = r.inviter_id
    LEFT JOIN public.food_club_members me ON me.user_id = r.invitee_id
    LEFT JOIN auth.users ue ON ue.id = r.invitee_id
   ORDER BY r.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$$;

-- Panoramica e funnel per un intervallo di serate [p_from, p_to].
CREATE OR REPLACE FUNCTION public.food_club_staff_overview(p_venue_id text, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from date := COALESCE(p_from, public.food_club_service_night(now()) - 29);
  v_to   date := COALESCE(p_to, public.food_club_service_night(now()));
  v_res  jsonb;
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  IF v_to < v_from OR v_to - v_from > 366 THEN RAISE EXCEPTION 'invalid_range'; END IF;
  WITH
  m AS (SELECT * FROM public.food_club_members WHERE venue_id = p_venue_id),
  s AS (SELECT st.* FROM public.food_club_stamps st JOIN m ON m.user_id = st.user_id
         WHERE st.service_night BETWEEN v_from AND v_to),
  v AS (SELECT vv.* FROM public.food_club_vouchers vv JOIN public.food_club_campaigns c ON c.id = vv.campaign_id AND c.venue_id = p_venue_id),
  o AS (SELECT oo.* FROM public.kitchen_orders oo WHERE oo.venue_id = p_venue_id AND oo.payment_status = 'paid'
         AND public.food_club_service_night(oo.created_at) BETWEEN v_from AND v_to),
  e AS (SELECT ev.event_name, count(DISTINCT ev.user_id) AS users FROM public.food_club_events ev
         WHERE ev.day BETWEEN v_from AND v_to GROUP BY ev.event_name)
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', v_from, 'to', v_to),
    'data_kind', 'descriptive',
    'campaign', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'active', c.active, 'starts_at', c.starts_at)
                   FROM public.food_club_campaigns c WHERE c.venue_id = p_venue_id ORDER BY c.active DESC, c.created_at LIMIT 1),
    'members', jsonb_build_object(
      'total_active', (SELECT count(*) FROM m WHERE status = 'active'),
      'new_in_range', (SELECT count(*) FROM m WHERE public.food_club_service_night(joined_at) BETWEEN v_from AND v_to),
      'left_total', (SELECT count(*) FROM m WHERE status = 'left'),
      'marketing_consent', (SELECT count(*) FROM m WHERE status = 'active' AND marketing_consent_at IS NOT NULL),
      'notif_club_on', (SELECT count(*) FROM m WHERE status = 'active' AND notif_club_enabled),
      'with_club_push_device', (SELECT count(DISTINCT ps.customer_id) FROM public.kitchen_push_subscriptions ps JOIN m ON m.user_id = ps.customer_id AND m.status = 'active' WHERE ps.consent_scope = 'club'),
      'joins_by_night', (SELECT COALESCE(jsonb_object_agg(d, n ORDER BY d), '{}'::jsonb) FROM (
          SELECT public.food_club_service_night(joined_at) AS d, count(*) AS n FROM m
           WHERE public.food_club_service_night(joined_at) BETWEEN v_from AND v_to GROUP BY 1) x)),
    'visits', jsonb_build_object(
      'stamps', (SELECT count(*) FROM s WHERE kind = 'order' AND revoked_at IS NULL),
      'stamps_revoked', (SELECT count(*) FROM s WHERE revoked_at IS NOT NULL),
      'members_with_visit', (SELECT count(DISTINCT user_id) FROM s WHERE kind = 'order' AND revoked_at IS NULL),
      'members_with_2plus_nights', (SELECT count(*) FROM (SELECT user_id FROM s WHERE kind = 'order' AND revoked_at IS NULL
                                     GROUP BY user_id HAVING count(DISTINCT service_night) >= 2) x),
      'cards_completed', (SELECT count(*) FROM public.food_club_cards c JOIN m ON m.user_id = c.user_id
                           WHERE c.status = 'completed' AND public.food_club_service_night(c.completed_at) BETWEEN v_from AND v_to)),
    'vouchers', jsonb_build_object(
      'issued', (SELECT count(*) FROM v WHERE public.food_club_service_night(issued_at) BETWEEN v_from AND v_to),
      'used', (SELECT count(*) FROM v WHERE status = 'used' AND public.food_club_service_night(used_at) BETWEEN v_from AND v_to),
      'expired', (SELECT count(*) FROM v WHERE (status = 'expired' OR (status = 'available' AND expires_at <= now()))
                    AND public.food_club_service_night(expires_at) BETWEEN v_from AND v_to),
      'reserved_now', (SELECT count(*) FROM v WHERE status = 'reserved'),
      'available_now', (SELECT count(*) FROM v WHERE status = 'available' AND expires_at > now()),
      'revoked', (SELECT count(*) FROM v WHERE status = 'revoked'),
      'discount_total', (SELECT COALESCE(sum(value), 0) FROM v WHERE status = 'used' AND public.food_club_service_night(used_at) BETWEEN v_from AND v_to),
      'by_source', (SELECT COALESCE(jsonb_object_agg(source, n), '{}'::jsonb) FROM (SELECT source, count(*) n FROM v GROUP BY source) x)),
    'referrals', (SELECT jsonb_build_object(
       'pending', count(*) FILTER (WHERE r.status = 'pending'), 'rewarded', count(*) FILTER (WHERE r.status = 'rewarded'),
       'capped', count(*) FILTER (WHERE r.status = 'capped'), 'void', count(*) FILTER (WHERE r.status = 'void'))
       FROM public.food_club_referrals r JOIN public.food_club_campaigns c ON c.id = r.campaign_id AND c.venue_id = p_venue_id),
    'orders', jsonb_build_object(
      'paid_total', (SELECT count(*) FROM o),
      'paid_customer_app', (SELECT count(*) FROM o WHERE source = 'customer_app'),
      'paid_staff', (SELECT count(*) FROM o WHERE source = 'staff'),
      'paid_unknown_source', (SELECT count(*) FROM o WHERE source IS NULL OR source = 'system'),
      'paid_by_members', (SELECT count(*) FROM o JOIN m ON m.user_id = o.customer_id),
      'food_by_members', (SELECT COALESCE(sum(public.food_club_order_food_amount(o.id)), 0) FROM o JOIN m ON m.user_id = o.customer_id),
      'food_total_customer_app', (SELECT COALESCE(sum(public.food_club_order_food_amount(o.id)), 0) FROM o WHERE source = 'customer_app')),
    'funnel', jsonb_build_object(
      'club_intro_view', COALESCE((SELECT users FROM e WHERE event_name = 'club_intro_view'), 0),
      'join_start', COALESCE((SELECT users FROM e WHERE event_name = 'join_start'), 0),
      'otp_sent', COALESCE((SELECT users FROM e WHERE event_name = 'otp_sent'), 0),
      'join_done', COALESCE((SELECT users FROM e WHERE event_name = 'join_done'), 0),
      'login_done', COALESCE((SELECT users FROM e WHERE event_name = 'login_done'), 0),
      'voucher_applied_cart', COALESCE((SELECT users FROM e WHERE event_name = 'voucher_applied_cart'), 0)),
    'pwa', jsonb_build_object(
      'invite_shown', COALESCE((SELECT users FROM e WHERE event_name = 'invite_shown'), 0),
      'install_cta_click', COALESCE((SELECT users FROM e WHERE event_name = 'install_cta_click'), 0),
      'install_accepted_android', COALESCE((SELECT users FROM e WHERE event_name = 'install_accepted'), 0),
      'app_installed_android', COALESCE((SELECT users FROM e WHERE event_name = 'app_installed'), 0),
      'first_standalone_open', COALESCE((SELECT users FROM e WHERE event_name = 'first_standalone_open'), 0),
      'push_granted', COALESCE((SELECT users FROM e WHERE event_name = 'push_granted'), 0),
      'push_denied', COALESCE((SELECT users FROM e WHERE event_name = 'push_denied'), 0),
      'notification_opened', COALESCE((SELECT users FROM e WHERE event_name = 'notification_opened'), 0)),
    'notifications', (SELECT jsonb_build_object(
       'queued', count(*) FILTER (WHERE fm.push_status = 'queued'), 'sent', count(*) FILTER (WHERE fm.push_status = 'sent'),
       'skipped', count(*) FILTER (WHERE fm.push_status = 'skipped'), 'failed', count(*) FILTER (WHERE fm.push_status = 'failed'),
       'opened', count(*) FILTER (WHERE fm.opened_at IS NOT NULL))
       FROM public.food_club_messages fm JOIN m ON m.user_id = fm.user_id
      WHERE public.food_club_service_night(fm.created_at) BETWEEN v_from AND v_to),
    'anomalies', jsonb_build_object(
      'food_club_errors', (SELECT count(*) FROM public.kitchen_action_log l WHERE l.venue_id = p_venue_id
                             AND l.action IN ('food_club_error', 'food_club_paid_without_charge')
                             AND l.created_at > now() - interval '30 days'),
      'unpaid_with_voucher', (SELECT count(*) FROM v JOIN public.kitchen_orders oo ON oo.id = v.reserved_order_id
                               WHERE v.status = 'reserved' AND public.food_club_service_night(oo.created_at) < public.food_club_service_night(now())))
  ) INTO v_res;
  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.food_club_require_staff(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_staff_order_badges(text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_unpaid_orders(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_campaigns(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_admin_set_campaign_active(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_members(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_vouchers(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_referrals(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_overview(text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.food_club_staff_order_badges(text, text[]),
  public.food_club_staff_unpaid_orders(text),
  public.food_club_staff_campaigns(text),
  public.food_club_admin_set_campaign_active(text, boolean),
  public.food_club_staff_members(text, text, integer),
  public.food_club_staff_vouchers(text, text, integer),
  public.food_club_staff_referrals(text, integer),
  public.food_club_staff_overview(text, date, date)
  TO authenticated;
