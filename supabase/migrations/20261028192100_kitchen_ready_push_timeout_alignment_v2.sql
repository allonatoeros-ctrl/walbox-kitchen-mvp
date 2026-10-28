-- INC-20261028-0001: align the pg_net request timeout with the intentional
-- 10-second readiness/undo window in send-order-ready-push.
--
-- Prior state: pg_net stopped waiting after 5 seconds, while the Edge Function
-- deliberately waited 10 seconds before checking the order and returning 200.
-- This caused false HTTP-failure signals even when the Edge Function completed.
--
-- Replaces only the trigger function. No trigger, order, payment, job, Vault
-- secret, or subscription is created or modified by this migration directly.
-- Apply to production only after an explicit release gate and review.

CREATE OR REPLACE FUNCTION public.kitchen_orders_ready_push_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret             text;
  v_edge_function_url  text := 'https://pcrqfdzipotprqtuemso.supabase.co/functions/v1/send-order-ready-push';
BEGIN
  -- Keep the existing Vault-based authentication. Never embed secret values.
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'kitchen_push_webhook_secret';

  IF v_secret IS NULL THEN
    -- A push failure must never abort the kitchen order status transition.
    RAISE WARNING 'kitchen_orders_ready_push_dispatch: secret kitchen_push_webhook_secret assente in Vault, dispatch saltato per ordine %', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := jsonb_build_object('order_id', NEW.id, 'ready_event_id', NEW.ready_event_id),
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kitchen_orders_ready_push_dispatch: net.http_post fallita per ordine %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_orders_ready_push_dispatch() FROM PUBLIC;
