-- WALRUS FOOD CLUB V1 — Fase A: stati del checkout SumUp solo quelli documentati (solo SQL).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`).
-- Report: ai-ops/reports/food-club-local-fase-a-sb-2026-11-08.md
--
-- Difetto corretto
--  * La documentazione SumUp dei checkout (create/get/list/deactivate) elenca SOLO gli stati PENDING, FAILED, PAID,
--    EXPIRED. CANCELLED esiste solo per le transazioni (transactions[].status), non per il checkout.
--  * 20261109104000 trattava CANCELLED come stato terminale del checkout in food_club_release_eval_attempt
--    (`IN ('FAILED', 'EXPIRED', 'CANCELLED')`). Era dormiente (terminal_verified = false) ma era uno stato inventato:
--    con le regole accese due GET CANCELLED avrebbero dato not_payable.
--  * Da qui: due GET CANCELLED (o qualunque stato non documentato) -> 'uncertain' con reason 'states_not_concordant'.
--
-- Perimetro
--  * CREATE OR REPLACE della SOLA funzione food_club_release_eval_attempt, identica all'originale di 20261109104000
--    tranne la rimozione di 'CANCELLED' dai due IN degli stati terminali. Stessa firma, stesso LANGUAGE, nessun
--    SECURITY DEFINER (come l'originale), stesso search_path, stesso REVOKE. Nessun OWNER esplicito (come l'originale:
--    CREATE OR REPLACE conserva owner e ACL della funzione esistente).
--  * Nessuna funzione/trigger kitchen_* toccata. Costanti di verifica invariate (false/false/false, merchant NULL).

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
     AND e.valid_until = v_intent.valid_until
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
     AND e.valid_until = v_intent.valid_until
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

-- Permessi identici a 20261109104000 (funzione interna: nessun ruolo di API la esegue).
REVOKE ALL ON FUNCTION public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
