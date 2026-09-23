-- Kitchen Payment Hub V1 — "Passa al pagamento al banco" per un checkout SumUp non concluso.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Nessun `supabase db push`/`db query -f`/apply_migration
-- in questo task. Apply remoto resta una decisione separata di Eros (vedi §5.1 SECURITY_POLICY.md).
--
-- Problem this fixes (audit ai-ops/reports/sumup-abandoned-checkout-audit.md, MINIMUM_FIX): se il
-- cliente abbandona un checkout SumUp online senza tornare sull'app e senza che webhook/sweep lo
-- risolvano, l'attempt resta 'initiated'/'pending' e kitchen_payment_record_counter (F03,
-- 20260913120000) blocca qualunque incasso cash/POS sullo stesso ordine finché quell'attempt non è
-- chiuso. L'unico meccanismo esistente che chiude davvero il checkout su SumUp
-- (kitchen_order_cancel_with_payment_attempt, 20260921100000) cancella l'intero ORDINE — non c'è un
-- modo per liberare solo l'attempt e tenere l'ordine vivo per un pagamento al banco.
--
-- kitchen_payment_attempt_close_unpaid(p_attempt_id, p_note): nuova RPC, stesso pattern di
-- kitchen_payment_fail (20260830101227) ma dedicata a questo flow esplicito staff. Chiude un
-- attempt 'initiated'/'pending', OPPURE un attempt già 'failed' ma ancora nella stessa-checkout
-- retry window di F03 (provider='sumup' AND failure_reason='sumup_failed' — carta rifiutata ma
-- checkout SumUp ancora tecnicamente riattivabile per un nuovo tentativo, 20260913120000/
-- 20260830101227): in questo caso lo staff conferma esplicitamente che il cliente vuole pagare al
-- banco invece di ritentare la carta, e l'attempt va comunque chiuso per liberare la cassa.
-- Qualunque altro 'failed' già terminale e non-bloccante (già 'staff_closed_for_counter', o
-- 'sumup_expired'/'sumup_cancelled'/'sumup_amount_mismatch' — nessuno dei quali è retry-eligible)
-- resta dominio esclusivo della ri-verifica autoritativa SumUp via
-- kitchen_payment_fail/applySumupCheckoutResult: qui è un no-op idempotente. In entrambi i casi
-- gestiti, marca l'attempt 'failed' con un failure_reason FISSO e non-riutilizzabile
-- ('staff_closed_for_counter') deciso dentro la funzione, mai passato dal chiamante:
--   - NON è 'sumup_failed' -> kitchen_payment_record_counter (F03) non lo considera più "online
--     payment in progress": il banco può incassare subito dopo questa chiamata, stesso ordine.
--   - NON è 'sumup_failed' -> kitchen_payment_confirm (20260830101227/20260913120000) non lo
--     considera più same-checkout-retry-eligible: un webhook/reconcile tardivo su questo stesso
--     attempt_id non può più "resuscitarlo" in succeeded.
-- kitchen_orders NON viene mai toccata da questa funzione (stesso principio di kitchen_payment_fail):
-- l'ordine resta in payment_status='pending_counter_payment', pronto per
-- kitchen_payment_record_counter esattamente come oggi per un ordine mai passato da SumUp.
--
-- Idempotenza/race handling (stesso registro di kitchen_order_cancel_with_payment_attempt e
-- kitchen_payment_confirm):
--   - già 'succeeded' -> RAISE payment_attempt_already_succeeded: un webhook/reconcile ha vinto la
--     race prima di questa chiamata, il chiamante deve fermarsi e riconciliare, mai forzare un
--     secondo incasso sopra un pagamento online già riuscito.
--   - già 'cancelled' -> no-op idempotente, ritorna la riga così com'è.
--   - già 'failed' con provider/failure_reason DIVERSI da sumup/sumup_failed (già
--     'staff_closed_for_counter', o 'sumup_expired'/'sumup_cancelled'/'sumup_amount_mismatch') ->
--     no-op idempotente: già terminale e non bloccante, nessuna riscrittura.
--   - 'initiated'/'pending', OPPURE 'failed' con provider='sumup' AND failure_reason='sumup_failed'
--     -> procede alla chiusura/conversione in 'staff_closed_for_counter' (doppio click o retry
--     client sullo stesso stato restano comunque idempotenti grazie all'UPDATE senza condizioni
--     aggiuntive su questi due path).
--   - qualunque altro stato -> invalid_attempt_status (difesa in profondità, non dovrebbe accadere
--     dato il filtro a monte nell'endpoint).
-- Lock riga FOR UPDATE sull'attempt prima di leggerne lo stato, stesso ordine di lock di
-- kitchen_payment_fail/kitchen_payment_confirm.
--
-- Staff-callable (is_staff_for_venue sul venue_id dell'attempt), non service_role-only: è un'azione
-- esplicita del banco ("il cliente vuole pagare qui"), non una risoluzione automatica webhook/sweep.

CREATE OR REPLACE FUNCTION public.kitchen_payment_attempt_close_unpaid(
  p_attempt_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payment  public.kitchen_payments;
  v_old_status text;
  v_old_reason text;
BEGIN
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_attempt_not_found';
  END IF;

  IF v_payment.direction <> 'charge' THEN
    RAISE EXCEPTION 'not_a_charge_attempt';
  END IF;

  IF NOT is_staff_for_venue(v_payment.venue_id) THEN
    RAISE EXCEPTION 'not_staff_for_venue';
  END IF;

  IF v_payment.status = 'succeeded' THEN
    -- Race: il checkout è stato confermato PAID (webhook/reconcile) tra la verifica SumUp fatta
    -- dal chiamante e questo lock. Mai forzare un secondo incasso sopra un pagamento online che ha
    -- realmente vinto: il chiamante deve fermarsi e riconciliare (stessa postura di
    -- resolveAsPaidAndStop in kitchen-cancel-with-payment-check.js).
    RAISE EXCEPTION 'payment_attempt_already_succeeded';
  END IF;

  IF v_payment.status = 'cancelled' THEN
    RETURN v_payment; -- idempotente: già chiuso (doppio click, retry, o risolto da un'altra strada)
  END IF;

  -- Estensione F03 same-checkout retry window: un attempt 'failed' con provider='sumup' AND
  -- failure_reason='sumup_failed' e' esattamente la stessa finestra di retry gia' gestita da
  -- kitchen_payment_confirm (20260830101227/20260913120000) — SumUp ha detto "carta rifiutata" ma
  -- il checkout resta tecnicamente riattivabile. Se lo staff sceglie qui "PASSA AL BANCO", va
  -- convertito in 'staff_closed_for_counter' esattamente come un attempt ancora 'initiated'/
  -- 'pending', altrimenti resterebbe per sempre retry-eligible e F03 bloccherebbe il banco.
  -- Qualunque altro 'failed' (gia' 'staff_closed_for_counter', o 'sumup_expired'/'sumup_cancelled'/
  -- 'sumup_amount_mismatch' — nessuno dei quali e' retry-eligible in F03/kitchen_payment_confirm)
  -- e' gia' terminale e non bloccante: no-op idempotente, nessuna riscrittura.
  IF v_payment.status = 'failed'
     AND NOT (v_payment.provider = 'sumup' AND v_payment.failure_reason = 'sumup_failed')
  THEN
    RETURN v_payment;
  END IF;

  IF v_payment.status NOT IN ('initiated', 'pending', 'failed') THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  v_old_status := v_payment.status;
  v_old_reason := v_payment.failure_reason;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = 'staff_closed_for_counter', updated_at = now()
  WHERE id = p_attempt_id
  RETURNING * INTO v_payment;

  -- kitchen_orders deliberatamente non toccata: l'ordine resta come già era
  -- (pending_counter_payment nel caso normale), pronto per kitchen_payment_record_counter.

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, metadata)
  VALUES (
    v_payment.order_id, v_payment.venue_id, 'payment_attempt_closed_for_counter', 'staff', auth.uid(),
    jsonb_build_object(
      'payment_id', v_payment.id,
      'previous_status', v_old_status,
      'previous_failure_reason', v_old_reason,
      'note', p_note
    )
  );

  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_payment_attempt_close_unpaid(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_close_unpaid(uuid, text) TO authenticated;
