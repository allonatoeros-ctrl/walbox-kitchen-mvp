-- Walbox Kitchen Pilot — RPC + policy/constraint completion, Sprint 3B remote alignment.
--
-- APPLIED TO THE REMOTE PROJECT on 2026-09-06 as migration version `20260906171426`
-- (name in the ledger: `kitchen_pilot_order_contract_rpc_v1`). The file content is byte-identical
-- to the SQL registered there. DO NOT re-run: it is already live. Renamed from the former
-- `20260906120000_...` filename by the ledger reconciliation of 2026-09-07 (see
-- `ai-ops/reports/kitchen-migration-ledger-reconciliation-20260907.md`).
--
-- Scope / why this file exists (see ai-ops/reports/sprint3b-remote-db-alignment-audit.md):
--   `20260901120000_kitchen_pilot_order_contract_v1.sql` (superseded draft, now kept in
--   `ai-ops/archive/migrations/`) was never applied to the
--   remote as-is. Its section 1 (table_id nullable, service_day, service_sequence,
--   kitchen_service_order_counters, kitchen_format_operational_code, realtime publication)
--   IS already live on the remote project, applied under a different migration name/version
--   (`20260905072954_kitchen_order_code_infra_table_id_nullable_v1` for the schema/counter
--   part, `20260903001022` for the realtime publication). Its section 2 and 3 — the RPCs, the
--   direct-insert policy drops, and the payment_method constraint update — were NEVER applied.
--
--   This migration carries ONLY section 2 and 3 of that file, verbatim, so it can be applied
--   on top of the current remote state without re-declaring anything that already exists there.
--   It intentionally does NOT touch: table_id, service_day, service_sequence,
--   kitchen_service_order_counters, kitchen_format_operational_code, or the realtime
--   publication — all already applied remotely, out of scope for this migration.
--
--   Every statement below is already idempotent by construction (CREATE OR REPLACE FUNCTION,
--   DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT, DROP POLICY IF EXISTS), so re-running this
--   file against a database where it was already applied is a safe no-op, not an error.

-- =============================================================================
-- 2. Customer order creation: a single DB transaction allocates the code and derives total
--
-- No-tables contract: no table_id/fulfillment_type input at all. Every order inserted through
-- this RPC has table_id = NULL. This is the only customer-facing write path (direct customer
-- insert policies are dropped below), so it is also the enforcement point for "no tables".
-- Depends on kitchen_service_order_counters and kitchen_format_operational_code, both already
-- live on the remote (applied by 20260905072954_kitchen_order_code_infra_table_id_nullable_v1).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order(
  p_venue_id text,
  p_nickname text,
  p_customer_note text,
  p_items jsonb
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service_day date := timezone('Europe/Rome', now())::date;
  v_sequence integer;
  v_total numeric;
  v_order public.kitchen_orders;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'customer_session_required';
  END IF;
  IF p_venue_id IS NULL OR btrim(p_venue_id) = '' THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;
  IF p_nickname IS NULL OR btrim(p_nickname) = '' THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;

  SELECT sum((line.quantity::numeric) * line.price)
  INTO v_total
  FROM jsonb_to_recordset(p_items) AS line(item_id text, name text, quantity integer, price numeric);

  IF v_total IS NULL OR v_total <= 0 OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, name text, quantity integer, price numeric)
    WHERE line.item_id IS NULL OR btrim(line.item_id) = ''
      OR line.name IS NULL OR btrim(line.name) = ''
      OR line.quantity IS NULL OR line.quantity < 1
      OR line.price IS NULL OR line.price < 0
  ) THEN
    RAISE EXCEPTION 'invalid_order_items';
  END IF;

  INSERT INTO public.kitchen_service_order_counters (venue_id, service_day, last_sequence)
  VALUES (p_venue_id, v_service_day, 1)
  ON CONFLICT (venue_id, service_day)
  DO UPDATE SET last_sequence = public.kitchen_service_order_counters.last_sequence + 1,
                updated_at = now()
  RETURNING last_sequence INTO v_sequence;

  INSERT INTO public.kitchen_orders (
    id, order_code, venue_id, table_id, nickname, customer_id,
    status, customer_note, total, payment_status, payment_method, service_day, service_sequence
  ) VALUES (
    'order-' || gen_random_uuid()::text,
    public.kitchen_format_operational_code(v_sequence),
    p_venue_id,
    NULL,
    btrim(p_nickname),
    auth.uid(),
    'pending_counter_payment',
    NULLIF(btrim(p_customer_note), ''),
    v_total,
    'pending_counter_payment',
    NULL,
    v_service_day,
    v_sequence
  )
  RETURNING * INTO v_order;

  INSERT INTO public.kitchen_order_items (order_id, venue_id, item_id, name, quantity, price)
  SELECT v_order.id, v_order.venue_id, line.item_id, line.name, line.quantity, line.price
  FROM jsonb_to_recordset(p_items) AS line(item_id text, name text, quantity integer, price numeric);

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order(text, text, text, jsonb) TO authenticated;

-- Direct customer writes bypass server-side allocation and total calculation, so the RPC becomes
-- the only customer creation path. Read policies remain unchanged.
DROP POLICY IF EXISTS customer_insert_own_order_items ON public.kitchen_order_items;
DROP POLICY IF EXISTS customer_insert_own_orders ON public.kitchen_orders;

-- =============================================================================
-- 3. Payment Hub: secure staff-confirmed counter cash/card, no POS hardware integration
-- =============================================================================

ALTER TABLE public.kitchen_payments
  DROP CONSTRAINT IF EXISTS kitchen_payments_method_check;
ALTER TABLE public.kitchen_payments
  ADD CONSTRAINT kitchen_payments_method_check CHECK (
    method = ANY (ARRAY[
      'sumup_online'::text, 'sumup_pos'::text, 'satispay_app'::text,
      'cash'::text, 'card_counter_manual'::text, 'manual_comp'::text, 'manual_other'::text
    ])
  );

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_payment_method_check;
ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_payment_method_check CHECK (
    payment_method IS NULL OR payment_method = ANY (ARRAY[
      'counter'::text, 'sumup_online'::text, 'sumup_pos'::text,
      'satispay_app'::text, 'cash'::text, 'card_counter_manual'::text,
      'manual_comp'::text, 'manual_other'::text
    ])
  );

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

-- Compatibility signature only: legacy callers may still pass an amount, but it is ignored.
-- The function delegates to the authoritative two-argument RPC, so no client-supplied amount can
-- influence the recorded payment. This REPLACEs the pre-Sprint3B kitchen_payment_record_cash
-- (20260828100300_kitchen_payment_rpc_cash_v1.sql), which trusted p_amount from the client and
-- never advanced kitchen_orders.status from pending_counter_payment to received.
CREATE OR REPLACE FUNCTION public.kitchen_payment_record_cash(
  p_order_id text,
  p_amount numeric
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.kitchen_payment_record_counter(p_order_id, 'cash');
END;
$function$;
