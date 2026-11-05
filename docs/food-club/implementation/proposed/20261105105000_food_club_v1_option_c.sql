-- WALRUS FOOD CLUB V1 — OPZIONE C «blocco intelligente» del buono durante un pagamento SumUp incerto.
-- STATO: PROPOSTA. File FUORI da supabase/migrations/ (area protetta). Mai applicato a DB remoti.
-- Dipende da: 4 migration Food Club (20261105100000..103000) + patch proposta 20261105104000 (FIX-1..5).
-- Verificato solo su stack Supabase locale con proposed/51_option_c.sql (OC1–OC11) e harness/run-oc-local.sh.
--
-- Regola: il buono resta RISERVATO finché l'ordine ha almeno un attempt di pagamento ancora confermabile
--   o una chiusura di attempt SumUp non attestata dal server (OC12b, sezioni 0 e 7).
--   - charge 'succeeded' con importo = totale su ordine chiuso (cancelled/payment_abandoned) -> 'used', una volta, niente timbro
--   - charge 'succeeded' con importo ≠ totale (N1) -> buono resta riservato, anomalia per lo staff, niente timbro
--   - nessun attempt confermabile e nessun charge riuscito, ordine chiuso -> 'available' (o 'expired' se scaduto)
--   - stati incerti (initiated/pending/sumup_failed/abandoned_timeout) -> nessuna restituzione automatica
--   - dopo 30 minuti dal PRIMO attempt ancora confermabile (N2) -> segnalazione staff, nessuno sblocco
--   - sblocco manuale: solo manager, solo se nessun attempt è confermabile e nessun charge è riuscito
-- Attempt CONFERMABILE = stessa lista di kitchen_payment_confirm (20261012100000):
--   initiated | pending | failed/sumup/sumup_failed | failed/sumup/abandoned_timeout.
--
-- Ordine dei lock (uguale a kitchen_payment_confirm / cancel_with_payment_attempt): kitchen_payments -> kitchen_orders
-- -> food_club_vouchers. Il trigger su kitchen_orders legge gli attempt SENZA lock (prenderlo invertirebbe l'ordine):
-- se un attempt cambia in parallelo, il suo trigger su kitchen_payments attende il lock dell'ordine e ricalcola dopo.

-- ---------------------------------------------------------------------------------------------------
-- 0) OC12b: provenienza delle chiusure degli attempt SumUp.
--    Un attempt SumUp che diventa non confermabile (cancelled / failed con motivo non ritentabile) per mano di un
--    chiamante che NON è service_role (staff con il proprio JWT, sessione senza claim) è una chiusura NON VERIFICATA:
--    il DB non può sapere se SumUp è stato davvero controllato. Finché il server non la attesta, l'attempt resta
--    confermabile per kitchen_payment_confirm (nessun incasso perso) e il buono resta riservato.
--    Il motivo scritto dal chiamante è solo un dato: l'autorizzazione dipende dal ruolo, mai dalla stringa.
-- ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kitchen_payment_closure_attestations (
  payment_id               uuid PRIMARY KEY REFERENCES public.kitchen_payments(id) ON DELETE RESTRICT,
  order_id                 text NOT NULL,
  venue_id                 text NOT NULL,
  closed_by                uuid,
  closed_role              text,
  from_status              text NOT NULL,
  from_reason              text,
  to_status                text NOT NULL,
  to_reason                text,
  closed_at                timestamptz NOT NULL DEFAULT now(),
  attested_at              timestamptz,
  attested_provider_status text,
  attested_raw             jsonb,
  CONSTRAINT kitchen_payment_closure_attested_status_ck
    CHECK (attested_at IS NULL OR attested_provider_status IN ('EXPIRED', 'CANCELLED', 'SERVER_RECHECK'))
);
CREATE INDEX IF NOT EXISTS kitchen_payment_closure_attestations_open_idx
  ON public.kitchen_payment_closure_attestations (order_id) WHERE attested_at IS NULL;
ALTER TABLE public.kitchen_payment_closure_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kitchen_payment_closure_attestations FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 1) Stato del pagamento di un ordine: unica fonte di verità per il rilascio
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_attempt_confirmable(p public.kitchen_payments)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.direction = 'charge' AND (
    p.status IN ('initiated', 'pending')
    OR (p.status = 'failed' AND p.provider = 'sumup' AND p.failure_reason IN ('sumup_failed', 'abandoned_timeout')));
$$;

-- N1, percorso reale: SumUp ha detto PAID ma l'importo non coincide con l'attempt, e l'API (sumupPaymentResolution.js)
-- registra kitchen_payment_fail(..., 'sumup_amount_mismatch'). L'incasso esiste su SumUp ma l'attempt è 'failed':
-- né confermabile né chiuso. È l'unico scrittore di questo motivo; il motivo da solo basta (fail-safe: blocco).
CREATE OR REPLACE FUNCTION public.food_club_attempt_captured_mismatch(p public.kitchen_payments)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p.direction = 'charge' AND p.status = 'failed' AND p.provider = 'sumup'
     AND p.failure_reason = 'sumup_amount_mismatch';
$$;

CREATE OR REPLACE FUNCTION public.food_club_order_payment_state(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.kitchen_payments p
                  WHERE p.order_id = p_order_id AND p.direction = 'charge' AND p.status = 'succeeded') THEN 'paid'
    WHEN EXISTS (SELECT 1 FROM public.kitchen_payments p
                  WHERE p.order_id = p_order_id AND public.food_club_attempt_captured_mismatch(p)) THEN 'mismatch'
    WHEN EXISTS (SELECT 1 FROM public.kitchen_payments p
                  WHERE p.order_id = p_order_id AND public.food_club_attempt_confirmable(p)) THEN 'open'
    WHEN EXISTS (SELECT 1 FROM public.kitchen_payments p
                   JOIN public.kitchen_payment_closure_attestations c ON c.payment_id = p.id
                  WHERE p.order_id = p_order_id AND c.attested_at IS NULL AND p.status <> 'succeeded') THEN 'unverified'
    ELSE 'closed' END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Regolamento del buono riservato su un ordine NON pagato (idempotente). Chiamato dai due trigger.
--    Il chiamante tiene già il lock dell'ordine (UPDATE dell'ordine, oppure SELECT ... FOR UPDATE).
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_settle_unpaid_order(p_order_id text, p_stage text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.kitchen_orders;
  v_voucher public.food_club_vouchers;
  v_charge  public.kitchen_payments;
  v_state   text;
  v_to      text;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND OR v_order.payment_status = 'paid' THEN RETURN; END IF;  -- pagato: lo regola food_club_settle_paid_order
  SELECT * INTO v_voucher FROM public.food_club_vouchers
   WHERE reserved_order_id = p_order_id AND status = 'reserved' FOR UPDATE;
  IF v_voucher.id IS NULL THEN RETURN; END IF;

  SELECT * INTO v_charge FROM public.kitchen_payments
   WHERE order_id = p_order_id AND direction = 'charge' AND status = 'succeeded' LIMIT 1;

  IF v_charge.id IS NOT NULL THEN
    IF v_charge.amount IS DISTINCT FROM v_order.total THEN
      -- N1: importo anomalo. Buono bloccato, evidenza dell'incasso preservata (il charge resta 'succeeded').
      IF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events
                      WHERE voucher_id = v_voucher.id AND order_id = p_order_id AND event = 'held_amount_mismatch') THEN
        PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'reserved', 'held_amount_mismatch', p_order_id, 'system',
          jsonb_build_object('payment_id', v_charge.id, 'payment_amount', v_charge.amount, 'order_total', v_order.total, 'stage', p_stage));
        INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
        VALUES (p_order_id, v_order.venue_id, 'food_club_voucher_amount_mismatch', 'system',
                jsonb_build_object('voucher_id', v_voucher.id, 'payment_id', v_charge.id, 'payment_amount', v_charge.amount,
                                   'order_total', v_order.total, 'needs_manual_reconciliation', true));
      END IF;
    ELSIF v_order.status IN ('cancelled', 'payment_abandoned') THEN
      -- Pagamento confermato su ordine chiuso: buono consumato una sola volta (lock + condizione sullo stato).
      UPDATE public.food_club_vouchers SET status = 'used', used_order_id = p_order_id, used_at = now()
       WHERE id = v_voucher.id AND status = 'reserved';
      PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'used', 'consumed_on_late_payment', p_order_id, 'system',
        jsonb_build_object('payment_id', v_charge.id, 'order_status', v_order.status, 'stage', p_stage));
    END IF;
    -- importo giusto e ordine ancora aperto: kitchen_payment_confirm porta l'ordine a 'paid' subito dopo.
    RETURN;
  END IF;

  -- N1 percorso reale: incasso SumUp con importo diverso, attempt 'failed/sumup_amount_mismatch'. Vale su ordine
  -- aperto o chiuso: buono bloccato (mai rilasciato, mai consumato), anomalia una sola volta, riconciliazione manuale.
  SELECT * INTO v_charge FROM public.kitchen_payments p
   WHERE p.order_id = p_order_id AND public.food_club_attempt_captured_mismatch(p)
   ORDER BY p.updated_at DESC LIMIT 1;
  IF v_charge.id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events
                    WHERE voucher_id = v_voucher.id AND order_id = p_order_id AND event = 'held_amount_mismatch') THEN
      PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'reserved', 'held_amount_mismatch', p_order_id, 'system',
        jsonb_build_object('payment_id', v_charge.id, 'attempt_amount', v_charge.amount,
                           'provider_amount', v_charge.raw_last_event->'amount', 'provider_status', v_charge.raw_last_event->>'status',
                           'order_total', v_order.total, 'stage', p_stage, 'source', 'failed_amount_mismatch'));
      INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
      VALUES (p_order_id, v_order.venue_id, 'food_club_voucher_amount_mismatch', 'system',
              jsonb_build_object('voucher_id', v_voucher.id, 'payment_id', v_charge.id, 'attempt_amount', v_charge.amount,
                                 'provider_amount', v_charge.raw_last_event->'amount', 'order_total', v_order.total,
                                 'needs_manual_reconciliation', true));
    END IF;
    RETURN;
  END IF;

  IF v_order.status NOT IN ('cancelled', 'payment_abandoned') THEN RETURN; END IF;

  v_state := public.food_club_order_payment_state(p_order_id);
  IF v_state = 'closed' THEN
    v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
    UPDATE public.food_club_vouchers SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
     WHERE id = v_voucher.id AND status = 'reserved';
    PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'released', p_order_id, 'system',
      jsonb_build_object('order_status', v_order.status, 'reason', 'all_attempts_final', 'stage', p_stage));
  ELSIF v_state = 'unverified' THEN
    -- OC12b: chiusura dell'attempt non attestata dal server -> buono trattenuto, segnalazione una sola volta.
    IF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events
                    WHERE voucher_id = v_voucher.id AND order_id = p_order_id AND event = 'held_closure_unverified') THEN
      PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'reserved', 'held_closure_unverified', p_order_id, 'system',
        jsonb_build_object('order_status', v_order.status, 'stage', p_stage));
      INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
      VALUES (p_order_id, v_order.venue_id, 'food_club_voucher_closure_unverified', 'system',
              jsonb_build_object('voucher_id', v_voucher.id, 'needs_server_verification', true));
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events
                     WHERE voucher_id = v_voucher.id AND order_id = p_order_id AND event = 'held_payment_open') THEN
    PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', 'reserved', 'held_payment_open', p_order_id, 'system',
      jsonb_build_object('order_status', v_order.status, 'stage', p_stage));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Trigger esistente su kitchen_orders (chiuso non pagato): ora rilascia SOLO se nessun attempt è confermabile.
--    Stessa firma e stesso WHEN di 20261105101000: si sostituisce solo il corpo.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_orders_food_club_on_closed_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_settle_unpaid_order(NEW.id, 'order_closed');
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4) Nuovo trigger su kitchen_payments: ogni cambio di stato/motivo di un charge riesamina il buono dell'ordine.
--    Non scatta sulle ri-verifiche identiche (kitchen_payment_fail no-op, webhook duplicato già 'succeeded').
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_payments_food_club_on_attempt_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- OC12b: fuori dal blocco EXCEPTION: se la provenienza non si registra, la chiusura stessa fallisce (fail closed).
  PERFORM public.kitchen_payment_record_closure_provenance(OLD, NEW);
  BEGIN
    PERFORM 1 FROM public.kitchen_orders WHERE id = NEW.order_id FOR UPDATE;
    PERFORM public.food_club_settle_unpaid_order(NEW.order_id, 'attempt_' || NEW.status);
  EXCEPTION WHEN OTHERS THEN
    -- Mai bloccare il ledger dei pagamenti per un errore Food Club: evidenza allo staff (stessa postura di FIX-1/2).
    INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
    VALUES (NEW.order_id, NEW.venue_id, 'food_club_error', 'system',
            jsonb_build_object('stage', 'on_attempt_change', 'sqlstate', SQLSTATE, 'message', left(SQLERRM, 300),
                               'payment_id', NEW.id, 'needs_manual_reconciliation', true));
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_payments_food_club_on_attempt_change ON public.kitchen_payments;
CREATE TRIGGER kitchen_payments_food_club_on_attempt_change
  AFTER UPDATE OF status, failure_reason ON public.kitchen_payments
  FOR EACH ROW
  WHEN (NEW.direction = 'charge'
        AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.failure_reason IS DISTINCT FROM NEW.failure_reason))
  EXECUTE FUNCTION public.kitchen_payments_food_club_on_attempt_change();

-- ---------------------------------------------------------------------------------------------------
-- 5) Staff: buoni bloccati da segnalare (N2: 30 minuti dal PRIMO attempt ancora confermabile; N1: subito)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_staff_vouchers_on_hold(p_venue_id text, p_min_minutes integer DEFAULT 30)
RETURNS TABLE (voucher_id uuid, voucher_code text, order_id text, order_code text, order_status text,
               reason text, pending_since timestamptz, minutes_pending integer, attempts_open integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  WITH held AS (
    SELECT v.id AS vid, v.code, o.id AS oid, o.order_code, o.status AS ostatus,
           (SELECT min(p.created_at) FROM public.kitchen_payments p
             WHERE p.order_id = o.id AND public.food_club_attempt_confirmable(p)) AS first_open,
           (SELECT count(*)::int FROM public.kitchen_payments p
             WHERE p.order_id = o.id AND public.food_club_attempt_confirmable(p)) AS n_open,
           EXISTS (SELECT 1 FROM public.kitchen_payments p WHERE p.order_id = o.id AND p.direction = 'charge'
                     AND p.status = 'succeeded' AND p.amount IS DISTINCT FROM o.total)
           OR EXISTS (SELECT 1 FROM public.kitchen_payments p
                       WHERE p.order_id = o.id AND public.food_club_attempt_captured_mismatch(p)) AS mismatch,
           EXISTS (SELECT 1 FROM public.kitchen_payments p
                     JOIN public.kitchen_payment_closure_attestations c ON c.payment_id = p.id
                    WHERE p.order_id = o.id AND c.attested_at IS NULL AND p.status <> 'succeeded') AS unverified
      FROM public.food_club_vouchers v
      JOIN public.kitchen_orders o ON o.id = v.reserved_order_id
     WHERE v.status = 'reserved' AND o.venue_id = p_venue_id AND o.payment_status IS DISTINCT FROM 'paid')
  SELECT h.vid, h.code, h.oid, h.order_code, h.ostatus,
         CASE WHEN h.mismatch THEN 'amount_mismatch' WHEN h.unverified THEN 'closure_unverified' ELSE 'payment_pending' END,
         h.first_open,
         CASE WHEN h.first_open IS NULL THEN NULL ELSE (extract(epoch FROM now() - h.first_open) / 60)::int END,
         h.n_open
    FROM held h
   WHERE h.mismatch OR h.unverified OR (h.first_open IS NOT NULL AND h.first_open <= now() - make_interval(mins => GREATEST(p_min_minutes, 0)))
   ORDER BY h.first_open NULLS FIRST;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6) Sblocco manuale: solo manager, solo dopo verifica definitiva di tutti gli attempt. Idempotente.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_admin_release_voucher(p_order_id text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   public.kitchen_orders;
  v_voucher public.food_club_vouchers;
  v_state   text;
  v_to      text;
BEGIN
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  PERFORM public.food_club_require_staff(v_order.venue_id, true);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;

  -- Stesso ordine dei lock di kitchen_payment_confirm: attempt -> ordine -> buono.
  PERFORM 1 FROM public.kitchen_payments WHERE order_id = p_order_id AND direction = 'charge' FOR UPDATE;
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  SELECT * INTO v_voucher FROM public.food_club_vouchers
   WHERE reserved_order_id = p_order_id AND status = 'reserved' FOR UPDATE;
  IF v_voucher.id IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_held');
  END IF;
  IF v_order.status NOT IN ('cancelled', 'payment_abandoned') THEN RAISE EXCEPTION 'order_not_closed'; END IF;

  v_state := public.food_club_order_payment_state(p_order_id);
  IF v_state = 'open' THEN RAISE EXCEPTION 'payment_still_confirmable'; END IF;
  IF v_state = 'unverified' THEN RAISE EXCEPTION 'payment_closure_unverified'; END IF;  -- OC12b: serve la verifica server
  IF v_state IN ('paid', 'mismatch') THEN RAISE EXCEPTION 'payment_succeeded_needs_reconciliation'; END IF;

  v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
  UPDATE public.food_club_vouchers SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
   WHERE id = v_voucher.id AND status = 'reserved';
  PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'released_by_admin', p_order_id, 'staff',
    jsonb_build_object('reason', p_reason, 'staff_id', auth.uid()));
  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (p_order_id, v_order.venue_id, 'food_club_voucher_admin_released', 'staff', auth.uid(), p_reason,
          jsonb_build_object('voucher_id', v_voucher.id, 'to_status', v_to));
  RETURN jsonb_build_object('released', true, 'to_status', v_to);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 7) OC12b: provenienza, attestazione server, segnalazione staff; kitchen_payment_fail e _confirm aggiornate.
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_payment_record_closure_provenance(p_old public.kitchen_payments, p_new public.kitchen_payments)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_new.direction <> 'charge' OR p_new.provider IS DISTINCT FROM 'sumup' THEN RETURN; END IF;
  IF p_new.status = 'succeeded' OR public.food_club_attempt_confirmable(p_new) THEN RETURN; END IF;
  IF auth.role() = 'service_role' THEN
    -- Percorso server (webhook/reconcile/sweep dopo GET SumUp): la nuova chiusura vale come attestazione.
    UPDATE public.kitchen_payment_closure_attestations
       SET attested_at = now(), attested_provider_status = 'SERVER_RECHECK',
           attested_raw = jsonb_build_object('status', p_new.status, 'reason', p_new.failure_reason)
     WHERE payment_id = p_new.id AND attested_at IS NULL;
    RETURN;
  END IF;
  INSERT INTO public.kitchen_payment_closure_attestations
    (payment_id, order_id, venue_id, closed_by, closed_role, from_status, from_reason, to_status, to_reason)
  VALUES (p_new.id, p_new.order_id, p_new.venue_id, auth.uid(), COALESCE(auth.role(), 'none'),
          p_old.status, p_old.failure_reason, p_new.status, p_new.failure_reason)
  ON CONFLICT (payment_id) DO UPDATE
     SET closed_by = EXCLUDED.closed_by, closed_role = EXCLUDED.closed_role, to_status = EXCLUDED.to_status,
         to_reason = EXCLUDED.to_reason, closed_at = now(),
         attested_at = NULL, attested_provider_status = NULL, attested_raw = NULL;
END;
$$;

-- Attestazione: SOLO service_role, SOLO con un esito SumUp terminale letto dal server (EXPIRED/CANCELLED).
-- FAILED non è terminale (A23: SumUp lascia FAILED anche dopo il DELETE). PAID -> kitchen_payment_confirm.
CREATE OR REPLACE FUNCTION public.kitchen_payment_attest_closed(p_attempt_id uuid, p_provider_status text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.kitchen_payments;
  v_n       integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_only'; END IF;
  IF p_provider_status IS NULL OR p_provider_status NOT IN ('EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'provider_status_not_terminal';
  END IF;
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;
  IF v_payment.status = 'succeeded' THEN RAISE EXCEPTION 'attempt_succeeded'; END IF;
  IF public.food_club_attempt_confirmable(v_payment) THEN RAISE EXCEPTION 'attempt_still_confirmable'; END IF;
  UPDATE public.kitchen_payment_closure_attestations
     SET attested_at = now(), attested_provider_status = p_provider_status, attested_raw = p_raw_payload
   WHERE payment_id = p_attempt_id AND attested_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RETURN jsonb_build_object('attested', false, 'reason', 'nothing_to_attest'); END IF;
  -- Ordine dei lock: attempt -> ordine -> buono (come kitchen_payment_confirm).
  PERFORM 1 FROM public.kitchen_orders WHERE id = v_payment.order_id FOR UPDATE;
  PERFORM public.food_club_settle_unpaid_order(v_payment.order_id, 'closure_attested');
  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
  VALUES (v_payment.order_id, v_payment.venue_id, 'payment_closure_attested', 'system',
          jsonb_build_object('payment_id', p_attempt_id, 'provider_status', p_provider_status));
  RETURN jsonb_build_object('attested', true);
END;
$$;

-- Segnalazione dello staff: solo log. Non cambia attempt, ordine o buono. La nota è un dato non attendibile.
CREATE OR REPLACE FUNCTION public.kitchen_payment_report_problem(p_attempt_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment public.kitchen_payments;
BEGIN
  SELECT * INTO v_payment FROM public.kitchen_payments WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_attempt_not_found'; END IF;
  IF NOT public.is_staff_for_venue(v_payment.venue_id) THEN RAISE EXCEPTION 'not_staff_for_venue'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 3 THEN RAISE EXCEPTION 'note_required'; END IF;
  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason, metadata)
  VALUES (v_payment.order_id, v_payment.venue_id, 'payment_problem_reported', 'staff', auth.uid(), left(p_note, 500),
          jsonb_build_object('payment_id', v_payment.id, 'attempt_status', v_payment.status,
                             'failure_reason', v_payment.failure_reason, 'untrusted_note', true));
  RETURN jsonb_build_object('reported', true);
END;
$$;

-- kitchen_payment_fail: identica a 20260830101227 salvo il ramo staff (OC12b).
CREATE OR REPLACE FUNCTION public.kitchen_payment_fail(p_attempt_id uuid, p_reason text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS kitchen_payments
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
    -- OC12b: lo staff non dichiara più l'esito di un pagamento (il motivo è un dato del client, non una prova).
    -- Per segnalare un problema: kitchen_payment_report_problem (nessun effetto su attempt, ordine o buono).
    RAISE EXCEPTION 'staff_cannot_fail_payment_use_report';
  ELSE
    RAISE EXCEPTION 'not_authorized';
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

-- kitchen_payment_confirm: identica a 20261012100000 salvo l'accettazione delle chiusure non attestate (OC12b).
CREATE OR REPLACE FUNCTION public.kitchen_payment_confirm(p_attempt_id uuid, p_provider_ref text, p_raw_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS kitchen_payments
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
     -- OC12b: chiusura non attestata dal server (staff, sessione senza claim): un PAID reale entra nel ledger.
     AND NOT EXISTS (SELECT 1 FROM public.kitchen_payment_closure_attestations c
                      WHERE c.payment_id = v_payment.id AND c.attested_at IS NULL)
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

REVOKE ALL ON FUNCTION public.kitchen_payment_record_closure_provenance(public.kitchen_payments, public.kitchen_payments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_payment_attest_closed(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_attest_closed(uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.kitchen_payment_report_problem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_payment_report_problem(uuid, text) TO authenticated;
-- ---------------------------------------------------------------------------------------------------
-- Permessi: funzioni interne senza EXECUTE per i client; RPC staff/manager solo ad authenticated (guardia interna).
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_attempt_confirmable(public.kitchen_payments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_attempt_captured_mismatch(public.kitchen_payments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_order_payment_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_settle_unpaid_order(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_orders_food_club_on_closed_unpaid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kitchen_payments_food_club_on_attempt_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_staff_vouchers_on_hold(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_admin_release_voucher(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.food_club_staff_vouchers_on_hold(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_admin_release_voucher(text, text) TO authenticated;
