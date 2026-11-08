-- kitchen_payment_confirm_counter_closed_reconcile_v1 — K2 lato SQL (2026-11-08).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. L'apply su Production richiede il gate esplicito di Eros
-- (solo `npx supabase db push --linked`). Va rilasciata INSIEME a K1 (20261108120000).
--
-- Difetto K2 (ai-ops/reports/KITCHEN_K1_PASSO1.md §5-7, test tests/db/kitchen-payments/p1c, p6a, p6b):
-- un PAID SumUp reale su un attempt chiuso per il banco (`failed` + `customer_switched_to_counter` /
-- `staff_closed_for_counter`) o annullato (`cancelled`) veniva rifiutato con `invalid_attempt_status`:
-- incasso fuori dal ledger e senza traccia nel DB (resta solo in kitchen_payment_webhook_ingest).
--
-- Correzione (decisioni di Eros D1 e D4, 2026-11-08), solo kitchen_payment_confirm:
--  1. Confermabilita': un attempt SumUp `failed` con uno dei due motivi "passato al banco", o
--     `cancelled`, resta confermabile (stesso precedente di `abandoned_timeout`, S3 D4). Effetti, tutti
--     con i rami gia' esistenti:
--     - banco non ancora incassato (D1) -> l'ordine diventa pagato online; kitchen_payment_record_counter
--       trova il charge `succeeded` e lo restituisce invece di incassare di nuovo.
--     - banco gia' incassato (D4) -> unique_violation su kitchen_payments_one_succeeded_charge_per_order
--       -> log `payment_confirm_lost_race`. Il ledger resta con UN solo charge riuscito.
--     - ordine annullato -> ramo esistente `payment_confirmed_after_cancel` (flag gia' presente).
--  2. Segnalazione (D4): il log `payment_confirm_lost_race` riceve `double_charge: true` e
--     `needs_manual_reconciliation: true` piu' i riferimenti dei due incassi (id attempt, provider,
--     provider_ref = id checkout SumUp, importo, canale). Nessun payload grezzo, nessun dato di carta.
--     Affinamento (Passo 3B, 2026-11-08): `double_charge` e' true solo se entrambi gli incassi hanno una
--     prova (`provider_verified` = SumUp con id checkout reale, `staff_recorded` = banco contanti/POS
--     manuale) e non sono la stessa transazione. Campo `classification`: `double_charge`,
--     `duplicate_notification` (stesso provider_ref) o `unverified_collection` (prova insufficiente);
--     piu' `losing_evidence` / `winning_evidence`. needs_manual_reconciliation sempre true.
--     La segnalazione e' idempotente per attempt: un webhook ripetuto non crea un secondo log.
--  3. Robustezza: se nel ramo lost_race il charge vincente non si trova, la funzione solleva un errore
--     (rollback, il webhook risponde errore e SumUp ripete) invece di proseguire con una riga vuota.
-- Tutto il resto e' identico a 20261012100000 (stati initiated/pending, sumup_failed, abandoned_timeout,
-- controllo importo, rami POP/PCP/PA/annullato/oltre). Grant invariati.
-- Nessuna altra funzione toccata; nessuna modifica a tabelle, colonne, indici, RLS o api/.
-- Limite noto: il webhook (api/kitchen-sumup-webhook.js) scarta ancora gli attempt `cancelled` prima di
-- arrivare qui: K2 lato API e' il Passo 4.

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
  v_attempt      public.kitchen_payments; -- K2: attempt perdente, per i riferimenti del lost_race
  v_losing_ref   text; -- K2 affinamento: classificazione del lost_race
  v_winning_ref  text;
  v_losing_evidence  text;
  v_winning_evidence text;
  v_classification   text;
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

  -- S3 (D4): un attempt chiuso dallo sweep dei 5 minuti (`failed`/`abandoned_timeout`) resta
  -- confermabile, così un PAID SumUp residuo entra nel ledger invece di andare perso.
  IF v_payment.status NOT IN ('initiated', 'pending')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'sumup_failed')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'abandoned_timeout')
     -- K2 (D1/D4): un PAID SumUp reale su un attempt chiuso per il banco o annullato non va perso.
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup'
              AND v_payment.failure_reason IN ('customer_switched_to_counter', 'staff_closed_for_counter'))
     AND NOT (v_payment.status = 'cancelled' AND v_payment.provider = 'sumup')
  THEN
    RAISE EXCEPTION 'invalid_attempt_status';
  END IF;

  v_old_status := v_payment.status;
  v_old_reason := v_payment.failure_reason;
  v_attempt := v_payment;

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
    WHERE order_id = v_attempt.order_id AND direction = 'charge' AND status = 'succeeded';
    -- K2: mai un lost_race senza vincente (rollback: il chiamante riceve errore e SumUp ripete).
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_confirm_winner_not_found';
    END IF;

    -- K2 (D4): il PAID di questo attempt arriva quando l'ordine ha gia' un charge riuscito. Il ledger
    -- tiene un solo charge; qui restano i riferimenti di entrambi i soldi e una classificazione esplicita.
    -- Idempotente: una consegna ripetuta dello stesso PAID (stesso attempt) non duplica la segnalazione.
    -- Le consegne concorrenti dello stesso attempt sono serializzate dal FOR UPDATE sulla riga attempt.
    --
    -- K2 affinamento (Passo 3B): double_charge=true SOLO con due incassi economici distinti e provati.
    -- Due eventi o due attempt da soli non bastano.
    --  - perdente `provider_verified`: provider sumup + id checkout SumUp reale (non vuoto e diverso
    --    dall'id dell'attempt, che e' il fallback `checkout.id ?? attempt.id` del chiamante).
    --  - vincente `provider_verified`: sumup con provider_ref reale (stessa regola, sul suo id);
    --    `staff_recorded`: banco (channel counter) con contanti o POS manuale registrato dallo staff;
    --    qualsiasi altro caso (omaggio, manual_other, satispay senza prova) = `unverified`.
    --  - stesso provider_ref su vincente e perdente = stessa transazione SumUp notificata due volte:
    --    `duplicate_notification`, double_charge=false.
    --  - prova insufficiente da una delle due parti: `unverified_collection`, double_charge=false.
    -- needs_manual_reconciliation resta true in tutti i casi (nessuna decisione automatica sui soldi).
    v_losing_ref := NULLIF(btrim(p_provider_ref), '');
    v_winning_ref := NULLIF(btrim(v_payment.provider_ref), '');
    v_losing_evidence := CASE
      WHEN v_attempt.provider = 'sumup' AND v_losing_ref IS NOT NULL AND v_losing_ref <> p_attempt_id::text
        THEN 'provider_verified'
      ELSE 'unverified' END;
    v_winning_evidence := CASE
      WHEN v_payment.provider = 'sumup' AND v_winning_ref IS NOT NULL AND v_winning_ref <> v_payment.id::text
        THEN 'provider_verified'
      WHEN v_payment.channel = 'counter' AND v_payment.provider IN ('cash', 'manual')
           AND v_payment.method IN ('cash', 'card_counter_manual')
        THEN 'staff_recorded'
      ELSE 'unverified' END;
    v_classification := CASE
      WHEN v_losing_ref IS NOT NULL AND v_losing_ref = v_winning_ref THEN 'duplicate_notification'
      WHEN v_losing_evidence <> 'unverified' AND v_winning_evidence <> 'unverified'
           AND v_payment.id <> p_attempt_id
           AND v_attempt.amount > 0 AND v_payment.amount > 0
        THEN 'double_charge'
      ELSE 'unverified_collection' END;

    IF NOT EXISTS (
      SELECT 1 FROM public.kitchen_action_log
      WHERE order_id = v_attempt.order_id
        AND action = 'payment_confirm_lost_race'
        AND metadata->>'losing_attempt_id' = p_attempt_id::text
    ) THEN
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirm_lost_race', 'system',
      jsonb_build_object(
        'losing_attempt_id', p_attempt_id,
        'winning_payment_id', v_payment.id,
        'winning_channel', v_payment.channel,
        'winning_method', v_payment.method,
        'winning_provider', v_payment.provider,
        'winning_amount', v_payment.amount,
        'losing_provider', v_attempt.provider,
        'losing_provider_ref', p_provider_ref,
        'losing_amount', v_attempt.amount,
        'losing_status_before', v_old_status,
        'losing_failure_reason_before', v_old_reason,
        'losing_evidence', v_losing_evidence,
        'winning_evidence', v_winning_evidence,
        'classification', v_classification,
        'double_charge', v_classification = 'double_charge',
        'needs_manual_reconciliation', true
      )
    );
    END IF;

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

  IF v_order_status IN ('pending_counter_payment', 'pending_online_payment') THEN
    -- S3: POP entra in cucina solo qui, con 'paid' nello stesso UPDATE (invariante I1/I2 di S2).
    UPDATE public.kitchen_orders
    SET payment_status = 'paid', payment_method = v_payment.method, paid_at = now(), status = 'received'
    WHERE id = v_payment.order_id;
  ELSIF v_order_status = 'payment_abandoned' THEN
    -- S3 (D4): dopo l'abbandono non si paga più. Un PAID SumUp residuo chiude comunque il charge
    -- come 'succeeded' (sopra: i soldi non si perdono), ma l'ordine resta PA: nessun 'paid', nessun
    -- rientro in cassa, nessun rimborso automatico. Solo log back-office per Eros.
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (
      v_payment.order_id, v_payment.venue_id, 'payment_confirmed_after_abandon', 'system',
      jsonb_build_object(
        'payment_id', v_payment.id,
        'provider_ref', p_provider_ref,
        'promoted_from_status', v_old_status,
        'promoted_from_failure_reason', v_old_reason,
        'needs_manual_reconciliation', true
      )
    );
    RETURN v_payment;
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
      'order_status_after', CASE WHEN v_order_status IN ('pending_counter_payment', 'pending_online_payment') THEN 'received' ELSE v_order_status END,
      'promoted_from_status', v_old_status,
      'promoted_from_failure_reason', v_old_reason
    )
  );

  RETURN v_payment;
END;
$function$;

-- Grant invariati rispetto a 20261009130000 (CREATE OR REPLACE li conserva); ripetuti, idempotenti.
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_confirm(uuid, text, jsonb) TO service_role;
