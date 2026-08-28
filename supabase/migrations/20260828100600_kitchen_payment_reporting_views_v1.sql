-- Kitchen Payment Hub V1 — Step 7: reporting views (read-only, no new tables).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source design: ai-ops/reports/kitchen-payment-hub-v1-fase1-domain-design.md (REPORTING).
--
-- Staff-only access is enforced with an explicit is_staff_for_venue(...) predicate inside each
-- view (rather than relying on RLS pass-through from the underlying tables), so the restriction
-- holds regardless of the view owner's RLS-bypass privileges. GRANT SELECT to authenticated only —
-- no anon access, matching the design.

CREATE OR REPLACE VIEW public.kitchen_payments_daily_summary AS
SELECT
  kp.venue_id,
  date_trunc('day', kp.created_at) AS day,
  kp.provider,
  kp.method,
  kp.direction,
  kp.status,
  sum(kp.amount) AS total_amount,
  count(*) AS attempt_count
FROM public.kitchen_payments kp
WHERE is_staff_for_venue(kp.venue_id)
GROUP BY kp.venue_id, date_trunc('day', kp.created_at), kp.provider, kp.method, kp.direction, kp.status;

GRANT SELECT ON public.kitchen_payments_daily_summary TO authenticated;

-- Drift detector: orders the cache marks 'paid' with no matching succeeded charge row — same drift
-- shape already known between localStorage and Supabase elsewhere in this repo (see CHECKPOINT.md).
CREATE OR REPLACE VIEW public.kitchen_payments_order_reconciliation AS
SELECT
  o.id AS order_id,
  o.venue_id,
  o.payment_status,
  o.total,
  o.created_at AS order_created_at
FROM public.kitchen_orders o
WHERE is_staff_for_venue(o.venue_id)
  AND o.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments kp
    WHERE kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
  );

GRANT SELECT ON public.kitchen_payments_order_reconciliation TO authenticated;
