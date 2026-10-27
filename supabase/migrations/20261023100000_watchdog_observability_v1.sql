-- Watchdog observability v1 — interfaccia di sola osservazione per il Watchdog Professional.
--
-- STATO: PREPARATORIA — NON APPLICATA A NESSUN DATABASE REMOTO.
-- Vive nel repo allonatoeros-ctrl/Ops-watchdog-audits (walbox-observability/). Va copiata in
-- walbox-kitchen-mvp/supabase/migrations/ e applicata con `npx supabase db push --linked` SOLO dopo
-- approvazione esplicita di Eros, un progetto Supabase alla volta (Walrus 1, Walrus 2, Walrus 3 …).
-- Testata localmente su PostgreSQL 16 con una fixture sintetica che riproduce le tabelle Kitchen
-- (watchdog/fixtures/walbox-synthetic-schema.sql): NON è una prova del comportamento in produzione.
--
-- Perché esiste
--   Le viste kitchen_payments_order_reconciliation e kitchen_payments_provider_drift_candidates filtrano con
--   is_staff_for_venue() → auth.uid(). Lette con service_role o con un ruolo senza identità staff restituiscono
--   ZERO righe anche in presenza di anomalie (audit 02 §3; collaudo locale dichiarato da Eros: T01=2, T02=6,
--   service_role=0). Un sensore costruito su quelle viste è cieco e risponde "sano".
--
-- Cosa fa
--   1. Schema dedicato `watchdog_obs` e ruolo NOLOGIN `watchdog_observer`. Il login per installazione si crea a
--      mano con walbox-observability/scripts/create_observer_login.sql (la password non è mai in una migration).
--   2. Identità dell'installazione (installation_id, venue_id, fingerprint casuale generata QUI all'applicazione):
--      il Watchdog la confronta con la propria configurazione e rifiuta di dichiarare OK se non coincide
--      (protezione da credenziali o URL scambiati tra locali).
--   3. Funzioni SECURITY DEFINER di sola lettura che NON dipendono da auth.uid() e restituiscono jsonb con
--      conteggi e riferimenti tecnici minimi (id ordine, codice operativo, stati, istanti). Mai: nickname,
--      note, customer_id, table_id, raw_payload, raw_last_event, actor_id, reason libero, endpoint push.
--   4. Attestazione positiva di visibilità (visibility()): il Watchdog dichiara OK solo se l'owner delle funzioni
--      vede davvero le tabelle (RLS non attiva per lui, righe visibili coerenti con le statistiche).
--   5. Hardening anti-impersonificazione MIRATO (sezione 12), DISPONIBILE MA NON APPLICATO da questa migration:
--      un login Postgres può eseguire `SET request.jwt.claims = …` e far credere ad auth.uid()/auth.role() di
--      essere staff o service_role dentro le funzioni SECURITY DEFINER eseguibili da PUBLIC. La migration definisce
--      soltanto le funzioni watchdog_obs.harden_public_definer_functions() / rollback_public_hardening() e la
--      tabella di snapshot watchdog_obs.privilege_changes: NON modifica alcuna ACL di funzioni applicative Walbox.
--      Con il trasporto HTTPS non esiste alcun login Watchdog (watchdog_observer è NOLOGIN), quindi il vettore non è
--      raggiungibile con la credenziale del Watchdog. L'applicazione resta una decisione separata, con
--      autorizzazione esplicita (scripts/reharden_public_functions.sql, preceduto da scripts/preflight_hardening.sql
--      e da scripts/acl_snapshot.sql; annullabile con scripts/rollback_public_hardening.sql). Quando applicato,
--      EXECUTE passa da PUBLIC a un GRANT esplicito per OGNI ruolo esistente tranne la famiglia watchdog_observer:
--      nessun ruolo esistente perde o guadagna privilegi effettivi.
--
-- Cosa NON fa
--   Nessuna scrittura su tabelle Kitchen, nessuna modifica a viste/RPC/policy esistenti, nessun URL cablato,
--   nessun segreto. Il ruolo observer non ha privilegi su alcuna tabella.
--
-- Parametri da impostare prima dell'applicazione (una sola volta per progetto):
--   watchdog_obs.installation_identity viene popolata dal blocco "IDENTITÀ" in fondo, che legge
--   current_setting('watchdog.installation_id') e current_setting('watchdog.venue_id'). Se non impostati la
--   migration usa il venue 'walrus-main' e l'id 'da-configurare' e il Watchdog resterà NON VERIFICABILE finché
--   l'identità non viene aggiornata con walbox-observability/scripts/set_installation_identity.sql.

-- =========================================================================
-- 1. Schema e ruolo
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS watchdog_obs;
REVOKE ALL ON SCHEMA watchdog_obs FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'watchdog_observer') THEN
    CREATE ROLE watchdog_observer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA watchdog_obs TO watchdog_observer;

-- =========================================================================
-- 2. Identità dell'installazione
-- =========================================================================

CREATE TABLE IF NOT EXISTS watchdog_obs.installation_identity (
  singleton        boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  installation_id  text NOT NULL CHECK (installation_id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  venue_id         text NOT NULL,
  fingerprint      uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON watchdog_obs.installation_identity FROM PUBLIC;

CREATE OR REPLACE FUNCTION watchdog_obs._venue()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$ SELECT venue_id FROM watchdog_obs.installation_identity WHERE singleton $$;

-- Parametro intero limitato: l'observer non può chiedere finestre enormi.
CREATE OR REPLACE FUNCTION watchdog_obs._int(p jsonb, k text, d integer, lo integer, hi integer)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT LEAST(hi, GREATEST(lo, COALESCE(
    CASE WHEN jsonb_typeof(p -> k) = 'number' THEN (p ->> k)::numeric::integer END, d)))
$$;

CREATE OR REPLACE FUNCTION watchdog_obs._ts(p jsonb, k text, d timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF jsonb_typeof(p -> k) = 'string' THEN
    RETURN (p ->> k)::timestamptz;
  END IF;
  RETURN d;
EXCEPTION WHEN others THEN
  RETURN d;
END
$$;

CREATE OR REPLACE FUNCTION watchdog_obs.identity()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'installation_id', i.installation_id,
    'venue_id', i.venue_id,
    'fingerprint', i.fingerprint,
    'schema_version', 1,
    'db_now', now()
  )
  FROM watchdog_obs.installation_identity i
  WHERE i.singleton
$$;

-- =========================================================================
-- 3. Attestazione di visibilità
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.visibility()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_tables text[] := ARRAY['public.kitchen_orders', 'public.kitchen_order_items', 'public.kitchen_payments',
                           'public.kitchen_payment_webhook_events', 'public.kitchen_action_log'];
  v_t text;
  v_rel regclass;
  v_visible boolean;
  v_est bigint;
  v_out jsonb := '[]'::jsonb;
  v_exposed_fn integer;
  v_exposed_ext integer;
  v_exposed_obs integer;
  v_exposed_tbl integer;
  v_reachable jsonb;
BEGIN
  FOREACH v_t IN ARRAY v_tables LOOP
    v_rel := to_regclass(v_t);
    IF v_rel IS NULL THEN
      v_out := v_out || jsonb_build_object('name', v_t, 'exists', false);
      CONTINUE;
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s)', v_rel) INTO v_visible;
    SELECT GREATEST(COALESCE(s.n_live_tup, 0), COALESCE(c.reltuples, 0)::bigint)
      INTO v_est
      FROM pg_class c LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE c.oid = v_rel;
    v_out := v_out || jsonb_build_object(
      'name', v_t,
      'exists', true,
      'rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = v_rel),
      'rls_forced', (SELECT relforcerowsecurity FROM pg_class WHERE oid = v_rel),
      'rls_active_for_reader', row_security_active(v_rel),
      'visible_any', v_visible,
      'estimated_rows', v_est
    );
  END LOOP;

  -- Privilegi in eccesso del ruolo observer (devono essere zero). Il vettore di impersonificazione sono le
  -- funzioni SECURITY DEFINER eseguibili fuori da watchdog_obs (in qualunque schema non di sistema): le INVOKER
  -- girano con i privilegi dell'observer, che non ne ha su alcuna tabella.
  SELECT count(*) INTO v_exposed_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'watchdog_obs') AND n.nspname NOT LIKE 'pg\_toast%'
     AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     AND has_schema_privilege('watchdog_observer', n.oid, 'USAGE')
     AND has_function_privilege('watchdog_observer', p.oid, 'EXECUTE');
  SELECT count(*) INTO v_exposed_ext
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'watchdog_obs')
     AND p.prosecdef
     AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
     AND has_schema_privilege('watchdog_observer', n.oid, 'USAGE')
     AND has_function_privilege('watchdog_observer', p.oid, 'EXECUTE');
  -- dentro watchdog_obs l'observer deve poter eseguire solo le funzioni di lettura
  SELECT count(*) INTO v_exposed_obs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'watchdog_obs'
     AND p.proname NOT IN ('identity', 'visibility', 'b01_orders', 'b02_payments', 'b03_webhooks', 'b04_kitchen',
                           'b05_devices', 'b06_chain', 'jobs', 'app_errors')
     AND has_function_privilege('watchdog_observer', p.oid, 'EXECUTE');
  SELECT count(*) INTO v_exposed_tbl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND CASE WHEN c.relkind IN ('r', 'v', 'm', 'p', 'f')
              THEN has_table_privilege('watchdog_observer', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
              ELSE false END;
  -- Tabelle e sequenze raggiungibili dall'observer FUORI da public (privilegio, anche tramite PUBLIC, + USAGE sullo
  -- schema). Su Supabase pg_net può concedere ALL a PUBLIC su net.http_request_queue/_http_response: chiunque abbia
  -- un login può accodare richieste HTTP e leggere gli header in coda. Solo nomi, mai contenuti.
  SELECT COALESCE(jsonb_agg(n.nspname || '.' || c.relname ORDER BY n.nspname, c.relname), '[]'::jsonb) INTO v_reachable
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public', 'watchdog_obs') AND n.nspname NOT LIKE 'pg\_toast%'
     AND has_schema_privilege('watchdog_observer', n.oid, 'USAGE')
     AND CASE WHEN c.relkind IN ('r', 'v', 'm', 'p', 'f')
              THEN has_table_privilege('watchdog_observer', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
              WHEN c.relkind = 'S' THEN has_sequence_privilege('watchdog_observer', c.oid, 'USAGE, SELECT, UPDATE')
              ELSE false END;

  RETURN jsonb_build_object(
    'db_now', now(),
    'reader', current_user,
    'tables', v_out,
    'venue_orders_visible', (SELECT EXISTS (SELECT 1 FROM public.kitchen_orders o WHERE o.venue_id = watchdog_obs._venue())),
    'observer_exposed_public_functions', v_exposed_fn + v_exposed_obs,
    'observer_exposed_extension_definer_functions', v_exposed_ext,
    'observer_exposed_public_tables', v_exposed_tbl,
    'observer_reachable_platform_tables', v_reachable,
    'heartbeat_supported', to_regclass('public.kitchen_device_heartbeats') IS NOT NULL
  );
END
$$;

-- =========================================================================
-- 4. B01 — Persistenza e integrità degli ordini
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b01_orders(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_window integer := watchdog_obs._int(p_params, 'window_minutes', 1440, 5, 10080);
  v_since timestamptz := watchdog_obs._ts(p_params, 'since', now() - interval '30 days');
  v_items_grace integer := watchdog_obs._int(p_params, 'items_grace_seconds', 60, 10, 3600);
  v_rules jsonb := '[]'::jsonb;
  v_rule record;
BEGIN
  FOR v_rule IN
    WITH base AS (
      SELECT o.* FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.created_at >= v_since
    ), items AS (
      SELECT i.order_id, sum(i.quantity::numeric * i.price) AS items_total, count(*) AS n
        FROM public.kitchen_order_items i
        JOIN base b ON b.id = i.order_id
       GROUP BY i.order_id
    ), violations AS (
      SELECT 'paid_without_paid_at'::text AS code, b.id, b.order_code, b.status, b.created_at
        FROM base b WHERE b.payment_status = 'paid' AND b.paid_at IS NULL
      UNION ALL
      SELECT 'cancelled_without_cancelled_at', b.id, b.order_code, b.status, b.created_at
        FROM base b WHERE b.status = 'cancelled' AND b.cancelled_at IS NULL
      UNION ALL
      SELECT 'ready_without_ready_at', b.id, b.order_code, b.status, b.created_at
        FROM base b WHERE b.status = 'ready' AND b.ready_at IS NULL
      UNION ALL
      SELECT 'missing_service_sequence', b.id, b.order_code, b.status, b.created_at
        FROM base b WHERE b.service_day IS NULL OR b.service_sequence IS NULL
      UNION ALL
      SELECT 'order_without_items', b.id, b.order_code, b.status, b.created_at
        FROM base b LEFT JOIN items i ON i.order_id = b.id
       WHERE i.order_id IS NULL
         AND b.status NOT IN ('cancelled', 'payment_abandoned')
         AND b.created_at < now() - make_interval(secs => v_items_grace)
      UNION ALL
      SELECT 'total_items_mismatch', b.id, b.order_code, b.status, b.created_at
        FROM base b JOIN items i ON i.order_id = b.id
       WHERE abs(i.items_total - b.total) > 0.01
         AND abs(i.items_total - COALESCE(b.discount_amount, 0) - b.total) > 0.01
      UNION ALL
      SELECT 'online_paid_flow_mismatch', b.id, b.order_code, b.status, b.created_at
        FROM base b
       WHERE b.status IN ('received', 'preparing', 'ready', 'delivered')
         AND b.payment_method = 'sumup_online'
         AND b.payment_status IS DISTINCT FROM 'paid'
         AND b.payment_status IS DISTINCT FROM 'refunded'
    )
    SELECT v.code,
           count(*) AS n,
           (SELECT jsonb_agg(s) FROM (
              SELECT jsonb_build_object('order_id', x.id, 'order_code', x.order_code, 'status', x.status,
                                        'created_at', x.created_at) AS s
                FROM violations x WHERE x.code = v.code ORDER BY x.created_at DESC LIMIT 5) q) AS samples
      FROM violations v
     GROUP BY v.code
  LOOP
    v_rules := v_rules || jsonb_build_object('code', v_rule.code, 'count', v_rule.n, 'samples', COALESCE(v_rule.samples, '[]'::jsonb));
  END LOOP;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'venue_id', v_venue,
    'since', v_since,
    'window_minutes', v_window,
    'orders_since', (SELECT count(*) FROM public.kitchen_orders o WHERE o.venue_id = v_venue AND o.created_at >= v_since),
    'orders_in_window', (SELECT count(*) FROM public.kitchen_orders o
                          WHERE o.venue_id = v_venue AND o.created_at >= now() - make_interval(mins => v_window)),
    'last_order_at', (SELECT max(o.created_at) FROM public.kitchen_orders o WHERE o.venue_id = v_venue),
    'rules', v_rules
  );
END
$$;

-- =========================================================================
-- 5. B02 — Riconciliazione dei pagamenti (stessa logica delle viste drift, senza filtro staff)
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b02_payments(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  -- PAYMENT_HUB_BASELINE_V1 (api/_lib/paymentOrderDriftSensor.js:20) come limite inferiore assoluto.
  v_baseline timestamptz := watchdog_obs._ts(p_params, 'since', '2026-08-28T15:53:58.298771Z'::timestamptz);
  -- Finestra LIMITATA (default 30 giorni, max 400): senza limite la baseline fissa produce una scansione che
  -- cresce per sempre a ogni esecuzione (ogni 120 s). Le anomalie più vecchie della finestra non spariscono:
  -- il sensore esegue al più una volta al giorno una scansione completa (lookback_days = 400) e le riporta.
  v_lookback integer := watchdog_obs._int(p_params, 'lookback_days', 30, 1, 400);
  v_since timestamptz := GREATEST(v_baseline, now() - make_interval(days => v_lookback));
  v_window integer := watchdog_obs._int(p_params, 'events_window_minutes', 1440, 5, 10080);
  v_stale_h integer := watchdog_obs._int(p_params, 'stale_attempt_hours', 24, 1, 720);
  v_drift jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_r record;
BEGIN
  FOR v_r IN
    WITH d AS (
      SELECT 'paid_without_verifiable_charge'::text AS drift_type, o.id AS order_id, o.order_code, o.payment_status, o.created_at
        FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.created_at >= v_since
         AND o.payment_status = 'paid'
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments kp
                          WHERE kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
                            AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL))
      UNION ALL
      SELECT 'refunded_without_verifiable_refund', o.id, o.order_code, o.payment_status, o.created_at
        FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.created_at >= v_since
         AND o.payment_status = 'refunded'
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments kp
                          WHERE kp.order_id = o.id AND kp.direction = 'refund' AND kp.status = 'succeeded'
                            AND (kp.provider <> 'sumup' OR kp.provider_ref IS NOT NULL))
      UNION ALL
      SELECT 'refund_stuck_initiated', kp.order_id, o.order_code, o.payment_status, o.created_at
        FROM public.kitchen_payments kp JOIN public.kitchen_orders o ON o.id = kp.order_id
       WHERE kp.venue_id = v_venue AND o.created_at >= v_since
         AND kp.direction = 'refund' AND kp.status IN ('initiated', 'pending')
      UNION ALL
      SELECT 'failed_charge_retry_window_open', kp.order_id, o.order_code, o.payment_status, o.created_at
        FROM public.kitchen_payments kp JOIN public.kitchen_orders o ON o.id = kp.order_id
       WHERE kp.venue_id = v_venue AND o.created_at >= v_since
         AND kp.direction = 'charge' AND kp.status = 'failed' AND kp.provider = 'sumup'
         AND kp.failure_reason = 'sumup_failed'
         AND o.payment_status <> 'paid'
         AND o.status NOT IN ('cancelled', 'pending_online_payment', 'payment_abandoned')
      UNION ALL
      -- equivalente a kitchen_payments_order_reconciliation
      SELECT 'paid_without_succeeded_charge', o.id, o.order_code, o.payment_status, o.created_at
        FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.created_at >= v_since
         AND o.payment_status = 'paid'
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments kp
                          WHERE kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded')
    )
    SELECT d.drift_type, count(*) AS n,
           (SELECT jsonb_agg(s) FROM (
              SELECT jsonb_build_object('order_id', x.order_id, 'order_code', x.order_code,
                                        'payment_status', x.payment_status, 'created_at', x.created_at) AS s
                FROM d x WHERE x.drift_type = d.drift_type ORDER BY x.created_at DESC LIMIT 5) q) AS samples
      FROM d GROUP BY d.drift_type
  LOOP
    v_drift := v_drift || jsonb_build_object('type', v_r.drift_type, 'count', v_r.n, 'samples', COALESCE(v_r.samples, '[]'::jsonb));
  END LOOP;

  FOR v_r IN
    SELECT l.action, count(*) AS n, max(l.created_at) AS last_at,
           (SELECT jsonb_agg(s) FROM (
              SELECT jsonb_build_object('order_id', x.order_id, 'created_at', x.created_at) AS s
                FROM public.kitchen_action_log x
               WHERE x.venue_id = v_venue AND x.action = l.action
                 AND x.created_at >= now() - make_interval(mins => v_window)
               ORDER BY x.created_at DESC LIMIT 5) q) AS samples
      FROM public.kitchen_action_log l
     WHERE l.venue_id = v_venue
       AND l.created_at >= now() - make_interval(mins => v_window)
       AND l.action IN ('payment_confirm_lost_race', 'payment_confirmed_amount_mismatch',
                        'payment_confirmed_after_abandon', 'payment_confirmed_after_cancel',
                        'payment_refund_failed')
     GROUP BY l.action
  LOOP
    v_events := v_events || jsonb_build_object('action', v_r.action, 'count', v_r.n, 'last_at', v_r.last_at,
                                               'samples', COALESCE(v_r.samples, '[]'::jsonb));
  END LOOP;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'venue_id', v_venue,
    'since', v_since,
    'baseline', v_baseline,
    'lookback_days', v_lookback,
    'events_window_minutes', v_window,
    'drift', v_drift,
    'events', v_events,
    'stale_attempts', (
      SELECT jsonb_build_object('count', count(*), 'samples', COALESCE((
        SELECT jsonb_agg(s) FROM (
          SELECT jsonb_build_object('payment_id', kp2.id, 'order_id', kp2.order_id, 'status', kp2.status,
                                    'direction', kp2.direction, 'created_at', kp2.created_at) AS s
            FROM public.kitchen_payments kp2
           WHERE kp2.venue_id = v_venue AND kp2.status IN ('initiated', 'pending')
             AND kp2.created_at < now() - make_interval(hours => v_stale_h)
             AND kp2.created_at >= v_since
           ORDER BY kp2.created_at DESC LIMIT 5) q), '[]'::jsonb))
        FROM public.kitchen_payments kp
       WHERE kp.venue_id = v_venue AND kp.status IN ('initiated', 'pending')
         AND kp.created_at < now() - make_interval(hours => v_stale_h)
         AND kp.created_at >= v_since),
    -- evidenza positiva: il sensore vede pagamenti reali dell'installazione
    'paid_orders_since', (SELECT count(*) FROM public.kitchen_orders o
                           WHERE o.venue_id = v_venue AND o.created_at >= v_since AND o.payment_status = 'paid'),
    'succeeded_charges_since', (SELECT count(*) FROM public.kitchen_payments kp
                                 WHERE kp.venue_id = v_venue AND kp.created_at >= v_since
                                   AND kp.direction = 'charge' AND kp.status = 'succeeded')
  );
END
$$;

-- =========================================================================
-- 6. B03 — Affidabilità ed elaborazione dei webhook
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b03_webhooks(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_window integer := watchdog_obs._int(p_params, 'window_minutes', 1440, 5, 10080);
  v_grace integer := watchdog_obs._int(p_params, 'paid_event_grace_minutes', 10, 1, 1440);
  v_from timestamptz := now() - make_interval(mins => v_window);
BEGIN
  RETURN (
    WITH ev AS (
      SELECT e.id, e.provider_event_id, e.received_at, e.processed_at, e.processing_error,
             split_part(e.provider_event_id, ':', 1) AS checkout_id,
             upper(split_part(e.provider_event_id, ':', 2)) AS ev_status
        FROM public.kitchen_payment_webhook_events e
       WHERE e.provider = 'sumup' AND e.received_at >= v_from
    ), online AS (
      SELECT kp.* FROM public.kitchen_payments kp
       WHERE kp.venue_id = v_venue AND kp.provider = 'sumup' AND kp.channel = 'app'
         AND kp.direction = 'charge' AND kp.created_at >= v_from
    ), venue_ev AS (
      SELECT ev.* FROM ev JOIN public.kitchen_payments kp ON kp.provider_ref = ev.checkout_id
       WHERE kp.venue_id = v_venue
    ), paid_no_charge AS (
      SELECT DISTINCT kp.id AS payment_id, kp.order_id, kp.status, ev.received_at
        FROM venue_ev ev JOIN public.kitchen_payments kp ON kp.provider_ref = ev.checkout_id
       WHERE ev.ev_status IN ('PAID', 'SUCCESSFUL')
         AND kp.status <> 'succeeded'
         AND ev.received_at < now() - make_interval(mins => v_grace)
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments k2
                          WHERE k2.order_id = kp.order_id AND k2.direction = 'charge' AND k2.status = 'succeeded')
    )
    SELECT jsonb_build_object(
      'generated_at', now(),
      'window_minutes', v_window,
      'last_event_at', (SELECT max(e.received_at) FROM public.kitchen_payment_webhook_events e WHERE e.provider = 'sumup'),
      'events_in_window', (SELECT count(*) FROM venue_ev),
      'events_unmatched_in_window', (SELECT count(*) FROM ev WHERE NOT EXISTS (
          SELECT 1 FROM public.kitchen_payments kp WHERE kp.provider_ref = ev.checkout_id)),
      'by_status', COALESCE((SELECT jsonb_object_agg(s.ev_status, s.n) FROM (
          SELECT ev_status, count(*) AS n FROM venue_ev GROUP BY ev_status) s), '{}'::jsonb),
      'online_charges_in_window', (SELECT count(*) FROM online),
      'online_succeeded_in_window', (SELECT count(*) FROM online WHERE status = 'succeeded'),
      'online_succeeded_with_event', (SELECT count(*) FROM online o
          WHERE o.status = 'succeeded' AND o.provider_ref IS NOT NULL
            AND EXISTS (SELECT 1 FROM ev WHERE ev.checkout_id = o.provider_ref)),
      'paid_event_without_succeeded_charge', jsonb_build_object(
          'count', (SELECT count(*) FROM paid_no_charge),
          'samples', COALESCE((SELECT jsonb_agg(s) FROM (
              SELECT jsonb_build_object('payment_id', payment_id, 'order_id', order_id, 'status', status,
                                        'received_at', received_at) AS s
                FROM paid_no_charge ORDER BY received_at DESC LIMIT 5) q), '[]'::jsonb)),
      -- tracciamento dell'esito: oggi processed_at/processing_error non vengono mai scritti dal webhook
      'outcome_tracking', jsonb_build_object(
          'rows_in_window', (SELECT count(*) FROM ev),
          'rows_with_processed_at', (SELECT count(*) FROM ev WHERE processed_at IS NOT NULL),
          'rows_with_processing_error', (SELECT count(*) FROM ev WHERE processing_error IS NOT NULL))
    )
  );
END
$$;

-- =========================================================================
-- 7. B04 — Disponibilità tecnica degli ordini in cucina
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b04_kitchen(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_pop_max integer := watchdog_obs._int(p_params, 'pop_max_minutes', 7, 2, 240);
  v_grace integer := watchdog_obs._int(p_params, 'paid_hidden_grace_seconds', 90, 15, 3600);
  v_window integer := watchdog_obs._int(p_params, 'window_minutes', 1440, 5, 10080);
  v_unresolved integer := watchdog_obs._int(p_params, 'unresolved_lookback_days', 30, 1, 400);
  v_pub_exists boolean;
  v_published boolean;
  v_open boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') INTO v_pub_exists;
  SELECT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'kitchen_orders')
    INTO v_published;
  IF to_regclass('public.kitchen_service_state') IS NOT NULL THEN
    EXECUTE 'SELECT is_open FROM public.kitchen_service_state WHERE venue_id = $1' INTO v_open USING v_venue;
  END IF;

  RETURN (
    WITH pop AS (
      SELECT o.id, o.order_code, o.created_at FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.status = 'pending_online_payment'
         AND o.created_at < now() - make_interval(mins => v_pop_max)
    ), hidden AS (
      -- pagato ma ancora in attesa di pagamento: la cucina non lo vede (guasto di sincronizzazione)
      SELECT o.id, o.order_code, o.status, kp.updated_at AS paid_at_provider
        FROM public.kitchen_orders o
        JOIN public.kitchen_payments kp ON kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
       WHERE o.venue_id = v_venue AND o.status = 'pending_online_payment'
         AND kp.updated_at < now() - make_interval(secs => v_grace)
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments r WHERE r.order_id = o.id
                          AND r.direction = 'refund' AND r.status = 'succeeded')
    ), after_abandon AS (
      -- PAID arrivato dopo l'abbandono: Walbox lascia l'ordine chiuso di proposito (20261012100000) e registra
      -- payment_confirmed_after_abandon. Soldi incassati senza ordine: anomalia finché non c'è un rimborso riuscito.
      SELECT o.id, o.order_code, o.status, kp.updated_at AS paid_at_provider
        FROM public.kitchen_orders o
        JOIN public.kitchen_payments kp ON kp.order_id = o.id AND kp.direction = 'charge' AND kp.status = 'succeeded'
       WHERE o.venue_id = v_venue AND o.status = 'payment_abandoned'
         AND o.created_at >= now() - make_interval(days => v_unresolved)
         AND kp.updated_at < now() - make_interval(secs => v_grace)
         AND NOT EXISTS (SELECT 1 FROM public.kitchen_payments r WHERE r.order_id = o.id
                          AND r.direction = 'refund' AND r.status = 'succeeded')
    )
    SELECT jsonb_build_object(
      'generated_at', now(),
      'pop_max_minutes', v_pop_max,
      'pop_overdue', jsonb_build_object('count', (SELECT count(*) FROM pop),
          'samples', COALESCE((SELECT jsonb_agg(s) FROM (SELECT jsonb_build_object('order_id', id, 'order_code', order_code,
              'created_at', created_at) AS s FROM pop ORDER BY created_at LIMIT 5) q), '[]'::jsonb)),
      'paid_hidden', jsonb_build_object('count', (SELECT count(*) FROM hidden),
          'samples', COALESCE((SELECT jsonb_agg(s) FROM (SELECT jsonb_build_object('order_id', id, 'order_code', order_code,
              'status', status, 'paid_at_provider', paid_at_provider) AS s FROM hidden ORDER BY paid_at_provider LIMIT 5) q), '[]'::jsonb)),
      'paid_after_abandon_unresolved', jsonb_build_object('count', (SELECT count(*) FROM after_abandon),
          'samples', COALESCE((SELECT jsonb_agg(s) FROM (SELECT jsonb_build_object('order_id', id, 'order_code', order_code,
              'status', status, 'paid_at_provider', paid_at_provider) AS s FROM after_abandon ORDER BY paid_at_provider LIMIT 5) q), '[]'::jsonb)),
      'unresolved_lookback_days', v_unresolved,
      'abandon_stuck_events', jsonb_build_object(
          'count', (SELECT count(*) FROM public.kitchen_action_log l WHERE l.venue_id = v_venue
                     AND l.action = 'online_abandon_stuck' AND l.created_at >= now() - make_interval(mins => v_window)),
          'last_at', (SELECT max(l.created_at) FROM public.kitchen_action_log l WHERE l.venue_id = v_venue
                     AND l.action = 'online_abandon_stuck')),
      'realtime', jsonb_build_object('publication_exists', v_pub_exists, 'kitchen_orders_published', v_published),
      'service_open', v_open,
      'active_orders', (SELECT count(*) FROM public.kitchen_orders o WHERE o.venue_id = v_venue
                         AND o.status IN ('received', 'preparing', 'ready')),
      -- evidenza di traffico: senza ordini nella finestra la disponibilità in cucina non è stata esercitata
      'orders_in_window', (SELECT count(*) FROM public.kitchen_orders o WHERE o.venue_id = v_venue
                            AND o.created_at >= now() - make_interval(mins => v_window))
    )
  );
END
$$;

-- =========================================================================
-- 8. B05 — Connessione dei dispositivi Kitchen/TV (richiede la migration heartbeat)
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b05_devices(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_devices jsonb := '[]'::jsonb;
  v_open boolean;
BEGIN
  IF to_regclass('public.kitchen_service_state') IS NOT NULL THEN
    EXECUTE 'SELECT is_open FROM public.kitchen_service_state WHERE venue_id = $1' INTO v_open USING v_venue;
  END IF;
  IF to_regclass('public.kitchen_device_heartbeats') IS NULL THEN
    RETURN jsonb_build_object('generated_at', now(), 'supported', false, 'service_open', v_open, 'devices', v_devices);
  END IF;
  EXECUTE $q$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'device_id', h.device_id, 'kind', h.device_kind, 'last_seen_at', h.last_seen_at,
             'realtime_status', h.realtime_status, 'last_sync_at', h.last_sync_at, 'app_bundle', h.app_bundle)
             ORDER BY h.device_id), '[]'::jsonb)
      FROM public.kitchen_device_heartbeats h
     WHERE h.venue_id = $1
  $q$ INTO v_devices USING v_venue;
  RETURN jsonb_build_object('generated_at', now(), 'supported', true, 'service_open', v_open, 'devices', v_devices);
END
$$;

-- =========================================================================
-- 9. B06 — Catena end-to-end ordine → pagamento → cucina (osservazione passiva)
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.b06_chain(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_window integer := watchdog_obs._int(p_params, 'window_minutes', 240, 15, 10080);
  v_pop_max integer := watchdog_obs._int(p_params, 'pop_max_minutes', 7, 2, 240);
  v_grace integer := watchdog_obs._int(p_params, 'paid_hidden_grace_seconds', 90, 15, 3600);
BEGIN
  RETURN (
    WITH o AS (
      SELECT o.id, o.order_code, o.status, o.payment_status, o.created_at,
             EXISTS (SELECT 1 FROM public.kitchen_payments kp WHERE kp.order_id = o.id
                      AND kp.direction = 'charge' AND kp.channel = 'app') AS has_app_attempt,
             (SELECT max(kp.updated_at) FROM public.kitchen_payments kp WHERE kp.order_id = o.id
                      AND kp.direction = 'charge' AND kp.status = 'succeeded') AS succeeded_at,
             (SELECT kp.provider FROM public.kitchen_payments kp WHERE kp.order_id = o.id
                      AND kp.direction = 'charge' AND kp.status = 'succeeded' LIMIT 1) AS succeeded_provider,
             EXISTS (SELECT 1 FROM public.kitchen_payments kp WHERE kp.order_id = o.id
                      AND kp.direction = 'refund' AND kp.status = 'succeeded') AS refunded
        FROM public.kitchen_orders o
       WHERE o.venue_id = v_venue AND o.created_at >= now() - make_interval(mins => v_window)
    ), c AS (
      SELECT o.*,
             (o.has_app_attempt OR o.status IN ('pending_online_payment', 'payment_abandoned')) AS online_lane,
             CASE
               WHEN o.succeeded_at IS NOT NULL AND o.status = 'pending_online_payment' AND NOT o.refunded
                    AND o.succeeded_at < now() - make_interval(secs => v_grace) THEN 'broken_paid_not_visible'
               WHEN o.succeeded_at IS NOT NULL AND o.status = 'payment_abandoned' AND NOT o.refunded
                    AND o.succeeded_at < now() - make_interval(secs => v_grace) THEN 'broken_paid_after_abandon'
               WHEN o.succeeded_at IS NOT NULL AND o.payment_status IS DISTINCT FROM 'paid'
                    AND o.payment_status IS DISTINCT FROM 'refunded'
                    AND o.succeeded_at < now() - make_interval(secs => v_grace) THEN 'broken_paid_not_marked'
               WHEN o.status = 'pending_online_payment'
                    AND o.created_at < now() - make_interval(mins => v_pop_max) THEN 'broken_pop_not_closed'
               WHEN o.status = 'pending_online_payment' THEN 'awaiting_customer'
               WHEN o.status = 'pending_counter_payment' THEN 'awaiting_counter'
               WHEN o.status IN ('payment_abandoned', 'cancelled') THEN 'closed_unpaid'
               WHEN o.payment_status IN ('paid', 'refunded')
                    AND o.status IN ('received', 'preparing', 'ready', 'delivered') THEN 'complete'
               ELSE 'in_progress'
             END AS stage
        FROM o
    )
    SELECT jsonb_build_object(
      'generated_at', now(),
      'window_minutes', v_window,
      'orders_in_window', (SELECT count(*) FROM c),
      'online', jsonb_build_object(
          'total', (SELECT count(*) FROM c WHERE online_lane),
          'stages', COALESCE((SELECT jsonb_object_agg(stage, n) FROM (
              SELECT stage, count(*) AS n FROM c WHERE online_lane GROUP BY stage) s), '{}'::jsonb)),
      'counter', jsonb_build_object(
          'total', (SELECT count(*) FROM c WHERE NOT online_lane),
          'stages', COALESCE((SELECT jsonb_object_agg(stage, n) FROM (
              SELECT stage, count(*) AS n FROM c WHERE NOT online_lane GROUP BY stage) s), '{}'::jsonb)),
      'broken_samples', COALESCE((SELECT jsonb_agg(s) FROM (
          SELECT jsonb_build_object('order_id', id, 'order_code', order_code, 'stage', stage, 'status', status,
                                    'payment_status', payment_status, 'created_at', created_at) AS s
            FROM c WHERE stage LIKE 'broken_%' ORDER BY created_at LIMIT 10) q), '[]'::jsonb)
    )
  );
END
$$;

-- =========================================================================
-- 10. Job pianificati e chiamate HTTP del database (pg_cron / pg_net), se presenti
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.jobs(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_hours integer := watchdog_obs._int(p_params, 'window_hours', 24, 1, 168);
  v_jobs jsonb := '[]'::jsonb;
  v_net jsonb := NULL;
  v_cron boolean := to_regclass('cron.job') IS NOT NULL AND to_regclass('cron.job_run_details') IS NOT NULL;
  v_has_net boolean := to_regclass('net._http_response') IS NOT NULL;
BEGIN
  IF v_cron THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
               'last_start', r.last_start, 'last_end', r.last_end, 'last_status', r.last_status,
               'runs_window', COALESCE(r.runs, 0), 'failures_window', COALESCE(r.failures, 0),
               'last_success', r.last_success) ORDER BY j.jobname), '[]'::jsonb)
        FROM cron.job j
        LEFT JOIN LATERAL (
          SELECT max(d.start_time) AS last_start,
                 max(d.end_time) AS last_end,
                 (SELECT d2.status FROM cron.job_run_details d2 WHERE d2.jobid = j.jobid
                   ORDER BY d2.start_time DESC NULLS LAST LIMIT 1) AS last_status,
                 count(*) FILTER (WHERE d.start_time >= now() - make_interval(hours => $1)) AS runs,
                 count(*) FILTER (WHERE d.start_time >= now() - make_interval(hours => $1)
                                    AND d.status NOT IN ('succeeded', 'running', 'starting')) AS failures,
                 max(d.end_time) FILTER (WHERE d.status = 'succeeded') AS last_success
            FROM cron.job_run_details d WHERE d.jobid = j.jobid
        ) r ON true
    $q$ INTO v_jobs USING v_hours;
  END IF;
  IF v_has_net THEN
    -- solo codici e conteggi: mai contenuto, header o messaggi (possono contenere URL o dati)
    EXECUTE $q$
      SELECT jsonb_build_object(
        'total', count(*),
        'non_2xx', count(*) FILTER (WHERE status_code IS NULL OR status_code < 200 OR status_code >= 300),
        'timed_out', count(*) FILTER (WHERE timed_out),
        'last_at', max(created),
        'last_non_2xx_at', max(created) FILTER (WHERE status_code IS NULL OR status_code < 200 OR status_code >= 300),
        'status_codes', COALESCE((SELECT jsonb_object_agg(COALESCE(s.code::text, 'nessuno'), s.n) FROM (
            SELECT status_code AS code, count(*) AS n FROM net._http_response
             WHERE created >= now() - make_interval(hours => $1) GROUP BY status_code) s), '{}'::jsonb))
        FROM net._http_response WHERE created >= now() - make_interval(hours => $1)
    $q$ INTO v_net USING v_hours;
  END IF;
  RETURN jsonb_build_object('generated_at', now(), 'window_hours', v_hours,
                            'cron_available', v_cron, 'jobs', v_jobs,
                            'net_available', v_has_net, 'net', v_net);
END
$$;

-- =========================================================================
-- 11. Errori applicativi osservabili nel database
-- =========================================================================

CREATE OR REPLACE FUNCTION watchdog_obs.app_errors(p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_venue text := watchdog_obs._venue();
  v_window integer := watchdog_obs._int(p_params, 'window_minutes', 60, 5, 10080);
BEGIN
  RETURN jsonb_build_object(
    'generated_at', now(),
    'window_minutes', v_window,
    'actions', COALESCE((SELECT jsonb_object_agg(a.action, a.n) FROM (
        SELECT l.action, count(*) AS n FROM public.kitchen_action_log l
         WHERE l.venue_id = v_venue AND l.created_at >= now() - make_interval(mins => v_window)
           AND l.actor_type = 'system'
           AND l.action IN ('payment_failed', 'payment_refund_failed', 'online_abandon_stuck',
                            'payment_confirm_lost_race', 'payment_confirmed_amount_mismatch')
         GROUP BY l.action) a), '{}'::jsonb),
    'failed_payments_by_reason', COALESCE((SELECT jsonb_object_agg(f.reason, f.n) FROM (
        SELECT COALESCE(kp.failure_reason, 'sconosciuto') AS reason, count(*) AS n FROM public.kitchen_payments kp
         WHERE kp.venue_id = v_venue AND kp.status = 'failed'
           AND kp.updated_at >= now() - make_interval(mins => v_window)
         GROUP BY 1) f), '{}'::jsonb)
  );
END
$$;

-- =========================================================================
-- 12. Hardening anti-impersonificazione MIRATO, con snapshot e rollback
-- =========================================================================
-- Vettore: un login Postgres può eseguire `SET request.jwt.claims = …` e far restituire ad auth.uid()/auth.role()
-- un'identità staff o service_role. Il rischio esiste SOLO per le funzioni SECURITY DEFINER eseguibili tramite
-- PUBLIC: girano con i privilegi dell'owner e si fidano di auth.*(). Le funzioni SECURITY INVOKER girano con i
-- privilegi del chiamante e il ruolo observer non ha alcun privilegio su tabelle: non sono un vettore.
--
-- Cosa si fa, per ogni funzione SECURITY DEFINER di `public` (non di estensione) eseguibile da PUBLIC:
--   1. si registra l'ACL originale in watchdog_obs.privilege_changes (rollback esatto);
--   2. si concede EXECUTE in modo ESPLICITO a ogni ruolo esistente che oggi lo ha tramite PUBLIC, esclusi
--      watchdog_observer e i suoi membri (i superuser non ne hanno bisogno; i ruoli predefiniti pg_* sono inclusi);
--   3. si revoca EXECUTE a PUBLIC.
-- Risultato: nessun ruolo esistente (anon, authenticated, service_role, postgres, ruoli interni Supabase, login
-- personalizzati) perde o guadagna un privilegio effettivo; lo perde solo la famiglia watchdog_observer.
-- NON si toccano: funzioni INVOKER, funzioni di estensioni, schemi gestiti da Supabase, default privileges.
-- Rollback: walbox-observability/scripts/rollback_public_hardening.sql (ripristina l'ACL registrata e la confronta).

CREATE TABLE IF NOT EXISTS watchdog_obs.privilege_changes (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id         uuid NOT NULL,
  applied_at       timestamptz NOT NULL DEFAULT now(),
  applied_by       text NOT NULL DEFAULT current_user,
  function_oid     oid NOT NULL,
  function_sig     text NOT NULL,
  owner_name       text NOT NULL,
  acl_before       aclitem[],          -- NULL = ACL di default (EXECUTE a PUBLIC e all'owner)
  granted_roles    text[] NOT NULL,    -- ruoli che hanno ricevuto un GRANT esplicito da questo hardening
  acl_after        aclitem[],
  rolled_back_at   timestamptz
);
REVOKE ALL ON watchdog_obs.privilege_changes FROM PUBLIC;

-- ACL normalizzata per confronti (NULL → default esplicito, elementi ordinati).
CREATE OR REPLACE FUNCTION watchdog_obs._acl_norm(p_acl aclitem[], p_owner oid)
RETURNS text[]
LANGUAGE sql STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT COALESCE(array_agg(x::text ORDER BY x::text), '{}')
    FROM unnest(COALESCE(p_acl, acldefault('f', p_owner))) AS x
$$;

CREATE OR REPLACE FUNCTION watchdog_obs.harden_public_definer_functions()
RETURNS integer
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_f record;
  v_role text;
  v_granted text[];
  v_n integer := 0;
BEGIN
  FOR v_f IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proowner, p.proacl
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
       AND (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
     ORDER BY p.oid
  LOOP
    v_granted := ARRAY[]::text[];
    FOR v_role IN
      SELECT r.rolname FROM pg_roles r
       WHERE NOT r.rolsuper
         AND r.oid <> v_f.proowner
         AND r.rolname <> 'watchdog_observer'
         -- famiglia observer = chi ne eredita i privilegi o può assumerlo (SET ROLE). Da PG16 chi crea un ruolo ne
         -- riceve solo l'ADMIN OPTION (es. postgres): non è un observer e conserva i propri privilegi.
         -- 'SET' esiste solo da PG16; fino a PG15 ogni appartenenza consente SET ROLE.
         AND NOT CASE WHEN current_setting('server_version_num')::int >= 160000
                      THEN pg_has_role(r.oid, 'watchdog_observer', 'USAGE') OR pg_has_role(r.oid, 'watchdog_observer', 'SET')
                      ELSE pg_has_role(r.oid, 'watchdog_observer', 'MEMBER') END
         -- già titolare di un GRANT esplicito: nulla da aggiungere
         AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(v_f.proacl, acldefault('f', v_f.proowner))) a
                          WHERE a.grantee = r.oid AND a.privilege_type = 'EXECUTE')
       ORDER BY r.rolname
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', v_f.sig, v_role);
      v_granted := v_granted || v_role;
    END LOOP;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_f.sig);
    INSERT INTO watchdog_obs.privilege_changes (batch_id, function_oid, function_sig, owner_name, acl_before, granted_roles, acl_after)
    VALUES (v_batch, v_f.oid, v_f.sig::text, pg_get_userbyid(v_f.proowner), v_f.proacl, v_granted,
            (SELECT proacl FROM pg_proc WHERE oid = v_f.oid));
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'hardening watchdog_obs: % funzioni SECURITY DEFINER, batch %', v_n, v_batch;
  RETURN v_n;
END
$$;

-- Ripristina l'ACL registrata (tutti i batch non ancora annullati, oppure solo p_batch) e verifica che coincida
-- con quella originale. In caso di differenza solleva un errore e annulla tutto, salvo p_allow_drift.
CREATE OR REPLACE FUNCTION watchdog_obs.rollback_public_hardening(p_batch uuid DEFAULT NULL, p_allow_drift boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_c record;
  v_role text;
  v_now_acl aclitem[];
  v_owner oid;
  v_n integer := 0;
  v_drift text[] := ARRAY[]::text[];
BEGIN
  FOR v_c IN
    SELECT * FROM watchdog_obs.privilege_changes
     WHERE rolled_back_at IS NULL AND (p_batch IS NULL OR batch_id = p_batch)
     ORDER BY id DESC
  LOOP
    SELECT proacl, proowner INTO v_now_acl, v_owner FROM pg_proc WHERE oid = v_c.function_oid;
    IF NOT FOUND THEN
      RAISE NOTICE 'rollback: % non esiste più, salto', v_c.function_sig;
      UPDATE watchdog_obs.privilege_changes SET rolled_back_at = now() WHERE id = v_c.id;
      CONTINUE;
    END IF;
    FOREACH v_role IN ARRAY v_c.granted_roles LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', v_c.function_oid::regprocedure, v_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', v_c.function_oid::regprocedure);
    SELECT proacl INTO v_now_acl FROM pg_proc WHERE oid = v_c.function_oid;
    IF watchdog_obs._acl_norm(v_now_acl, v_owner) IS DISTINCT FROM watchdog_obs._acl_norm(v_c.acl_before, v_owner) THEN
      v_drift := v_drift || format('%s: atteso %s, trovato %s', v_c.function_sig,
                                   watchdog_obs._acl_norm(v_c.acl_before, v_owner), watchdog_obs._acl_norm(v_now_acl, v_owner));
    END IF;
    UPDATE watchdog_obs.privilege_changes SET rolled_back_at = now() WHERE id = v_c.id;
    v_n := v_n + 1;
  END LOOP;
  IF array_length(v_drift, 1) > 0 AND NOT p_allow_drift THEN
    RAISE EXCEPTION 'ROLLBACK NON ESATTO (annullato): %', array_to_string(v_drift, '; ');
  END IF;
  RAISE NOTICE 'rollback watchdog_obs: % funzioni ripristinate', v_n;
  RETURN v_n;
END
$$;

-- =========================================================================
-- 13. Privilegi su watchdog_obs: EXECUTE solo al ruolo observer, e solo sulle 10 funzioni di lettura
-- (hardening, rollback e funzioni interne restano dell'owner)
-- =========================================================================

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'watchdog_obs'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM service_role', v_fn);
    END IF;
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION watchdog_obs.identity() TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.visibility() TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b01_orders(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b02_payments(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b03_webhooks(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b04_kitchen(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b05_devices(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.b06_chain(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.jobs(jsonb) TO watchdog_observer;
GRANT EXECUTE ON FUNCTION watchdog_obs.app_errors(jsonb) TO watchdog_observer;

-- =========================================================================
-- 14. Hardening NON applicato da questa migration
-- =========================================================================
-- Decisione: nessuna modifica implicita alle ACL delle funzioni applicative Walbox (in particolare le funzioni di
-- pagamento) durante il primo deployment. L'hardening della sezione 12 resta disponibile e va eseguito, SOLO con
-- autorizzazione esplicita e dopo preflight_hardening.sql + acl_snapshot.sql, con
--   psql "$DB_ADMIN_URL" -f walbox-observability/scripts/reharden_public_functions.sql
-- (nuovo batch nello snapshot, annullabile con scripts/rollback_public_hardening.sql).
--
-- Finché non è applicato: visibility() conta le funzioni SECURITY DEFINER eseguibili dalla famiglia observer
-- (observer_exposed_public_functions). Con il trasporto Postgres diretto (login observer) il Watchdog lo segnala come
-- anomalia di sicurezza; con il trasporto HTTPS, senza alcun login observer, è solo un'informazione.
-- Nota: NON si modificano i default privileges.

-- =========================================================================
-- 15. IDENTITÀ (eseguito una sola volta per progetto)
-- =========================================================================

INSERT INTO watchdog_obs.installation_identity (installation_id, venue_id)
VALUES (
  COALESCE(NULLIF(current_setting('watchdog.installation_id', true), ''), 'da-configurare'),
  COALESCE(NULLIF(current_setting('watchdog.venue_id', true), ''), 'walrus-main')
)
ON CONFLICT (singleton) DO NOTHING;
