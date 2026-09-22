-- Kitchen Payment Hub V1 — Payment Cancel Hardening.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. PRODUCTION FREEZE in effect (Kitchen live a Melegnano):
-- nessun `supabase db push`/`db query -f`/apply_migration in questo task. Apply remoto resta una
-- decisione separata di Eros, da fare fuori da questo run (vedi §5.1 SECURITY_POLICY.md quando
-- succedera': solo `supabase db push --linked`).
--
-- Problem this fixes: staff cancelling an order (`kitchen_order_cancel`, 20260914090000) only checks
-- kitchen_orders.payment_status='paid' — it never looks at a live SumUp charge attempt still
-- 'initiated'/'pending'. If staff cancels while the customer's hosted checkout page is still open,
-- the order becomes 'cancelled' while the SumUp checkout can still turn PAID underneath it. When the
-- webhook/reconcile later calls kitchen_payment_confirm (any version since 20260828100800), the ELSE
-- branch ("order already moved on or was cancelled: only settle the payment fields, never touch
-- status") sets kitchen_orders.payment_status='paid' regardless of status — producing the exact
-- invalid combination status='cancelled' + payment_status='paid' that this migration closes.
--
-- Two changes, both CREATE OR REPLACE on top of the live bodies (20260913120000 for confirm), no
-- ALTER/DROP/new column/new status value (kitchen_payments.status already allows 'cancelled', see
-- kitchen_payments_status_check in 20260828100000 — reserved but never written by any RPC until now):
--
-- 1. kitchen_payment_confirm: the 'cancelled' order-status case is split out of the generic ELSE
--    branch. The charge itself still settles to 'succeeded' (money was genuinely captured on SumUp,
--    never silently dropped from the ledger), but kitchen_orders is left untouched — payment_status
--    never flips to 'paid' on a cancelled order. A dedicated kitchen_action_log entry
--    ('payment_confirmed_after_cancel', metadata.needs_manual_reconciliation=true) makes the conflict
--    visible to staff instead of a silent, structurally-invalid write — same posture as the existing
--    'payment_confirm_lost_race' entry (F03, 20260913120000) for a different confirm-time conflict.
--
-- 2. kitchen_order_cancel_with_payment_attempt(p_order_id, p_reason): new RPC, called by the new
--    dedicated endpoint (api/kitchen-cancel-with-payment-check.js) instead of duplicating cancel
--    logic there. Same lock order as kitchen_payment_confirm — the live charge attempt row (if any)
--    is locked FOR UPDATE *before* the order row — so a concurrent confirm/fail for that same attempt
--    always serializes against this call on the same row-level lock instead of deadlocking or racing
--    silently. Strict superset of kitchen_order_cancel (same is_staff_for_venue check, same
--    payment_status='paid' guard, same idempotent no-op on an already-cancelled order): additionally
--    cancels the live attempt (status='cancelled', a value the schema already allowed but no RPC ever
--    wrote) atomically with the order. kitchen_order_cancel itself is left completely untouched — a
--    historical migration, never modified — and stays reachable for any other caller.

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
  v_old_status   text;
  v_old_reason   text;
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

  IF v_payment.status NOT IN ('initiated', 'pending')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'sumup_failed')
  THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  v_old_status := v_payment.status;
  v_old_reason := v_payment.failure_reason;

  BEGIN
    UPDATE public.kitchen_payments
    SET status = 'succeeded', provider_ref = p_provider_ref, failure_reason = NULL,
        raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_payment;
  EXCEPTION WHEN unique_violation THEN
    -- Race with another attempt for the same order already marked succeeded first (e.g. a counter
    -- cash payment recorded while this SumUp checkout was still open — F03): treat as idempotent
    -- replay, return the one that actually won instead of erroring the webhook/reconcile caller.
    SELECT * INTO v_payment
    FROM public.kitchen_payments
    WHERE order_id = v_payment.order_id AND direction = 'charge' AND status = 'succeeded';

    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirm_lost_race', 'system',
      jsonb_build_object(
        'losing_attempt_id', p_attempt_id,
        'winning_payment_id', v_payment.id,
        'winning_channel', v_payment.channel,
        'winning_method', v_payment.method
      )
    );

    RETURN v_payment;
  END;

  -- Lock the order row before branching on its status so a concurrent staff status-change (or
  -- cancel, see kitchen_order_cancel_with_payment_attempt below) can't race between the SELECT and
  -- the conditional UPDATE below.
  SELECT status INTO v_order_status FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE;

  IF v_order_status = 'pending_counter_payment' THEN
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now(), status = 'received'
    WHERE id = v_payment.order_id;
  ELSIF v_order_status = 'cancelled' THEN
    -- Payment Cancel Hardening: never create order.status='cancelled' + payment_status='paid'.
    -- SumUp genuinely captured the money on this checkout after the order was already cancelled
    -- (e.g. the cancel endpoint's best-effort DELETE lost the race, or the customer completed the
    -- hosted checkout page right after cancel). The charge above already settled to 'succeeded' —
    -- the money is never silently dropped from the ledger — but kitchen_orders is deliberately left
    -- untouched here: payment_status must never flip to 'paid' while status is 'cancelled'. Flagged
    -- in kitchen_action_log for staff to resolve explicitly (refund), same posture as the existing
    -- 'payment_confirm_lost_race' entry for a different confirm-time conflict above.
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirmed_after_cancel', 'system',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_ref', p_provider_ref,
        'needs_manual_reconciliation', true
      )
    );
    RETURN v_payment;
  ELSE
    -- Order already moved on (received/preparing/ready/delivered): only settle the payment fields,
    -- never touch status.
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
      'order_status_after', CASE WHEN v_order_status = 'pending_counter_payment' THEN 'received' ELSE v_order_status END,
      'promoted_from_status', v_old_status,
      'promoted_from_failure_reason', v_old_reason
    )
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.kitchen_order_cancel_with_payment_attempt(
  p_order_id text,
  p_reason text DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment    public.kitchen_payments;
  v_order      public.kitchen_orders;
  v_old_status text;
BEGIN
  -- Same lock order as kitchen_payment_confirm above: the live charge attempt row (if any) is
  -- locked FIRST, the order row SECOND — so a concurrent confirm for the very same attempt always
  -- serializes against this call on the same row-level lock instead of deadlocking. At most one
  -- charge attempt can be 'initiated'/'pending' per order at a time (kitchen_payment_attempt_start's
  -- own duplicate guard, 20260830101227), so this filter always resolves to the same physical row a
  -- concurrent kitchen_payment_confirm(p_attempt_id=...) call would lock by id.
  SELECT * INTO v_payment
  FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge' AND status IN ('initiated', 'pending')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT is_staff_for_venue(v_order.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  -- Idempotent: already cancelled, nothing left to do (same precedent as kitchen_order_cancel).
  IF v_order.status = 'cancelled' THEN
    RETURN v_order;
  END IF;

  -- Same guard as kitchen_order_cancel (20260914090000): a currently succeeded, unrefunded charge
  -- must never be silently cancelled — staff must refund first.
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid_cannot_cancel';
  END IF;

  -- Race guard: if a live attempt was found above but a concurrent confirm/fail resolved it between
  -- the caller's SumUp GET check and this transaction's lock, it is no longer initiated/pending by
  -- the time we re-read it here under FOR UPDATE — never force-cancel over that outcome.
  IF v_payment.id IS NOT NULL AND v_payment.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'payment_attempt_not_cancelable';
  END IF;

  IF v_payment.id IS NOT NULL THEN
    UPDATE public.kitchen_payments
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_payment.id;

    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
    VALUES (
      v_order.id, v_order.venue_id, 'payment_attempt_cancelled', 'staff', auth.uid(),
      jsonb_build_object('payment_id', v_payment.id, 'reason', p_reason)
    );
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

REVOKE ALL ON FUNCTION public.kitchen_order_cancel_with_payment_attempt(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_order_cancel_with_payment_attempt(text, text) TO authenticated;
