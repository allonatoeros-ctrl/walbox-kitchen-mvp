-- Kitchen Payment Hub V1 — SumUp Online — Duplicate Live Checkout Guard (P0).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. See 20260828100000_kitchen_payments_v1.sql header.
-- Source: ai-ops/reports/sumup-duplicate-checkout-p0-fase1-fix-design.md (Layer 2 — CONCURRENCY_GUARD),
-- Gate 2 approvato parzialmente da Eros (design 2-layer + TTL 20s), apply remoto NON approvato.
--
-- Problem: api/kitchen-sumup-create-checkout.js could create a brand-new SumUp checkout on every
-- invocation for the same 'initiated' payment_attempt_id (abandon+retry, back-button, double-click,
-- two tabs) — the existing kitchen_payment_attempt_start guard (20260830130000) only dedups the
-- kitchen_payments ROW per order, it never stops the SAME row from getting a second live SumUp
-- checkout. Two live checkouts sharing one checkout_reference (=attempt.id) can both turn PAID,
-- capturing money twice at the acquirer while Walbox silently absorbs the second webhook as
-- already-resolved (kitchen-sumup-webhook.js:91).
--
-- Fix: an application-level "read provider_ref, then decide" check alone is racy — two concurrent
-- calls for the same attempt can both observe provider_ref IS NULL before either writes it. This RPC
-- makes the "I am the one creating a checkout for this attempt" decision atomic via a single
-- conditional UPDATE (row-level lock implicit in the UPDATE itself), not a session-held FOR UPDATE
-- lock — the SumUp POST /v0.1/checkouts call happens in Node, outside any Postgres transaction, so a
-- lock cannot be held open across it from a stateless serverless function on a pooled connection.
--
-- checkout_claim_at TTL (20s, approved by Eros): safety net for a crashed/timed-out request between
-- claim and the provider_ref write (api/kitchen-sumup-create-checkout.js still calls the existing
-- kitchen_payment_attempt_set_provider_ref RPC afterwards, unchanged) — without it, a single failed
-- request would permanently lock the attempt out of ever getting a checkout. Losing the race (0 rows
-- claimed) is a normal, expected outcome here, not an error: the caller is expected to follow the
-- "provider_ref already present -> re-check via GET, never re-create" path instead, so this RPC
-- never RAISEs for that case, only for auth/not-found — same posture as
-- kitchen_payment_attempt_set_provider_ref's own "already resolved -> silent no-op" branch.

ALTER TABLE public.kitchen_payments
  ADD COLUMN IF NOT EXISTS checkout_claim_at timestamptz;

CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_claim_checkout(
  p_attempt_id uuid
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

  -- Atomic claim: only a row that is still 'initiated', a charge, and has no checkout yet
  -- (provider_ref IS NULL) can be claimed — and only if no OTHER claim is currently live
  -- (checkout_claim_at NULL or older than the 20s TTL). Exactly one concurrent caller can match
  -- this UPDATE for a given attempt id; every other concurrent caller updates 0 rows.
  UPDATE public.kitchen_payments
  SET checkout_claim_at = now()
  WHERE id = p_attempt_id
    AND status = 'initiated'
    AND direction = 'charge'
    AND provider_ref IS NULL
    AND (checkout_claim_at IS NULL OR checkout_claim_at < now() - interval '20 seconds')
  RETURNING * INTO v_payment;

  -- 0 rows matched -> v_payment is NULL (every field), FOUND is false. Not an error: the caller
  -- (create-checkout.js) treats a NULL/absent return as "someone else already owns this attempt's
  -- checkout creation, or it already has a provider_ref" and must not call SumUp itself.
  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_claim_checkout(uuid)
  TO service_role;
