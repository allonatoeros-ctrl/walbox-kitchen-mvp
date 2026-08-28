-- Kitchen Payment Hub V1 — Step 6: RPC #5 (refund).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (RPC_DESIGN #5).
-- V1 scope: full refund only, synchronous — no async provider refund confirmation (see RISKS in the
-- design doc; a symmetric confirm RPC for async provider refunds is explicitly deferred to V2).
--
-- Same actor_id deviation as RPC #4 (see 20260828100300_kitchen_payment_rpc_cash_v1.sql header):
-- uses auth.uid() internally instead of a client-supplied actor_id parameter.

CREATE OR REPLACE FUNCTION public.kitchen_payment_refund(
  p_order_id text,
  p_amount numeric,
  p_reason text
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order  public.kitchen_orders;
  v_charge public.kitchen_payments;
  v_refund public.kitchen_payments;
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
    RAISE EXCEPTION 'no_succeeded_charge_to_refund'; -- also covers: order already refunded (T19 guard)
  END IF;

  IF p_amount <> v_charge.amount THEN
    RAISE EXCEPTION 'refund_amount_mismatch'; -- V1: full refund only, no partial
  END IF;

  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    p_order_id, v_order.venue_id, 'counter', v_charge.provider, v_charge.method, 'refund', 'succeeded', p_amount,
    'staff', auth.uid()
  )
  RETURNING * INTO v_refund;

  UPDATE public.kitchen_orders
  SET payment_status = 'refunded'
  WHERE id = p_order_id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (
    p_order_id, v_order.venue_id, 'payment_refunded', 'staff', auth.uid(), p_reason,
    jsonb_build_object('refund_payment_id', v_refund.id, 'original_charge_id', v_charge.id)
  );

  RETURN v_refund;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_refund(text, numeric, text)
  TO authenticated;
