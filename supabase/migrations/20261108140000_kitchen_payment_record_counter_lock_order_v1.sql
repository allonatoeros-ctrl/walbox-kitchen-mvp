-- kitchen_payment_record_counter_lock_order_v1 — K4 (Passo 3, 2026-11-08).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. L'apply su Production richiede il gate esplicito di Eros
-- (solo `npx supabase db push --linked`). Va rilasciata INSIEME a K1 (20261108120000) e K2 (20261108130000).
--
-- Difetto K4 (ai-ops/reports/KITCHEN_K2_PASSO2.md, test tests/db/kitchen-payments/p7_concorrenza.sh 7b3 e
-- p7c_k2_concorrenza.sh 7c1): deadlock tra "INCASSA al banco" e il PAID SumUp sullo stesso ordine.
-- Convenzione dei lock del progetto: prima le righe charge dell'ordine (ORDER BY id FOR UPDATE), poi la riga
-- ordine. La rispettano kitchen_payment_confirm, kitchen_payment_attempt_close_unpaid,
-- kitchen_order_cancel_with_payment_attempt, kitchen_order_switch_to_counter_system e
-- kitchen_order_mark_payment_abandoned. kitchen_payment_record_counter era l'unica al contrario: prendeva la riga
-- ordine e poi, nell'INSERT del charge `succeeded`, aspettava sull'indice unico
-- kitchen_payments_one_succeeded_charge_per_order la transazione di un confirm che aveva gia' portato l'attempt a
-- `succeeded` e stava aspettando proprio quella riga ordine -> deadlock, una delle due chiamate annullata.
--
-- Correzione, solo kitchen_payment_record_counter (corpo copiato ESATTO da 20260913120000, grant inclusi):
--  a. lettura SENZA lock del venue_id dell'ordine e controllo staff PRIMA di qualsiasi lock (stessi messaggi
--     order_not_found / not_staff_for_venue): un utente non staff non resta piu' in coda dietro i lock.
--  b. lock delle righe charge dell'ordine `ORDER BY id FOR UPDATE`, come le altre funzioni.
--  c. poi il corpo esistente invariato: SELECT ordine FOR UPDATE con i suoi controlli, che restano la verifica
--     definitiva sotto lock (stessi rami, stessi log, stesso INSERT).
-- Variante scartata: invertire confirm (ordine -> attempt). Creerebbe il deadlock opposto con close_unpaid, cancel,
-- switch e abandon, che prendono gia' attempt -> ordine.
-- Nessuna altra funzione toccata; nessuna modifica a tabelle, colonne, indici, RLS o api/.

CREATE OR REPLACE FUNCTION public.kitchen_payment_record_counter(
  p_order_id text,
  p_method text
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.kitchen_orders;
  v_existing public.kitchen_payments;
  v_payment public.kitchen_payments;
  v_provider text;
  v_venue_id public.kitchen_orders.venue_id%TYPE;
BEGIN
  IF p_method NOT IN ('cash', 'card_counter_manual') THEN
    RAISE EXCEPTION 'invalid_counter_payment_method';
  END IF;

  -- K4 a. controllo staff senza lock: chi non e' staff esce subito, senza mettersi in coda sui lock.
  SELECT venue_id INTO v_venue_id FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT is_staff_for_venue(v_venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'; END IF;

  -- K4 b. convenzione dei lock: prima le righe charge dell'ordine, poi la riga ordine (come confirm,
  -- close_unpaid, cancel_with_payment_attempt, switch_to_counter_system, mark_payment_abandoned).
  PERFORM 1 FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge'
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT is_staff_for_venue(v_order.venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'; END IF;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'order_cancelled'; END IF;

  SELECT * INTO v_existing
  FROM public.kitchen_payments
  WHERE order_id = v_order.id AND direction = 'charge' AND status = 'succeeded'
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing; -- idempotent result for double click / concurrent staff tab
  END IF;

  -- F03 fix: block on any SumUp/online charge attempt that is still live or still retry-eligible
  -- on the same checkout — identical predicate to kitchen_payment_attempt_start (20260830101227),
  -- read here under the same kitchen_orders row lock taken above (K4: dopo i lock sulle righe charge),
  -- so a concurrent attempt_start/
  -- record_counter call for this order_id always serializes against this check (see design doc,
  -- CONCURRENCY_STRATEGY). Unlike the succeeded-branch above, this is NOT idempotent: the order is
  -- not yet paid, so silently returning success would be wrong — the caller must see a distinct
  -- error and decide (retry later, or resolve the stuck attempt via kitchen_payment_fail).
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = v_order.id
      AND direction = 'charge'
      AND (
        status IN ('initiated', 'pending')
        OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
      )
  ) THEN
    RAISE EXCEPTION 'online_payment_in_progress';
  END IF;

  v_provider := CASE WHEN p_method = 'cash' THEN 'cash' ELSE 'manual' END;
  INSERT INTO public.kitchen_payments (
    order_id, venue_id, channel, provider, method, direction, status, amount,
    initiated_by_actor_type, initiated_by_actor_id
  ) VALUES (
    v_order.id, v_order.venue_id, 'counter', v_provider, p_method, 'charge', 'succeeded', v_order.total,
    'staff', auth.uid()
  )
  RETURNING * INTO v_payment;

  UPDATE public.kitchen_orders
  SET payment_status = 'paid', payment_method = p_method, paid_at = now(),
      status = CASE WHEN status = 'pending_counter_payment' THEN 'received' ELSE status END
  WHERE id = v_order.id;

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    v_order.id, v_order.venue_id, 'payment_confirmed', 'staff', auth.uid(),
    jsonb_build_object(
      'payment_id', v_payment.id,
      'method', p_method,
      'source', 'staff_confirmed_counter',
      'amount_derived_server_side', true
    )
  );

  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_payment_record_counter(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_record_counter(text, text) TO authenticated;
