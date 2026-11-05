-- PAGAMENTI E RIMBORSI — minimo privilegio (audit finale pre-API SumUp, 2026-11-05).
-- STATO: PROPOSTA. File FUORI da supabase/migrations/ (area protetta). Mai applicato a DB remoti.
-- Dipende da: 76 migration locali = 74 attuali + proposed 20261105104000 + 20261105105000 (Opzione C).
-- Verificato solo su stack Supabase locale con proposed/52_refund_audit.sql e harness/run-ra-local.sh.
--
-- Principio (lo stesso di OC12b): l'esito di un'operazione col provider lo attesta solo il server (service_role),
-- mai il JWT dello staff, mai una stringa scelta dal chiamante.
-- 1) kitchen_payment_refund_fail: ramo staff rimosso. Lo staff poteva dichiarare FALLITO un rimborso che SumUp
--    aveva già eseguito (RA1): ledger «pagato», timbro e buono restavano, conferma del server poi rifiutata.
--    L'app non chiama mai questa RPC con il JWT dello staff (solo api/kitchen-sumup-refund.js con service_role).
-- 2) Stato «rimborsato» e importi di kitchen_orders scrivibili solo dalle RPC (SECURITY DEFINER): la policy
--    staff_update_venue_orders permetteva UPDATE diretto di payment_status (finto rimborso, RA3; rimborso
--    annullato, RA4). L'app scrive direttamente solo status, ready_at, staff_note (useKitchenOrders.js).
--    Versione MINIMA: resta permesso l'UPDATE diretto a 'paid' (percorso coperto da RF1, RF2, OC13).
--    La versione completa (tutti i campi di pagamento) è la decisione aperta D-RA1 del report.
-- 3) GRANT: anon non esegue nessuna RPC di pagamento/rimborso; le RPC solo-server non sono eseguibili da
--    authenticated. Le guardie interne restano (doppio controllo GRANT + auth.role()).

-- 1) -------------------------------------------------------------------------------------------------
-- Identica a 20260830120000 salvo il controllo del ruolo (staff -> rifiuto; IS DISTINCT FROM: claim vuoti = rifiuto).
CREATE OR REPLACE FUNCTION public.kitchen_payment_refund_fail(
  p_refund_id uuid,
  p_reason text,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS public.kitchen_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_refund public.kitchen_payments;
BEGIN
  SELECT * INTO v_refund FROM public.kitchen_payments WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_attempt_not_found';
  END IF;

  IF v_refund.direction <> 'refund' THEN
    RAISE EXCEPTION 'not_a_refund_attempt';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF is_staff_for_venue(v_refund.venue_id) THEN
      -- Lo staff non può sapere se SumUp ha eseguito il rimborso: solo il server, dopo la risposta di SumUp.
      RAISE EXCEPTION 'staff_cannot_fail_refund';
    END IF;
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_refund.status NOT IN ('initiated', 'pending') THEN
    RAISE EXCEPTION 'invalid_refund_status';
  END IF;

  UPDATE public.kitchen_payments
  SET status = 'failed', failure_reason = p_reason, raw_last_event = p_raw_payload, updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;

  -- kitchen_orders.payment_status resta invariato: il charge originale è ancora 'paid'.

  INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, actor_id, reason)
  VALUES (v_refund.order_id, v_refund.venue_id, 'payment_refund_failed', 'system', NULL, p_reason);

  RETURN v_refund;
END;
$function$;

-- 2) -------------------------------------------------------------------------------------------------
-- SECURITY INVOKER di proposito: current_user è il ruolo che esegue l'UPDATE. Dentro una RPC SECURITY DEFINER è
-- il proprietario della funzione (postgres), in un UPDATE diretto via PostgREST è anon/authenticated.
CREATE OR REPLACE FUNCTION public.kitchen_orders_guard_payment_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
       (NEW.payment_status IS DISTINCT FROM OLD.payment_status
        AND (NEW.payment_status = 'refunded' OR OLD.payment_status = 'refunded'))
    OR NEW.total           IS DISTINCT FROM OLD.total
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount) THEN
    RAISE EXCEPTION 'payment_fields_rpc_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS kitchen_orders_guard_payment_fields ON public.kitchen_orders;
CREATE TRIGGER kitchen_orders_guard_payment_fields
  BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.kitchen_orders_guard_payment_fields();
REVOKE ALL ON FUNCTION public.kitchen_orders_guard_payment_fields() FROM PUBLIC, anon, authenticated;

-- 3) -------------------------------------------------------------------------------------------------
-- a) anon: nessuna RPC di pagamento. Il checkout del cliente usa la sessione anonima di Supabase Auth, cioè il
--    ruolo authenticated (kitchen_payment_attempt_start e kitchen_customer_create_order non sono già eseguibili da anon).
REVOKE EXECUTE ON FUNCTION public.kitchen_order_cancel(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_order_cancel_with_payment_attempt(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_close_unpaid(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_fail(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_record_cash(text, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_record_counter(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_refund(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.kitchen_order_cancel(text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_order_cancel_with_payment_attempt(text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_attempt_close_unpaid(uuid, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_fail(uuid, text, jsonb) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_record_cash(text, numeric) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_record_counter(text, text) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_refund(text, text) TO authenticated, service_role;
-- b) solo server: né anon né authenticated (oggi la guardia interna usa `<>`, che con claim vuoti non scatta).
--    kitchen_payment_fail resta ad authenticated solo perché OC14 verifica il messaggio staff_cannot_fail_payment_use_report.
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_claim_checkout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_attempt_set_provider_ref(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_refund_claim_provider_call(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_refund_confirm(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_webhook_ingest(text, text, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kitchen_payment_refund_fail(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_attempt_claim_checkout(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_attempt_set_provider_ref(uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_refund_claim_provider_call(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_refund_confirm(uuid, text, jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_webhook_ingest(text, text, boolean, jsonb) TO service_role;
GRANT  EXECUTE ON FUNCTION public.kitchen_payment_refund_fail(uuid, text, jsonb) TO service_role;
