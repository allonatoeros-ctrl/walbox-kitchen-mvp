-- Kitchen S0.5 F1 — Amount Integrity: un attempt/checkout SumUp non puo avere un importo diverso
-- dal totale autorevole dell'ordine (kitchen_orders.total).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO ANY DATABASE. Nessun `supabase db push`/migration up/--linked/
-- apply_migration finche Eros non da un gate di apply dedicato (SECURITY_POLICY §5.1).
--
-- Fonte: ai-ops/reports/kitchen-s0-5-f1-amount-integrity-audit.md (Opzione A + guard D, Gate 1
-- approvato). Solo CREATE OR REPLACE, nessun ALTER/DROP/colonna/RLS/nuovo stato. Ogni funzione e la
-- copia del corpo live piu recente con UNA sola aggiunta:
--
--   1. kitchen_promo_pass_redeem_for_order (base 20260910130000): se esiste un charge attempt live /
--      retry-eligible per l'ordine -> RAISE 'payment_in_progress' (promo e total invariati).
--      Il retry idempotente (stesso codice gia applicato) resta prima del guard.
--   2. kitchen_payment_attempt_start (base 20260923122000): riuso di v_existing solo se
--      v_existing.amount = v_order.total, altrimenti RAISE 'amount_mismatch_live_attempt'.
--   3. kitchen_payment_confirm (base 20260921100000): se v_payment.amount <> kitchen_orders.total
--      il charge resta 'succeeded' ma l'ordine NON viene promosso a paid; log
--      'payment_confirmed_amount_mismatch' con needs_manual_reconciliation=true.
--
-- Fuori scope (gate separato): UPDATE staff su kitchen_orders.total (RLS).

CREATE OR REPLACE FUNCTION public.kitchen_promo_pass_redeem_for_order(
  p_code     text,
  p_order_id text
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order       public.kitchen_orders;
  v_promo       public.kitchen_promo_passes;
  v_code        text := upper(btrim(coalesce(p_code, '')));
  v_unit_price  numeric;
  v_discount    numeric;
BEGIN
  IF v_code = '' THEN
    RAISE EXCEPTION 'invalid_promo_code';
  END IF;
  IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
    RAISE EXCEPTION 'invalid_order';
  END IF;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;
  IF NOT (is_staff_for_venue(v_order.venue_id) OR v_order.customer_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized_for_order';
  END IF;

  -- Retry idempotente: stesso codice già applicato a questo stesso ordine (doppio tap cliente /
  -- retry di rete) → ritorna l'ordine invariato invece di sbagliare o scontare due volte.
  IF v_order.promo_code = v_code THEN
    RETURN v_order;
  END IF;
  IF v_order.promo_code IS NOT NULL THEN
    RAISE EXCEPTION 'order_already_has_promo';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  -- S0.5 F1 (Amount Integrity, I2): il totale e congelato finche esiste un charge attempt live per
  -- questo ordine (solo ONLINE: channel='app' per initiated/pending; failed+sumup+sumup_failed retry-eligible). Cambiare
  -- total sotto un attempt/checkout SumUp gia creato lo lascerebbe con l'importo vecchio (sovra-
  -- addebito). Posizionato DOPO il retry idempotente (stesso codice gia applicato resta un no-op)
  -- e prima di qualsiasi scrittura su promo/ordine. Nessun PATCH SumUp, nessuna riattivazione.
  IF EXISTS (
    SELECT 1
    FROM public.kitchen_payments p
    WHERE p.order_id = v_order.id
      AND p.direction = 'charge'
      AND (
        (p.status IN ('initiated', 'pending') AND p.channel = 'app')
        OR (p.status = 'failed' AND p.provider = 'sumup' AND p.failure_reason = 'sumup_failed')
      )
  ) THEN
    RAISE EXCEPTION 'payment_in_progress';
  END IF;

  SELECT * INTO v_promo
  FROM public.kitchen_promo_passes
  WHERE code = v_code
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_code_not_found';
  END IF;
  IF v_promo.status = 'redeemed' THEN
    RAISE EXCEPTION 'promo_already_redeemed';
  END IF;
  IF v_promo.venue_id <> v_order.venue_id THEN
    RAISE EXCEPTION 'promo_venue_mismatch';
  END IF;

  -- Scelta automatica server-side del Peso Massimo meno costoso presente nell'ordine. Allowlist
  -- hardcoded qui (non dal client): unico punto da aggiornare se in futuro cambiano i Pesi Massimi
  -- ordinabili.
  SELECT oi.price INTO v_unit_price
  FROM public.kitchen_order_items oi
  WHERE oi.order_id = v_order.id
    AND oi.item_id = ANY (ARRAY['item-009', 'item-010', 'item-011', 'item-040', 'item-041', 'item-042'])
  ORDER BY oi.price ASC
  LIMIT 1;

  IF v_unit_price IS NULL THEN
    RAISE EXCEPTION 'promo_no_eligible_item';
  END IF;

  v_discount := round(v_unit_price * 0.10, 2);

  UPDATE public.kitchen_orders
  SET discount_amount = v_discount,
      promo_code = v_code,
      total = total - v_discount
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  -- Guardia atomica anti-doppio-uso: WHERE status='issued' garantisce che, in caso di due
  -- chiamate concorrenti sullo stesso codice, solo una aggiorni la riga. L'altra rientra qui con
  -- FOUND=false e l'intera transazione (incluso lo sconto sopra) viene annullata dall'eccezione.
  UPDATE public.kitchen_promo_passes
  SET status = 'redeemed', redeemed_at = now(), redeemed_by = auth.uid()
  WHERE code = v_promo.code AND status = 'issued';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promo_already_redeemed';
  END IF;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_promo_pass_redeem_for_order(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_start(
  p_order_id text,
  p_channel text,
  p_provider text,
  p_method text,
  p_amount numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order    public.kitchen_orders;
  v_existing public.kitchen_payments;
  v_payment  public.kitchen_payments;
  v_actor_type text;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order_cancelled';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order_already_paid';
  END IF;

  IF p_channel = 'app' THEN
    IF v_order.customer_id IS NULL OR v_order.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'not_order_owner';
    END IF;
    -- BUG A fix: lo staff ha già chiuso il checkout online per questo ordine (PASSA AL BANCO,
    -- kitchen_payment_attempt_close_unpaid) — nessun nuovo attempt online, a prescindere da
    -- provider/method/idempotency_key o da cosa mostra ancora localStorage sul device cliente.
    IF v_order.online_payment_disabled THEN
      RAISE EXCEPTION 'online_payment_disabled';
    END IF;
    v_actor_type := 'customer';
  ELSIF p_channel = 'counter' THEN
    IF NOT is_staff_for_venue(v_order.venue_id) THEN
      RAISE EXCEPTION 'not_staff_for_venue';
    END IF;
    v_actor_type := 'staff';
  ELSE
    RAISE EXCEPTION 'invalid_channel';
  END IF;

  IF p_amount <> v_order.total THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  -- Duplicate checkout guard (P1-1, unchanged): any live charge attempt for this order blocks a new
  -- one, independent of idempotency_key.
  -- Same-checkout retry guard (LONG SESSION F, unchanged): a 'failed' SumUp attempt whose checkout
  -- can still turn PAID (failure_reason = 'sumup_failed') ALSO blocks a new attempt — of ANY
  -- provider/channel, not just another SumUp one, because the old checkout could still capture money
  -- underneath a second, independent payment. This is why the guard below is not scoped to
  -- p_provider/p_method: it protects the order, not just the same payment method. Attempts failed
  -- for any other reason ('sumup_expired', 'sumup_cancelled', 'sumup_amount_mismatch') are NOT live
  -- here on purpose — those are genuinely terminal on SumUp's side (or a Walbox-side data mismatch
  -- that can never resolve to PAID), so they never block a fresh retry. No timeout/TTL-based bypass
  -- either way: the guard clears itself only when a later authoritative SumUp check changes
  -- failure_reason away from 'sumup_failed' (see kitchen_payment_fail in this same migration).
  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = p_order_id
    AND direction = 'charge'
    AND (
      status IN ('initiated', 'pending')
      OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
    )
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- S0.5 F1 (Amount Integrity, I1): un attempt live e uno snapshot dell'importo; se non coincide
    -- piu con kitchen_orders.total (letto sotto lock FOR UPDATE sopra) NON va riusato, altrimenti il
    -- client riprenderebbe/creerebbe un checkout con l'importo vecchio. Fail closed: lo staff
    -- risolve con PASSA AL BANCO / cancel gia esistenti.
    IF v_existing.amount <> v_order.total THEN
      RAISE EXCEPTION 'amount_mismatch_live_attempt';
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    idempotency_key, initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    p_order_id, v_order.venue_id, p_channel, p_provider, p_method, 'charge', 'initiated', p_amount,
    p_idempotency_key, v_actor_type, auth.uid()
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    p_order_id, v_order.venue_id, 'payment_attempt_started', v_actor_type, auth.uid(),
    jsonb_build_object('payment_id', v_payment.id, 'provider', p_provider, 'method', p_method)
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.kitchen_payment_confirm(
  p_attempt_id uuid,
  p_provider_ref text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment      public.kitchen_payments;
  v_order_status text;
  v_order_total  numeric;
  v_old_status   text;
  v_old_reason   text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  IF v_payment.direction <> 'charge' THEN
    RAISE EXCEPTION 'not_a_charge_attempt';
  END IF;

  IF v_payment.status = 'succeeded' THEN
    RETURN v_payment; -- duplicate webhook delivery, already confirmed: idempotent no-op
  END IF;

  IF v_payment.status NOT IN ('initiated', 'pending')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'sumup_failed')
  THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  v_old_status := v_payment.status;
  v_old_reason := v_payment.failure_reason;

  BEGIN
    UPDATE public.kitchen_payments
    SET status = 'succeeded', provider_ref = p_provider_ref, failure_reason = NULL,
        raw_last_event = p_raw_payload, updated_at = now()
    WHERE id = p_attempt_id
    RETURNING * INTO v_payment;
  EXCEPTION WHEN unique_violation THEN
    -- Race with another attempt for the same order already marked succeeded first (e.g. a counter
    -- cash payment recorded while this SumUp checkout was still open — F03): treat as idempotent
    -- replay, return the one that actually won instead of erroring the webhook/reconcile caller.
    SELECT * INTO v_payment
    FROM public.kitchen_payments
    WHERE order_id = v_payment.order_id AND direction = 'charge' AND status = 'succeeded';

    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirm_lost_race', 'system',
      jsonb_build_object(
        'losing_attempt_id', p_attempt_id,
        'winning_payment_id', v_payment.id,
        'winning_channel', v_payment.channel,
        'winning_method', v_payment.method
      )
    );

    RETURN v_payment;
  END;

  -- Lock the order row before branching on its status so a concurrent staff status-change (or
  -- cancel, see kitchen_order_cancel_with_payment_attempt below) can't race between the SELECT and
  -- the conditional UPDATE below.
  SELECT status, total INTO v_order_status, v_order_total
  FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE;

  -- S0.5 F1 (Amount Integrity, I3): l'ordine diventa 'paid' solo se l'importo registrato sul charge
  -- (gia verificato = checkout.amount su SumUp dal chiamante) coincide con il totale autorevole
  -- dell'ordine. Altrimenti il charge resta 'succeeded' (denaro catturato, mai perso dal ledger) ma
  -- kitchen_orders NON viene toccato: niente 'paid' silenzioso. Stessa postura del ramo 'cancelled'
  -- sotto e di 'payment_confirm_lost_race': evidenza in kitchen_action_log, riconciliazione manuale.
  IF v_payment.amount IS DISTINCT FROM v_order_total THEN
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirmed_amount_mismatch', 'system',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_ref', p_provider_ref,
        'payment_amount', v_payment.amount,
        'order_total', v_order_total,
        'order_status', v_order_status,
        'needs_manual_reconciliation', true
      )
    );
    RETURN v_payment;
  END IF;

  IF v_order_status = 'pending_counter_payment' THEN
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now(), status = 'received'
    WHERE id = v_payment.order_id;
  ELSIF v_order_status = 'cancelled' THEN
    -- Payment Cancel Hardening: never create order.status='cancelled' + payment_status='paid'.
    -- SumUp genuinely captured the money on this checkout after the order was already cancelled
    -- (e.g. the cancel endpoint's best-effort DELETE lost the race, or the customer completed the
    -- hosted checkout page right after cancel). The charge above already settled to 'succeeded' —
    -- the money is never silently dropped from the ledger — but kitchen_orders is deliberately left
    -- untouched here: payment_status must never flip to 'paid' while status is 'cancelled'. Flagged
    -- in kitchen_action_log for staff to resolve explicitly (refund), same posture as the existing
    -- 'payment_confirm_lost_race' entry for a different confirm-time conflict above.
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirmed_after_cancel', 'system',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_ref', p_provider_ref,
        'needs_manual_reconciliation', true
      )
    );
    RETURN v_payment;
  ELSE
    -- Order already moved on (received/preparing/ready/delivered): only settle the payment fields,
    -- never touch status.
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now()
    WHERE id = v_payment.order_id;
  END IF;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_confirmed', 'system',
    jsonb_build_object(
      'payment_id', v_payment.id,
      'provider_ref', p_provider_ref,
      'order_status_before', v_order_status,
      'order_status_after', CASE WHEN v_order_status = 'pending_counter_payment' THEN 'received' ELSE v_order_status END,
      'promoted_from_status', v_old_status,
      'promoted_from_failure_reason', v_old_reason
    )
  );

  RETURN v_payment;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb)
  TO service_role;
