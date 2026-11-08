-- WALRUS FOOD CLUB V1 — Passo 3D: buoni «in verifica» (riservati su ordine annullato) — vista staff + rilascio manuale dopo 24 h.
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`).
--
-- SCOPO
--  Finché non ci sono prove sandbox SumUp (costanti di food_club_release_verified_rules() = false), il rilascio
--  automatico (20261109104000/105000) libera solo gli ordini che non hanno mai chiesto un checkout. Un buono
--  riservato su un ordine annullato/abbandonato CON checkout resta quindi bloccato, e dopo 24 h dal riferimento
--  COALESCE(sealed_at, created_at + 17 min) lo sweep smette di controllarlo. Qui:
--   1) food_club_staff_held_vouchers(venue): elenco di questi buoni per lo staff (sola lettura);
--   2) food_club_manager_resolve_held_voucher(buono, nota): il MANAGER libera a mano il buono, ma SOLO dopo 24 h
--      dal riferimento, con nota obbligatoria (>= 10 caratteri), e solo se il DB non vede alcun pagamento.
--
-- PERCHÉ MANUALE E SOLO DOPO 24 H
--  Un checkout SumUp creato per l'ordine può restare pagabile per un tempo non ancora provato in sandbox. Dopo 24 h
--  (molto oltre ogni validità attesa) il rischio di un pagamento tardivo e' minimo, ma NON nullo: per questo serve un
--  umano che controlli la dashboard SumUp e lasci una nota. Un PAID tardivo dopo il rilascio manuale passa comunque
--  da food_club_consume_on_charge (reclaim / log double_spend): quella funzione NON viene toccata.
--
-- PRINCIPI
--  * Nessuna funzione/trigger kitchen_* creata, alterata o ridefinita. Nessuna tabella nuova. Nessun CHECK sui nomi
--    evento (food_club_voucher_events.event e' text libero): niente da estendere.
--  * Transizione del buono IDENTICA al rilascio automatico: reserved -> available (o expired se scaduto), campi
--    reserved_order_id/reserved_at azzerati, evento via food_club_log_voucher, guard di transizione invariato.
--    Come nel rilascio automatico lo sconto dell'ordine annullato non viene toccato (l'ordine non e' piu' pagabile).
--  * Lock nello stesso ordine K4 delle altre funzioni: righe charge dell'ordine (ORDER BY id) -> ordine -> buono
--    -> riga sigillo. Mai un lock su una riga pagamento DOPO aver preso l'ordine. lock_timeout 2 s.
--  * Se una condizione manca: {ok:false, reason:...} senza alcuna scrittura.
--
-- ROLLBACK (manuale, solo se mai applicata): DROP FUNCTION public.food_club_manager_resolve_held_voucher(uuid, text);
--   DROP FUNCTION public.food_club_staff_held_vouchers(text);  Nessun dato da ripristinare: i buoni gia' liberati restano
--   liberati (evento 'manual_release_after_24h' nello storico).

-- ---------------------------------------------------------------------------------------------------
-- 1) Vista staff: buoni riservati su ordini annullati/abbandonati non pagati
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_staff_held_vouchers(p_venue_id text)
RETURNS TABLE (voucher_id uuid, voucher_code text, value numeric, expires_at timestamptz,
               order_id text, order_code text, order_status text, order_created_at timestamptz,
               reference_at timestamptz, hours_since_reference numeric, over_24h boolean,
               seal_checks integer, seal_last_reason text, seal_last_check_at timestamptz,
               has_succeeded_charge boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.food_club_require_staff(p_venue_id);
  RETURN QUERY
  SELECT v.id, v.code, v.value, v.expires_at,
         o.id, o.order_code, o.status, o.created_at,
         ref.at,
         round(extract(epoch FROM (now() - ref.at)) / 3600.0, 1),
         ref.at <= now() - interval '24 hours',
         s.checks, s.last_reason, s.last_check_at,
         EXISTS (SELECT 1 FROM public.kitchen_payments p
                  WHERE p.order_id = o.id AND p.direction = 'charge' AND p.status = 'succeeded')
    FROM public.food_club_vouchers v
    JOIN public.kitchen_orders o ON o.id = v.reserved_order_id
    LEFT JOIN public.food_club_release_seals s ON s.order_id = o.id
    CROSS JOIN LATERAL (SELECT COALESCE(s.sealed_at, o.created_at + interval '17 minutes') AS at) ref
   WHERE v.status = 'reserved'
     AND o.venue_id = p_venue_id
     AND o.status IN ('cancelled', 'payment_abandoned')
     AND o.payment_status IS DISTINCT FROM 'paid'
   ORDER BY ref.at, v.id;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Rilascio manuale (solo manager, solo dopo 24 h, nota obbligatoria)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_manager_resolve_held_voucher(p_voucher_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
  v_venue    text;
  v_order_id text;
  v_note     text := btrim(COALESCE(p_note, ''));
  v_locked   uuid[];
  v_now_ids  uuid[];
  v_order    public.kitchen_orders;
  v_voucher  public.food_club_vouchers;
  v_seal     public.food_club_release_seals;
  v_ref      timestamptz;
  v_to       text;
  v_rows     integer;
BEGIN
  -- 1) Lettura SENZA lock: serve solo a trovare locale e ordine. Il locale viene dalla campagna del buono.
  SELECT c.venue_id, v.reserved_order_id INTO v_venue, v_order_id
    FROM public.food_club_vouchers v JOIN public.food_club_campaigns c ON c.id = v.campaign_id
   WHERE v.id = p_voucher_id;
  IF NOT FOUND THEN
    -- Buono inesistente: risposta solo a chi e' manager di almeno un locale (nessuna sonda per anonimi/staff semplice).
    IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.kitchen_staff_members s
                                          WHERE s.user_id = auth.uid() AND s.role = 'manager') THEN
      RAISE EXCEPTION 'manager_only';
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'voucher_not_found');
  END IF;

  PERFORM public.food_club_require_staff(v_venue, true);   -- manager_only / not_staff_for_venue

  IF char_length(v_note) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'note_too_short');
  END IF;
  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved');
  END IF;

  -- 2) Lock K4: righe charge dell'ordine -> ordine -> buono -> sigillo.
  SELECT COALESCE(array_agg(s.id ORDER BY s.id), '{}'::uuid[]) INTO v_locked
    FROM (SELECT p.id FROM public.kitchen_payments p
           WHERE p.order_id = v_order_id AND p.direction = 'charge'
           ORDER BY p.id FOR UPDATE) s;
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}'::uuid[]) INTO v_now_ids
    FROM public.kitchen_payments p WHERE p.order_id = v_order_id AND p.direction = 'charge';
  IF v_now_ids IS DISTINCT FROM v_locked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payments_changed');
  END IF;
  SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = p_voucher_id FOR UPDATE;
  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = v_order_id FOR UPDATE;

  -- 3) Ricontrollo di TUTTO sotto lock. Nessuna scrittura finché una condizione manca.
  IF v_voucher.status IS DISTINCT FROM 'reserved' OR v_voucher.reserved_order_id IS DISTINCT FROM v_order_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved');
  END IF;
  IF v_order.venue_id IS DISTINCT FROM v_venue THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'venue_mismatch');
  END IF;
  IF v_order.status NOT IN ('cancelled', 'payment_abandoned') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_closed');
  END IF;
  IF v_order.payment_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_paid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.kitchen_payments p
              WHERE p.order_id = v_order_id AND p.direction = 'charge' AND p.status = 'succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'charge_succeeded');
  END IF;
  IF EXISTS (SELECT 1 FROM public.food_club_checkout_evidence e
              WHERE e.order_id = v_order_id AND upper(e.sumup_status) = 'PAID') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'paid_evidence');
  END IF;
  v_ref := COALESCE(v_seal.sealed_at, v_order.created_at + interval '17 minutes');
  IF v_ref > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early', 'reference_at', v_ref);
  END IF;

  -- 3b) Sigillo (D3): se l'ordine non ne ha uno lo creo ora, nella stessa transazione e PRIMA di liberare il buono.
  -- Il trigger food_club_seal_guard_insert (104000) rifiuta cosi' ogni nuovo incasso (anche al banco) sul vecchio ordine.
  IF v_seal.order_id IS NULL THEN
    INSERT INTO public.food_club_release_seals (order_id, voucher_id, last_reason)
    VALUES (v_order_id, v_voucher.id, 'manual_release_after_24h')
    ON CONFLICT (order_id) DO NOTHING;
    SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = v_order_id;
  END IF;

  -- 4) Transizione identica al rilascio automatico.
  v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
  UPDATE public.food_club_vouchers
     SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
   WHERE id = v_voucher.id AND status = 'reserved' AND reserved_order_id = v_order_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'food_club_manual_release_unexpected_state';
  END IF;
  PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'manual_release_after_24h', v_order_id,
    'staff', jsonb_build_object('staff_user_id', auth.uid(), 'note', v_note, 'reference_at', v_ref));
  IF v_seal.order_id IS NOT NULL THEN
    UPDATE public.food_club_release_seals
       SET checks = checks + 1, last_check_at = now(), last_reason = 'manual_release_after_24h'
     WHERE order_id = v_order_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'released', true, 'result', 'released', 'voucher_status', v_to);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Permessi (stesso schema delle RPC staff del file 103000: authenticated, mai anon)
-- ---------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.food_club_staff_held_vouchers(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.food_club_manager_resolve_held_voucher(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.food_club_staff_held_vouchers(text),
  public.food_club_manager_resolve_held_voucher(uuid, text)
  TO authenticated;
