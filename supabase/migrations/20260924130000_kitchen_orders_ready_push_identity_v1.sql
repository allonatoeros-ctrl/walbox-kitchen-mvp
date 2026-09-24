-- kitchen_orders ready-push identity + async dispatch — F6 Phase 2 (2026-09-24).
--
-- DOCUMENTATION ONLY — NOT APPLIED TO REMOTE. Supabase è area protetta (CLAUDE.md §5): questa
-- migration non va eseguita con `supabase db push`/apply finché Eros non approva esplicitamente
-- il Gate 2 di implementazione server-side (vedi ai-ops/SECURITY_POLICY.md §7). Coerente con
-- ai-ops/reports/kitchen-f6-webpush-phase2-final-architecture-gate-20260924.md (DB_CHANGES).
--
-- INVARIANTE: PUSH = side effect, MAI source of truth. Ogni pezzo di questa migration è pensato
-- per non poter MAI bloccare o far fallire uno UPDATE reale su kitchen_orders (status/payment/
-- workflow staff) — vedi commenti sotto sul trigger di dispatch (EXCEPTION WHEN OTHERS) e sul
-- trigger di identità (RAISE WARNING mai RAISE EXCEPTION).
--
-- Nota tipo: kitchen_orders.id è `text` (order code, non uuid) — vedi schema baseline
-- 20260710173936. Tutti i riferimenti sotto usano text, non uuid.

-- =========================================================================
-- 1) READY EVENT IDENTITY — nuove colonne
-- =========================================================================

ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS ready_event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS ready_push_claimed_at timestamptz NULL;

COMMENT ON COLUMN public.kitchen_orders.ready_event_id IS
  'Identità del singolo ingresso in status=ready, rigenerata dal trigger BEFORE UPDATE sotto. '
  'READY -> undo -> READY produce SEMPRE un ready_event_id diverso: distingue un nuovo evento '
  'ready da un retry/duplicate sullo stesso evento. NON deducibile da ready_at (colonna esistente, '
  'schema baseline), che è scritta dal client e non garantita collision-safe.';

COMMENT ON COLUMN public.kitchen_orders.ready_push_claimed_at IS
  'Claim idempotente per il push "ordine pronto": settato dalla Edge Function SOLO dopo aver '
  'verificato, a fine wait, che status=ready e ready_event_id non sia cambiato. Resettato a NULL '
  'dal trigger di identità ad ogni transizione di status (nuovo evento = nuovo claim possibile).';

-- =========================================================================
-- 2) TRIGGER BEFORE UPDATE — mantiene l'identità dell'evento ready
--    Puro SQL, nessuna chiamata di rete: non può mai fallire per cause esterne (Edge Function giù,
--    rete, pg_net non installata). Esegue SEMPRE prima di qualunque trigger AFTER UPDATE sulla
--    stessa riga (garanzia Postgres per timing, non per ordine alfabetico dei trigger).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.kitchen_orders_ready_event_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Nuovo ingresso in ready (da qualunque altro stato) -> nuova identità evento.
    IF NEW.status = 'ready' THEN
      NEW.ready_event_id := gen_random_uuid();
    END IF;
    -- Qualunque cambio di status invalida il claim precedente: un ready_push_claimed_at
    -- residuo del ciclo ready precedente non deve mai bloccare il claim del prossimo evento
    -- ready (vedi UNDO_RACE_VERDICT nel report Final Architecture Gate).
    NEW.ready_push_claimed_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER kitchen_orders_ready_event_identity_trg
  BEFORE UPDATE ON public.kitchen_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.kitchen_orders_ready_event_identity();

-- =========================================================================
-- 3) ASYNC DELIVERY — pg_net + trigger AFTER UPDATE verso la Edge Function
--    Opzione B del gate precedente (Database Webhook pattern), scritta a mano (non dalla
--    Dashboard) per restare in una migration versionata senza incorporare un secret letterale
--    (vedi AUTH_MODEL/SECRETS_MODEL nel report Final Architecture Gate).
-- =========================================================================

-- Non installata oggi sul progetto remoto (verificato via MCP Supabase nel gate precedente).
-- L'abilitazione è parte dello schema proposto; l'APPLY resta comunque bloccato da CLAUDE.md §5.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Placeholder documentato (AUTH_IMPLEMENTATION): l'URL reale della Edge Function del progetto va
-- sostituito manualmente al momento dell'apply (Gate 2 dedicato), MAI committato come URL di
-- produzione finto o presunto. L'URL non è un segreto di per sé, ma finché non è un task di
-- deploy approvato non ha senso fissarlo a un progetto reale.
CREATE OR REPLACE FUNCTION public.kitchen_orders_ready_push_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret             text;
  v_edge_function_url  text := '<KITCHEN_PUSH_EDGE_FUNCTION_URL>'; -- GATE: sostituire al deploy
BEGIN
  -- Il secret vive SOLO in Supabase Vault, creato fuori da qualunque migration versionata
  -- (vedi runbook ai-ops/runbooks/kitchen-f6-webpush-vault-secret-setup.md). Qui compare solo il
  -- NOME del secret, mai il valore.
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'kitchen_push_webhook_secret';

  IF v_secret IS NULL THEN
    -- Config mancante: WARNING, mai EXCEPTION. Non deve mai far fallire lo UPDATE che ha
    -- generato questo trigger (invariante "status/payment/workflow completano anche con push
    -- offline").
    RAISE WARNING 'kitchen_orders_ready_push_dispatch: secret kitchen_push_webhook_secret assente in Vault, dispatch saltato per ordine %', NEW.id;
    RETURN NEW;
  END IF;

  -- net.http_post è fire-and-forget (accoda la richiesta, non attende la risposta): già di per sé
  -- non blocca la transazione. Il BEGIN/EXCEPTION sotto copre il caso limite in cui la chiamata
  -- stessa sollevi un errore sincrono (es. pg_net non disponibile per qualunque motivo a runtime):
  -- anche in quel caso lo UPDATE su kitchen_orders.status deve committare comunque.
  BEGIN
    PERFORM net.http_post(
      url := v_edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_secret
      ),
      body := jsonb_build_object('order_id', NEW.id, 'ready_event_id', NEW.ready_event_id),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'kitchen_orders_ready_push_dispatch: net.http_post fallita per ordine %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.kitchen_orders_ready_push_dispatch() FROM PUBLIC;

-- WHEN sulla riga: dispatch SOLO su vera transizione verso ready (mai su update di staff_note,
-- payment_status, ecc. — stesso filtro già raccomandato nel gate precedente).
CREATE TRIGGER kitchen_orders_ready_push_webhook_trg
  AFTER UPDATE ON public.kitchen_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'ready')
  EXECUTE FUNCTION public.kitchen_orders_ready_push_dispatch();
