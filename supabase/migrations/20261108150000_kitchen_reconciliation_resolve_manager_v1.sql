-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Applicazione in produzione = decisione di Eros (db push).
-- K6 (2026-11-08) — chiusura delle segnalazioni "Da riconciliare" SOLO dal manager, controllata lato server.
-- Proposta: ai-ops/current/KITCHEN_K6_MIGRATION_PROPOSTA.sql; correzioni: ai-ops/current/KITCHEN_K6_PROVENIENZA_STOP.md.
-- Test di comportamento su Postgres locale: tests/db/kitchen-payments/p8_k6_chiusura_manager.sql e p8b_k6_concorrenza.sh.
--
-- 1) Policy di INSERT sul log ristretta: lo staff scrive solo righe actor_type='staff' con il proprio uid.
--    Le righe 'system' nascono solo da RPC SECURITY DEFINER (owner, fuori RLS) o da service_role (sweep K6-b).
--    Il client (src/hooks/useKitchenOrders.js) scrive gia' 'staff' + session.user.id: nessun effetto sull'app.
-- 2) Tabella append-only kitchen_reconciliation_resolutions: si scrive solo tramite la RPC, nessuna modifica
--    o cancellazione possibile (trigger), nemmeno per owner/service_role.
-- 3) Istante di fiducia: le segnalazioni create PRIMA di questa migration non sono dimostrabili (con la policy
--    vecchia uno staff poteva falsificare righe 'system'). La RPC le rifiuta (legacy_item_not_verifiable).
--    L'istante e' fissato in una funzione costante creata qui con now() della transazione della migration
--    (= momento esatto dell'applicazione, nessuna finestra tra costante scritta a mano e deploy).
-- Nessuna modifica a K1/K2/K4, a kitchen_payments o agli ordini. Nessun rimborso.

-- 1) Policy di INSERT sul log ---------------------------------------------------------------------------------
DROP POLICY IF EXISTS staff_insert_venue_action_log ON public.kitchen_action_log;
CREATE POLICY staff_insert_venue_action_log ON public.kitchen_action_log
  FOR INSERT TO authenticated
  WITH CHECK (
    is_staff_for_venue(venue_id)
    AND actor_type = 'staff'
    AND actor_id = auth.uid()
  );

-- 2) Tabella delle chiusure -----------------------------------------------------------------------------------
CREATE TABLE public.kitchen_reconciliation_resolutions (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  venue_id          text NOT NULL,
  source_log_id     uuid NOT NULL REFERENCES public.kitchen_action_log(id) ON DELETE RESTRICT,
  order_id          text,
  outcome           text NOT NULL,
  note              text NOT NULL,
  refund_ref_tail   text,
  resolved_by       uuid NOT NULL,
  -- Nome mostrato: solo auth.users.raw_app_meta_data->>'display_name' (scrivibile solo lato server).
  -- Mai email, mai raw_user_meta_data (modificabile dall'utente). NULL -> la UI mostra "Manager".
  resolved_by_label text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_reconciliation_resolutions_pkey PRIMARY KEY (id),
  -- una sola chiusura per segnalazione
  CONSTRAINT kitchen_reconciliation_resolutions_source_unique UNIQUE (source_log_id),
  CONSTRAINT kitchen_reconciliation_resolutions_outcome_check CHECK (
    outcome = ANY (ARRAY['refunded_on_sumup','verified_not_charged','refunded_in_walbox','seen'])
  ),
  CONSTRAINT kitchen_reconciliation_resolutions_note_check CHECK (char_length(btrim(note)) BETWEEN 1 AND 140),
  -- solo le ultime cifre del riferimento rimborso SumUp, mai il riferimento completo
  CONSTRAINT kitchen_reconciliation_resolutions_ref_check CHECK (refund_ref_tail IS NULL OR refund_ref_tail ~ '^[A-Za-z0-9]{1,6}$'),
  CONSTRAINT kitchen_reconciliation_resolutions_label_check CHECK (resolved_by_label IS NULL OR char_length(resolved_by_label) BETWEEN 1 AND 60)
);

ALTER TABLE public.kitchen_reconciliation_resolutions ENABLE ROW LEVEL SECURITY;

-- Lettura: tutto lo staff del locale (decisione Eros 2026-11-08). Nessuna policy di scrittura.
CREATE POLICY staff_select_venue_reconciliation_resolutions ON public.kitchen_reconciliation_resolutions
  FOR SELECT TO authenticated
  USING (is_staff_for_venue(venue_id));

-- Scrittura diretta tolta a tutti i ruoli API (anche service_role): si scrive solo con la RPC.
REVOKE ALL ON public.kitchen_reconciliation_resolutions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.kitchen_reconciliation_resolutions TO authenticated, service_role;

-- Append-only: nessuna modifica o cancellazione, nemmeno da owner/superuser/service_role.
CREATE FUNCTION public.kitchen_reconciliation_resolutions_block_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'reconciliation_resolutions_append_only';
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_reconciliation_resolutions_block_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER kitchen_reconciliation_resolutions_no_update_delete
  BEFORE UPDATE OR DELETE ON public.kitchen_reconciliation_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_reconciliation_resolutions_block_change();

CREATE TRIGGER kitchen_reconciliation_resolutions_no_truncate
  BEFORE TRUNCATE ON public.kitchen_reconciliation_resolutions
  FOR EACH STATEMENT EXECUTE FUNCTION public.kitchen_reconciliation_resolutions_block_change();

-- 3) Istante di fiducia = momento dell'applicazione di questa migration (costante scritta una volta) ----------
DO $do$
BEGIN
  EXECUTE format($f$
    CREATE FUNCTION public.kitchen_reconciliation_trusted_since()
    RETURNS timestamptz
    LANGUAGE sql
    IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $body$ SELECT %L::timestamptz $body$
  $f$, now());
END;
$do$;

REVOKE ALL ON FUNCTION public.kitchen_reconciliation_trusted_since() FROM PUBLIC, anon, authenticated;

-- 4) RPC di chiusura ------------------------------------------------------------------------------------------
-- Errori (testo esatto, mappato in italiano dalla UI): not_authenticated, source_log_not_found,
-- not_manager_for_venue, legacy_item_not_verifiable, not_a_reconciliation_item, invalid_outcome, invalid_note,
-- invalid_refund_ref, already_resolved, no_walbox_refund_found.
-- refunded_on_sumup: dichiarativo (Walbox non vede i rimborsi fatti nell'app SumUp); il riferimento e' opzionale.
CREATE FUNCTION public.kitchen_reconciliation_resolve(
  p_source_log_id uuid,
  p_outcome text,
  p_note text,
  p_refund_ref_tail text DEFAULT NULL
)
RETURNS public.kitchen_reconciliation_resolutions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_log public.kitchen_action_log%ROWTYPE;
  v_existing public.kitchen_reconciliation_resolutions%ROWTYPE;
  v_row public.kitchen_reconciliation_resolutions%ROWTYPE;
  v_label text;
  v_note text := btrim(coalesce(p_note, ''));
  v_ref text := nullif(btrim(coalesce(p_refund_ref_tail, '')), '');
BEGIN
  -- service_role / chiamate senza utente: nessuna chiusura anonima.
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Serializza le chiusure della stessa segnalazione (doppio clic, due manager insieme).
  PERFORM pg_advisory_xact_lock(hashtext('kitchen_reconciliation_resolve'), hashtext(p_source_log_id::text));

  SELECT * INTO v_log FROM public.kitchen_action_log WHERE id = p_source_log_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source_log_not_found'; END IF;

  -- Permesso verificato QUI, non nella UI: manager del locale della segnalazione.
  IF NOT EXISTS (
    SELECT 1 FROM public.kitchen_staff_members
    WHERE user_id = v_uid AND venue_id = v_log.venue_id AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'not_manager_for_venue';
  END IF;

  -- Eventi precedenti alla policy stretta: provenienza non dimostrabile, mai trattati come affidabili.
  IF v_log.created_at < public.kitchen_reconciliation_trusted_since() THEN
    RAISE EXCEPTION 'legacy_item_not_verifiable';
  END IF;

  -- Solo segnalazioni vere, scritte dal sistema (RPC di pagamento o sweep).
  IF v_log.actor_type <> 'system'
     OR v_log.action <> ALL (ARRAY['payment_confirm_lost_race','payment_confirmed_after_cancel',
                                   'payment_confirmed_after_abandon','payment_confirmed_amount_mismatch',
                                   'payment_late_unverified'])
     OR coalesce(v_log.metadata->>'needs_manual_reconciliation', '') <> 'true' THEN
    RAISE EXCEPTION 'not_a_reconciliation_item';
  END IF;

  IF p_outcome IS NULL
     OR p_outcome <> ALL (ARRAY['refunded_on_sumup','verified_not_charged','refunded_in_walbox','seen']) THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;
  IF char_length(v_note) < 1 OR char_length(v_note) > 140 THEN RAISE EXCEPTION 'invalid_note'; END IF;
  IF v_ref IS NOT NULL AND v_ref !~ '^[A-Za-z0-9]{1,6}$' THEN RAISE EXCEPTION 'invalid_refund_ref'; END IF;

  -- Gia' chiusa: stesso esito e stesso autore -> restituisce la chiusura (doppio clic); altrimenti errore.
  SELECT * INTO v_existing FROM public.kitchen_reconciliation_resolutions WHERE source_log_id = p_source_log_id;
  IF FOUND THEN
    IF v_existing.outcome = p_outcome AND v_existing.resolved_by = v_uid THEN
      RETURN v_existing;
    END IF;
    RAISE EXCEPTION 'already_resolved';
  END IF;

  -- "Rimborsato in Walbox" solo con la prova: rimborso succeeded dello stesso ordine e locale, dopo la segnalazione.
  IF p_outcome = 'refunded_in_walbox' AND NOT EXISTS (
    SELECT 1 FROM public.kitchen_payments
    WHERE order_id = v_log.order_id
      AND venue_id = v_log.venue_id
      AND direction = 'refund'
      AND status = 'succeeded'
      AND created_at >= v_log.created_at
  ) THEN
    RAISE EXCEPTION 'no_walbox_refund_found';
  END IF;

  SELECT nullif(left(btrim(u.raw_app_meta_data->>'display_name'), 60), '') INTO v_label
  FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.kitchen_reconciliation_resolutions (
    venue_id, source_log_id, order_id, outcome, note, refund_ref_tail, resolved_by, resolved_by_label
  ) VALUES (
    v_log.venue_id, v_log.id, v_log.order_id, p_outcome, v_note, v_ref, v_uid, v_label
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_reconciliation_resolve(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitchen_reconciliation_resolve(uuid, text, text, text) TO authenticated;
