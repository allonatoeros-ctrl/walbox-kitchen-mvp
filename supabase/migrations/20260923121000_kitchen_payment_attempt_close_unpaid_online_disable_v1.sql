-- Kitchen Payment Hub V1 — BUG A fix, parte 2/3: kitchen_payment_attempt_close_unpaid ora marca
-- l'ordine online_payment_disabled=true quando lo staff esegue "PASSA AL BANCO".
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Vedi 20260923120000 header per il resto del contesto
-- BUG A. Nessun `supabase db push`/`db query -f`/apply_migration in questo task.
--
-- CREATE OR REPLACE sopra la versione definita in 20260923100000 (quel file resta intatto per
-- istruzione — stesso pattern già usato da 20260830101227 sopra 20260828100900): solo l'aggiunta
-- della UPDATE su kitchen_orders, nessun'altra riga della funzione cambiata.
--
-- Dove mettere la UPDATE: subito dopo il guard 'succeeded' (che RAISE-a, quindi non la raggiunge
-- mai — mai disabilitare l'online su un ordine il cui checkout ha appena vinto la race ed è
-- realmente pagato) e PRIMA dei tre rami 'cancelled' / 'failed non-retry' / conversione. Questo fa
-- sì che la UPDATE giri per ognuno dei tre esiti non-eccezione della funzione (idempotente su
-- 'cancelled', idempotente su un 'failed' già terminale, e sulla conversione vera e propria) — in
-- tutti e tre i casi lo staff ha comunque eseguito l'azione esplicita "PASSA AL BANCO" attraverso
-- l'endpoint dedicato (api/kitchen-staff-sumup-close-for-counter.js), che chiama questa RPC SOLO
-- quando esiste un attempt eleggibile da chiudere — mai a vuoto. Se la funzione invece RAISE-a più
-- sotto (invalid_attempt_status, difesa in profondità) l'intera chiamata/transazione va in rollback
-- e questa UPDATE non sopravvive: nessuna scrittura orfana su un caso di errore.
--
-- `WHERE ... AND online_payment_disabled = false` rende la scrittura un vero no-op quando il flag è
-- già true (doppio click, retry client, o un secondo "PASSA AL BANCO" su un attempt successivo dello
-- stesso ordine): stesso spirito idempotente del resto della funzione, nessuna riga toccata se non
-- c'è nulla da cambiare.
--
-- status ordine deliberatamente invariato (come già oggi): questa funzione continua a non toccare
-- kitchen_orders.status/payment_status — l'ordine resta pending_counter_payment, pronto per
-- kitchen_payment_record_counter esattamente come prima di questa migration.

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
    -- resolveAsPaidAndStop in kitchen-cancel-with-payment-check.js). Nessuna scrittura su
    -- kitchen_orders.online_payment_disabled in questo ramo: l'ordine è stato pagato online, non
    -- va dirottato al banco.
    RAISE EXCEPTION 'payment_attempt_already_succeeded';
  END IF;

  -- BUG A fix: da qui in poi la funzione esegue davvero l'azione esplicita "PASSA AL BANCO" dello
  -- staff (chiamata solo dall'endpoint dedicato quando esiste un attempt eleggibile) — su
  -- CIASCUNO dei tre esiti restanti (cancelled no-op, failed-non-retry no-op, conversione)
  -- l'ordine deve risultare online_payment_disabled=true: il cliente non deve più poter avviare un
  -- nuovo checkout online per questo ordine, indipendentemente da quale ramo l'attempt attraversa.
  UPDATE public.kitchen_orders
  SET online_payment_disabled = true
  WHERE id = v_payment.order_id AND online_payment_disabled = false;

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

  -- kitchen_orders.status/payment_status deliberatamente non toccati: l'ordine resta come già era
  -- (pending_counter_payment nel caso normale), pronto per kitchen_payment_record_counter.
  -- online_payment_disabled è già stato impostato sopra, prima di questo ramo.

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
