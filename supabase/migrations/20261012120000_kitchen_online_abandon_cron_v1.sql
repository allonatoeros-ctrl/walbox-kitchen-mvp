-- =========================================================================
-- S6 — Chiusura automatica a 5 minuti degli ordini online non pagati (pg_cron)
-- Piano: docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md §5 (opzione A) e §S6.
-- Stato: SOLO LOCALE, non applicata al remoto. Apply = `npx supabase db push --linked`, gate di Eros,
-- DOPO il deploy di api/kitchen-online-abandon-sweep.js e DOPO aver creato il secret (runbook:
-- docs/KITCHEN_ONLINE_ABANDON_BACKOFFICE.md).
--
-- Cosa fa:
--   1) attiva pg_cron (Supabase: schema pg_catalog, jobs nello schema cron);
--   2) kitchen_order_log_online_abandon_stuck: log back-office `online_abandon_stuck`, una riga per ordine
--      (service role, la chiama lo sweep);
--   3) kitchen_online_abandon_sweep_tick: ogni minuto un solo EXISTS indicizzato; SOLO se vero legge il
--      secret dal Vault e fa UNA net.http_post verso lo sweep Vercel. Zero POP scaduti = zero HTTP;
--   4) job `kitchen-online-abandon-sweep` ogni minuto + job `kitchen-cron-history-retention` giornaliero
--      (cron.job_run_details > 7 giorni).
-- Hardening consumo: gli ordini incerti da oltre 15 minuti tengono vivo il tick solo ogni 10 minuti
-- (minuto multiplo di 10), cosi' un ordine bloccato non genera 1.440 chiamate al giorno.
-- Additiva: nessuna tabella o funzione esistente modificata.
-- Rollback: SELECT cron.unschedule('kitchen-online-abandon-sweep'); (migration dedicata, gate di Eros).
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Gia' installata in produzione (20260924130000); IF NOT EXISTS per lo stack locale.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =========================================================================
-- 1) kitchen_order_log_online_abandon_stuck — log back-office deduplicato
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_order_log_online_abandon_stuck(
  p_order_id text,
  p_reason   text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.kitchen_orders;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Due sweep in parallelo: serializza per ordine, poi una sola riga per ordine.
  PERFORM pg_advisory_xact_lock(hashtext('kitchen_online_abandon_stuck:' || p_order_id));
  IF EXISTS (
    SELECT 1 FROM public.kitchen_action_log
    WHERE order_id = p_order_id AND action = 'online_abandon_stuck'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.kitchen_action_log (
    order_id, venue_id, action, from_status, to_status, actor_type, reason, metadata
  ) VALUES (
    v_order.id, v_order.venue_id, 'online_abandon_stuck',
    v_order.status, v_order.status, 'system', left(COALESCE(p_reason, 'unknown'), 200),
    jsonb_build_object('order_created_at', v_order.created_at, 'total', v_order.total)
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_order_log_online_abandon_stuck(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_log_online_abandon_stuck(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_log_online_abandon_stuck(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_order_log_online_abandon_stuck(text, text) TO service_role;

-- =========================================================================
-- 2) kitchen_online_abandon_sweep_tick — controllo leggero, HTTP solo se c'e' lavoro
-- =========================================================================

-- Il secret vive SOLO nel Vault (`kitchen_abandon_sweep_secret`, stesso valore della env Vercel
-- KITCHEN_ABANDON_SWEEP_SECRET), creato da Eros fuori da qualunque migration. Qui compare solo il NOME.
-- Ritorna l'id della richiesta pg_net, oppure NULL quando non parte nessuna chiamata.
CREATE OR REPLACE FUNCTION public.kitchen_online_abandon_sweep_tick(
  p_url text DEFAULT 'https://walbox-from-zero-v2.vercel.app/api/kitchen-online-abandon-sweep'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  -- Unica lettura del ramo vuoto: indice parziale idx_kitchen_orders_pending_online_created (S2).
  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_orders
    WHERE status = 'pending_online_payment'
      AND created_at < now() - interval '5 minutes'
      AND (
        created_at >= now() - interval '15 minutes'
        OR extract(minute FROM now())::int % 10 = 0
      )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'kitchen_abandon_sweep_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'kitchen_online_abandon_sweep_tick: secret kitchen_abandon_sweep_secret assente in Vault, sweep saltato';
    RETURN NULL;
  END IF;

  -- Fire-and-forget: pg_net accoda la richiesta, il job non aspetta Vercel.
  SELECT net.http_post(
    url := p_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

-- Solo il proprietario (postgres, che esegue i job pg_cron) puo' chiamarla.
REVOKE ALL ON FUNCTION public.kitchen_online_abandon_sweep_tick(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_online_abandon_sweep_tick(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_online_abandon_sweep_tick(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_online_abandon_sweep_tick(text) FROM service_role;

-- =========================================================================
-- 3) Job pg_cron (cron.schedule con nome = upsert: rieseguibile)
-- =========================================================================

SELECT cron.schedule(
  'kitchen-online-abandon-sweep',
  '* * * * *',
  $$SELECT public.kitchen_online_abandon_sweep_tick()$$
);

-- 1.440 righe al giorno dal job a 1 minuto: si tengono 7 giorni di storico.
SELECT cron.schedule(
  'kitchen-cron-history-retention',
  '17 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);
