-- WALRUS FOOD CLUB V1 — Passo 3A: restituzione sicura del buono dopo annullo/abbandono con checkout SumUp (solo SQL).
-- File versionato: NON applicato a produzione. Applicazione = gate di Eros (`npx supabase db push --linked`).
-- Riferimenti: ai-ops/reports/food-club-passo3-piano-2026-11-08.md e food-club-passo3-integrazione-2026-11-08.md
-- (l'integrazione prevale sul piano).
--
-- Principi
--  * NESSUNA funzione/trigger kitchen_* viene creata, alterata o ridefinita. Il Club si aggancia con trigger Club
--    (prefisso food_club_) su kitchen_payments; nessun trigger su kitchen_orders.
--  * Flusso in tre tempi: SIGILLO (da created_at + 17 min: sull'ordine non nascono più claim/attempt SumUp) ->
--    PROVE (evidenze SumUp registrate dal server con orario del DB, dopo sigillo + 60 s) -> RILASCIO (il DB rilegge
--    tutto sotto lock e CALCOLA il verdetto; la RPC non riceve verdetti).
--  * Il buono torna disponibile solo se OGNI riga charge dell'ordine ha una prova positiva di "non pagabile".
--    Nel dubbio resta RISERVATO (stato sicuro: lo staff lo libera a mano come oggi).
--  * Le regole che dipendono dalla sandbox SumUp nascono SPENTE: food_club_release_verified_rules() = false/false/false
--    e food_club_expected_merchant_code() = NULL. Cambiarle = nuova migration = gate di Eros dopo SB-1..SB-7.
--    Con le costanti spente l'unico rilascio possibile è P-A (mai richiesto un checkout: prova solo-DB).
--  * Tabelle nuove: solo SECURITY DEFINER può scrivere (anche service_role non ha INSERT/UPDATE/DELETE). Orari
--    (sealed_at, fetched_at, recorded_at) sempre dal DB. Append-only con trigger, anche contro il superuser.
--  * Lock ovunque nell'ordine K4: righe charge dell'ordine (ORDER BY id) -> riga ordine -> buono -> riga sigillo.
--    Mai un lock su una riga pagamento DOPO aver preso l'ordine. lock_timeout 2 s: se Kitchen tiene un lock è il
--    Club a rinunciare (errore lock_not_available), mai Kitchen ad aspettare un rilascio.
--  * Le funzioni trigger sono VOLATILE: in READ COMMITTED ogni query interna prende uno snapshot nuovo e vede un
--    sigillo committato da un'altra transazione durante l'attesa del lock di riga.
--  * Nessun DELETE su kitchen_orders/kitchen_payments in nessuna migration, funzione o API (verificato per grep): le
--    FK ON DELETE CASCADE delle tabelle nuove non sono mai esercitate da Kitchen; il trigger le lascia passare
--    (pg_trigger_depth() > 1) per non bloccare la cancellazione di un account (auth.users -> buoni -> sigilli).
--
-- Verificato nel codice (non dedotto): checkout_claim_at è assegnato solo con `= now()` (due soli punti, entrambi
-- in kitchen_payment_attempt_claim_checkout) e nessuno lo riporta a NULL; l'unica POST di creazione checkout SumUp
-- in api/ è api/kitchen-sumup-create-checkout.js. Per questo P-A (claim NULL e provider_ref NULL) è una prova solo-DB.

-- ---------------------------------------------------------------------------------------------------
-- 1) Costanti di verifica (spente) — nessun GUC/parametro le può cambiare
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_release_verified_rules()
RETURNS TABLE (valid_until_verified boolean, terminal_verified boolean, list_verified boolean)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT false, false, false $$;

CREATE OR REPLACE FUNCTION public.food_club_expected_merchant_code()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT NULL::text $$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Tabelle
-- ---------------------------------------------------------------------------------------------------
-- Sigillo: una riga per ordine. Dal sigillo in poi sull'ordine non nascono claim né attempt SumUp.
CREATE TABLE IF NOT EXISTS public.food_club_release_seals (
  order_id      text PRIMARY KEY REFERENCES public.kitchen_orders(id) ON DELETE CASCADE,
  voucher_id    uuid NOT NULL REFERENCES public.food_club_vouchers(id) ON DELETE CASCADE,
  sealed_at     timestamptz NOT NULL DEFAULT now(),
  checks        integer NOT NULL DEFAULT 0 CHECK (checks >= 0),
  last_check_at timestamptz,
  last_reason   text
);

-- Intento registrato PRIMA della POST di creazione checkout (usato dal Passo 3B; in 3A nessuna API lo chiama).
CREATE TABLE IF NOT EXISTS public.food_club_checkout_intents (
  attempt_id  uuid PRIMARY KEY REFERENCES public.kitchen_payments(id) ON DELETE CASCADE,
  order_id    text NOT NULL,
  valid_until timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS food_club_checkout_intents_order ON public.food_club_checkout_intents (order_id);

-- Evidenze normalizzate di SumUp (GET checkout / List per checkout_reference). Nessun dato carta né personale.
CREATE TABLE IF NOT EXISTS public.food_club_checkout_evidence (
  id                 bigserial PRIMARY KEY,
  order_id           text NOT NULL,
  attempt_id         uuid NOT NULL REFERENCES public.kitchen_payments(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('get', 'list')),
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  http_status        integer,
  checkout_id        text,
  checkout_reference text,
  sumup_status       text,
  amount             numeric(10,2),
  currency           text,
  merchant_code      text,
  valid_until        timestamptz,
  list_count         integer,
  body_sha256        text CHECK (body_sha256 IS NULL OR body_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS food_club_checkout_evidence_attempt ON public.food_club_checkout_evidence (attempt_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS food_club_checkout_evidence_order ON public.food_club_checkout_evidence (order_id);

ALTER TABLE public.food_club_release_seals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_checkout_intents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_club_checkout_evidence ENABLE ROW LEVEL SECURITY;

-- Nessuna policy: né anon né authenticated né (con RLS) altri ruoli senza BYPASSRLS leggono qualcosa.
REVOKE ALL ON public.food_club_release_seals, public.food_club_checkout_intents, public.food_club_checkout_evidence
  FROM PUBLIC, anon, authenticated;
-- Supabase concede ALL a service_role sulle tabelle nuove: tolgo ogni scrittura. Scrive solo il SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.food_club_release_seals, public.food_club_checkout_intents, public.food_club_checkout_evidence
  FROM service_role;
GRANT SELECT ON public.food_club_release_seals, public.food_club_checkout_intents, public.food_club_checkout_evidence
  TO service_role;
REVOKE ALL ON SEQUENCE public.food_club_checkout_evidence_id_seq FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- 3) Immutabilità / append-only (valgono anche per il superuser: i trigger scattano sempre)
-- ---------------------------------------------------------------------------------------------------
-- Sigilli: UPDATE solo di checks / last_check_at / last_reason. DELETE: solo a cascata da FK (profondità trigger > 1)
-- oppure sigilli con più di 90 giorni il cui buono non è più riservato su quell'ordine.
CREATE OR REPLACE FUNCTION public.food_club_release_seals_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.voucher_id IS DISTINCT FROM OLD.voucher_id
       OR NEW.sealed_at IS DISTINCT FROM OLD.sealed_at THEN
      RAISE EXCEPTION 'food_club_release_seal_immutable';
    END IF;
    IF NEW.checks < OLD.checks THEN
      RAISE EXCEPTION 'food_club_release_seal_immutable';
    END IF;
    RETURN NEW;
  END IF;
  -- DELETE
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- cascata da FK (ordine, buono)
  IF OLD.sealed_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v
                      WHERE v.status = 'reserved' AND v.reserved_order_id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'food_club_release_seal_immutable';
END;
$$;
DROP TRIGGER IF EXISTS food_club_release_seals_guard ON public.food_club_release_seals;
CREATE TRIGGER food_club_release_seals_guard
  BEFORE UPDATE OR DELETE ON public.food_club_release_seals
  FOR EACH ROW EXECUTE FUNCTION public.food_club_release_seals_guard();

-- Evidenze e intenti: append-only. DELETE solo a cascata da FK, oppure righe con più di 90 giorni il cui buono non è
-- più riservato su quell'ordine (una prova necessaria a un buono riservato non si cancella mai).
CREATE OR REPLACE FUNCTION public.food_club_release_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'food_club_release_append_only';
  END IF;
  IF pg_trigger_depth() > 1 THEN RETURN OLD; END IF; -- cascata da FK (pagamento)
  v_ts := CASE TG_TABLE_NAME
            WHEN 'food_club_checkout_evidence' THEN (to_jsonb(OLD) ->> 'fetched_at')::timestamptz
            WHEN 'food_club_checkout_intents'  THEN (to_jsonb(OLD) ->> 'recorded_at')::timestamptz
          END;
  IF v_ts < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v
                      WHERE v.status = 'reserved' AND v.reserved_order_id = OLD.order_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'food_club_release_append_only';
END;
$$;
DROP TRIGGER IF EXISTS food_club_checkout_evidence_guard ON public.food_club_checkout_evidence;
CREATE TRIGGER food_club_checkout_evidence_guard
  BEFORE UPDATE OR DELETE ON public.food_club_checkout_evidence
  FOR EACH ROW EXECUTE FUNCTION public.food_club_release_append_only_guard();
DROP TRIGGER IF EXISTS food_club_checkout_intents_guard ON public.food_club_checkout_intents;
CREATE TRIGGER food_club_checkout_intents_guard
  BEFORE UPDATE OR DELETE ON public.food_club_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.food_club_release_append_only_guard();

-- ---------------------------------------------------------------------------------------------------
-- 4) Trigger Club di chiusura su kitchen_payments (nessuna funzione Kitchen toccata)
-- ---------------------------------------------------------------------------------------------------
-- A: QUALSIASI nuovo charge (SumUp, cash, manual) su un ordine sigillato -> rifiutato: dopo il sigillo il buono torna al
-- cliente e un incasso al banco sul vecchio ordine gia' scontato sarebbe un doppio sconto. B: nuova claim del checkout su un ordine sigillato ->
-- rifiutata (un no-op silenzioso sarebbe pericoloso: la claim tornerebbe la riga e create-checkout chiamerebbe SumUp).
-- Nessun lock: una sola SELECT per chiave primaria sul sigillo. Il trigger e' solo BEFORE INSERT: un PAID tardivo su un attempt SumUp ESISTENTE (UPDATE) passa ancora da confirm. Non toccano confirm, refund, fail,
-- switch, mark_payment_abandoned, privacy (nessuno di questi inserisce charge SumUp o valorizza checkout_claim_at).
CREATE OR REPLACE FUNCTION public.food_club_seal_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.food_club_release_seals s WHERE s.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'food_club_order_sealed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS food_club_seal_guard_insert ON public.kitchen_payments;
CREATE TRIGGER food_club_seal_guard_insert
  BEFORE INSERT ON public.kitchen_payments
  FOR EACH ROW
  WHEN (NEW.direction = 'charge')
  EXECUTE FUNCTION public.food_club_seal_guard_insert();

CREATE OR REPLACE FUNCTION public.food_club_seal_guard_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.food_club_release_seals s WHERE s.order_id = NEW.order_id) THEN
    RAISE EXCEPTION 'food_club_order_sealed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS food_club_seal_guard_claim ON public.kitchen_payments;
CREATE TRIGGER food_club_seal_guard_claim
  BEFORE UPDATE OF checkout_claim_at ON public.kitchen_payments
  FOR EACH ROW
  WHEN (NEW.checkout_claim_at IS DISTINCT FROM OLD.checkout_claim_at AND NEW.checkout_claim_at IS NOT NULL)
  EXECUTE FUNCTION public.food_club_seal_guard_claim();

-- ---------------------------------------------------------------------------------------------------
-- 5) RPC: sigillo
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_seal_order_for_release(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
  v_locked  uuid[];
  v_now_ids uuid[];
  v_order   public.kitchen_orders;
  v_voucher public.food_club_vouchers;
  v_seal    public.food_club_release_seals;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  -- Idempotenza veloce, senza lock.
  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_sealed', true, 'sealed_at', v_seal.sealed_at,
                              'voucher_id', v_seal.voucher_id);
  END IF;

  -- Lock K4: 1) righe charge dell'ordine in ordine di id; 2) ordine; 3) buono; 4) sigillo.
  SELECT COALESCE(array_agg(s.id ORDER BY s.id), '{}'::uuid[]) INTO v_locked
    FROM (SELECT p.id FROM public.kitchen_payments p
           WHERE p.order_id = p_order_id AND p.direction = 'charge'
           ORDER BY p.id FOR UPDATE) s;
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;
  -- Dopo il lock dell'ordine l'insieme dei charge deve essere quello bloccato (attempt_start tiene l'ordine mentre inserisce).
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}'::uuid[]) INTO v_now_ids
    FROM public.kitchen_payments p WHERE p.order_id = p_order_id AND p.direction = 'charge';
  IF v_now_ids IS DISTINCT FROM v_locked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payments_changed');
  END IF;

  -- Sigillo creato da un'altra transazione durante l'attesa dei lock.
  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_sealed', true, 'sealed_at', v_seal.sealed_at,
                              'voucher_id', v_seal.voucher_id);
  END IF;

  IF v_order.status NOT IN ('cancelled', 'payment_abandoned') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_open');
  END IF;
  IF v_order.payment_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_paid');
  END IF;
  IF now() < v_order.created_at + interval '17 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_early');
  END IF;
  IF EXISTS (SELECT 1 FROM public.kitchen_payments p
              WHERE p.order_id = p_order_id AND p.direction = 'charge' AND p.status = 'succeeded') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'charge_succeeded');
  END IF;

  SELECT * INTO v_voucher FROM public.food_club_vouchers
   WHERE reserved_order_id = p_order_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_reserved_voucher');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                  WHERE e.voucher_id = v_voucher.id AND e.order_id = p_order_id
                    AND e.event = 'held_until_checkout_expiry') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_hold_event');
  END IF;
  -- Claim viva (TTL 20 s): una POST di creazione checkout potrebbe essere in corso. Qualunque stato della riga
  -- (più prudente del solo initiated/pending della specifica).
  IF EXISTS (SELECT 1 FROM public.kitchen_payments p
              WHERE p.order_id = p_order_id AND p.direction = 'charge'
                AND p.checkout_claim_at > now() - interval '20 seconds') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_in_progress');
  END IF;

  -- sealed_at = orario reale (clock_timestamp), non l'inizio transazione: l'attesa dei lock non accorcia i 60 s.
  INSERT INTO public.food_club_release_seals (order_id, voucher_id, sealed_at)
  VALUES (p_order_id, v_voucher.id, clock_timestamp())
  ON CONFLICT (order_id) DO NOTHING
  RETURNING * INTO v_seal;
  IF v_seal.order_id IS NULL THEN
    SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', true, 'already_sealed', true, 'sealed_at', v_seal.sealed_at,
                              'voucher_id', v_seal.voucher_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'already_sealed', false, 'sealed_at', v_seal.sealed_at,
                            'voucher_id', v_seal.voucher_id);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6) RPC: intento pre-POST (il Passo 3B lo chiamerà dall'API; qui nessuna API lo usa)
-- ---------------------------------------------------------------------------------------------------
-- valid_until = created_at dell'ordine + 15 min, calcolato nel DB e troncato al secondo (un formato senza frazioni
-- sopravvive all'andata e ritorno con SumUp: l'uguaglianza esatta dei legami altrimenti non reggerebbe mai).
CREATE OR REPLACE FUNCTION public.food_club_record_checkout_intent(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
  v_pay    public.kitchen_payments;
  v_order  public.kitchen_orders;
  v_intent public.food_club_checkout_intents;
  v_valid  timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  -- Unico lock: la riga dell'attempt. Niente altri lock su pagamenti; ordine e sigillo letti senza lock
  -- (il sigillo prende comunque la riga dell'attempt per prima e ci serializza).
  SELECT * INTO v_pay FROM public.kitchen_payments WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_found'; END IF;

  SELECT * INTO v_intent FROM public.food_club_checkout_intents WHERE attempt_id = p_attempt_id;
  IF FOUND THEN
    RETURN jsonb_build_object('valid_until', to_char(v_intent.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                              'already_recorded', true);
  END IF;

  IF v_pay.direction IS DISTINCT FROM 'charge' OR v_pay.provider IS DISTINCT FROM 'sumup' THEN
    RAISE EXCEPTION 'attempt_not_sumup_charge';
  END IF;
  IF v_pay.checkout_claim_at IS NULL THEN RAISE EXCEPTION 'claim_missing'; END IF;
  IF v_pay.provider_ref IS NOT NULL THEN RAISE EXCEPTION 'provider_ref_present'; END IF;
  IF EXISTS (SELECT 1 FROM public.food_club_release_seals s WHERE s.order_id = v_pay.order_id) THEN
    RAISE EXCEPTION 'food_club_order_sealed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v
                  WHERE v.status = 'reserved' AND v.reserved_order_id = v_pay.order_id) THEN
    RAISE EXCEPTION 'no_reserved_voucher';
  END IF;
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = v_pay.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF now() >= v_order.created_at + interval '15 minutes' THEN
    RAISE EXCEPTION 'intent_too_late';
  END IF;

  v_valid := date_trunc('second', v_order.created_at + interval '15 minutes');
  INSERT INTO public.food_club_checkout_intents (attempt_id, order_id, valid_until)
  VALUES (p_attempt_id, v_pay.order_id, v_valid)
  ON CONFLICT (attempt_id) DO NOTHING;
  SELECT * INTO v_intent FROM public.food_club_checkout_intents WHERE attempt_id = p_attempt_id;
  RETURN jsonb_build_object('valid_until', to_char(v_intent.valid_until AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                            'already_recorded', false);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 7) RPC: registrazione evidenze (campi grezzi in whitelist, mai verdetti)
-- ---------------------------------------------------------------------------------------------------
-- Validazione tipi: un cast fallito -> eccezione 'evidence_bad_field'. Campi extra ignorati.
CREATE OR REPLACE FUNCTION public.food_club_evidence_normalize(p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_key text;
  v_val jsonb;
  v_num numeric;
  v_ts  timestamptz;
BEGIN
  IF p_fields IS NULL OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'evidence_bad_field: fields non e'' un oggetto';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_fields) LOOP
    IF v_key NOT IN ('http_status', 'checkout_id', 'checkout_reference', 'sumup_status', 'amount', 'currency',
                     'merchant_code', 'valid_until', 'list_count', 'body_sha256') THEN
      CONTINUE; -- campo extra: ignorato
    END IF;
    v_val := p_fields -> v_key;
    IF jsonb_typeof(v_val) = 'null' THEN CONTINUE; END IF;
    IF v_key IN ('http_status', 'list_count') THEN
      IF jsonb_typeof(v_val) <> 'number' THEN RAISE EXCEPTION 'evidence_bad_field: %', v_key; END IF;
      v_num := (v_val #>> '{}')::numeric;
      IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 100000 THEN RAISE EXCEPTION 'evidence_bad_field: %', v_key; END IF;
      v_out := v_out || jsonb_build_object(v_key, v_num::integer);
    ELSIF v_key = 'amount' THEN
      IF jsonb_typeof(v_val) <> 'number' THEN RAISE EXCEPTION 'evidence_bad_field: %', v_key; END IF;
      v_num := (v_val #>> '{}')::numeric;
      IF v_num < 0 OR v_num >= 100000000 OR round(v_num, 2) <> v_num THEN RAISE EXCEPTION 'evidence_bad_field: %', v_key; END IF;
      v_out := v_out || jsonb_build_object(v_key, v_num);
    ELSIF v_key = 'valid_until' THEN
      IF jsonb_typeof(v_val) <> 'string' THEN RAISE EXCEPTION 'evidence_bad_field: %', v_key; END IF;
      BEGIN
        v_ts := (v_val #>> '{}')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'evidence_bad_field: %', v_key;
      END;
      v_out := v_out || jsonb_build_object(v_key, v_ts);
    ELSIF v_key = 'body_sha256' THEN
      IF jsonb_typeof(v_val) <> 'string' OR (v_val #>> '{}') !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'evidence_bad_field: %', v_key;
      END IF;
      v_out := v_out || jsonb_build_object(v_key, v_val);
    ELSE -- checkout_id, checkout_reference, sumup_status, currency, merchant_code: stringhe brevi
      IF jsonb_typeof(v_val) <> 'string' OR char_length(v_val #>> '{}') > 200 THEN
        RAISE EXCEPTION 'evidence_bad_field: %', v_key;
      END IF;
      v_out := v_out || jsonb_build_object(v_key, v_val);
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.food_club_record_checkout_evidence(p_attempt_id uuid, p_kind text, p_fields jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
  v_pay  public.kitchen_payments;
  v_seal public.food_club_release_seals;
  v_n    jsonb;
  v_id   bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('get', 'list') THEN RAISE EXCEPTION 'evidence_bad_kind'; END IF;
  SELECT * INTO v_pay FROM public.kitchen_payments WHERE id = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
  IF v_pay.direction IS DISTINCT FROM 'charge' THEN RAISE EXCEPTION 'attempt_not_charge'; END IF;
  -- order_id preso dal DB, mai dal chiamante.
  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = v_pay.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_sealed'; END IF;
  IF now() < v_seal.sealed_at + interval '60 seconds' THEN RAISE EXCEPTION 'evidence_too_early'; END IF;
  v_n := public.food_club_evidence_normalize(p_fields);
  INSERT INTO public.food_club_checkout_evidence
    (order_id, attempt_id, kind, http_status, checkout_id, checkout_reference, sumup_status, amount, currency,
     merchant_code, valid_until, list_count, body_sha256)
  VALUES
    (v_pay.order_id, p_attempt_id, p_kind, (v_n ->> 'http_status')::integer, v_n ->> 'checkout_id',
     v_n ->> 'checkout_reference', v_n ->> 'sumup_status', (v_n ->> 'amount')::numeric, v_n ->> 'currency',
     v_n ->> 'merchant_code', (v_n ->> 'valid_until')::timestamptz, (v_n ->> 'list_count')::integer,
     v_n ->> 'body_sha256')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

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
  ELSIF upper(v_a.sumup_status) IN ('FAILED', 'EXPIRED', 'CANCELLED')
        AND upper(v_b.sumup_status) IN ('FAILED', 'EXPIRED', 'CANCELLED') THEN
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

-- ---------------------------------------------------------------------------------------------------
-- 9) RPC: rilascio del buono dopo le evidenze
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_release_voucher_after_evidence(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET lock_timeout = '2s'
SET statement_timeout = '5s'
AS $$
DECLARE
  v_seal     public.food_club_release_seals;
  v_locked   uuid[];
  v_now_ids  uuid[];
  v_order    public.kitchen_orders;
  v_voucher  public.food_club_vouchers;
  v_pay      public.kitchen_payments;
  v_res      jsonb;
  v_verdicts jsonb := '[]'::jsonb;
  v_ev_ids   jsonb := '[]'::jsonb;
  v_n_ok     integer := 0;
  v_any_paid boolean := false;
  v_unc      text := NULL;
  v_released integer;
  v_to       text;
  v_reason   text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;

  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_sealed');
  END IF;

  -- Lock K4: 1) righe charge; 2) ordine; 3) buono; 4) sigillo.
  SELECT COALESCE(array_agg(s.id ORDER BY s.id), '{}'::uuid[]) INTO v_locked
    FROM (SELECT p.id FROM public.kitchen_payments p
           WHERE p.order_id = p_order_id AND p.direction = 'charge'
           ORDER BY p.id FOR UPDATE) s;
  SELECT * INTO v_order FROM public.kitchen_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}'::uuid[]) INTO v_now_ids
    FROM public.kitchen_payments p WHERE p.order_id = p_order_id AND p.direction = 'charge';
  IF v_now_ids IS DISTINCT FROM v_locked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payments_changed');
  END IF;

  SELECT * INTO v_voucher FROM public.food_club_vouchers WHERE id = v_seal.voucher_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'voucher_not_found');
  END IF;
  SELECT * INTO v_seal FROM public.food_club_release_seals WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_sealed');
  END IF;

  -- Buono già altrove: nessuna scrittura (idempotenza, rilascio doppio in parallelo, PAID tardivo già consumato).
  IF v_voucher.status = 'used' THEN
    RETURN jsonb_build_object('ok', true, 'released', false, 'result', 'already_used');
  END IF;
  IF v_voucher.status <> 'reserved' OR v_voucher.reserved_order_id IS DISTINCT FROM p_order_id THEN
    RETURN jsonb_build_object('ok', true, 'released', false, 'result', 'already_released');
  END IF;

  -- Condizioni del sigillo, ricontrollate sotto lock.
  IF v_order.status NOT IN ('cancelled', 'payment_abandoned') THEN
    v_reason := 'order_not_closed';
  ELSIF v_order.payment_status IS NOT DISTINCT FROM 'paid' THEN
    v_reason := 'order_paid';
  ELSIF EXISTS (SELECT 1 FROM public.kitchen_payments p
                 WHERE p.order_id = p_order_id AND p.direction = 'charge' AND p.status = 'succeeded') THEN
    v_reason := 'charge_succeeded';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.food_club_release_seals
       SET checks = checks + 1, last_check_at = now(), last_reason = v_reason WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason);
  END IF;

  -- Verdetto per OGNI riga charge, calcolato qui dall'SQL.
  FOR v_pay IN SELECT * FROM public.kitchen_payments p
                WHERE p.order_id = p_order_id AND p.direction = 'charge' ORDER BY p.id LOOP
    v_res := public.food_club_release_eval_attempt(v_pay, v_seal.sealed_at);
    v_verdicts := v_verdicts || jsonb_build_array(jsonb_build_object(
      'attempt_id', v_pay.id, 'verdict', v_res ->> 'verdict', 'reason', v_res ->> 'reason'));
    v_ev_ids := v_ev_ids || COALESCE(v_res -> 'evidence_ids', '[]'::jsonb);
    CASE v_res ->> 'verdict'
      WHEN 'not_payable' THEN v_n_ok := v_n_ok + 1;
      WHEN 'ignored' THEN NULL;
      WHEN 'paid' THEN v_any_paid := true;
      ELSE v_unc := COALESCE(v_unc, v_res ->> 'reason');
    END CASE;
  END LOOP;

  IF v_any_paid THEN
    v_reason := 'paid_evidence';
  ELSIF v_unc IS NOT NULL THEN
    v_reason := 'uncertain:' || v_unc;
  ELSIF v_n_ok = 0 THEN
    v_reason := 'no_payment_proof';
  END IF;
  IF v_reason IS NOT NULL THEN
    UPDATE public.food_club_release_seals
       SET checks = checks + 1, last_check_at = now(), last_reason = v_reason WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', true, 'released', false, 'result', 'not_released', 'reason', v_reason,
                              'verdicts', v_verdicts);
  END IF;

  -- Tetto giornaliero: al massimo 20 rilasci automatici nelle ultime 24 h (serializzati da un advisory lock).
  PERFORM pg_advisory_xact_lock(hashtextextended('food_club_release_cap', 0));
  IF (SELECT count(*) FROM public.food_club_voucher_events e
       WHERE e.event = 'released_after_checkout_evidence' AND e.created_at > now() - interval '24 hours') >= 20 THEN
    IF NOT EXISTS (SELECT 1 FROM public.kitchen_action_log l
                    WHERE l.order_id = p_order_id AND l.action = 'food_club_release_cap_reached'
                      AND l.created_at > now() - interval '24 hours') THEN
      INSERT INTO public.kitchen_action_log (order_id, venue_id, action, actor_type, metadata)
      VALUES (v_order.id, v_order.venue_id, 'food_club_release_cap_reached', 'system',
              jsonb_build_object('voucher_id', v_voucher.id, 'cap', 20, 'window_hours', 24));
    END IF;
    UPDATE public.food_club_release_seals
       SET checks = checks + 1, last_check_at = now(), last_reason = 'release_cap_reached' WHERE order_id = p_order_id;
    RETURN jsonb_build_object('ok', true, 'released', false, 'result', 'not_released',
                              'reason', 'release_cap_reached', 'verdicts', v_verdicts);
  END IF;

  -- Tutti not_payable: il buono torna disponibile (o scaduto, come il rilascio del banco puro), un solo evento.
  v_to := CASE WHEN v_voucher.expires_at > now() THEN 'available' ELSE 'expired' END;
  UPDATE public.food_club_vouchers
     SET status = v_to, reserved_order_id = NULL, reserved_at = NULL
   WHERE id = v_voucher.id AND status = 'reserved' AND reserved_order_id = p_order_id;
  GET DIAGNOSTICS v_released = ROW_COUNT;
  IF v_released <> 1 THEN
    RAISE EXCEPTION 'food_club_release_unexpected_state';
  END IF;
  PERFORM public.food_club_log_voucher(v_voucher.id, 'reserved', v_to, 'released_after_checkout_evidence', p_order_id,
    'system', jsonb_build_object('evidence_ids', v_ev_ids, 'verdicts', v_verdicts,
                                 'sealed_at', v_seal.sealed_at, 'order_status', v_order.status));
  UPDATE public.food_club_release_seals
     SET checks = checks + 1, last_check_at = now(), last_reason = 'released' WHERE order_id = p_order_id;
  RETURN jsonb_build_object('ok', true, 'released', true, 'result', 'released', 'voucher_status', v_to,
                            'verdicts', v_verdicts);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 10) Retention: la funzione Club già esistente (cron 03:20, nessuna pianificazione toccata) pulisce anche le prove
-- ---------------------------------------------------------------------------------------------------
-- Comportamento precedente identico; aggiunte: evidenze/intenti con più di 90 giorni e sigilli con sealed_at più
-- vecchio di 90 giorni, SOLO se il buono legato non è più riservato su quell'ordine (stessa regola dei trigger).
CREATE OR REPLACE FUNCTION public.food_club_retention_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_t integer; v_e integer; v_m integer; v_ev integer; v_in integer; v_se integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_only';
  END IF;
  DELETE FROM public.food_club_merge_tickets WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_t = ROW_COUNT;
  DELETE FROM public.food_club_events WHERE created_at < now() - interval '400 days';
  GET DIAGNOSTICS v_e = ROW_COUNT;
  DELETE FROM public.food_club_messages WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_m = ROW_COUNT;
  -- Passo 3A: prove del rilascio (90 giorni, mai se servono a un buono ancora riservato su quell'ordine).
  DELETE FROM public.food_club_checkout_evidence e
   WHERE e.fetched_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v WHERE v.status = 'reserved' AND v.reserved_order_id = e.order_id);
  GET DIAGNOSTICS v_ev = ROW_COUNT;
  DELETE FROM public.food_club_checkout_intents i
   WHERE i.recorded_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v WHERE v.status = 'reserved' AND v.reserved_order_id = i.order_id);
  GET DIAGNOSTICS v_in = ROW_COUNT;
  DELETE FROM public.food_club_release_seals s
   WHERE s.sealed_at < now() - interval '90 days'
     AND NOT EXISTS (SELECT 1 FROM public.food_club_vouchers v WHERE v.status = 'reserved' AND v.reserved_order_id = s.order_id);
  GET DIAGNOSTICS v_se = ROW_COUNT;
  RETURN jsonb_build_object('tickets', v_t, 'events', v_e, 'messages', v_m,
                            'release_evidence', v_ev, 'release_intents', v_in, 'release_seals', v_se);
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 11) Permessi
-- ---------------------------------------------------------------------------------------------------
-- RPC pubbliche per il server (service_role). Supabase concede EXECUTE di default ad anon/authenticated sulle
-- funzioni nuove: il REVOKE esplicito è obbligatorio (provato su stack Supabase locale).
REVOKE ALL ON FUNCTION public.food_club_seal_order_for_release(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_record_checkout_intent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_record_checkout_evidence(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_release_voucher_after_evidence(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_seal_order_for_release(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.food_club_record_checkout_intent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.food_club_record_checkout_evidence(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.food_club_release_voucher_after_evidence(text) TO service_role;
-- Costanti: non eseguibili da client.
REVOKE ALL ON FUNCTION public.food_club_release_verified_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.food_club_expected_merchant_code() FROM PUBLIC, anon, authenticated;
-- Funzioni interne e trigger: nessun ruolo di API (nemmeno service_role).
REVOKE ALL ON FUNCTION public.food_club_evidence_normalize(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_release_eval_attempt(public.kitchen_payments, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_release_seals_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_release_append_only_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_seal_guard_insert() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.food_club_seal_guard_claim() FROM PUBLIC, anon, authenticated, service_role;
-- Retention (invariata): solo service_role.
REVOKE ALL ON FUNCTION public.food_club_retention_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_club_retention_sweep() TO service_role;
