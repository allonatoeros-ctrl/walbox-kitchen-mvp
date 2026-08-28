-- Kitchen Payment Hub V1 — Step 1: kitchen_payments (table + indexes + RLS SELECT-only).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Do not run `supabase db push` / apply_migration
-- until Eros gives explicit Gate 2 approval (CLAUDE.md §3, SECURITY_POLICY.md §5).
--
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (KITCHEN_PAYMENTS_SCHEMA,
-- PAYMENT_ATTEMPT_MODEL, RLS_DESIGN). Baseline reference: 20260827222829_kitchen_schema_baseline_v1.sql.
--
-- One row per payment attempt (not per order): an order can have N attempts, but at most one
-- succeeded charge — enforced below via partial unique index, not just application logic.
-- No INSERT/UPDATE/DELETE policy for authenticated/anon: the only write path is the RPC
-- SECURITY DEFINER functions added in later migrations of this sprint (same pattern already in
-- use for kitchen_orders/kitchen_order_items — no staff INSERT policy on those either).

CREATE TABLE IF NOT EXISTS public.kitchen_payments (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id                text NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE RESTRICT,
  venue_id                text NOT NULL,
  channel                 text NOT NULL,
  provider                text NOT NULL,
  method                  text NOT NULL,
  direction               text NOT NULL DEFAULT 'charge',
  status                  text NOT NULL DEFAULT 'initiated',
  amount                  numeric NOT NULL,
  provider_ref            text,
  idempotency_key         text,
  initiated_by_actor_type text NOT NULL,
  initiated_by_actor_id   uuid,
  failure_reason          text,
  raw_last_event          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_payments_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_payments_channel_check CHECK (
    channel = ANY (ARRAY['app'::text, 'counter'::text])
  ),
  CONSTRAINT kitchen_payments_provider_check CHECK (
    provider = ANY (ARRAY['sumup'::text, 'satispay'::text, 'cash'::text, 'manual'::text])
  ),
  CONSTRAINT kitchen_payments_method_check CHECK (
    method = ANY (ARRAY[
      'sumup_online'::text, 'sumup_pos'::text, 'satispay_app'::text,
      'cash'::text, 'manual_comp'::text, 'manual_other'::text
    ])
  ),
  CONSTRAINT kitchen_payments_direction_check CHECK (
    direction = ANY (ARRAY['charge'::text, 'refund'::text])
  ),
  CONSTRAINT kitchen_payments_status_check CHECK (
    status = ANY (ARRAY['initiated'::text, 'pending'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text])
  ),
  CONSTRAINT kitchen_payments_amount_check CHECK (amount > 0::numeric),
  CONSTRAINT kitchen_payments_actor_type_check CHECK (
    initiated_by_actor_type = ANY (ARRAY['customer'::text, 'staff'::text, 'system'::text])
  )
);

-- At most one succeeded charge per order — DB-level, not just RPC-level.
CREATE UNIQUE INDEX IF NOT EXISTS kitchen_payments_one_succeeded_charge_per_order
  ON public.kitchen_payments (order_id)
  WHERE direction = 'charge' AND status = 'succeeded';

CREATE INDEX IF NOT EXISTS idx_kitchen_payments_order_created
  ON public.kitchen_payments (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kitchen_payments_venue_status
  ON public.kitchen_payments (venue_id, status, created_at);

ALTER TABLE public.kitchen_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_select_own_payments ON public.kitchen_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kitchen_orders o
      WHERE o.id = kitchen_payments.order_id
        AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY staff_select_venue_payments ON public.kitchen_payments
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));
