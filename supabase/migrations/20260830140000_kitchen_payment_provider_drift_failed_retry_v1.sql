-- Kitchen Payment Hub V1 — SumUp Online — Same-Checkout Retry Fix (LONG SESSION F) — drift view update.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE for THIS file. Unlike the other files in this task,
-- 20260830121000_kitchen_payment_provider_drift_v1.sql (the view this migration replaces) is
-- ALREADY APPLIED TO THE REMOTE per Eros — that file is left completely untouched, this is a fresh
-- CREATE OR REPLACE VIEW layered on top of it, same pattern already used elsewhere in this project
-- for a function that was already live (e.g. kitchen_payment_confirm in 20260828100800 on top of
-- 20260828100400). CREATE OR REPLACE VIEW requires restating the full view body, so the 4 existing
-- branches from 20260830121000 are reproduced verbatim below, unchanged, plus one new branch.
--
-- New branch: 'failed_charge_retry_window_open' — a charge attempt is 'failed' with
-- provider='sumup' AND failure_reason='sumup_failed' (the exact same-checkout-retry-eligible state
-- that kitchen_payment_attempt_start now blocks on, and kitchen_payment_confirm now allows to
-- promote — see 20260830130000) while the order itself is not yet 'paid'. This is the staff-visible
-- safety net for FASE 3/5 of the same-checkout retry task: if the webhook/on-demand reconcile/
-- autonomous sweep haven't yet resolved one of these (still within the retry window, or stuck for
-- some other reason), staff can see it here instead of it being silently invisible. Distinct from
-- 'paid_without_verifiable_charge' above it: that branch is for orders ALREADY marked paid without
-- evidence; this one is for orders NOT YET marked paid where the money might still land on this same
-- checkout. No new active provider calls here either, same "minimo reporting" philosophy as
-- 20260830121000's own header.

CREATE OR REPLACE VIEW public.kitchen_payments_provider_drift_candidates AS
SELECT
  o.id AS order_id,
  o.venue_id,
  o.payment_status,
  o.total,
  'paid_without_verifiable_charge'::text AS drift_type
FROM public.kitchen_orders o
WHERE is_staff_for_venue(o.venue_id)
  AND o.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments kp
    WHERE kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
      AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL)
  )

UNION ALL

SELECT
  o.id AS order_id,
  o.venue_id,
  o.payment_status,
  o.total,
  'refunded_without_verifiable_refund'::text AS drift_type
FROM public.kitchen_orders o
WHERE is_staff_for_venue(o.venue_id)
  AND o.payment_status = 'refunded'
  AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments kp
    WHERE kp.order_id = o.id AND kp.direction = 'refund' AND kp.status = 'succeeded'
      AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL)
  )

UNION ALL

SELECT
  kp.order_id,
  kp.venue_id,
  o.payment_status,
  o.total,
  'refund_stuck_initiated'::text AS drift_type
FROM public.kitchen_payments kp
JOIN public.kitchen_orders o ON o.id = kp.order_id
WHERE is_staff_for_venue(kp.venue_id)
  AND kp.direction = 'refund'
  AND kp.status IN ('initiated', 'pending')

UNION ALL

SELECT
  kp.order_id,
  kp.venue_id,
  o.payment_status,
  o.total,
  'failed_charge_retry_window_open'::text AS drift_type
FROM public.kitchen_payments kp
JOIN public.kitchen_orders o ON o.id = kp.order_id
WHERE is_staff_for_venue(kp.venue_id)
  AND kp.direction = 'charge'
  AND kp.status = 'failed'
  AND kp.provider = 'sumup'
  AND kp.failure_reason = 'sumup_failed'
  AND o.payment_status <> 'paid';

GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated;
