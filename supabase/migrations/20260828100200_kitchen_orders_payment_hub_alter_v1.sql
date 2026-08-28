-- Kitchen Payment Hub V1 — Step 3: minimal ALTERs on kitchen_orders (no new columns).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (ORDER_CHANGES).
-- Resolves BLOCKER #1 from kitchen-schema-baseline-v1-audit.md (payment_method hardcoded to 'counter').
--
-- Isolated and reversible: existing rows only ever used 'counter'/NULL for payment_method and
-- NULL/'pending_counter_payment'/'paid'/'cancelled' for payment_status, all still valid under the
-- widened constraints below — no data migration needed.

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_payment_method_check;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_payment_method_check CHECK (
    payment_method IS NULL OR payment_method = ANY (ARRAY[
      'counter'::text, 'sumup_online'::text, 'sumup_pos'::text,
      'satispay_app'::text, 'cash'::text, 'manual_comp'::text, 'manual_other'::text
    ])
  );

ALTER TABLE public.kitchen_orders
  DROP CONSTRAINT IF EXISTS kitchen_orders_payment_status_check;

ALTER TABLE public.kitchen_orders
  ADD CONSTRAINT kitchen_orders_payment_status_check CHECK (
    payment_status IS NULL OR payment_status = ANY (ARRAY[
      'pending_counter_payment'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text
    ])
  );
