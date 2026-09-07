-- Walbox Kitchen Pilot — operational order code and secure counter payment contract.
--
-- LOCAL DRAFT ONLY. It has NOT been applied to Supabase, and must not be applied without a
-- separate human gate. This migration changes order data shape and RLS write boundaries.
--
-- Product contract (no-tables pilot, corrected 2026-09-05 — see
-- ai-ops/reports/sprint3b-no-tables-correction-audit.md):
--   QR -> Kitchen -> ordine -> order_code -> staff -> status -> ritiro. No table, no takeaway,
--   no fulfillment concept at all. table_id becomes nullable and is never written by the
--   customer order path; it is kept only for schema back-compat with existing rows/readers.
--   operational order_code -> allocated server-side per venue + Europe/Rome service day
--   counter payment -> staff chooses only cash or card_counter_manual; amount is order.total
--
-- This intentionally does NOT add any SumUp POS/Cloud API integration and does NOT alter the
-- asynchronous SumUp Online confirmation lifecycle owned by the existing Payment Hub RPCs.

-- =============================================================================
-- 1. Operational-code ledger and the table_id relaxation the no-tables contract requires
-- =============================================================================

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS service_day date,
  ADD COLUMN IF NOT EXISTS service_sequence integer;

-- kitchen_orders.table_id is NOT NULL on the live schema (20260710173936). The no-tables
-- contract stops writing any table value from the customer order path, so the column must
-- become optional. No existing table_id value is touched or backfilled.
ALTER TABLE public.kitchen_orders
  ALTER COLUMN table_id DROP NOT NULL;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_service_sequence_positive_check
    CHECK (service_sequence IS NULL OR service_sequence > 0) NOT VALID;

ALTER TABLE public.kitchen_orders
  VALIDATE CONSTRAINT kitchen_orders_service_sequence_positive_check;

CREATE TABLE IF NOT EXISTS public.kitchen_service_order_counters (
  venue_id     text NOT NULL,
  service_day  date NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_service_order_counters_pkey PRIMARY KEY (venue_id, service_day),
  CONSTRAINT kitchen_service_order_counters_nonnegative_check CHECK (last_sequence >= 0)
);

ALTER TABLE public.kitchen_service_order_counters ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_venue_service_sequence_unique
  ON public.kitchen_orders (venue_id, service_day, service_sequence)
  WHERE service_day IS NOT NULL AND service_sequence IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_orders_venue_service_code_unique
  ON public.kitchen_orders (venue_id, service_day, order_code)
  WHERE service_day IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kitchen_format_operational_code(p_sequence integer)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_value integer := ((p_sequence - 1) / 99);
  v_letters text := '';
BEGIN
  IF p_sequence IS NULL OR p_sequence < 1 THEN
    RAISE EXCEPTION 'invalid_service_sequence';
  END IF;

  LOOP
    v_letters := chr(65 + (v_value % 26)) || v_letters;
    v_value := (v_value / 26) - 1;
    EXIT WHEN v_value < 0;
  END LOOP;

  RETURN v_letters || lpad((((p_sequence - 1) % 99) + 1)::text, 2, '0');
END;
$function$;

-- =============================================================================
-- 2. Customer order creation: a single DB transaction allocates the code and derives total
--
-- No-tables contract: no table_id/fulfillment_type input at all. Every order inserted through
-- this RPC has table_id = NULL. This is the only customer-facing write path (direct customer
-- insert policies are dropped below), so it is also the enforcement point for "no tables".
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
-- influence the recorded payment.
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
