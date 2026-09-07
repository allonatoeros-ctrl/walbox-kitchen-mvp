-- Jukebox schema baseline v1 — DOCUMENTATION ONLY, NOT APPLIED TO REMOTE.
--
-- Fotografa fedelmente lo schema Jukebox già esistente sul DB remoto (song_requests,
-- venue_settings, playback_state — create fuori da questo repo, prima dell'adozione
-- delle migration tracciate). Ricostruita via introspection read-only diretta
-- (information_schema / pg_catalog / pg_policies) il 2026-08-28, a fronte del report:
-- ai-ops/reports/jukebox-schema-baseline-audit.md
--
-- Timestamp scelto (20260710173930) per precedere 20260710173935_live_night_v0_schema_rls.sql,
-- coerente con l'evidenza che queste tabelle esistono da prima (song_requests.created_at più
-- vecchio = 2026-06-30) e con il commento "Modello: venue_settings" in live_night_v0.
--
-- 20260727011827_p0_2_r4_rls_hardening_f4.sql presuppone che queste tabelle e le policy
-- SELECT/INSERT di base esistano già (fa solo DROP POLICY IF EXISTS + CREATE POLICY sulle
-- policy UPDATE/INSERT finali): questa baseline crea solo gli oggetti "pre-hardening", le
-- policy staff finali restano create da quella migration, invariata.
--
-- Usa CREATE TABLE/POLICY IF NOT EXISTS dove possibile per essere non distruttiva anche se
-- applicata per errore contro un DB che ha già questi oggetti.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- song_requests
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.song_requests (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at   timestamptz DEFAULT now(),
  table_number text,
  nickname     text,
  song         jsonb,
  mood         jsonb,
  dedication   text,
  reaction     jsonb DEFAULT '{"fire": 0, "heart": 0}'::jsonb,
  status       text DEFAULT 'pending'::text,
  CONSTRAINT song_requests_pkey PRIMARY KEY (id)
);

ALTER TABLE public.song_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_requests_allow_authenticated_insert ON public.song_requests
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY song_requests_allow_authenticated_select ON public.song_requests
  FOR SELECT TO authenticated
  USING (true);

-- Nota: song_requests_staff_update viene creata da 20260727011827_p0_2_r4_rls_hardening_f4.sql
-- (dipende da is_staff_for_venue(), definita in 20260710173936_kitchen_schema_baseline_v1.sql).

-- =========================================================================
-- venue_settings — riga singleton id='main'
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.venue_settings (
  id           text NOT NULL DEFAULT 'main'::text,
  queue_paused boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_settings_pkey PRIMARY KEY (id)
);

ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY venue_settings_allow_authenticated_select ON public.venue_settings
  FOR SELECT TO authenticated
  USING (true);

-- Nota: venue_settings_staff_update viene creata da 20260727011827_p0_2_r4_rls_hardening_f4.sql.

-- Seed bootstrap: senza questa riga, setQueuePaused() (src/hooks/useVenueSettings.js) fa un
-- UPDATE su 0 righe (nessun errore, nessun effetto) su un DB azzerato — la feature "pausa
-- coda" staff resterebbe silenziosamente non funzionante. Decisione Eros 2026-08-28: seed sì.
INSERT INTO public.venue_settings (id, queue_paused, updated_at)
VALUES ('main', false, now())
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- playback_state — riga singleton id=1
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.playback_state (
  id                 integer NOT NULL DEFAULT 1,
  progress_ms        integer,
  duration_ms        integer,
  is_playing         boolean,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  track_name         text,
  artist_name        text,
  cover_url          text,
  spotify_track_uri  text,
  CONSTRAINT playback_state_pkey PRIMARY KEY (id)
);

ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playback_state select" ON public.playback_state
  FOR SELECT TO public
  USING (true);

-- Nessun seed: src/pages/LiveTvScreenWalrusPoster.jsx e StaffDashboard.jsx leggono con
-- .maybeSingle() (nessun errore se assente) e lo staff device fa upsert al primo poll
-- Spotify — la riga id=1 si autocrea via playback_state_staff_write (creata da
-- 20260727011827_p0_2_r4_rls_hardening_f4.sql). Nessun gap funzionale su DB vuoto.
