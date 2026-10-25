-- Watchdog observability — gateway HTTPS (P0-2, pg_net) v1.
--
-- STATO: PREPARATORIA — NON APPLICATA A NESSUN DATABASE REMOTO. Richiede la migration 20261023100000 (schema
-- watchdog_obs). Va copiata in walbox-kitchen-mvp/supabase/migrations/ e applicata con `npx supabase db push --linked`
-- SOLO dopo approvazione esplicita di Eros, un progetto Supabase alla volta.
--
-- Perché esiste (docs/P0-2_PG_NET_ARCHITETTURA.md)
--   Su Supabase l'estensione pg_net è di supabase_admin e concede USAGE sullo schema net e ALL su
--   net.http_request_queue / net._http_response a PUBLIC. Il proprietario del progetto non può revocarlo (la revoca
--   come postgres non ha effetto) e Supabase non supporta la modifica di quei grant. Qualunque ruolo con LOGIN, quindi
--   anche un login observer dedicato al Watchdog, può accodare richieste HTTP dal database e leggere gli header in
--   coda (Bearer dello sweep e del push). L'unica mitigazione indicata dalla piattaforma è non dare LOGIN a ruoli che
--   non devono poterlo fare.
--
-- Cosa fa
--   Espone UNA sola funzione, public.watchdog_obs_gateway(p_check, p_params), chiamata dalla Edge Function
--   `watchdog-observability` via PostgREST con la chiave service_role (iniettata dalla piattaforma solo nella
--   funzione, mai posseduta dal Watchdog). Il Watchdog non ha più alcun login Postgres.
--   - allow-list fissa dei controlli: probe, b01_orders … app_errors (le stesse funzioni di lettura già collaudate,
--     nessuna logica duplicata);
--   - identità + visibilità + dati nella STESSA transazione, come il connettore Postgres;
--   - transazione forzata in sola lettura prima di qualunque lettura (transaction_read_only = on);
--   - parametri: solo oggetto jsonb, al massimo 2 KB (i limiti numerici restano quelli di watchdog_obs._int);
--   - attestazione del percorso (`gateway`): login diretti della famiglia observer ancora attivi, ruoli diversi da
--     service_role che possono eseguire il gateway, versione del gateway.
--
-- Cosa NON fa
--   Nessuna scrittura, nessun SQL dinamico guidato dall'input, nessun accesso a net.*, cron.*, vault.*, auth.*
--   oltre a quanto già fanno le funzioni di lettura (jobs() legge solo conteggi e codici di net._http_response).
--   Nessuna nuova funzione SECURITY DEFINER: il gateway è INVOKER e gira come service_role.
--
-- Privilegi effettivi dopo l'applicazione
--   - EXECUTE sul gateway: solo service_role (e l'owner). Revocato a PUBLIC, anon, authenticated (i default
--     privileges di Supabase lo concederebbero ad anon e authenticated).
--   - service_role: USAGE su watchdog_obs ed EXECUTE sulle 10 funzioni di lettura (non su hardening, rollback o
--     funzioni interne). watchdog_obs NON è uno schema esposto da PostgREST: service_role vi arriva solo dal gateway.
--
-- Rollback: walbox-observability/scripts/rollback_https_gateway.sql (rimuove gateway e grant; ACL di watchdog_obs
-- tornano allo stato della migration 20261023100000).

DO $$
BEGIN
  IF to_regnamespace('watchdog_obs') IS NULL OR to_regprocedure('watchdog_obs.identity()') IS NULL THEN
    RAISE EXCEPTION 'watchdog_obs assente: applicare prima la migration 20261023100000_watchdog_observability_v1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'ruolo service_role assente: il gateway HTTPS è previsto solo su Supabase';
  END IF;
END
$$;

-- Attestazione del percorso HTTPS. Solo nomi di ruoli e booleani, mai segreti.
CREATE OR REPLACE FUNCTION watchdog_obs.gateway_attestation()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_fn regprocedure := to_regprocedure('public.watchdog_obs_gateway(text,jsonb)');
  v_logins jsonb;
  v_exposed jsonb;
BEGIN
  -- Login diretti della famiglia observer (stessa definizione dell'hardening: chi ne eredita i privilegi o può
  -- assumerlo; l'ADMIN OPTION implicita di PG16+ non conta). Con il gateway devono essere zero: un login così
  -- raggiungerebbe pg_net tramite PUBLIC (P0-2).
  SELECT COALESCE(jsonb_agg(r.rolname ORDER BY r.rolname), '[]'::jsonb) INTO v_logins
    FROM pg_roles r
   WHERE r.rolcanlogin AND NOT r.rolsuper
     AND (r.rolname = 'watchdog_observer'
          OR CASE WHEN current_setting('server_version_num')::int >= 160000
                  THEN pg_has_role(r.oid, 'watchdog_observer', 'USAGE') OR pg_has_role(r.oid, 'watchdog_observer', 'SET')
                  ELSE pg_has_role(r.oid, 'watchdog_observer', 'MEMBER') END);
  -- Chi, oltre a service_role e ai superuser, può eseguire il gateway (deve essere vuoto; l'owner è escluso).
  IF v_fn IS NULL THEN
    v_exposed := '["gateway assente"]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(r.rolname ORDER BY r.rolname), '[]'::jsonb) INTO v_exposed
      FROM pg_roles r
     WHERE NOT r.rolsuper
       AND r.rolname <> 'service_role'
       AND r.oid <> (SELECT proowner FROM pg_proc WHERE oid = v_fn)
       AND r.rolname NOT LIKE 'pg\_%'
       AND has_function_privilege(r.oid, v_fn, 'EXECUTE');
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = v_fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
      v_exposed := v_exposed || '["PUBLIC"]'::jsonb;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'gateway_version', 1,
    'session_user', session_user,
    'current_user', current_user,
    'observer_login_roles', v_logins,
    'gateway_executable_by', v_exposed,
    'transaction_read_only', current_setting('transaction_read_only') = 'on'
  );
END
$$;
REVOKE ALL ON FUNCTION watchdog_obs.gateway_attestation() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION watchdog_obs.gateway_attestation() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION watchdog_obs.gateway_attestation() FROM authenticated;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.watchdog_obs_gateway(p_check text, p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
-- PostgREST applica lo statement_timeout dichiarato sulla funzione all'intera richiesta (verificato su v16.4: con 1s la
-- chiamata viene annullata a 1,0 s; senza, vale l'8s di authenticator). 6s < 8s della Edge Function: una lettura lenta
-- viene annullata nel database invece di restare in esecuzione dopo l'abbandono della richiesta.
SET statement_timeout = '6s'
AS $$
DECLARE
  v_data jsonb;
BEGIN
  -- Sola lettura per tutta la transazione, prima di qualunque lettura: passare a read only è sempre ammesso, tornare
  -- indietro no. Qualunque scrittura successiva, anche da funzioni chiamate, fallisce con 25006.
  PERFORM set_config('transaction_read_only', 'on', true);

  IF p_check IS NULL OR p_check !~ '^[a-z0-9_]{1,32}$' THEN
    RAISE EXCEPTION 'controllo non valido' USING ERRCODE = '22023';
  END IF;
  IF p_params IS NULL THEN
    p_params := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(p_params) <> 'object' OR length(p_params::text) > 2048 THEN
    RAISE EXCEPTION 'parametri non validi' USING ERRCODE = '22023';
  END IF;

  -- allow-list fissa: nessun nome di funzione costruito dall'input
  CASE p_check
    WHEN 'probe' THEN v_data := NULL;
    WHEN 'b01_orders' THEN v_data := watchdog_obs.b01_orders(p_params);
    WHEN 'b02_payments' THEN v_data := watchdog_obs.b02_payments(p_params);
    WHEN 'b03_webhooks' THEN v_data := watchdog_obs.b03_webhooks(p_params);
    WHEN 'b04_kitchen' THEN v_data := watchdog_obs.b04_kitchen(p_params);
    WHEN 'b05_devices' THEN v_data := watchdog_obs.b05_devices(p_params);
    WHEN 'b06_chain' THEN v_data := watchdog_obs.b06_chain(p_params);
    WHEN 'jobs' THEN v_data := watchdog_obs.jobs(p_params);
    WHEN 'app_errors' THEN v_data := watchdog_obs.app_errors(p_params);
    ELSE RAISE EXCEPTION 'controllo non ammesso' USING ERRCODE = '22023';
  END CASE;

  RETURN jsonb_build_object(
    'identity', watchdog_obs.identity(),
    'visibility', watchdog_obs.visibility(),
    'gateway', watchdog_obs.gateway_attestation(),
    'data', v_data
  );
END
$$;

REVOKE ALL ON FUNCTION public.watchdog_obs_gateway(text, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.watchdog_obs_gateway(text, jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.watchdog_obs_gateway(text, jsonb) FROM authenticated;
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION public.watchdog_obs_gateway(text, jsonb) TO service_role;

GRANT USAGE ON SCHEMA watchdog_obs TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.identity() TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.visibility() TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.gateway_attestation() TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b01_orders(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b02_payments(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b03_webhooks(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b04_kitchen(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b05_devices(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.b06_chain(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.jobs(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION watchdog_obs.app_errors(jsonb) TO service_role;

-- PostgREST rilegge lo schema per esporre la nuova RPC (solo a service_role, per i grant sopra).
NOTIFY pgrst, 'reload schema';
