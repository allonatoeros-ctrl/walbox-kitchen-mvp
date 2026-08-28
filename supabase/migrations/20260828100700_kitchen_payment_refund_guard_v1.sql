-- Kitchen Payment Hub V1 — Fix T19: double refund not blocked (P1 finding).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source finding: ai-ops/reports/kitchen-payment-hub-v1-fase4-dynamic-verification-result.md (T19).
--
-- Mirrors the existing charge-side guard (kitchen_payments_one_succeeded_charge_per_order): at most
-- one succeeded refund per order, DB-level, so a second kitchen_payment_refund() call (or a
-- concurrent double-click/race bypassing the RPC-level guard added in
-- 20260828100500_kitchen_payment_rpc_refund_v1.sql) cannot insert a second succeeded refund row.

CREATE UNIQUE INDEX IF NOT EXISTS kitchen_payments_one_succeeded_refund_per_order
  ON public.kitchen_payments (order_id)
  WHERE direction = 'refund' AND status = 'succeeded';
