-- Kitchen Payment Hub V1 — SumUp Online Refund — FASE 3/4 (real provider-side refund).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source: LONG SESSION B task (SumUp refund + reconciliation), P0-2 from
-- ai-ops/reports/sumup-payment-reliability-contract-v1-audit.md.
--
-- Problem this fixes: the kitchen_payment_refund RPC from 20260828100500 (already live on remote,
-- see CHECKPOINT.md) writes a 'succeeded' refund row and marks the order 'refunded' purely from the
-- RPC call succeeding — it never calls SumUp. Staff could believe a refund happened while the
-- customer's card was never credited.
--
-- Fix: split the single synchronous RPC into the same initiated -> succeeded|failed lifecycle
-- already used for charges (kitchen_payment_attempt_start / _confirm / _fail):
--   kitchen_payment_refund(order_id, reason)            -> opens/reuses an 'initiated' refund attempt
--   kitchen_payment_refund_confirm(refund_id, ref, raw)  -> service_role only, 'succeeded' + order.refunded
--   kitchen_payment_refund_fail(refund_id, reason, raw)  -> service_role or staff, 'failed', order untouched
--   kitchen_payment_refund_claim_provider_call(refund_id)-> service_role only, atomic "I'm about to
--                                                            call the real SumUp API" claim marker
-- api/kitchen-sumup-refund.js (server-side) is the only caller that ever calls the real SumUp refund
-- API, and only calls _confirm after SumUp itself returns success (204) — never before.
--
-- Signature change: kitchen_payment_refund drops the p_amount parameter entirely. V1 stays full-refund
-- only (unchanged scope from 20260828100500) and the amount is now ALWAYS derived server-side from
-- the original succeeded charge — a client can no longer influence the refunded amount at all, not
-- even indirectly via a validated-but-accepted parameter.
--
-- Duplicate refund guard: mirrors the charge-side fix in 20260828100900 exactly — any live
-- ('initiated'/'pending') refund attempt on the order is reused instead of starting a second one, so
-- two staff devices / a double-click never open two attempts. kitchen_payment_refund_claim_provider_call
-- closes the remaining gap: reusing the SAME attempt row across two concurrent HTTP requests must not
-- let both requests call the real SumUp API. It row-locks the refund attempt and raises
-- 'refund_call_already_claimed' if a provider call was already claimed for it — the second caller
-- must not retry SumUp, only report "already in progress" (T14 duplicate refund).
--
-- kitchen_payments_one_succeeded_refund_per_order (20260828100700) is untouched and still the
-- DB-level backstop against two succeeded refunds landing for the same order.

DROP FUNCTION IF EXISTS public.kitchen_payment_refund(text, numeric, text);

CREATE FUNCTION public.kitchen_payment_refund(
  p_order_id text,
  p_reason text
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order    public.kitchen_orders;
  v_charge   public.kitchen_payments;
  v_existing public.kitchen_payments;
  v_refund   public.kitchen_payments;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT is_staff_for_venue(v_order.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  SELECT * INTO v_charge
  FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge' AND status = 'succeeded'
    AND NOT EXISTS (
      SELECT 1 FROM public.kitchen_payments r
      WHERE r.order_id = p_order_id AND r.direction = 'refund' AND r.status = 'succeeded'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_succeeded_charge_to_refund'; -- also covers: order already refunded
  END IF;

  -- Duplicate/concurrent refund guard: any live refund attempt on this order is reused instead of
  -- starting a second one — the DB row lock on v_order above already serializes concurrent callers
  -- for the same order, so the second caller always observes the first caller's INSERT here.
  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = p_order_id
    AND direction = 'refund'
    AND status IN ('initiated', 'pending')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    p_order_id, v_order.venue_id, 'counter', v_charge.provider, v_charge.method, 'refund', 'initiated',
    v_charge.amount, -- amount always derived server-side from the original charge (V1: full refund only)
    'staff', auth.uid()
  )
  RETURNING * INTO v_refund;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (
    p_order_id, v_order.venue_id, 'payment_refund_attempt_started', 'staff', auth.uid(), p_reason,
    jsonb_build_object('refund_payment_id', v_refund.id, 'original_charge_id', v_charge.id)
  );

  RETURN v_refund;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_refund(text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_payment_refund_confirm(
  p_refund_id uuid,
  p_provider_ref text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refund public.kitchen_payments;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_refund FROM public.kitchen_payments WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_attempt_not_found';
  END IF;

  IF v_refund.direction <> 'refund' THEN
    RAISE EXCEPTION 'not_a_refund_attempt';
  END IF;

  IF v_refund.status = 'succeeded' THEN
    RETURN v_refund; -- idempotent no-op on a duplicate confirm
  END IF;

  IF v_refund.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_refund_status';
  END IF;

  BEGIN
    UPDATE public.kitchen_payments
    SET status = 'succeeded', provider_ref = p_provider_ref, raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_refund_id
    RETURNING * INTO v_refund;
  EXCEPTION WHEN unique_violation THEN
    -- Race with another refund attempt for the same order already succeeded first (should not
    -- happen given the duplicate guard above, kept only as the same defensive pattern already used
    -- by kitchen_payment_confirm for charges).
    SELECT * INTO v_refund
    FROM public.kitchen_payments
    WHERE order_id = v_refund.order_id AND direction = 'refund' AND status = 'succeeded';
    RETURN v_refund;
  END;

  UPDATE public.kitchen_orders
  SET payment_status = 'refunded'
  WHERE id = v_refund.order_id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
  VALUES (
    v_refund.order_id, v_refund.venue_id, 'payment_refunded', 'system',
    jsonb_build_object('refund_payment_id', v_refund.id, 'provider_ref', p_provider_ref)
  );

  RETURN v_refund;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_refund_confirm(uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.kitchen_payment_refund_fail(
  p_refund_id uuid,
  p_reason text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refund     public.kitchen_payments;
  v_actor_type text;
BEGIN
  SELECT * INTO v_refund FROM public.kitchen_payments WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_attempt_not_found';
  END IF;

  IF v_refund.direction <> 'refund' THEN
    RAISE EXCEPTION 'not_a_refund_attempt';
  END IF;

  IF auth.role() = 'service_role' THEN
    v_actor_type := 'system';
  ELSIF is_staff_for_venue(v_refund.venue_id) THEN
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_refund.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_refund_status';
  END IF;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = p_reason, raw_last_event = p_raw_payload, updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;

  -- kitchen_orders.payment_status is deliberately left untouched here: the original charge is still
  -- 'paid', a failed refund attempt must never move it to 'refunded' — see FASE 4 contract.

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason)
  VALUES (
    v_refund.order_id, v_refund.venue_id, 'payment_refund_failed', v_actor_type,
    CASE WHEN v_actor_type = 'staff' THEN auth.uid() ELSE NULL END,
    p_reason
  );

  RETURN v_refund;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_refund_fail(uuid, text, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kitchen_payment_refund_claim_provider_call(
  p_refund_id uuid
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refund public.kitchen_payments;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_refund FROM public.kitchen_payments WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_attempt_not_found';
  END IF;

  IF v_refund.direction <> 'refund' OR v_refund.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_refund_status';
  END IF;

  IF v_refund.raw_last_event ? 'provider_call_claimed_at' THEN
    -- Another request already claimed this refund attempt for the real SumUp call. Never issue a
    -- second real provider-side refund call for the same attempt — the caller must report
    -- "already in progress", not retry SumUp (T14 duplicate refund).
    RAISE EXCEPTION 'refund_call_already_claimed';
  END IF;

  UPDATE public.kitchen_payments
  SET raw_last_event = raw_last_event || jsonb_build_object('provider_call_claimed_at', now()),
      updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;

  RETURN v_refund;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_refund_claim_provider_call(uuid)
  TO service_role;
