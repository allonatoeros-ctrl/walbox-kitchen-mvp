-- Kitchen Payment Hub V1 — F03: Cash/POS vs SumUp online mutual exclusivity.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Gate 1 approvato da Eros per implementazione locale
-- (design: ai-ops/reports/f03-cash-sumup-exclusivity-design.md, audit:
-- ai-ops/reports/f03-cash-sumup-exclusivity-audit.md). Apply remoto NON eseguito in questo task.
--
-- Root cause (audit F03, CONFIRMED): kitchen_payment_record_counter (20260906171426) blocca un
-- nuovo incasso banco solo se esiste già un charge 'succeeded' per l'ordine — non controlla un
-- tentativo SumUp ancora 'initiated'/'pending', né uno 'failed' nella finestra di retry stesso-
-- checkout (provider='sumup' AND failure_reason='sumup_failed'). kitchen_payment_attempt_start
-- (20260830101227) ha già questo identico predicato per bloccare nuovi tentativi online — qui lo
-- si riusa parola per parola per il percorso banco, chiudendo l'asimmetria. Nessun nuovo status,
-- nessun nuovo failure_reason, nessuna nuova colonna/indice: solo il corpo delle due funzioni.
--
-- CREATE OR REPLACE su top delle versioni live (20260906171426 per record_counter, 20260830101227
-- per confirm) — quei file restano invariati, questa migration porta i corpi aggiornati. Zero
-- modifiche a GRANT/REVOKE rispetto a quanto già live (restati identici per chiarezza, come da
-- convenzione già in uso in questo progetto, es. 20260830101227 su 20260828100400).

CREATE OR REPLACE FUNCTION public.kitchen_payment_record_counter(
  p_order_id text,
  p_method text
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.kitchen_orders;
  v_existing public.kitchen_payments;
  v_payment public.kitchen_payments;
  v_provider text;
BEGIN
  IF p_method NOT IN ('cash', 'card_counter_manual') THEN
    RAISE EXCEPTION 'invalid_counter_payment_method';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT is_staff_for_venue(v_order.venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled'; END IF;

  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = v_order.id AND direction = 'charge' AND status = 'succeeded'
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing; -- idempotent result for double click / concurrent staff tab
  END IF;

  -- F03 fix: block on any SumUp/online charge attempt that is still live or still retry-eligible
  -- on the same checkout — identical predicate to kitchen_payment_attempt_start (20260830101227),
  -- read here under the same kitchen_orders row lock taken above, so a concurrent attempt_start/
  -- record_counter call for this order_id always serializes against this check (see design doc,
  -- CONCURRENCY_STRATEGY). Unlike the succeeded-branch above, this is NOT idempotent: the order is
  -- not yet paid, so silently returning success would be wrong — the caller must see a distinct
  -- error and decide (retry later, or resolve the stuck attempt via kitchen_payment_fail).
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = v_order.id
      AND direction = 'charge'
      AND (
        status IN ('initiated', 'pending')
        OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
      )
  ) THEN
    RAISE EXCEPTION 'online_payment_in_progress';
  END IF;

  v_provider := CASE WHEN p_method = 'cash' THEN 'cash' ELSE 'manual' END;
  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    v_order.id, v_order.venue_id, 'counter', v_provider, p_method, 'charge', 'succeeded', v_order.total,
    'staff', auth.uid()
  )
  RETURNING * INTO v_payment;

  UPDATE public.kitchen_orders
  SET payment_status = 'paid', payment_method = p_method, paid_at = now(),
      status = CASE WHEN status = 'pending_counter_payment' THEN 'received' ELSE status END
  WHERE id = v_order.id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    v_order.id, v_order.venue_id, 'payment_confirmed', 'staff', auth.uid(),
    jsonb_build_object(
      'payment_id', v_payment.id,
      'method', p_method,
      'source', 'staff_confirmed_counter',
      'amount_derived_server_side', true
    )
  );

  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_payment_record_counter(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_record_counter(text, text) TO authenticated;

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

    -- F03 fix: log the lost race so a real double-capture (money landed on two rails) stays
    -- visible to staff, without changing the return contract — still no RAISE, still returns the
    -- winning row, preserving the idempotent-confirm invariant the webhook/reconcile/sweep depend
    -- on. Callers that inspect the returned row's `id` against the attempt they asked to confirm
    -- can now also detect this case client-side (see api/_lib/sumupPaymentResolution.js).
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
