-- WALRUS FOOD CLUB V1 — EXPIRED dopo DELETE SumUp: valid_until anticipato accettato solo per EXPIRED (solo SQL).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`).
-- Stato: ai-ops/current/FOOD_CLUB_LOCAL_NO_SANDBOX.md (fix valid_until dopo DELETE, 2026-11-21).
--
-- Difetto corretto
--  * Sandbox SumUp SB-4 (VERIFICATO 2026-11-21): la DELETE di un checkout (deactivateAndVerify, flussi
--    close-for-counter e cancel-with-payment-check) lo mette EXPIRED e RISCRIVE valid_until all'istante della
--    cancellazione (con 9 decimali). La doppia GET legata richiedeva `e.valid_until = v_intent.valid_until` esatto:
--    ogni checkout disattivato restava 'uncertain:get_missing_or_unbound' e il buono trattenuto per sempre.
--  * Da qui una GET e' legata anche se: status EXPIRED (case-insensitive, come i due IN terminali) e valid_until
--    PRIMA di quello dell'intento e NON prima di created_at dell'attempt. FAILED/PENDING/PAID: uguaglianza esatta
--    come prima; EXPIRED con valid_until dopo l'intento o prima della creazione dell'attempt: non legata.
--  * Le soglie del verdetto restano sul valid_until dell'INTENTO (PENDING oltre scadenza), non su quello della GET.
--
-- Perimetro
--  * CREATE OR REPLACE della SOLA funzione food_club_release_eval_attempt, identica a 20261109108000 tranne le due
--    condizioni su valid_until delle GET (v_a, v_b). Stessa firma, LANGUAGE, nessun SECURITY DEFINER, stesso
--    search_path, stesso REVOKE, nessun OWNER esplicito. Costanti di verifica invariate (false/false/false, merchant NULL).

-- ---------------------------------------------------------------------------------------------------
-- 8) Verdetto di un singolo attempt (interno: lo chiama solo il rilascio, sotto i suoi lock)
-- ---------------------------------------------------------------------------------------------------
-- Ritorna {verdict: ignored|not_payable|paid|uncertain, reason, evidence_ids[]}.
CREATE OR REPLACE FUNCTION public.food_club_release_eval_attempt(p_attempt public.kitchen_payments, p_sealed_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rules    record;
  v_merchant text := public.food_club_expected_merchant_code();
  v_intent   public.food_club_checkout_intents;
  v_has_int  boolean;
  v_list     public.food_club_checkout_evidence;
  v_a        public.food_club_checkout_evidence;
  v_b        public.food_club_checkout_evidence;
  v_cid      text;
  v_paid_ids bigint[];
BEGIN
  IF p_attempt.provider IN ('cash', 'manual') THEN
    RETURN jsonb_build_object('verdict', 'ignored', 'reason', 'counter_provider', 'evidence_ids', '[]'::jsonb);
  END IF;
  IF p_attempt.provider IS DISTINCT FROM 'sumup' THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'unknown_provider', 'evidence_ids', '[]'::jsonb);
  END IF;
  SELECT * INTO v_rules FROM public.food_club_release_verified_rules();

  -- Un PAID in qualunque evidenza dell'attempt chiude la questione: nessun rilascio.
  SELECT array_agg(e.id ORDER BY e.id) INTO v_paid_ids
    FROM public.food_club_checkout_evidence e
   WHERE e.attempt_id = p_attempt.id AND upper(e.sumup_status) = 'PAID';
  IF v_paid_ids IS NOT NULL THEN
    RETURN jsonb_build_object('verdict', 'paid', 'reason', 'paid_evidence', 'evidence_ids', to_jsonb(v_paid_ids));
  END IF;

  SELECT * INTO v_intent FROM public.food_club_checkout_intents WHERE attempt_id = p_attempt.id;
  v_has_int := FOUND;

  -- P-A: mai richiesto un checkout. checkout_claim_at letto sotto lock; nessuno lo azzera dopo averlo valorizzato e
  -- la POST di creazione avviene solo dopo una claim riuscita; dopo il sigillo la claim è impossibile (trigger B).
  IF p_attempt.provider_ref IS NULL AND p_attempt.checkout_claim_at IS NULL THEN
    IF v_has_int THEN
      RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'intent_without_claim', 'evidence_ids', '[]'::jsonb);
    END IF;
    RETURN jsonb_build_object('verdict', 'not_payable', 'reason', 'never_requested', 'evidence_ids', '[]'::jsonb);
  END IF;

  -- P-B / P-C: serve l'intento registrato prima della POST.
  IF NOT v_has_int THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'no_intent', 'evidence_ids', '[]'::jsonb);
  END IF;

  -- List fresca (dopo sigillo + 60 s, non più vecchia di 120 s), HTTP 200: la più recente.
  SELECT * INTO v_list FROM public.food_club_checkout_evidence e
   WHERE e.attempt_id = p_attempt.id AND e.kind = 'list' AND e.http_status = 200
     AND e.fetched_at >= p_sealed_at + interval '60 seconds'
     AND e.fetched_at >= now() - interval '120 seconds'
   ORDER BY e.fetched_at DESC, e.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'list_missing_or_stale', 'evidence_ids', '[]'::jsonb);
  END IF;

  IF p_attempt.provider_ref IS NULL THEN
    -- P-C: claim fatta ma esito della POST ignoto.
    IF v_list.list_count = 0 THEN
      IF v_rules.list_verified AND v_rules.valid_until_verified
         AND v_intent.valid_until <= now() - interval '2 minutes' THEN
        RETURN jsonb_build_object('verdict', 'not_payable', 'reason', 'list_empty_after_valid_until',
                                  'evidence_ids', jsonb_build_array(v_list.id));
      END IF;
      RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'list_empty_rules_off_or_too_early',
                                'evidence_ids', jsonb_build_array(v_list.id));
    ELSIF v_list.list_count = 1 AND v_list.checkout_id IS NOT NULL THEN
      v_cid := v_list.checkout_id; -- si tratta come P-B con il checkout trovato dalla List
    ELSE
      RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'list_unexpected_count',
                                'evidence_ids', jsonb_build_array(v_list.id));
    END IF;
  ELSE
    -- P-B: la List deve avere esattamente 1 risultato = provider_ref.
    IF v_list.list_count IS DISTINCT FROM 1 OR v_list.checkout_id IS DISTINCT FROM p_attempt.provider_ref THEN
      RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'list_mismatch',
                                'evidence_ids', jsonb_build_array(v_list.id));
    END IF;
    v_cid := p_attempt.provider_ref;
  END IF;

  -- Doppia GET legata: reference = attempt, checkout_id, importo, EUR, merchant atteso (NULL -> mai), valid_until
  -- dell'intento; HTTP 200; dopo sigillo + 60 s. La più recente deve essere fresca; la precedente ≥ 60 s prima.
  SELECT * INTO v_a FROM public.food_club_checkout_evidence e
   WHERE e.attempt_id = p_attempt.id AND e.kind = 'get' AND e.http_status = 200
     AND e.fetched_at >= p_sealed_at + interval '60 seconds'
     AND e.checkout_reference = p_attempt.id::text AND e.checkout_id = v_cid
     AND e.amount = p_attempt.amount AND e.currency = 'EUR' AND e.merchant_code = v_merchant
     AND (e.valid_until = v_intent.valid_until
          OR (upper(e.sumup_status) = 'EXPIRED' AND e.valid_until < v_intent.valid_until
              AND e.valid_until >= p_attempt.created_at))
   ORDER BY e.fetched_at DESC, e.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'get_missing_or_unbound',
                              'evidence_ids', jsonb_build_array(v_list.id));
  END IF;
  IF v_a.fetched_at < now() - interval '120 seconds' THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'get_stale',
                              'evidence_ids', jsonb_build_array(v_list.id, v_a.id));
  END IF;
  SELECT * INTO v_b FROM public.food_club_checkout_evidence e
   WHERE e.attempt_id = p_attempt.id AND e.kind = 'get' AND e.http_status = 200
     AND e.fetched_at >= p_sealed_at + interval '60 seconds'
     AND e.fetched_at <= v_a.fetched_at - interval '60 seconds'
     AND e.checkout_reference = p_attempt.id::text AND e.checkout_id = v_cid
     AND e.amount = p_attempt.amount AND e.currency = 'EUR' AND e.merchant_code = v_merchant
     AND (e.valid_until = v_intent.valid_until
          OR (upper(e.sumup_status) = 'EXPIRED' AND e.valid_until < v_intent.valid_until
              AND e.valid_until >= p_attempt.created_at))
   ORDER BY e.fetched_at DESC, e.id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'second_get_missing',
                              'evidence_ids', jsonb_build_array(v_list.id, v_a.id));
  END IF;

  IF upper(v_a.sumup_status) = 'PENDING' AND upper(v_b.sumup_status) = 'PENDING'
     AND v_intent.valid_until <= v_b.fetched_at - interval '2 minutes' THEN
    IF v_rules.valid_until_verified THEN
      RETURN jsonb_build_object('verdict', 'not_payable', 'reason', 'pending_after_valid_until',
                                'evidence_ids', jsonb_build_array(v_list.id, v_a.id, v_b.id));
    END IF;
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'valid_until_rule_not_verified',
                              'evidence_ids', jsonb_build_array(v_list.id, v_a.id, v_b.id));
  ELSIF upper(v_a.sumup_status) IN ('FAILED', 'EXPIRED')
        AND upper(v_b.sumup_status) IN ('FAILED', 'EXPIRED') THEN
    IF v_rules.terminal_verified THEN
      RETURN jsonb_build_object('verdict', 'not_payable', 'reason', 'terminal_state',
                                'evidence_ids', jsonb_build_array(v_list.id, v_a.id, v_b.id));
    END IF;
    RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'terminal_rule_not_verified',
                              'evidence_ids', jsonb_build_array(v_list.id, v_a.id, v_b.id));
  END IF;
  RETURN jsonb_build_object('verdict', 'uncertain', 'reason', 'states_not_concordant',
                            'evidence_ids', jsonb_build_array(v_list.id, v_a.id, v_b.id));
END;
$$;

-- Permessi identici a 20261109104000/108000 (funzione interna: nessun ruolo di API la esegue).
REVOKE ALL ON FUNCTION public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
