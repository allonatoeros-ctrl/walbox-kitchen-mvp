-- Kitchen Payment Hub V1 — SumUp Online — Final Reconciliation Coverage — FASE 5.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source: LONG SESSION B task, FASE 5 (both drift directions must be individuable by staff).
--
-- Direction A (SumUp paid, Walbox not updated) is handled ACTIVELY by the on-demand reconcile
-- endpoint + the autonomous sweep (api/_lib/sumupReconcileSweep.js) — those call SumUp directly and
-- self-heal. Direction B (Walbox says paid/refunded, but we can't verify it against the provider) has
-- no automatic call-SumUp-for-every-order mechanism (deliberately — no heavy infra per the task), so
-- this is the "minimo reporting" that makes that drift individuable by staff: a single read-only view,
-- no new tables, same is_staff_for_venue-gated pattern as kitchen_payments_order_reconciliation
-- (20260828100600).
--
-- "Verifiable" here means: a succeeded charge/refund row exists AND, if its provider is 'sumup', it
-- carries a provider_ref (the SumUp checkout id) we could still re-check later. Cash/manual/other
-- non-online providers never have a provider_ref by design (kitchen_payment_record_cash and the
-- non-sumup branch of kitchen_payment_refund_confirm both leave it NULL) — those never count as
-- drift here, only 'sumup' rows without a provider_ref do.

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
  AND kp.status IN ('initiated', 'pending');

GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated;
