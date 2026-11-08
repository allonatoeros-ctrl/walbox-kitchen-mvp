-- =========================================================================
-- Food Club V1 — Passo 3C: avvio corretto della sweep per la restituzione dei buoni trattenuti
-- Piano: ai-ops/reports/food-club-passo3c-piano-2026-11-08.md (opzione B). Decisioni approvate: D-3C-1 (24 h), D-3C-2 (raffiche).
-- Stato: SOLO LOCALE, non applicata al remoto. Apply = `npx supabase db push --linked`, gate di Eros.
--
-- Problema: il tick Kitchen sveglia la sweep solo se esiste un ordine POP scaduto. Un buono trattenuto su un ordine
-- gia' chiuso (cancelled/payment_abandoned) non lo fa mai partire. Qui il tick Club copre quel buco.
--
-- Cosa fa (tutto additivo, nessuna funzione kitchen_* ridefinita, nessun cron nuovo):
--   1) food_club_release_tick_enabled(): interruttore DB costante `false`. Cambiarlo = nuova migration = gate di Eros.
--   2) food_club_release_tick_due(p_now): criterio "c'e' un buono trattenuto da controllare?" (solo lettura, testabile).
--      NON legge food_club_campaigns: un buono gia' trattenuto va restituito anche a campagna spenta.
--   3) food_club_release_sweep_tick(p_url): se interruttore spento o criterio falso -> NULL (zero HTTP); altrimenti
--      UNA net.http_post identica a quella del tick Kitchen (secret Vault kitchen_abandon_sweep_secret, solo per nome).
--   4) il job pg_cron esistente `kitchen-online-abandon-sweep` viene ri-schedulato con lo STESSO nome e la STESSA
--      frequenza; nuovo comando: COALESCE(tick Kitchen, tick Club). Il Club parte solo se Kitchen non ha gia' chiamato:
--      al massimo UNA chiamata al minuto.
--
-- Cadenza (riferimento = sigillo, oppure created_at + 17 min se non ancora sigillato):
--   * primi 10 minuti: ogni minuto (servono 3-4 giri consecutivi: sigillo, List+GET A, GET B + verdetto);
--   * da 10 minuti a 24 h: raffica di 4 minuti consecutivi ogni 30 (minuto UTC % 30 < 4), finche' l'ultimo esito non e'
--     terminale (paid_evidence, order_paid, charge_succeeded);
--   * oltre 24 h: STOP. Il buono resta RISERVATO (stato sicuro) e lo staff lo libera a mano.
--
-- Rollback (migration dedicata, gate di Eros): ri-schedulare il job col comando originale
--   SELECT cron.schedule('kitchen-online-abandon-sweep', '* * * * *', $$SELECT public.kitchen_online_abandon_sweep_tick()$$);
-- le funzioni Club restano inerti. Emergenza immediata: env FOOD_CLUB_RELEASE_ENABLED su Vercel (la sweep torna solo Kitchen).
-- =========================================================================

-- ---------------------------------------------------------------------------------------------------
-- 1) Interruttore DB (costante, spento)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_release_tick_enabled()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT false $$;

-- ---------------------------------------------------------------------------------------------------
-- 2) Criterio "buono trattenuto da controllare" (p_now al posto di now(): testabile con orari fissi)
-- ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.food_club_release_tick_due(p_now timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.food_club_vouchers v
      JOIN public.kitchen_orders o ON o.id = v.reserved_order_id
      LEFT JOIN public.food_club_release_seals s ON s.order_id = o.id AND s.voucher_id = v.id
     WHERE v.status = 'reserved'
       AND o.status IN ('cancelled', 'payment_abandoned')
       AND o.payment_status IS DISTINCT FROM 'paid'
       AND o.created_at < p_now - interval '17 minutes'
       AND EXISTS (SELECT 1 FROM public.food_club_voucher_events e
                    WHERE e.voucher_id = v.id AND e.order_id = o.id
                      AND e.event = 'held_until_checkout_expiry')
       AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments p
                        WHERE p.order_id = o.id AND p.direction = 'charge' AND p.status = 'succeeded')
       AND (
         -- primi 10 minuti dal riferimento (sigillo, o minuto 17 se non ancora sigillato): ogni minuto
         COALESCE(s.sealed_at, o.created_at + interval '17 minutes') > p_now - interval '10 minutes'
         -- poi fino a 24 h: raffica di 4 minuti consecutivi ogni 30, se l'ultimo esito non e' terminale
         OR (
           COALESCE(s.sealed_at, o.created_at + interval '17 minutes') > p_now - interval '24 hours'
           AND extract(minute FROM p_now AT TIME ZONE 'UTC')::int % 30 < 4
           AND COALESCE(s.last_reason, '') NOT IN ('paid_evidence', 'order_paid', 'charge_succeeded')
         )
       )
  );
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 3) Tick Club: HTTP solo se interruttore acceso E criterio vero
-- ---------------------------------------------------------------------------------------------------
-- Il secret vive SOLO nel Vault (`kitchen_abandon_sweep_secret`, lo stesso del tick Kitchen); qui compare solo il NOME.
-- Ritorna l'id della richiesta pg_net, oppure NULL quando non parte nessuna chiamata.
CREATE OR REPLACE FUNCTION public.food_club_release_sweep_tick(
  p_url text DEFAULT 'https://walbox-from-zero-v2.vercel.app/api/kitchen-online-abandon-sweep'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_secret     text;
  v_request_id bigint;
BEGIN
  -- Interruttore PRIMA di qualunque lettura di tabella.
  IF NOT public.food_club_release_tick_enabled() THEN
    RETURN NULL;
  END IF;

  IF NOT public.food_club_release_tick_due(now()) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'kitchen_abandon_sweep_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'food_club_release_sweep_tick: secret kitchen_abandon_sweep_secret assente in Vault, sweep saltato';
    RETURN NULL;
  END IF;

  -- Fire-and-forget: pg_net accoda la richiesta, il job non aspetta Vercel.
  SELECT net.http_post(
    url := p_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$function$;

-- Solo il proprietario (postgres, che esegue i job pg_cron) puo' chiamarle.
REVOKE ALL ON FUNCTION public.food_club_release_tick_enabled() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_enabled() FROM anon;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_enabled() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_enabled() FROM service_role;
REVOKE ALL ON FUNCTION public.food_club_release_tick_due(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_due(timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_due(timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.food_club_release_tick_due(timestamptz) FROM service_role;
REVOKE ALL ON FUNCTION public.food_club_release_sweep_tick(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.food_club_release_sweep_tick(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.food_club_release_sweep_tick(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.food_club_release_sweep_tick(text) FROM service_role;

-- ---------------------------------------------------------------------------------------------------
-- 4) Job esistente, stesso nome e stessa frequenza (cron.schedule con nome = upsert del comando)
-- ---------------------------------------------------------------------------------------------------
SELECT cron.schedule(
  'kitchen-online-abandon-sweep',
  '* * * * *',
  $$SELECT COALESCE(public.kitchen_online_abandon_sweep_tick(), public.food_club_release_sweep_tick())$$
);
