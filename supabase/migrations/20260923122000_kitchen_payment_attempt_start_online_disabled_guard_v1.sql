-- Kitchen Payment Hub V1 — BUG A fix, parte 3/3: kitchen_payment_attempt_start rifiuta un nuovo
-- attempt online se l'ordine ha online_payment_disabled=true.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Vedi 20260923120000 header per il resto del contesto
-- BUG A. Nessun `supabase db push`/`db query -f`/apply_migration in questo task.
--
-- CREATE OR REPLACE sopra la versione definita in 20260830101227 (quel file resta intatto per
-- istruzione — stesso pattern già usato da 20260830101227 sopra 20260828100900): solo l'aggiunta
-- del nuovo guard online_payment_disabled dentro il ramo p_channel = 'app', nessun'altra riga della
-- funzione cambiata. kitchen_payment_confirm e kitchen_payment_fail, definite nello stesso file di
-- origine, non sono toccate qui: restano quelle di 20260830101227.
--
-- Perché solo p_channel = 'app': online_payment_disabled esprime "il cliente non può più avviare un
-- pagamento online per questo ordine" — non "l'ordine non è più pagabile". Il canale 'counter' (uso
-- staff, es. un futuro SumUp POS al banco) deve restare libero: bloccarlo trasformerebbe la
-- protezione BUG A in un modo per impedire allo staff stesso di incassare, l'esatto opposto
-- dell'intento di "PASSA AL BANCO". Il flag non tocca in alcun modo kitchen_payment_record_counter
-- (contante/POS manuale), che resta l'unico percorso di incasso pensato per questo stato.
--
-- Dove mettere il guard: dentro il ramo p_channel = 'app', DOPO il check not_order_owner esistente
-- (un tentativo da un device che non è il proprietario dell'ordine deve continuare a fallire con
-- not_order_owner, non rivelare online_payment_disabled) e prima dell'assegnazione di v_actor_type
-- — quindi anche prima del guard amount_mismatch e del guard duplicate-checkout, così un ordine
-- dirottato al banco non lascia nemmeno leggere lo stato degli attempt esistenti a un nuovo
-- tentativo online. Tutte le altre guardie esistenti (order_not_found, order_cancelled,
-- order_already_paid, not_order_owner, not_staff_for_venue, invalid_channel, amount_mismatch,
-- duplicate/same-checkout-retry guard) restano invariate, stesso ordine, stesso comportamento.

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
