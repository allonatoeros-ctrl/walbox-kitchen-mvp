-- =========================================================================
-- Privacy Fase 2 — conservazione limitata dei dati personali (pg_cron notturno)
-- Piano: ai-ops/current/PRIVACY_GDPR.md §Fase 2 (Gate 1 Eros 30/10, giorni approvati).
-- Stato: SOLO LOCALE, non applicata al remoto. Apply = `npx supabase db push --linked`, gate di Eros.
--
-- Cosa fa (kitchen_privacy_retention_sweep, ogni notte alle 04:37):
--   1) ordini > 30 gg: nickname = 'anonimo', note/customer_note/staff_note = NULL. Importi, stati, date,
--      righe ordine e pagamenti restano (obblighi fiscali). Salta le righe incoerenti con I2
--      (paid + stato online): l'UPDATE fallirebbe nel trigger lifecycle guard;
--   2) kitchen_customer_sessions non viste da 30 gg: DELETE;
--   3) kitchen_payments.raw_last_event fermo da 90 gg: ridotto a id, status, checkout_reference e
--      transactions[{id, status, amount, currency}]. transactions[0].id resta: lo legge il rimborso
--      (api/kitchen-sumup-refund.js);
--   4) kitchen_payment_webhook_events.raw_payload > 90 gg: '{}' (le righe restano, servono contro i doppioni);
--   5) kitchen_push_subscriptions non viste da 180 gg: DELETE;
--   6) kitchen_promo_analytics_events > 90 gg: DELETE;
--   7) utenti anonimi inattivi da 90 gg (nessun login/refresh, nessun ordine recente, nessun pass promo,
--      non staff): DELETE da auth.users, max 1000 per notte. A cascata spariscono sessioni e push;
--      gli ordini restano con customer_id NULL.
-- kitchen_privacy_erase_order: richiesta di cancellazione di un cliente (la lancia Eros dal SQL editor).
-- Tutto idempotente: rieseguire non cambia nulla. Additiva: nessuna tabella o funzione esistente modificata.
-- Rollback: SELECT cron.unschedule('kitchen-privacy-retention'); (migration dedicata, gate di Eros).
-- I dati gia' anonimizzati o cancellati non si recuperano.
-- =========================================================================

-- pg_cron e' gia' attivo (20261012120000): ripetere CREATE EXTENSION fa fallire l'hook Supabase
-- (dependent privileges exist), provato su stack locale il 30/10.

-- =========================================================================
-- 1) kitchen_privacy_retention_sweep — pulizia notturna
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_privacy_retention_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_orders    integer;
  v_sessions  integer;
  v_payments  integer;
  v_webhooks  integer;
  v_push      integer;
  v_analytics integer;
  v_users     integer;
BEGIN
  -- 1) Ordini: via nickname e note dopo 30 giorni.
  UPDATE public.kitchen_orders
     SET nickname = 'anonimo', note = NULL, customer_note = NULL, staff_note = NULL
   WHERE created_at < now() - interval '30 days'
     AND (nickname IS DISTINCT FROM 'anonimo'
          OR note IS NOT NULL OR customer_note IS NOT NULL OR staff_note IS NOT NULL)
     AND NOT (payment_status IS NOT DISTINCT FROM 'paid'
              AND status IN ('pending_online_payment', 'payment_abandoned'));
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  -- 2) Sessioni cliente (nickname) non viste da 30 giorni.
  DELETE FROM public.kitchen_customer_sessions
   WHERE last_seen_at < now() - interval '30 days';
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  -- 3) Payload SumUp dei pagamenti: ridotto dopo 90 giorni, il rimborso resta possibile.
  UPDATE public.kitchen_payments
     SET raw_last_event = jsonb_strip_nulls(jsonb_build_object(
           'id', raw_last_event -> 'id',
           'status', raw_last_event -> 'status',
           'checkout_reference', raw_last_event -> 'checkout_reference',
           'transactions', CASE
             WHEN jsonb_typeof(raw_last_event -> 'transactions') = 'array' THEN (
               SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                        'id', t -> 'id',
                        'status', t -> 'status',
                        'amount', t -> 'amount',
                        'currency', t -> 'currency')) ORDER BY t_ord), '[]'::jsonb)
                 FROM jsonb_array_elements(raw_last_event -> 'transactions') WITH ORDINALITY AS x(t, t_ord))
           END,
           'privacy_reduced', true))
   WHERE updated_at < now() - interval '90 days'
     AND NOT (raw_last_event ? 'privacy_reduced');
  GET DIAGNOSTICS v_payments = ROW_COUNT;

  -- 4) Webhook: payload svuotato dopo 90 giorni (provider_event_id resta per la deduplica).
  UPDATE public.kitchen_payment_webhook_events
     SET raw_payload = '{}'::jsonb
   WHERE received_at < now() - interval '90 days'
     AND raw_payload <> '{}'::jsonb;
  GET DIAGNOSTICS v_webhooks = ROW_COUNT;

  -- 5) Notifiche push non viste da 180 giorni.
  DELETE FROM public.kitchen_push_subscriptions
   WHERE last_seen_at < now() - interval '180 days';
  GET DIAGNOSTICS v_push = ROW_COUNT;

  -- 6) Statistiche promo oltre 90 giorni.
  DELETE FROM public.kitchen_promo_analytics_events
   WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_analytics = ROW_COUNT;

  -- 7) Utenti anonimi inattivi da 90 giorni (lotto massimo 1000 per notte).
  DELETE FROM auth.users u
   WHERE u.id IN (
     SELECT a.id
       FROM auth.users a
      WHERE a.is_anonymous
        AND greatest(a.created_at, a.last_sign_in_at) < now() - interval '90 days'
        AND NOT EXISTS (SELECT 1 FROM auth.sessions s
                         WHERE s.user_id = a.id
                           AND greatest(s.created_at, s.updated_at, s.refreshed_at) >= now() - interval '90 days')
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_orders o
                         WHERE o.customer_id = a.id AND o.created_at >= now() - interval '90 days')
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_promo_passes p WHERE p.customer_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_staff_members m WHERE m.user_id = a.id)
        AND NOT EXISTS (SELECT 1 FROM public.kitchen_service_state st WHERE st.updated_by = a.id)
      ORDER BY a.created_at
      LIMIT 1000);
  GET DIAGNOSTICS v_users = ROW_COUNT;

  RETURN jsonb_build_object(
    'orders_anonymized', v_orders,
    'sessions_deleted', v_sessions,
    'payments_reduced', v_payments,
    'webhooks_emptied', v_webhooks,
    'push_deleted', v_push,
    'analytics_deleted', v_analytics,
    'anonymous_users_deleted', v_users);
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_privacy_retention_sweep() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_privacy_retention_sweep() FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_privacy_retention_sweep() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_privacy_retention_sweep() FROM service_role;

-- =========================================================================
-- 2) kitchen_privacy_erase_order — richiesta di cancellazione di un cliente
--    Il nickname deve coincidere (senza maiuscole/spazi) con quello dell'ordine: evita di
--    cancellare il cliente sbagliato. Anonimizza tutti gli ordini dello stesso cliente
--    (customer_id) e cancella le sue sessioni e notifiche push.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_privacy_erase_order(
  p_order_id text,
  p_nickname text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id uuid;
  v_nickname    text;
  v_orders      integer;
  v_sessions    integer := 0;
  v_push        integer := 0;
BEGIN
  SELECT customer_id, nickname INTO v_customer_id, v_nickname
    FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF lower(btrim(v_nickname)) IS DISTINCT FROM lower(btrim(p_nickname)) THEN
    RAISE EXCEPTION 'nickname_mismatch' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.kitchen_orders
     SET nickname = 'anonimo', note = NULL, customer_note = NULL, staff_note = NULL
   WHERE (id = p_order_id
          OR (v_customer_id IS NOT NULL AND customer_id = v_customer_id))
     AND NOT (payment_status IS NOT DISTINCT FROM 'paid'
              AND status IN ('pending_online_payment', 'payment_abandoned'));
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  IF v_customer_id IS NOT NULL THEN
    DELETE FROM public.kitchen_customer_sessions WHERE customer_id = v_customer_id;
    GET DIAGNOSTICS v_sessions = ROW_COUNT;
    DELETE FROM public.kitchen_push_subscriptions WHERE customer_id = v_customer_id;
    GET DIAGNOSTICS v_push = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'orders_anonymized', v_orders,
    'sessions_deleted', v_sessions,
    'push_deleted', v_push);
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_privacy_erase_order(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_privacy_erase_order(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_privacy_erase_order(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_privacy_erase_order(text, text) TO service_role;

-- =========================================================================
-- 3) Job pg_cron (cron.schedule con nome = upsert: rieseguibile)
-- =========================================================================

SELECT cron.schedule(
  'kitchen-privacy-retention',
  '37 4 * * *',
  $$SELECT public.kitchen_privacy_retention_sweep()$$
);
