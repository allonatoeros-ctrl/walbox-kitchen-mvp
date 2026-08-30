-- Kitchen Payment Hub V1 — SumUp Online Payment Reliability Hardening — FASE 1.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source: ai-ops/reports/sumup-payment-reliability-contract-v1-audit.md, P1-1 (multi-tab/multi-device
-- duplicate checkout) and Scenario 1b.
--
-- CREATE OR REPLACE on top of the version defined in 20260828100300_kitchen_payment_rpc_cash_v1.sql
-- (left untouched per instructions) — this migration lands the fixed function body.
--
-- Problem: the old duplicate guard only reused an existing attempt when the caller supplied the
-- SAME idempotency_key. That key is generated and cached per-tab (sessionStorage), so two tabs (or
-- two devices on the same order) each got their own idempotency_key, and each call created its own
-- 'initiated' kitchen_payments row — two independent SumUp checkouts could then be opened for the
-- same order.
--
-- Fix: before inserting a new attempt, look for ANY existing charge attempt on this order_id in
-- status ('initiated', 'pending') — independent of idempotency_key — and reuse it. This replaces
-- the idempotency_key-scoped lookup entirely (the new check is a strict superset: it also covers
-- the same-tab retry case the old key-scoped lookup handled). FAILED/CANCELLED attempts are not in
-- that IN-list, so they never block a new attempt — a customer whose payment failed can always
-- retry. No timeout/TTL-based bypass: an 'initiated'/'pending' attempt blocks new attempts for as
-- long as it stays in that status, regardless of its age (see FASE 5 — provider-side retries reuse
-- the same attempt via create-checkout, they don't need a new DB row).
--
-- Concurrency: unchanged from the original — the `FOR UPDATE` row lock taken on kitchen_orders at
-- the top of the function serializes concurrent calls for the same order, so the second concurrent
-- caller always observes the first caller's INSERT before running this SELECT.

CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_start(
  p_order_id text,
  p_channel text,
  p_provider text,
  p_method text,
  p_amount numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order    public.kitchen_orders;
  v_existing public.kitchen_payments;
  v_payment  public.kitchen_payments;
  v_actor_type text;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_cancelled';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  IF p_channel = 'app' THEN
    IF v_order.customer_id IS NULL OR v_order.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'not_order_owner';
    END IF;
    v_actor_type := 'customer';
  ELSIF p_channel = 'counter' THEN
    IF NOT is_staff_for_venue(v_order.venue_id) THEN
      RAISE EXCEPTION 'not_staff_for_venue';
    END IF;
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'invalid_channel';
  END IF;

  IF p_amount <> v_order.total THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  -- Duplicate checkout guard (P1-1): any live charge attempt for this order blocks a new one,
  -- independent of idempotency_key. FAILED/CANCELLED are not live, so they never block a retry.
  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = p_order_id
    AND direction = 'charge'
    AND status IN ('initiated', 'pending')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    idempotency_key, initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    p_order_id, v_order.venue_id, p_channel, p_provider, p_method, 'charge', 'initiated', p_amount,
    p_idempotency_key, v_actor_type, auth.uid()
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    p_order_id, v_order.venue_id, 'payment_attempt_started', v_actor_type, auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'provider', p_provider, 'method', p_method)
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text)
  TO authenticated;
