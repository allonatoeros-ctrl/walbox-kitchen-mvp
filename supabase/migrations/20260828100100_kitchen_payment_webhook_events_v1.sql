-- Kitchen Payment Hub V1 — Step 2: kitchen_payment_webhook_events (table + RLS SELECT-only staff).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (KITCHEN_PAYMENTS_SCHEMA,
-- RLS_DESIGN, WEBHOOK_FLOW).
--
-- Raw audit trail + idempotency ledger for provider webhooks. Written only by RPC #6
-- (kitchen_payment_webhook_ingest, service_role only, added in a later migration of this sprint) —
-- no INSERT policy for authenticated/anon here, same RPC-only write pattern as kitchen_payments.

CREATE TABLE IF NOT EXISTS public.kitchen_payment_webhook_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  provider           text NOT NULL,
  provider_event_id  text NOT NULL,
  event_type         text,
  payment_id         uuid REFERENCES public.kitchen_payments(id),
  signature_verified boolean NOT NULL DEFAULT false,
  raw_payload        jsonb NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  processing_error   text,
  CONSTRAINT kitchen_payment_webhook_events_pkey PRIMARY KEY (id),
  CONSTRAINT kitchen_payment_webhook_events_provider_check CHECK (
    provider = ANY (ARRAY['sumup'::text, 'satispay'::text])
  ),
  CONSTRAINT kitchen_payment_webhook_events_dedup UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_payment_webhook_events_payment_id
  ON public.kitchen_payment_webhook_events (payment_id);

ALTER TABLE public.kitchen_payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- Staff can see a webhook event only once it is linked to a payment attempt in their venue
-- (payment_id is nullable until RPC #2/#3 resolve it) — matches RLS_DESIGN exactly.
CREATE POLICY staff_select_venue_webhook_events ON public.kitchen_payment_webhook_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.kitchen_payments kp
      WHERE kp.id = kitchen_payment_webhook_events.payment_id
        AND is_staff_for_venue(kp.venue_id)
    )
  );
