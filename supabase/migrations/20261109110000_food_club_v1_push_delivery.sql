-- =========================================================================
-- Food Club V1 — Notifiche push: regole di consegna, recupero orfani, generatori promo/winback, schedule del tick
-- Stato: SOLO LOCALE, non applicata al remoto. Apply = `npx supabase db push --linked`, gate di Eros.
-- Riferimenti: docs/food-club/fase3/PWA-NOTIFICHE-spec.md §4 (valori D-19 proposti), CLOUD_HANDOFF.md §9,
--              RUNBOOK-push-food-club.md §3.
--
-- Cosa cambia (tutto additivo: nessuna tabella nuova, nessuna funzione kitchen_* toccata, stesse firme pubbliche):
--   1) food_club_push_claim_batch_at(p_limit, p_now): le regole di consegna con l'orario passato come parametro
--      (testabili). food_club_push_claim_batch(p_limit) resta la firma chiamata dalla Edge Function e delega con now().
--      Regole nuove rispetto a 20261109102000:
--        a. orfani: 'sending' da >10 min con 3 tentativi -> 'failed' (prima restavano 'sending' per sempre e
--           bloccavano il tetto giornaliero dell'utente);
--        b. due tick concorrenti non consegnano due messaggi allo stesso utente (advisory lock per utente);
--        c. voucher_expiring solo tra 17:00 e 20:00 Europe/Rome; finestra persa prima della scadenza -> saltato;
--        d. voucher_expiring a campagna spenta -> saltato (il buono non si può usare finché la campagna è spenta);
--        e. buono già usato/scaduto -> anche 'voucher_unlocked'/'referral_reward' saltati;
--        f. promo/winback mai nella stessa ora di un ordine del cliente (rinvio di 1 h dall'ordine).
--   2) food_club_push_report: 'time_budget' non consuma un tentativo e torna subito in coda; se dopo la pulizia
--      404/410 non resta alcuna sottoscrizione 'club', il messaggio è 'skipped' (no_club_subscription), non ritentato.
--   3) food_club_push_tick: chiama la funzione anche quando ci sono solo orfani da recuperare.
--   4) Generatori categoria Promozioni: food_club_promo_enqueue (solo service_role/postgres, nessuna UI) e
--      food_club_winback_enqueue (21 giorni senza visite, poi non prima di 60; solo con campagna attiva).
--   5) Job pg_cron:
--        food-club-push     ogni 5 minuti -> food_club_push_tick(URL funzione). Spento di fatto finché il secret
--                           'food_club_push_secret' non è in Vault: senza secret il tick scrive un WARNING e non chiama.
--        food-club-winback  ogni giorno alle 15:07 UTC (16:07/17:07 a Roma) -> solo righe in "Messaggi"; la consegna
--                           push segue le regole sopra.
--
-- Rollback (migration dedicata, gate di Eros):
--   SELECT cron.unschedule('food-club-push'); SELECT cron.unschedule('food-club-winback');
--   le funzioni restano inerti (nessun job le chiama). Emergenza: togliere il secret Vault 'food_club_push_secret'.
-- =========================================================================

-- ---------------------------------------------------------------------------------------------------
-- 1) Regole di consegna con orario esplicito
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_push_claim_batch_at(p_limit integer, p_now timestamptz)
RETURNS TABLE (message_id uuid, user_id uuid, kind text, title text, body text, url text, subscriptions jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.food_club_messages;
  v_m public.food_club_members;
  v_local timestamp;
  v_ltime time;
  v_quiet boolean;
  v_subs jsonb;
  v_next10 timestamptz;
  v_next17 timestamptz;
  v_vexp timestamptz;
  v_last_order timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'; END IF;
  p_now := COALESCE(p_now, now());

  -- Orfani (funzione caduta a metà): sotto i 3 tentativi tornano in coda, al terzo diventano 'failed'.
  UPDATE public.food_club_messages x SET push_status = 'queued'
   WHERE x.push_status = 'sending' AND x.push_claimed_at < p_now - interval '10 minutes' AND x.push_attempts < 3;
  UPDATE public.food_club_messages x SET push_status = 'failed', push_skip_reason = 'orphan_max_attempts'
   WHERE x.push_status = 'sending' AND x.push_claimed_at < p_now - interval '10 minutes' AND x.push_attempts >= 3;

  v_local := p_now AT TIME ZONE 'Europe/Rome';
  v_ltime := v_local::time;
  v_quiet := v_ltime >= time '22:30' OR v_ltime < time '10:00';
  v_next10 := (date_trunc('day', v_local) + CASE WHEN v_ltime >= time '10:00' THEN interval '1 day 10 hours' ELSE interval '10 hours' END)
              AT TIME ZONE 'Europe/Rome';
  v_next17 := (date_trunc('day', v_local) + CASE WHEN v_ltime >= time '17:00' THEN interval '1 day 17 hours' ELSE interval '17 hours' END)
              AT TIME ZONE 'Europe/Rome';

  FOR r IN SELECT * FROM public.food_club_messages m
            WHERE m.push_status = 'queued' AND m.push_after <= p_now
            ORDER BY m.push_after LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
            FOR UPDATE SKIP LOCKED LOOP
    -- Un solo tick alla volta per utente: l'altro lascia il messaggio in coda (lo riprende al giro dopo).
    IF NOT pg_try_advisory_xact_lock(hashtextextended('food_club_push:' || r.user_id::text, 0)) THEN CONTINUE; END IF;

    SELECT * INTO v_m FROM public.food_club_members fm WHERE fm.user_id = r.user_id;
    IF v_m.user_id IS NULL OR v_m.status <> 'active' THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'not_member' WHERE x.id = r.id; CONTINUE;
    END IF;
    -- Consenso marketing verificato AL MOMENTO dell'invio (non alla creazione del messaggio).
    IF r.category = 'promo' AND (v_m.marketing_consent_at IS NULL OR v_m.marketing_revoked_at IS NOT NULL OR NOT v_m.notif_promo_enabled) THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'no_marketing_consent' WHERE x.id = r.id; CONTINUE;
    END IF;
    IF r.category = 'club' AND NOT v_m.notif_club_enabled THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'club_notifications_off' WHERE x.id = r.id; CONTINUE;
    END IF;
    IF r.kind = 'stamp' AND r.created_at < p_now - interval '12 hours' THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'stale' WHERE x.id = r.id; CONTINUE;
    END IF;
    IF r.kind = 'voucher_expiring' THEN
      SELECT v.expires_at INTO v_vexp FROM public.food_club_vouchers v
       WHERE v.id::text = r.ref AND v.status = 'available' AND v.expires_at > p_now;
      IF v_vexp IS NULL THEN
        UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'voucher_not_available' WHERE x.id = r.id; CONTINUE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.food_club_campaigns c
                      WHERE c.venue_id = v_m.venue_id AND c.active
                        AND (c.starts_at IS NULL OR c.starts_at <= p_now) AND (c.ends_at IS NULL OR c.ends_at > p_now)) THEN
        UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'campaign_off' WHERE x.id = r.id; CONTINUE;
      END IF;
      IF v_ltime < time '17:00' OR v_ltime >= time '20:00' THEN
        IF v_next17 >= v_vexp THEN
          UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'expiring_window_missed' WHERE x.id = r.id;
        ELSE
          UPDATE public.food_club_messages x SET push_after = v_next17 WHERE x.id = r.id;
        END IF;
        CONTINUE;
      END IF;
    ELSIF r.kind IN ('voucher_unlocked', 'referral_reward')
          AND EXISTS (SELECT 1 FROM public.food_club_vouchers v
                       WHERE v.id::text = r.ref AND (v.status <> 'available' OR v.expires_at <= p_now)) THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'voucher_not_available' WHERE x.id = r.id; CONTINUE;
    END IF;
    -- Fascia silenziosa 22:30-10:00: passano solo timbro e buono sbloccato (seguono un pagamento appena fatto).
    IF v_quiet AND r.kind NOT IN ('stamp', 'voucher_unlocked') THEN
      UPDATE public.food_club_messages x SET push_after = v_next10 WHERE x.id = r.id; CONTINUE;
    END IF;
    -- Mai promo nella stessa ora di un ordine del cliente.
    IF r.category = 'promo' THEN
      SELECT max(o.created_at) INTO v_last_order FROM public.kitchen_orders o
       WHERE o.customer_id = r.user_id AND o.created_at > p_now - interval '1 hour' AND o.created_at <= p_now;
      IF v_last_order IS NOT NULL THEN
        UPDATE public.food_club_messages x SET push_after = v_last_order + interval '1 hour' WHERE x.id = r.id; CONTINUE;
      END IF;
    END IF;
    -- Massimo 1 notifica Club per utente ogni 20 h (anche una in corso di invio conta).
    IF EXISTS (SELECT 1 FROM public.food_club_messages x
                WHERE x.user_id = r.user_id AND x.id <> r.id
                  AND ((x.push_status = 'sent' AND x.push_sent_at > p_now - interval '20 hours')
                       OR x.push_status = 'sending')) THEN
      IF r.kind = 'stamp' THEN
        UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'daily_cap' WHERE x.id = r.id;
      ELSE
        UPDATE public.food_club_messages x SET push_after = GREATEST(v_next10, p_now + interval '20 hours') WHERE x.id = r.id;
      END IF;
      CONTINUE;
    END IF;
    IF r.category = 'promo' AND (
         EXISTS (SELECT 1 FROM public.food_club_messages x WHERE x.user_id = r.user_id AND x.category = 'promo'
                   AND x.push_status = 'sent' AND x.push_sent_at > p_now - interval '7 days')
      OR (SELECT count(*) FROM public.food_club_messages x WHERE x.user_id = r.user_id AND x.category = 'promo'
            AND x.push_status = 'sent' AND x.push_sent_at > p_now - interval '30 days') >= 2) THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'promo_cap' WHERE x.id = r.id; CONTINUE;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth_key)), '[]'::jsonb)
      INTO v_subs FROM public.kitchen_push_subscriptions s
     WHERE s.customer_id = r.user_id AND s.consent_scope = 'club';
    IF jsonb_array_length(v_subs) = 0 THEN
      UPDATE public.food_club_messages x SET push_status = 'skipped', push_skip_reason = 'no_club_subscription' WHERE x.id = r.id; CONTINUE;
    END IF;
    UPDATE public.food_club_messages x SET push_status = 'sending', push_claimed_at = p_now, push_attempts = x.push_attempts + 1
     WHERE x.id = r.id;
    message_id := r.id; user_id := r.user_id; kind := r.kind; title := r.title; body := r.body;
    url := r.url || CASE WHEN position('?' IN r.url) > 0 THEN '&' ELSE '?' END || 'n=' || r.id::text;
    subscriptions := v_subs;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Firma chiamata dalla Edge Function (invariata).
CREATE OR REPLACE FUNCTION public.food_club_push_claim_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (message_id uuid, user_id uuid, kind text, title text, body text, url text, subscriptions jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'; END IF;
  RETURN QUERY SELECT * FROM public.food_club_push_claim_batch_at(p_limit, now());
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Esito dell'invio
-- ---------------------------------------------------------------------------------------------------
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
  UPDATE public.food_club_messages m
     SET push_status = CASE
           WHEN COALESCE(p_delivered, 0) > 0 THEN 'sent'
           WHEN p_error = 'time_budget' THEN 'queued'
           WHEN NOT EXISTS (SELECT 1 FROM public.kitchen_push_subscriptions s
                             WHERE s.customer_id = m.user_id AND s.consent_scope = 'club') THEN 'skipped'
           WHEN m.push_attempts >= 3 OR p_error = 'vapid_not_configured' THEN 'failed'
           ELSE 'queued' END,
         push_attempts = CASE WHEN COALESCE(p_delivered, 0) = 0 AND p_error = 'time_budget'
                              THEN GREATEST(m.push_attempts - 1, 0) ELSE m.push_attempts END,
         push_sent_at = CASE WHEN COALESCE(p_delivered, 0) > 0 THEN now() ELSE m.push_sent_at END,
         push_after = CASE WHEN COALESCE(p_delivered, 0) > 0 THEN m.push_after
                           WHEN p_error = 'time_budget' THEN now()
                           ELSE now() + interval '5 minutes' END,
         push_skip_reason = CASE
           WHEN COALESCE(p_delivered, 0) = 0 AND p_error IS DISTINCT FROM 'time_budget'
                AND NOT EXISTS (SELECT 1 FROM public.kitchen_push_subscriptions s
                                 WHERE s.customer_id = m.user_id AND s.consent_scope = 'club') THEN 'no_club_subscription'
           ELSE left(p_error, 80) END
   WHERE m.id = p_message_id AND m.push_status = 'sending';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Tick (pg_cron -> pg_net -> Edge Function). Senza secret in Vault: WARNING e nessuna chiamata.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_push_tick(p_url text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.food_club_messages
                  WHERE (push_status = 'queued' AND push_after <= now())
                     OR (push_status = 'sending' AND push_claimed_at < now() - interval '10 minutes')) THEN
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

-- ---------------------------------------------------------------------------------------------------
-- 4) Generatori categoria Promozioni (la consegna ricontrolla consenso e limiti al momento dell'invio)
-- ---------------------------------------------------------------------------------------------------
-- Promo riservata: inserisce un messaggio per ogni iscritto attivo con consenso marketing valido e "Promo e novità"
-- acceso. Idempotente su (utente, 'promo', p_ref). Nessuna UI: chiamabile solo da service_role / postgres.
CREATE OR REPLACE FUNCTION public.food_club_promo_enqueue(p_venue_id text, p_ref text, p_title text, p_body text,
  p_url text DEFAULT '/kitchen', p_send_at timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  IF p_ref IS NULL OR btrim(p_ref) = '' OR char_length(p_ref) > 60 THEN RAISE EXCEPTION 'invalid_ref'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' OR char_length(p_title) > 40 THEN RAISE EXCEPTION 'invalid_title'; END IF;
  IF p_body IS NULL OR btrim(p_body) = '' OR char_length(p_body) > 90 THEN RAISE EXCEPTION 'invalid_body'; END IF;
  IF p_url IS NULL OR left(p_url, 1) <> '/' OR left(p_url, 2) = '//' THEN RAISE EXCEPTION 'invalid_url'; END IF;
  INSERT INTO public.food_club_messages (user_id, kind, category, ref, title, body, url, push_after)
  SELECT m.user_id, 'promo', 'promo', p_ref, p_title, p_body, p_url, COALESCE(p_send_at, now())
    FROM public.food_club_members m
   WHERE m.venue_id = p_venue_id AND m.status = 'active'
     AND m.marketing_consent_at IS NOT NULL AND m.marketing_revoked_at IS NULL AND m.notif_promo_enabled
  ON CONFLICT (user_id, kind, ref) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Ritorno dopo inattività: 21 giorni senza visite (iscrizione, timbro o ordine app pagato), poi non prima di 60 giorni
-- dall'ultimo invito. Solo con campagna attiva (il testo promette un timbro) e consenso marketing valido.
CREATE OR REPLACE FUNCTION public.food_club_winback_enqueue(p_now timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer; v_now timestamptz := COALESCE(p_now, now());
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  INSERT INTO public.food_club_messages (user_id, kind, category, ref, title, body, url, push_after, created_at)
  SELECT m.user_id, 'winback', 'promo', to_char(v_now AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD'),
         'CI MANCHI AL WALRUS', 'Il tuo prossimo timbro è a un ordine di distanza.', '/kitchen', v_now, v_now
    FROM public.food_club_members m
   WHERE m.status = 'active'
     AND m.marketing_consent_at IS NOT NULL AND m.marketing_revoked_at IS NULL AND m.notif_promo_enabled
     AND EXISTS (SELECT 1 FROM public.food_club_campaigns c
                  WHERE c.venue_id = m.venue_id AND c.active
                    AND (c.starts_at IS NULL OR c.starts_at <= v_now) AND (c.ends_at IS NULL OR c.ends_at > v_now))
     AND GREATEST(m.joined_at,
           (SELECT max(s.created_at) FROM public.food_club_stamps s WHERE s.user_id = m.user_id AND s.revoked_at IS NULL),
           (SELECT max(o.created_at) FROM public.kitchen_orders o WHERE o.customer_id = m.user_id AND o.payment_status = 'paid'))
         <= v_now - interval '21 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_messages x
                      WHERE x.user_id = m.user_id AND x.kind = 'winback' AND x.created_at > v_now - interval '60 days')
  ON CONFLICT (user_id, kind, ref) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5) Permessi (claim_batch, report, tick: invariati rispetto a 20261109102000)
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_push_claim_batch_at(integer, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_push_claim_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_push_report(uuid, integer, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_push_tick(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_promo_enqueue(text, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_winback_enqueue(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_push_claim_batch(integer), public.food_club_push_report(uuid, integer, text[], text),
  public.food_club_promo_enqueue(text, text, text, text, text, timestamptz), public.food_club_winback_enqueue(timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------------------------------
-- 6) Job pg_cron (cron.schedule con nome = upsert: rieseguibile)
-- ---------------------------------------------------------------------------------------------------
SELECT cron.schedule('food-club-push', '*/5 * * * *',
  $cron$SELECT public.food_club_push_tick('https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-food-club-push')$cron$);
SELECT cron.schedule('food-club-winback', '7 15 * * *', $cron$SELECT public.food_club_winback_enqueue()$cron$);
