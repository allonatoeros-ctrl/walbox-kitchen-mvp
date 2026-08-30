-- Kitchen Payment Hub V1 — SumUp Online — Same-Checkout Retry Fix (LONG SESSION F).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
--
-- Bug found in a real E2E scenario: a SumUp hosted checkout can go FAILED (declined card) and the
-- customer can still retry with a different card on the SAME checkout page — SumUp does not
-- invalidate the checkout on a decline. The checkout can later report PAID for the exact same
-- checkout id. Before this migration, once a kitchen_payments charge attempt was 'failed', nothing
-- ever re-checked it again: kitchen_payment_confirm rejected it outright, and
-- kitchen_payment_attempt_start let a brand new attempt/checkout start in the meantime — so Walbox
-- could end up with the order unpaid (CTA still showing "pay") while SumUp had actually captured the
-- money on the old checkout, or with two live checkouts open for the same order at once.
--
-- Contract (see ai-ops/reports, LONG SESSION F task):
--   * 'succeeded' stays absolute-terminal (never downgraded).
--   * 'cancelled' stays absolute-terminal (never resurrected).
--   * A 'failed' charge attempt is retry-eligible for promotion to 'succeeded' ONLY when
--     provider = 'sumup' AND failure_reason = 'sumup_failed' (SumUp itself said "card declined" —
--     not 'sumup_expired'/'sumup_cancelled', which are genuinely terminal on SumUp's side, and not
--     'sumup_amount_mismatch', which is a Walbox-side data problem that can never resolve to a valid
--     confirm — see api/_lib/sumupPaymentResolution.js, the PAID+mismatch branch always routes to
--     fail again, never to confirm, regardless of this RPC's guard).
--   * The promotion is driven exclusively by a fresh authoritative SumUp GET /checkouts/{id}
--     (webhook / on-demand reconcile / autonomous sweep, api/_lib/sumupPaymentResolution.js) — no
--     client can reach kitchen_payment_confirm directly (service_role_only, unchanged) or supply the
--     PAID verdict itself.
--   * While that same-checkout retry window is open, kitchen_payment_attempt_start must not let a
--     second payment (any provider/channel — online or counter) start for the order: the old
--     checkout could still turn PAID underneath a second, independent payment.
--
-- CREATE OR REPLACE on top of the versions defined in 20260828100900 (attempt_start),
-- 20260828100800 (confirm) and 20260828100400 (fail) — those files are left untouched per
-- instructions; this migration lands the fixed function bodies. The existing static test for
-- 20260828100900 ("FAILED/CANCELLED non sono nella lista di stati bloccanti") describes the
-- superseded behavior of that file's own source, not the live function anymore — see this
-- migration's own test file for the current contract.

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

  -- Duplicate checkout guard (P1-1, unchanged): any live charge attempt for this order blocks a new
  -- one, independent of idempotency_key.
  -- Same-checkout retry guard (LONG SESSION F, new): a 'failed' SumUp attempt whose checkout can
  -- still turn PAID (failure_reason = 'sumup_failed') ALSO blocks a new attempt — of ANY
  -- provider/channel, not just another SumUp one, because the old checkout could still capture money
  -- underneath a second, independent payment. This is why the guard below is not scoped to
  -- p_provider/p_method: it protects the order, not just the same payment method. Attempts failed
  -- for any other reason ('sumup_expired', 'sumup_cancelled', 'sumup_amount_mismatch') are NOT live
  -- here on purpose — those are genuinely terminal on SumUp's side (or a Walbox-side data mismatch
  -- that can never resolve to PAID), so they never block a fresh retry. No timeout/TTL-based bypass
  -- either way: the guard clears itself only when a later authoritative SumUp check changes
  -- failure_reason away from 'sumup_failed' (see kitchen_payment_fail in this same migration).
  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = p_order_id
    AND direction = 'charge'
    AND (
      status IN ('initiated', 'pending')
      OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
    )
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

  -- 'failed' is accepted ONLY for provider = 'sumup' AND failure_reason = 'sumup_failed' — the exact
  -- "same checkout can still turn PAID" case (see migration header). Any other failed reason
  -- ('sumup_expired'/'sumup_cancelled'/'sumup_amount_mismatch') or a staff-cancelled attempt
  -- ('cancelled') is rejected here, same as before this migration: a client-triggered re-check that
  -- somehow reaches this RPC for a genuinely terminal attempt must fail loudly, never silently
  -- resurrect it.
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
    -- payment fields, never touch status. This is also what keeps a cancelled order from being
    -- resurrected by a late same-checkout PAID: payment_status still reflects the money that was
    -- actually captured (so staff can see and refund it), but order.status stays 'cancelled'.
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
  v_was_failed boolean;
  v_old_reason text;
BEGIN
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  -- 'failed' is now accepted alongside 'initiated'/'pending' (was rejected before this migration):
  -- the same-checkout retry window means a previously-failed attempt can be re-verified again and
  -- found still not-PAID (e.g. the sweep re-checking a 'sumup_failed' attempt that is still FAILED,
  -- or now genuinely EXPIRED/CANCELLED) — that must not error. 'succeeded' (never downgrade) and
  -- 'cancelled' (never resurrect into a fail/refail cycle) stay rejected exactly as before.
  IF v_payment.status NOT IN ('initiated', 'pending', 'failed') THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  -- Authorization is status-dependent: re-verifying an already-'failed' attempt must be driven
  -- exclusively by the authoritative SumUp re-check (webhook/reconcile/sweep, service_role) — a
  -- staff-triggered fail on a 'failed' attempt would let a human race the same-checkout retry
  -- window instead of the fresh provider check deciding it. 'initiated'/'pending' stay open to
  -- staff as before (e.g. cancelling a stuck attempt at the counter).
  IF auth.role() = 'service_role' THEN
    v_actor_type := 'system';
  ELSIF v_payment.status = 'failed' THEN
    RAISE EXCEPTION 'not_authorized';
  ELSIF is_staff_for_venue(v_payment.venue_id) THEN
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_was_failed := (v_payment.status = 'failed');
  v_old_reason := v_payment.failure_reason;

  IF v_was_failed AND v_old_reason IS NOT DISTINCT FROM p_reason THEN
    -- Re-check landed on the exact same outcome as before: idempotent no-op, refresh
    -- raw_last_event/updated_at only, no duplicate kitchen_action_log entry (avoids log spam from a
    -- sweep repeatedly re-verifying a still-FAILED checkout).
    UPDATE public.kitchen_payments
    SET raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_payment;
    RETURN v_payment;
  END IF;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = p_reason, raw_last_event = p_raw_payload, updated_at = now()
  WHERE id = p_attempt_id
  RETURNING * INTO v_payment;

  -- kitchen_orders.payment_status/status are deliberately left untouched here (unchanged from
  -- before this migration): a failed/re-failed attempt must never advance or alter order state.

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_failed', v_actor_type,
    CASE WHEN v_actor_type = 'staff' THEN auth.uid() ELSE NULL END,
    p_reason,
    CASE WHEN v_was_failed THEN jsonb_build_object('recheck_reason_changed_from', v_old_reason) ELSE '{}'::jsonb END
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_fail(uuid, text, jsonb)
  TO authenticated, service_role;
