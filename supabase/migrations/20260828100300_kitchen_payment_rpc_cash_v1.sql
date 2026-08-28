-- Kitchen Payment Hub V1 — Step 4: RPC #1 (attempt_start) + RPC #4 (record_cash).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (RPC_DESIGN #1, #4).
-- Counter/cash path only — no external provider, no webhook. Validated end-to-end before touching
-- the SumUp/Satispay async RPCs (step 5 of this sprint).
--
-- Both SECURITY DEFINER, SET search_path pinned to 'public','pg_temp' (same pattern as
-- is_staff_for_venue in the baseline). Row locks (`FOR UPDATE` on the order) are the concurrency
-- control: two concurrent calls for the same order serialize on that lock, so the second call
-- always observes the first call's payment_status update before deciding to proceed or raise.
--
-- Deviation from the Fase 1 design doc, declared here: RPC #4 in the design lists a client-supplied
-- `actor_id` parameter; implemented instead using `auth.uid()` internally (the caller is already
-- required to be staff via is_staff_for_venue, so this only affects whose id is attributed in
-- kitchen_action_log, not authorization) — avoids a caller impersonating another staff member in
-- the log. Same convention applied to RPC #5 in the next migration.

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

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.kitchen_payments
    WHERE order_id = p_order_id
      AND idempotency_key = p_idempotency_key
      AND status IN ('initiated', 'pending', 'succeeded')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing;
    END IF;
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

CREATE OR REPLACE FUNCTION public.kitchen_payment_record_cash(
  p_order_id text,
  p_amount numeric
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   public.kitchen_orders;
  v_payment public.kitchen_payments;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT is_staff_for_venue(v_order.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_cancelled';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  IF p_amount <> v_order.total THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    p_order_id, v_order.venue_id, 'counter', 'cash', 'cash', 'charge', 'succeeded', p_amount,
    'staff', auth.uid()
  )
  RETURNING * INTO v_payment;

  UPDATE public.kitchen_orders
  SET payment_status = 'paid', payment_method = 'cash', paid_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    p_order_id, v_order.venue_id, 'payment_confirmed', 'staff', auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'method', 'cash')
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_record_cash(text, numeric)
  TO authenticated;
