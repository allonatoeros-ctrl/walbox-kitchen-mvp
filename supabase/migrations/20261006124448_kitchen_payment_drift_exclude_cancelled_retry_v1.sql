-- Kitchen Payment Hub — drift view: exclude cancelled orders from 'failed_charge_retry_window_open'.
--
-- Fix falso positivo ANOMALIE (ordini A10/A02: SumUp failed + ordine annullato mai pagato).
-- Un ordine cancelled non ha piu' una finestra di retry aperta. Delta minimo: solo l'ultimo branch
-- riceve `AND o.status <> 'cancelled'`; gli altri 3 branch sono riprodotti invariati
-- (layering su 20260830101340, CREATE OR REPLACE, nessun DROP, nessuna mutazione dati).

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
  AND o.payment_status <> 'paid'
  AND o.status <> 'cancelled';

GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated;
