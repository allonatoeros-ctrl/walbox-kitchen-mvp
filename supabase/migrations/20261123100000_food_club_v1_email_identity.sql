-- FOOD CLUB V1 — identità via EMAIL (codice a 6 cifre) accanto al telefono. File versionato: NON applicato a
-- produzione. Applicazione = gate di Eros (db push).
--
-- Decisione di Eros: al lancio l'iscrizione usa l'email confermata; il ramo telefono (SMS) resta nel codice per
-- l'uso futuro. Timbri, buoni, push e promo restano legati a user_id e NON cambiano.
--
-- Cosa fa:
--   1) colonna members.email_hash + indice UNIQUE parziale (1 email normalizzata = 1 iscritto);
--      merge_tickets: email_hash, phone_hash diventa nullable, CHECK almeno un hash;
--   2) funzioni nuove: food_club_email_hash, food_club_verified_email, food_club_verified_identity, food_club_mask_email;
--   3) ridefinisce food_club_join, food_club_my_state (versione di 20261109109000), food_club_redeem_merge_ticket;
--      nuova RPC food_club_create_merge_ticket_email(p_email); food_club_create_merge_ticket(p_phone) INVARIATA;
--   4) staff: food_club_staff_members / _vouchers / _referrals con email mascherata (colonne nuove in coda al
--      telefono) e ricerca per inizio email.
-- Invariati: food_club_phone_hash, food_club_verified_phone, food_club_mask_phone, tutte le funzioni kitchen_*,
-- nessun cron, nessun dato modificato.
--
-- REGOLA DI NORMALIZZAZIONE EMAIL (decisione prudente): trim + minuscole. SOLO per i domini gmail.com e
-- googlemail.com: nella parte locale si tolgono i punti e tutto da '+' in poi, e il dominio diventa gmail.com
-- (Ma.Rio+x@GoogleMail.com == mario@gmail.com). Per gli altri domini NIENTE altro: l'alias '+' non e' universale
-- (per molti provider nome+1@dominio e' una casella diversa).
--
-- ORDINE DI IDENTITA' per un NUOVO join: prima email confermata, poi telefono confermato. Un utente con entrambi si
-- iscrive con l'email. Chi e' gia' iscritto con phone_hash resta valido (join idempotente per user_id).
--
-- Codici errore nuovi: verified_identity_required (sostituisce verified_phone_required in join e redeem),
-- email_already_member, invalid_email, ticket_email_mismatch, ticket_identity_mismatch.
-- ticket_phone_mismatch resta per i biglietti solo-telefono.

-- ---------------------------------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------------------------------
ALTER TABLE public.food_club_members ADD COLUMN IF NOT EXISTS email_hash text; -- sha256 dell'email normalizzata; mai in chiaro
CREATE UNIQUE INDEX IF NOT EXISTS food_club_members_email_hash_unique
  ON public.food_club_members (email_hash) WHERE email_hash IS NOT NULL;

ALTER TABLE public.food_club_merge_tickets ADD COLUMN IF NOT EXISTS email_hash text;
ALTER TABLE public.food_club_merge_tickets ALTER COLUMN phone_hash DROP NOT NULL;
ALTER TABLE public.food_club_merge_tickets DROP CONSTRAINT IF EXISTS food_club_merge_tickets_identity_hash_check;
ALTER TABLE public.food_club_merge_tickets ADD CONSTRAINT food_club_merge_tickets_identity_hash_check
  CHECK (phone_hash IS NOT NULL OR email_hash IS NOT NULL);

-- ---------------------------------------------------------------------------------------------------
-- 2) Utilità identità email
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_email_hash(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  -- Sale diverso da quello del telefono ('food-club-v1:'). NULL se l'email non e' ben formata.
  SELECT CASE
    WHEN n.l = '' OR n.d = '' OR n.e ~ '\s' OR array_length(string_to_array(n.e, '@'), 1) IS DISTINCT FROM 2 THEN NULL
    ELSE encode(extensions.digest('food-club-v1-email:' ||
      CASE WHEN n.d IN ('gmail.com', 'googlemail.com')
           THEN replace(split_part(n.l, '+', 1), '.', '') || '@gmail.com'
           ELSE n.e END, 'sha256'), 'hex') END
    FROM (SELECT lower(btrim(COALESCE(p_email, ''))) AS e,
                 split_part(lower(btrim(COALESCE(p_email, ''))), '@', 1) AS l,
                 split_part(lower(btrim(COALESCE(p_email, ''))), '@', 2) AS d) n
   WHERE NOT (n.d IN ('gmail.com', 'googlemail.com') AND replace(split_part(n.l, '+', 1), '.', '') = '')
$$;

CREATE OR REPLACE FUNCTION public.food_club_verified_email(p_uid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.email FROM auth.users u
   WHERE u.id = p_uid AND NOT COALESCE(u.is_anonymous, false)
     AND u.email IS NOT NULL AND btrim(u.email) <> '' AND u.email_confirmed_at IS NOT NULL
$$;

-- Identita' verificata: email confermata prima, telefono confermato poi. Nessuna riga = non verificato.
CREATE OR REPLACE FUNCTION public.food_club_verified_identity(p_uid uuid)
RETURNS TABLE (identity_kind text, identity_hash text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.k, t.h FROM (
    SELECT 1 AS o, 'email'::text AS k, public.food_club_email_hash(public.food_club_verified_email(p_uid)) AS h
    UNION ALL
    SELECT 2, 'phone'::text, public.food_club_phone_hash(public.food_club_verified_phone(p_uid))
  ) t
  WHERE t.h IS NOT NULL
  ORDER BY t.o
  LIMIT 1
$$;

-- Email mascherata per lo staff: prime 2 lettere della parte locale + *** + dominio (ma***@gmail.com).
CREATE OR REPLACE FUNCTION public.food_club_mask_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_email IS NULL OR position('@' in btrim(p_email)) < 2 THEN NULL
    ELSE left(split_part(btrim(p_email), '@', 1), 2) || '***@' || substr(btrim(p_email), position('@' in btrim(p_email)) + 1) END
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Iscrizione (join): identita' = email confermata oppure telefono confermato
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
  v_kind text;
  v_hash text;
  v_member public.food_club_members;
  v_campaign public.food_club_campaigns;
  v_inviter public.food_club_members;
  v_card public.food_club_cards;
  v_referral_status text := 'none';
  v_retro integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  SELECT i.identity_kind, i.identity_hash INTO v_kind, v_hash FROM public.food_club_verified_identity(v_uid) i;
  IF v_kind IS NULL OR v_hash IS NULL THEN RAISE EXCEPTION 'verified_identity_required'; END IF;
  IF p_service_consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'service_consent_required'; END IF;
  IF p_terms_version IS NULL OR btrim(p_terms_version) = '' OR char_length(p_terms_version) > 40 THEN
    RAISE EXCEPTION 'terms_version_required';
  END IF;
  IF p_display_name IS NOT NULL AND char_length(btrim(p_display_name)) > 30 THEN RAISE EXCEPTION 'display_name_too_long'; END IF;

  SELECT * INTO v_member FROM public.food_club_members WHERE user_id = v_uid FOR UPDATE;
  IF FOUND AND v_member.status = 'active' THEN
    RETURN jsonb_build_object('member', true, 'already_member', true);
  END IF;

  IF FOUND THEN
    -- Rientro di un ex iscritto: nessun invito, nessun benvenuto. Si aggiorna solo l'hash del tipo usato ora.
    IF v_kind = 'email' AND EXISTS (SELECT 1 FROM public.food_club_members WHERE email_hash = v_hash AND user_id <> v_uid) THEN
      RAISE EXCEPTION 'email_already_member';
    END IF;
    UPDATE public.food_club_members
       SET status = 'active', left_at = NULL, joined_at = now(), terms_version = p_terms_version,
           service_consent_at = now(),
           phone_hash = CASE WHEN v_kind = 'phone' THEN v_hash ELSE phone_hash END,
           email_hash = CASE WHEN v_kind = 'email' THEN v_hash ELSE email_hash END,
           marketing_consent_at = CASE WHEN p_marketing_consent THEN now() ELSE NULL END,
           marketing_revoked_at = NULL, display_name = NULLIF(btrim(p_display_name), ''), updated_at = now()
     WHERE user_id = v_uid RETURNING * INTO v_member;
  ELSE
    -- Stessa identita' gia' usata da un altro account (numero riassegnato, alias email): rifiuto, lo gestisce lo staff (D-15).
    IF v_kind = 'email' THEN
      IF EXISTS (SELECT 1 FROM public.food_club_members WHERE email_hash = v_hash) THEN
        RAISE EXCEPTION 'email_already_member';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM public.food_club_members WHERE phone_hash = v_hash) THEN
      RAISE EXCEPTION 'phone_already_member';
    END IF;
    INSERT INTO public.food_club_members (user_id, terms_version, service_consent_at, marketing_consent_at,
      display_name, referral_code, phone_hash, email_hash)
    VALUES (v_uid, p_terms_version, now(), CASE WHEN p_marketing_consent THEN now() ELSE NULL END,
      NULLIF(btrim(p_display_name), ''), public.food_club_new_referral_code(),
      CASE WHEN v_kind = 'phone' THEN v_hash END, CASE WHEN v_kind = 'email' THEN v_hash END)
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
      ELSIF v_inviter.user_id = v_uid
            OR (v_kind = 'phone' AND v_inviter.phone_hash = v_hash)
            OR (v_kind = 'email' AND v_inviter.email_hash = v_hash) THEN
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

-- ---------------------------------------------------------------------------------------------------
-- 4) my_state: stessa definizione di 20261109109000 + campi identita' (phone_verified/phone_masked restano)
-- ---------------------------------------------------------------------------------------------------
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
  v_email text;
  v_kind text;
  v_last jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('session', false, 'member', false, 'campaign', public.food_club_public_campaign('walrus-main'));
  END IF;
  -- Nota: i lookup d'identita' stanno PRIMA della SELECT INTO v_m, perche' FOUND serve subito dopo.
  v_phone := public.food_club_verified_phone(v_uid);
  v_email := public.food_club_verified_email(v_uid);
  v_kind := (SELECT i.identity_kind FROM public.food_club_verified_identity(v_uid) i);
  SELECT * INTO v_m FROM public.food_club_members WHERE user_id = v_uid;
  IF NOT FOUND OR v_m.status <> 'active' THEN
    RETURN jsonb_build_object('session', true, 'member', false, 'left', FOUND AND v_m.status = 'left',
      'phone_verified', v_phone IS NOT NULL, 'phone_masked', public.food_club_mask_phone(v_phone),
      'email_verified', public.food_club_email_hash(v_email) IS NOT NULL, 'email_masked', public.food_club_mask_email(v_email),
      'identity_verified', v_kind IS NOT NULL, 'identity_kind', v_kind,
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
    'email_verified', public.food_club_email_hash(v_email) IS NOT NULL, 'email_masked', public.food_club_mask_email(v_email),
    'identity_verified', v_kind IS NOT NULL, 'identity_kind', v_kind,
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

-- ---------------------------------------------------------------------------------------------------
-- 5) Unione anonimo -> iscritto: il biglietto porta email_hash e/o phone_hash (almeno uno)
-- ---------------------------------------------------------------------------------------------------
-- food_club_create_merge_ticket(p_phone text) resta IDENTICA (non toccata). Ramo email: RPC nuova, stessa logica
-- (anonimo, niente-da-unire, rate limit 5/ora), biglietto con solo email_hash normalizzato.
CREATE FUNCTION public.food_club_create_merge_ticket_email(p_email text)
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
  IF public.food_club_email_hash(p_email) IS NULL THEN RAISE EXCEPTION 'invalid_email'; END IF;
  -- Niente da unire: nessun biglietto.
  IF NOT EXISTS (SELECT 1 FROM public.kitchen_orders WHERE customer_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_push_subscriptions WHERE customer_id = v_uid) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.food_club_merge_tickets WHERE source_user_id = v_uid AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'merge_ticket_rate_limited';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.food_club_merge_tickets (token_hash, source_user_id, email_hash)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid, public.food_club_email_hash(p_email));
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
  v_phone_hash text;
  v_email_hash text;
  v_orders integer := 0;
  v_push integer := 0;
  v_retro integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'session_required'; END IF;
  v_phone_hash := public.food_club_phone_hash(public.food_club_verified_phone(v_uid));
  v_email_hash := public.food_club_email_hash(public.food_club_verified_email(v_uid));
  IF v_phone_hash IS NULL AND v_email_hash IS NULL THEN RAISE EXCEPTION 'verified_identity_required'; END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_ticket'; END IF;
  SELECT * INTO v_t FROM public.food_club_merge_tickets
   WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_ticket'; END IF;
  IF v_t.redeemed_at IS NOT NULL THEN
    IF v_t.redeemed_by = v_uid THEN RETURN jsonb_build_object('merged', true, 'replay', true); END IF;
    RAISE EXCEPTION 'ticket_already_used';
  END IF;
  IF v_t.expires_at <= now() THEN RAISE EXCEPTION 'ticket_expired'; END IF;
  -- P4: il biglietto vale solo per l'identita' (email o telefono) per cui e' stato creato.
  -- COALESCE: un hash NULL (identita' non posseduta) non deve rendere NULL l'intera condizione.
  IF NOT (COALESCE(v_t.email_hash = v_email_hash, false) OR COALESCE(v_t.phone_hash = v_phone_hash, false)) THEN
    RAISE EXCEPTION '%', CASE WHEN v_t.email_hash IS NULL AND v_t.phone_hash IS NOT NULL THEN 'ticket_phone_mismatch'
                              WHEN v_t.phone_hash IS NULL AND v_t.email_hash IS NOT NULL THEN 'ticket_email_mismatch'
                              ELSE 'ticket_identity_mismatch' END;
  END IF;
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
-- 6) Analytics staff: email mascherata (colonne nuove) e ricerca per INIZIO email
-- ---------------------------------------------------------------------------------------------------
-- RETURNS TABLE cambia: serve DROP + CREATE. Nessun'altra funzione/vista dipende da queste tre.
DROP FUNCTION IF EXISTS public.food_club_staff_members(text, text, integer);
DROP FUNCTION IF EXISTS public.food_club_staff_vouchers(text, text, integer);
DROP FUNCTION IF EXISTS public.food_club_staff_referrals(text, integer);

CREATE FUNCTION public.food_club_staff_members(p_venue_id text, p_search text DEFAULT NULL, p_limit integer DEFAULT 100)
RETURNS TABLE (user_id uuid, display_name text, phone_masked text, status text, joined_at timestamptz,
               stamps_open integer, card_expires_at timestamptz, vouchers_available integer, vouchers_used integer,
               marketing boolean, notif_club boolean, last_order_at timestamptz, email_masked text)
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
         public.food_club_mask_email(CASE WHEN u.email_confirmed_at IS NOT NULL THEN u.email END)
    FROM public.food_club_members m
    LEFT JOIN auth.users u ON u.id = m.user_id
   WHERE m.venue_id = p_venue_id
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR m.display_name ILIKE '%' || btrim(p_search) || '%'
          -- telefono: ultime 3 cifre (solo se la ricerca contiene cifre: senza cifre non deve combaciare con chi non ha telefono)
          OR (regexp_replace(p_search, '\D', '', 'g') <> ''
              AND right(regexp_replace(COALESCE(u.phone, ''), '\D', '', 'g'), 3) = regexp_replace(p_search, '\D', '', 'g'))
          -- email: INIZIO dell'indirizzo, senza distinguere maiuscole, minimo 3 caratteri, solo email confermate
          OR (char_length(btrim(p_search)) >= 3 AND u.email_confirmed_at IS NOT NULL
              AND lower(u.email) LIKE replace(replace(replace(lower(btrim(p_search)), '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\'))
   ORDER BY m.joined_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

CREATE FUNCTION public.food_club_staff_vouchers(p_venue_id text, p_status text DEFAULT NULL, p_limit integer DEFAULT 200)
RETURNS TABLE (voucher_id uuid, code text, status text, value numeric, source text, issued_at timestamptz,
               expires_at timestamptz, member_name text, phone_masked text, order_code text, order_status text,
               order_paid boolean, used_at timestamptz, email_masked text)
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
         o.order_code, o.status, o.payment_status = 'paid', v.used_at,
         public.food_club_mask_email(CASE WHEN u.email_confirmed_at IS NOT NULL THEN u.email END)
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

CREATE FUNCTION public.food_club_staff_referrals(p_venue_id text, p_limit integer DEFAULT 200)
RETURNS TABLE (referral_id uuid, status text, created_at timestamptz, rewarded_at timestamptz,
               inviter_name text, inviter_phone text, invitee_name text, invitee_phone text,
               inviter_email text, invitee_email text)
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
         me.display_name, public.food_club_mask_phone(ue.phone),
         public.food_club_mask_email(CASE WHEN ui.email_confirmed_at IS NOT NULL THEN ui.email END),
         public.food_club_mask_email(CASE WHEN ue.email_confirmed_at IS NOT NULL THEN ue.email END)
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

-- ---------------------------------------------------------------------------------------------------
-- 7) Permessi (stessi schemi di 20261109102000 e 20261109103000)
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_email_hash(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_verified_email(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_verified_identity(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_mask_email(text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.food_club_join(text, boolean, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_my_state() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_create_merge_ticket_email(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_redeem_merge_ticket(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_members(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_vouchers(text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_staff_referrals(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.food_club_join(text, boolean, boolean, text, text),
  public.food_club_my_state(),
  public.food_club_create_merge_ticket_email(text),
  public.food_club_redeem_merge_ticket(text),
  public.food_club_staff_members(text, text, integer),
  public.food_club_staff_vouchers(text, text, integer),
  public.food_club_staff_referrals(text, integer)
  TO authenticated;
