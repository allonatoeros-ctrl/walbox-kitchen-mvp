-- Kitchen Payment Hub V1 — Step 5: RPC #2 (confirm) + #3 (fail) + #6 (webhook_ingest).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (RPC_DESIGN #2, #3, #6,
-- WEBHOOK_FLOW). Needed for the async SumUp/Satispay flows.
--
-- #2 and #6 are service_role only (called from the payment-webhook Edge Function after HMAC
-- signature verification — the Edge Function itself is out of scope for this sprint, see
-- MIGRATION_PLAN step 8 in the design doc). #3 (fail) is reachable by service_role (webhook reports
-- a failed attempt) OR by staff (manually cancelling a stuck attempt) — auth.role() distinguishes
-- the two so the action_log entry attributes the correct actor_type.
--
-- amount is never accepted as a webhook-driven RPC parameter here: #2 only updates the attempt
-- already created (and amount-validated) by RPC #1/#4 — the provider webhook cannot change what was
-- charged, only confirm or fail it.

CREATE OR REPLACE FUNCTION public.kitchen_payment_confirm(
  p_attempt_id uuid,
  p_provider_ref text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment public.kitchen_payments;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  IF v_payment.direction <> 'charge' THEN
    RAISE EXCEPTION 'not_a_charge_attempt';
  END IF;

  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment; -- duplicate webhook delivery, already confirmed: idempotent no-op
  END IF;

  IF v_payment.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  BEGIN
    UPDATE public.kitchen_payments
    SET status = 'succeeded', provider_ref = p_provider_ref, raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_payment;
  EXCEPTION WHEN unique_violation THEN
    -- Race with another attempt for the same order already marked succeeded first: treat as
    -- idempotent replay, return the one that actually won instead of erroring the webhook.
    SELECT * INTO v_payment
    FROM public.kitchen_payments
    WHERE order_id = v_payment.order_id AND direction = 'charge' AND status = 'succeeded';
    RETURN v_payment;
  END;

  UPDATE public.kitchen_orders
  SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now()
  WHERE id = v_payment.order_id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_confirmed', 'system',
    jsonb_build_object('payment_id', v_payment.id, 'provider_ref', p_provider_ref)
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.kitchen_payment_fail(
  p_attempt_id uuid,
  p_reason text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment    public.kitchen_payments;
  v_actor_type text;
BEGIN
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_actor_type := 'system';
  ELSIF is_staff_for_venue(v_payment.venue_id) THEN
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_payment.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = p_reason, raw_last_event = p_raw_payload, updated_at = now()
  WHERE id = p_attempt_id
  RETURNING * INTO v_payment;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_failed', v_actor_type,
    CASE WHEN v_actor_type = 'staff' THEN auth.uid() ELSE NULL END,
    p_reason
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_fail(uuid, text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kitchen_payment_webhook_ingest(
  p_provider text,
  p_provider_event_id text,
  p_signature_verified boolean,
  p_raw_payload jsonb
)
RETURNS public.kitchen_payment_webhook_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.kitchen_payment_webhook_events;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  INSERT INTO public.kitchen_payment_webhook_events (provider, provider_event_id, signature_verified, raw_payload)
  VALUES (p_provider, p_provider_event_id, p_signature_verified, p_raw_payload)
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF NOT FOUND THEN
    SELECT * INTO v_event
    FROM public.kitchen_payment_webhook_events
    WHERE provider = p_provider AND provider_event_id = p_provider_event_id;
  END IF;

  RETURN v_event;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_webhook_ingest(text, text, boolean, jsonb)
  TO service_role;
