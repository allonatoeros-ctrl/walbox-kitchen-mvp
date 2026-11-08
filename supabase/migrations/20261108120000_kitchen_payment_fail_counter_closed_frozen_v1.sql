-- kitchen_payment_fail_counter_closed_frozen_v1 — K1 (2026-11-08).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. L'apply su Production richiede il gate esplicito di Eros
-- (solo `npx supabase db push --linked`).
--
-- Difetto K1 (ai-ops/reports/KITCHEN_K1_PASSO1.md, test tests/db/kitchen-payments/p5a, p5b, p1c):
-- un webhook/reconcile SumUp FAILED/EXPIRED/CANCELLED su un attempt gia' chiuso per il banco
-- (`failed` + `customer_switched_to_counter` o `staff_closed_for_counter`) chiamava
-- kitchen_payment_fail come service_role e SOVRASCRIVEVA il motivo (es. -> `sumup_failed`).
-- Effetto: l'attempt tornava ritentabile/confermabile e kitchen_payment_record_counter rifiutava
-- l'incasso al banco con `online_payment_in_progress` (M/20260913120000:59-68).
--
-- Correzione: un attempt `failed` con uno di questi due motivi e' una chiusura decisa (dal cliente o
-- dallo staff) per passare al banco: kitchen_payment_fail la restituisce invariata (nessun UPDATE,
-- nessun log; la notifica SumUp resta in kitchen_payment_webhook_ingest).
-- Tutto il resto e' identico a 20260830101227: stessi stati ammessi, stessa autorizzazione (lo staff
-- su un attempt `failed` riceve ancora `not_authorized`), stesso trattamento di `sumup_failed`
-- (ritentabile sullo stesso checkout) e di `abandoned_timeout`. Grant invariati.
-- Nessuna altra funzione toccata; nessuna modifica a tabelle, colonne, RLS o api/.

CREATE OR REPLACE FUNCTION public.kitchen_payment_fail(
  p_attempt_id uuid,
  p_reason text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment    public.kitchen_payments;
  v_actor_type text;
  v_was_failed boolean;
  v_old_reason text;
BEGIN
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  -- 'failed' is now accepted alongside 'initiated'/'pending' (was rejected before this migration):
  -- the same-checkout retry window means a previously-failed attempt can be re-verified again and
  -- found still not-PAID (e.g. the sweep re-checking a 'sumup_failed' attempt that is still FAILED,
  -- or now genuinely EXPIRED/CANCELLED) — that must not error. 'succeeded' (never downgrade) and
  -- 'cancelled' (never resurrect into a fail/refail cycle) stay rejected exactly as before.
  IF v_payment.status NOT IN ('initiated', 'pending', 'failed') THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  -- Authorization is status-dependent: re-verifying an already-'failed' attempt must be driven
  -- exclusively by the authoritative SumUp re-check (webhook/reconcile/sweep, service_role) — a
  -- staff-triggered fail on a 'failed' attempt would let a human race the same-checkout retry
  -- window instead of the fresh provider check deciding it. 'initiated'/'pending' stay open to
  -- staff as before (e.g. cancelling a stuck attempt at the counter).
  IF auth.role() = 'service_role' THEN
    v_actor_type := 'system';
  ELSIF v_payment.status = 'failed' THEN
    RAISE EXCEPTION 'not_authorized';
  ELSIF is_staff_for_venue(v_payment.venue_id) THEN
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- K1: chiusura per il banco = stato terminale per questa funzione. Un FAILED/EXPIRED/CANCELLED
  -- tardivo di SumUp non la riapre e non ne cambia il motivo: riga restituita invariata.
  IF v_payment.status = 'failed'
     AND v_payment.failure_reason IN ('customer_switched_to_counter', 'staff_closed_for_counter')
  THEN
    RETURN v_payment;
  END IF;

  v_was_failed := (v_payment.status = 'failed');
  v_old_reason := v_payment.failure_reason;

  IF v_was_failed AND v_old_reason IS NOT DISTINCT FROM p_reason THEN
    -- Re-check landed on the exact same outcome as before: idempotent no-op, refresh
    -- raw_last_event/updated_at only, no duplicate kitchen_action_log entry (avoids log spam from a
    -- sweep repeatedly re-verifying a still-FAILED checkout).
    UPDATE public.kitchen_payments
    SET raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_payment;
    RETURN v_payment;
  END IF;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = p_reason, raw_last_event = p_raw_payload, updated_at = now()
  WHERE id = p_attempt_id
  RETURNING * INTO v_payment;

  -- kitchen_orders.payment_status/status are deliberately left untouched here (unchanged from
  -- before this migration): a failed/re-failed attempt must never advance or alter order state.

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_failed', v_actor_type,
    CASE WHEN v_actor_type = 'staff' THEN auth.uid() ELSE NULL END,
    p_reason,
    CASE WHEN v_was_failed THEN jsonb_build_object('recheck_reason_changed_from', v_old_reason) ELSE '{}'::jsonb END
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_fail(uuid, text, jsonb)
  TO authenticated, service_role;
