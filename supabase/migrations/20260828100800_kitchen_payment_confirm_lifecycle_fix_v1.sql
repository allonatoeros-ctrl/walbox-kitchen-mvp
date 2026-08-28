-- Kitchen Payment Hub V1 — Fix: kitchen_payment_confirm did not advance order.status.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source finding: SumUp sandbox E2E run (2026-08-28) — payment succeeded and
-- kitchen_orders.payment_status/payment_method/paid_at were set correctly, but
-- kitchen_orders.status stayed stuck on 'pending_counter_payment' forever, so the customer UI
-- and (likely) the kitchen queue never saw the order move forward after online payment.
--
-- CREATE OR REPLACE on top of the version defined in 20260828100400_kitchen_payment_rpc_webhook_v1.sql
-- (not applied to remote yet either) — that file is left untouched per instructions; this migration
-- is the one that actually lands the fixed function body.
--
-- Fix: when a charge is confirmed, also set kitchen_orders.status = 'received', but ONLY if it is
-- still 'pending_counter_payment'. Any later status (received/preparing/ready/delivered/cancelled)
-- is left untouched — a payment confirmation must never move an order backwards or resurrect a
-- cancelled one. Both UPDATEs run in the same function invocation (single implicit transaction),
-- so payment_status/payment_method/paid_at and status land atomically together or not at all.
-- kitchen_payment_fail is untouched: a failed/expired payment must never advance order.status.

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
  v_payment      public.kitchen_payments;
  v_order_status text;
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

  -- Lock the order row before branching on its status so a concurrent staff status-change can't
  -- race between the SELECT and the conditional UPDATE below.
  SELECT status INTO v_order_status FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE;

  IF v_order_status = 'pending_counter_payment' THEN
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now(), status = 'received'
    WHERE id = v_payment.order_id;
  ELSE
    -- Order already moved on (received/preparing/ready/delivered) or was cancelled: only settle the
    -- payment fields, never touch status.
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now()
    WHERE id = v_payment.order_id;
  END IF;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_confirmed', 'system',
    jsonb_build_object(
      'payment_id', v_payment.id,
      'provider_ref', p_provider_ref,
      'order_status_before', v_order_status,
      'order_status_after', CASE WHEN v_order_status = 'pending_counter_payment' THEN 'received' ELSE v_order_status END
    )
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb)
  TO service_role;
