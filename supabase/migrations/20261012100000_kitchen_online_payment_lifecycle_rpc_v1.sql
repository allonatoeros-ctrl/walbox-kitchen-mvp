-- kitchen_online_payment_lifecycle_rpc_v1 — Payment Lifecycle V2, S3: RPC e state machine DB (2026-10-12).
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. L'apply su Production richiede il gate esplicito di Eros
-- (solo `npx supabase db push --linked`) e va fatto INSIEME a 20261009140000 (S2): questa migration
-- usa gli stati `pending_online_payment` / `payment_abandoned` e la colonna `client_request_id` di S2.
--
-- Piano: docs/KITCHEN_PAYMENT_LIFECYCLE_V2.md §S3 (approvato da Eros 2026-10-12, decisioni D1–D4).
-- Abbreviazioni: POP = pending_online_payment, PA = payment_abandoned, PCP = pending_counter_payment.
--
-- Cosa introduce:
--   1) kitchen_customer_create_order_v2: come la v1 a 5 argomenti + corsia di pagamento
--      (`counter` -> PCP, `online` -> POP con payment_status NULL) + idempotenza su client_request_id.
--      La v1 resta invariata (la usano la cassa e le app vecchie ancora aperte).
--   2) kitchen_payment_confirm: ramo POP -> received + paid nello stesso UPDATE; ramo PA -> charge
--      `succeeded` nel ledger + log `payment_confirmed_after_abandon`, ordine NON toccato (D4).
--      Accetta anche un attempt `failed`/`abandoned_timeout` (chiuso dallo sweep) per non perdere
--      un PAID SumUp residuo. Tutti gli altri rami invariati.
--   3) kitchen_payment_attempt_start: rifiuta PA (`order_payment_abandoned`) e POP oltre
--      created_at + 4:30 (`online_payment_expired`).
--   4) kitchen_payment_attempt_claim_checkout: stesse due guardie sull'ordine.
--   5) kitchen_order_switch_to_counter_system (service role): POP -> PCP, attempt vivi chiusi.
--   6) kitchen_order_mark_payment_abandoned (service role): POP scaduto -> PA, attempt vivi chiusi.
--   7) View drift: il ramo `failed_charge_retry_window_open` esclude anche POP e PA.
--
-- Scelta tecnica (deviazione dal testo del piano, motivata): lo sweep chiude gli attempt vivi come
-- `failed` + failure_reason `abandoned_timeout`, non `cancelled`. Il webhook e il reconcile
-- (api/kitchen-sumup-webhook.js:89, api/_lib/sumupPaymentResolution.js:39) ignorano in silenzio gli
-- attempt `cancelled` e lasciano passare i `failed`: con `failed` un PAID SumUp residuo arriva a
-- kitchen_payment_confirm (ramo PA, D4: i soldi restano nel ledger) senza toccare `api/`. Stesso
-- schema già usato da `staff_closed_for_counter` (20260923121000).
--
-- Compatibilità con il codice in produzione (nessun client crea ancora ordini POP):
--   - gli ordini PCP seguono gli stessi rami di oggi in confirm/attempt_start/claim;
--   - nessuna mutazione di righe esistenti, nessun DROP, la v1 di create_order non cambia;
--   - le due RPC di sistema sono solo service_role, mai esposte al browser.
--
-- Ordine dei lock nelle RPC nuove: prima le righe kitchen_payments dell'ordine, poi la riga
-- kitchen_orders — lo stesso ordine di kitchen_payment_confirm e
-- kitchen_order_cancel_with_payment_attempt, per serializzare invece di andare in deadlock.

-- =========================================================================
-- 1) kitchen_customer_create_order_v2
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_customer_create_order_v2(
  p_venue_id text,
  p_nickname text,
  p_customer_note text,
  p_items jsonb,
  p_fulfillment_type text,
  p_payment_lane text,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_service_day date := timezone('Europe/Rome', now())::date;
  v_sequence integer;
  v_total numeric;
  v_order public.kitchen_orders;
  v_status text;
  v_payment_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'customer_session_required';
  END IF;
  IF p_payment_lane IS NULL OR p_payment_lane NOT IN ('counter', 'online') THEN
    RAISE EXCEPTION 'invalid_payment_lane';
  END IF;

  -- Doppio tap / retry di rete: stesso cliente + stesso client_request_id = stesso ordine, anche se
  -- nel frattempo la cucina ha chiuso o un piatto è finito (l'ordine esiste già). Vince il primo:
  -- corsia, piatti e note della seconda chiamata vengono ignorati.
  IF p_client_request_id IS NOT NULL THEN
    SELECT * INTO v_order
    FROM public.kitchen_orders
    WHERE customer_id = auth.uid() AND client_request_id = p_client_request_id;
    IF FOUND THEN
      IF v_order.venue_id IS DISTINCT FROM p_venue_id THEN
        RAISE EXCEPTION 'client_request_id_conflict';
      END IF;
      RETURN v_order;
    END IF;
  END IF;

  IF p_venue_id IS NULL OR btrim(p_venue_id) = '' THEN
    RAISE EXCEPTION 'invalid_venue';
  END IF;

  -- KITCHEN_OPEN_CLOSE_V1: nessuna riga per il venue = aperta di default.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_service_state s
    WHERE s.venue_id = p_venue_id AND s.is_open = false
  ) THEN
    RAISE EXCEPTION 'kitchen_closed';
  END IF;

  IF p_nickname IS NULL OR btrim(p_nickname) = '' THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required';
  END IF;
  IF p_fulfillment_type IS NOT NULL AND p_fulfillment_type NOT IN ('eat_here', 'takeaway') THEN
    RAISE EXCEPTION 'invalid_fulfillment_type';
  END IF;

  -- Stesse guardie di catalogo della v1 (20260923130000): name/price del client mai letti.
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    LEFT JOIN public.kitchen_menu_items m
      ON m.venue_id = p_venue_id AND m.item_id = line.item_id
    WHERE m.item_id IS NULL
  ) THEN
    RAISE EXCEPTION 'unknown_menu_item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    JOIN public.kitchen_menu_items m
      ON m.venue_id = p_venue_id AND m.item_id = line.item_id
    LEFT JOIN public.kitchen_menu_availability a
      ON a.venue_id = p_venue_id AND a.item_id = line.item_id
    WHERE m.price IS NULL OR COALESCE(a.available, true) = false
  ) THEN
    RAISE EXCEPTION 'item_not_orderable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    WHERE line.quantity IS NULL OR line.quantity < 1
  ) THEN
    RAISE EXCEPTION 'invalid_order_items';
  END IF;

  SELECT sum(line.quantity::numeric * m.price)
  INTO v_total
  FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
  JOIN public.kitchen_menu_items m
    ON m.venue_id = p_venue_id AND m.item_id = line.item_id;

  -- T1: POP nasce con payment_status NULL; la conferma scrive 'paid', lo switch scrive PCP.
  IF p_payment_lane = 'online' THEN
    v_status := 'pending_online_payment';
    v_payment_status := NULL;
  ELSE
    v_status := 'pending_counter_payment';
    v_payment_status := 'pending_counter_payment';
  END IF;

  -- Contatore + ordine + righe in un sotto-blocco: se due chiamate concorrenti con lo stesso
  -- client_request_id passano entrambe il controllo sopra, la seconda prende unique_violation
  -- sull'indice di S2, il suo incremento del contatore viene annullato (nessun buco nei codici) e
  -- restituisce l'ordine della prima.
  BEGIN
    INSERT INTO public.kitchen_service_order_counters (venue_id, service_day, last_sequence)
    VALUES (p_venue_id, v_service_day, 1)
    ON CONFLICT (venue_id, service_day)
    DO UPDATE SET last_sequence = public.kitchen_service_order_counters.last_sequence + 1,
                  updated_at = now()
    RETURNING last_sequence INTO v_sequence;

    INSERT INTO public.kitchen_orders (
      id, order_code, venue_id, table_id, nickname, customer_id,
      status, customer_note, total, payment_status, payment_method, service_day, service_sequence,
      fulfillment_type, client_request_id
    ) VALUES (
      'order-' || gen_random_uuid()::text,
      public.kitchen_format_operational_code(v_sequence),
      p_venue_id,
      NULL,
      btrim(p_nickname),
      auth.uid(),
      v_status,
      NULLIF(btrim(p_customer_note), ''),
      v_total,
      v_payment_status,
      NULL,
      v_service_day,
      v_sequence,
      p_fulfillment_type,
      p_client_request_id
    )
    RETURNING * INTO v_order;

    INSERT INTO public.kitchen_order_items (order_id, venue_id, item_id, name, quantity, price)
    SELECT v_order.id, v_order.venue_id, line.item_id, m.name, line.quantity, m.price
    FROM jsonb_to_recordset(p_items) AS line(item_id text, quantity integer)
    JOIN public.kitchen_menu_items m
      ON m.venue_id = p_venue_id AND m.item_id = line.item_id;
  EXCEPTION WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN
      RAISE;
    END IF;
    SELECT * INTO v_order
    FROM public.kitchen_orders
    WHERE customer_id = auth.uid() AND client_request_id = p_client_request_id;
    IF NOT FOUND THEN
      RAISE; -- unique_violation di un altro vincolo: non è un doppio tap
    END IF;
    IF v_order.venue_id IS DISTINCT FROM p_venue_id THEN
      RAISE EXCEPTION 'client_request_id_conflict';
    END IF;
  END;

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_customer_create_order_v2(text, text, text, jsonb, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_customer_create_order_v2(text, text, text, jsonb, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_customer_create_order_v2(text, text, text, jsonb, text, text, uuid) TO authenticated;

-- =========================================================================
-- 2) kitchen_payment_confirm — rami POP e PA (sopra 20261009120000, resto invariato)
-- =========================================================================

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

  -- S3 (D4): un attempt chiuso dallo sweep dei 5 minuti (`failed`/`abandoned_timeout`) resta
  -- confermabile, così un PAID SumUp residuo entra nel ledger invece di andare perso.
  IF v_payment.status NOT IN ('initiated', 'pending')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'sumup_failed')
     AND NOT (v_payment.status = 'failed' AND v_payment.provider = 'sumup' AND v_payment.failure_reason = 'abandoned_timeout')
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

-- =========================================================================
-- 3) kitchen_payment_attempt_start — guardie PA e POP scaduto (sopra 20261009120000)
-- =========================================================================

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

  -- S3 (D4): dopo l'abbandono non nasce nessun nuovo attempt, su nessun canale.
  IF v_order.status = 'payment_abandoned' THEN
    RAISE EXCEPTION 'order_payment_abandoned';
  END IF;

  -- S3 (D2 + T5): ordine online oltre created_at + 4:30 -> nessun checkout nuovo. Margine di 30 s
  -- sullo sweep (che lavora da created_at + 5:00), così nessun checkout nasce mentre lo sweep chiude.
  IF v_order.status = 'pending_online_payment'
     AND now() >= v_order.created_at + interval '4 minutes 30 seconds' THEN
    RAISE EXCEPTION 'online_payment_expired';
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

-- Grant invariati rispetto a 20261009130000 (CREATE OR REPLACE li conserva); ripetuti, idempotenti.
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_start(text, text, text, text, numeric, text) TO service_role;

-- =========================================================================
-- 4) kitchen_payment_attempt_claim_checkout — stesse guardie sull'ordine (sopra 20260830143353)
-- =========================================================================

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
  v_order_status text;
  v_order_created_at timestamptz;
BEGIN
  -- S3: IS DISTINCT FROM (prima `<>`): con claims vuoti auth.role() è NULL e `<>` saltava la guardia.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  -- S3: guardie sull'ordine prima del claim. Lettura senza lock (nessun nuovo ordine di lock contro
  -- confirm/cancel): se lo sweep chiude l'ordine dopo questa lettura, l'UPDATE sotto non trova più
  -- l'attempt 'initiated' (lo sweep lo porta a 'failed'), e il margine T5 (4:30 qui, 5:00 lo sweep)
  -- è più lungo del TTL del claim (20 s) che lo sweep rispetta.
  SELECT o.status, o.created_at INTO v_order_status, v_order_created_at
  FROM public.kitchen_payments p
  JOIN public.kitchen_orders o ON o.id = p.order_id
  WHERE p.id = p_attempt_id;

  IF v_order_status = 'payment_abandoned' THEN
    RAISE EXCEPTION 'order_payment_abandoned';
  END IF;

  IF v_order_status = 'pending_online_payment'
     AND now() >= v_order_created_at + interval '4 minutes 30 seconds' THEN
    RAISE EXCEPTION 'online_payment_expired';
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

GRANT EXECUTE ON FUNCTION public.kitchen_payment_attempt_claim_checkout(uuid) TO service_role;

-- =========================================================================
-- 5) kitchen_order_switch_to_counter_system — POP -> PCP (service role, chiamata da api/ in S4)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_order_switch_to_counter_system(
  p_order_id text,
  p_actor_customer_id uuid
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order  public.kitchen_orders;
  v_closed integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  -- Lock: prima gli attempt, poi l'ordine (stesso ordine di confirm/cancel).
  PERFORM 1 FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge'
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF p_actor_customer_id IS NULL OR v_order.customer_id IS DISTINCT FROM p_actor_customer_id THEN
    RAISE EXCEPTION 'not_order_owner';
  END IF;

  -- Idempotente: già passato al banco da questa RPC (doppio tap su "Paga al banco").
  IF v_order.status = 'pending_counter_payment' AND v_order.online_payment_disabled THEN
    RETURN v_order;
  END IF;

  IF v_order.status <> 'pending_online_payment' THEN
    RAISE EXCEPTION 'order_not_pending_online_payment';
  END IF;

  -- Un charge già riuscito (es. confermato con importo diverso dal totale) non va mai affiancato da
  -- un secondo incasso al banco.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = p_order_id AND direction = 'charge' AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'order_has_succeeded_charge';
  END IF;

  -- Un checkout potrebbe nascere su SumUp proprio ora (claim < 20 s, TTL di claim_checkout):
  -- fail closed, il chiamante riprova tra poco.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = p_order_id AND direction = 'charge'
      AND status IN ('initiated', 'pending')
      AND checkout_claim_at > now() - interval '20 seconds'
  ) THEN
    RAISE EXCEPTION 'checkout_claim_in_progress';
  END IF;

  -- Attempt vivi (stessa definizione della guardia di attempt_start) -> failed, non più ritentabili.
  -- Il chiamante (api/, S4) li ha già disattivati e verificati su SumUp prima di chiamare qui.
  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = 'customer_switched_to_counter', updated_at = now()
  WHERE order_id = p_order_id
    AND direction = 'charge'
    AND (
      status IN ('initiated', 'pending')
      OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
    );
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- I3 di S2: verso PCP solo con online_payment_disabled=true nello stesso UPDATE.
  UPDATE public.kitchen_orders
  SET status = 'pending_counter_payment',
      payment_status = 'pending_counter_payment',
      online_payment_disabled = true
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.kitchen_action_log (
    order_id, venue_id, action, from_status, to_status, actor_type, actor_id, reason, metadata
  ) VALUES (
    v_order.id, v_order.venue_id, 'online_payment_switched_to_counter',
    'pending_online_payment', 'pending_counter_payment', 'customer', p_actor_customer_id,
    'customer_switched_to_counter',
    jsonb_build_object('closed_attempts', v_closed)
  );

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_order_switch_to_counter_system(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_switch_to_counter_system(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_switch_to_counter_system(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_order_switch_to_counter_system(text, uuid) TO service_role;

-- =========================================================================
-- 6) kitchen_order_mark_payment_abandoned — POP scaduto -> PA (service role, sweep S6)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_order_mark_payment_abandoned(
  p_order_id text
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order  public.kitchen_orders;
  v_closed integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  -- Lock: prima gli attempt, poi l'ordine (stesso ordine di confirm/cancel).
  PERFORM 1 FROM public.kitchen_payments
  WHERE order_id = p_order_id AND direction = 'charge'
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  -- Idempotente: sweep doppio o in parallelo.
  IF v_order.status = 'payment_abandoned' THEN
    RETURN v_order;
  END IF;

  -- Pagato nel frattempo (received) o passato al banco (PCP): non è un abbandono.
  IF v_order.status <> 'pending_online_payment' THEN
    RAISE EXCEPTION 'order_not_pending_online_payment';
  END IF;

  -- D2: mai prima dei 5 minuti, anche se il chiamante sbaglia.
  IF now() < v_order.created_at + interval '5 minutes' THEN
    RAISE EXCEPTION 'online_payment_not_expired';
  END IF;

  -- D4 punto 3: un charge riuscito non è un abbandono. Il chiamante lo gestisce (confirm o log).
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = p_order_id AND direction = 'charge' AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'order_has_succeeded_charge';
  END IF;

  -- Un checkout potrebbe nascere su SumUp proprio ora: riprova al giro dopo.
  IF EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = p_order_id AND direction = 'charge'
      AND status IN ('initiated', 'pending')
      AND checkout_claim_at > now() - interval '20 seconds'
  ) THEN
    RAISE EXCEPTION 'checkout_claim_in_progress';
  END IF;

  -- Attempt vivi -> failed/abandoned_timeout (vedi header: resta confermabile da un PAID residuo).
  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = 'abandoned_timeout', updated_at = now()
  WHERE order_id = p_order_id
    AND direction = 'charge'
    AND (
      status IN ('initiated', 'pending')
      OR (status = 'failed' AND provider = 'sumup' AND failure_reason = 'sumup_failed')
    );
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  UPDATE public.kitchen_orders
  SET status = 'payment_abandoned'
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.kitchen_action_log (
    order_id, venue_id, action, from_status, to_status, actor_type, reason, metadata
  ) VALUES (
    v_order.id, v_order.venue_id, 'online_payment_abandoned',
    'pending_online_payment', 'payment_abandoned', 'system', 'abandoned_timeout',
    jsonb_build_object('closed_attempts', v_closed)
  );

  RETURN v_order;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_order_mark_payment_abandoned(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_mark_payment_abandoned(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_mark_payment_abandoned(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_order_mark_payment_abandoned(text) TO service_role;

-- =========================================================================
-- 7) View drift — ramo retry esclude anche POP e PA (sopra 20261006124448, altri 3 rami invariati)
-- =========================================================================

CREATE OR REPLACE VIEW public.kitchen_payments_provider_drift_candidates AS
SELECT
  o.id AS order_id,
  o.venue_id,
  o.payment_status,
  o.total,
  'paid_without_verifiable_charge'::text AS drift_type
FROM public.kitchen_orders o
WHERE is_staff_for_venue(o.venue_id)
  AND o.payment_status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments kp
    WHERE kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
      AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL)
  )

UNION ALL

SELECT
  o.id AS order_id,
  o.venue_id,
  o.payment_status,
  o.total,
  'refunded_without_verifiable_refund'::text AS drift_type
FROM public.kitchen_orders o
WHERE is_staff_for_venue(o.venue_id)
  AND o.payment_status = 'refunded'
  AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments kp
    WHERE kp.order_id = o.id AND kp.direction = 'refund' AND kp.status = 'succeeded'
      AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL)
  )

UNION ALL

SELECT
  kp.order_id,
  kp.venue_id,
  o.payment_status,
  o.total,
  'refund_stuck_initiated'::text AS drift_type
FROM public.kitchen_payments kp
JOIN public.kitchen_orders o ON o.id = kp.order_id
WHERE is_staff_for_venue(kp.venue_id)
  AND kp.direction = 'refund'
  AND kp.status IN ('initiated', 'pending')

UNION ALL

SELECT
  kp.order_id,
  kp.venue_id,
  o.payment_status,
  o.total,
  'failed_charge_retry_window_open'::text AS drift_type
FROM public.kitchen_payments kp
JOIN public.kitchen_orders o ON o.id = kp.order_id
WHERE is_staff_for_venue(kp.venue_id)
  AND kp.direction = 'charge'
  AND kp.status = 'failed'
  AND kp.provider = 'sumup'
  AND kp.failure_reason = 'sumup_failed'
  AND o.payment_status <> 'paid'
  AND o.status NOT IN ('cancelled', 'pending_online_payment', 'payment_abandoned');

GRANT SELECT ON public.kitchen_payments_provider_drift_candidates TO authenticated;
