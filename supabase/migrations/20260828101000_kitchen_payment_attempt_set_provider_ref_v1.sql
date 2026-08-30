-- Kitchen Payment Hub V1 — SumUp Online Payment Reliability Hardening — FASE 2 (Reconciliation Core).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source: ai-ops/reports/sumup-payment-reliability-contract-v1-audit.md, P0-1/P0-3 (no fallback /
-- no reconciliation for "SumUp paid, Walbox never told").
--
-- Reconciliation needs a reliable provider_ref (SumUp checkout id) for an attempt BEFORE the
-- webhook ever fires — today provider_ref is only written by kitchen_payment_confirm, i.e. after
-- the outcome is already known, which is useless for recovering a lost webhook. This RPC lets the
-- create-checkout endpoint persist the SumUp checkout id onto the attempt right after SumUp returns
-- it, so a later reconciliation call has a deterministic id to GET instead of guessing.
--
-- service_role only (called from api/kitchen-sumup-create-checkout.js with the service role key,
-- same trust boundary as kitchen_payment_confirm/fail/webhook_ingest). Never overwrites a
-- provider_ref once the attempt has left initiated/pending (kitchen_payment_confirm owns the final
-- provider_ref for a succeeded charge) — this RPC only tracks the checkout id while the outcome is
-- still open, and is a silent no-op past that point rather than an error, since a create-checkout
-- retry racing a webhook that just resolved the attempt is a normal, harmless timing case.

CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_set_provider_ref(
  p_attempt_id uuid,
  p_provider_ref text
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment public.kitchen_payments;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  IF v_payment.status NOT IN ('initiated', 'pending') THEN
    -- Already resolved (confirm/fail already ran) — never overwrite a settled attempt's
    -- provider_ref, and never error: this is a harmless race, not a caller mistake.
    RETURN v_payment;
  END IF;

  UPDATE public.kitchen_payments
  SET provider_ref = p_provider_ref, updated_at = now()
  WHERE id = p_attempt_id
  RETURNING * INTO v_payment;

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_set_provider_ref(uuid, text)
  TO service_role;
