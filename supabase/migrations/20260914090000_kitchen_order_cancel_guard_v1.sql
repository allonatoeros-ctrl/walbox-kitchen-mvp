-- Kitchen Payment Hub V1 — REAL_RISK #1 fix: block cancelling an order that is currently paid.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Gate 1 approvato da Eros per implementazione locale
-- (spec: ai-ops/reports/f04-f12-payment-hub-audit.md, REAL_RISKS #1 / MINIMAL_FIX_IF_NEEDED).
-- Apply remoto NON eseguito in questo task.
--
-- Problem this fixes (audit F04/F12, REAL_RISKS #1, CONFIRMED): cancelOrder in
-- src/hooks/useKitchenOrders.js writes `status='cancelled'` via a direct UPDATE on kitchen_orders
-- under the broad `staff_update_venue_orders` RLS policy (is_staff_for_venue only) — nothing checks
-- payment_status. Staff can cancel an order with payment_status='paid': the order becomes cancelled
-- while the charge stays 'paid' in the Payment Hub — no refund, no block, no alert. Money collected,
-- dish never delivered, discrepancy only surfaces via manual cross-check.
--
-- Fix: a new RPC, `kitchen_order_cancel(p_order_id, p_reason)`, SECURITY DEFINER, following the same
-- pattern already used by kitchen_payment_record_counter/kitchen_payment_refund (lock order row,
-- verify is_staff_for_venue, then act): rejects with `order_already_paid_cannot_cancel` when
-- payment_status='paid', forcing staff through an explicit refund (kitchen_payment_refund) first —
-- payment_status becomes 'refunded', which this guard does not block, so cancel is allowed again once
-- the refund has actually succeeded. An order that was never paid (payment_status NULL or
-- 'pending_counter_payment') cancels exactly as it does today: same UPDATE (status/cancel_reason/
-- cancelled_at), no other behavior change. The action-log write (previously done client-side via
-- supabaseInsertActionLog) now happens inside the RPC transaction, matching the other Payment Hub
-- RPCs (kitchen_payment_record_counter, kitchen_payment_refund) — venue_id comes from the locked
-- order row, not a hardcoded client-side constant.
--
-- No new column/index/status/constraint: reuses payment_status='paid' (already the only value that
-- means "currently has a succeeded, unrefunded charge" per kitchen_payment_refund's own guard logic).
-- Does not touch/widen the staff_update_venue_orders RLS policy — other client paths
-- (updateOrderStatus, updateStaffNote) keep using it legitimately for non-financial columns.

CREATE OR REPLACE FUNCTION public.kitchen_order_cancel(
  p_order_id text,
  p_reason text DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order      public.kitchen_orders;
  v_old_status text;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT is_staff_for_venue(v_order.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  -- REAL_RISKS #1: an order with a currently succeeded, unrefunded charge (payment_status='paid')
  -- must not be silently cancelled. Staff must refund first (kitchen_payment_refund moves
  -- payment_status to 'refunded', which this check does not match) before cancel is allowed again.
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid_cannot_cancel';
  END IF;

  v_old_status := v_order.status;

  UPDATE public.kitchen_orders
  SET status = 'cancelled', cancel_reason = p_reason, cancelled_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.kitchen_action_log (
    order_id, venue_id, action, from_status, to_status, actor_type, actor_id, reason
  ) VALUES (
    v_order.id, v_order.venue_id, 'cancelled', v_old_status, 'cancelled', 'staff', auth.uid(), p_reason
  );

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_order_cancel(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_order_cancel(text, text) TO authenticated;
