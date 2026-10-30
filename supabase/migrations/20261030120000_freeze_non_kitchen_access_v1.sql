-- Pulizia DB, Passo 2 — CONGELA l'accesso alle aree non-Kitchen (Jukebox, Live Night, Party Ferie,
-- FantaWalrus). Nessun DROP, nessun dato toccato.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Apply = decisione di Eros, solo con
-- `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md` §5.1). Decisione di Eros del
-- 2026-10-30: quelle aree non si usano piu' (stato e inventario: `ai-ops/current/DB_PULIZIA.md`).
--
-- COSA FA
--   1. REVOKE ALL da anon/authenticated sulle 21 tabelle non-Kitchen e sull'unica sequence.
--   2. REVOKE EXECUTE da PUBLIC/anon/authenticated sulle 9 funzioni non-Kitchen.
--   3. Toglie le 6 tabelle non-Kitchen dalla publication `supabase_realtime`.
--   service_role e postgres restano invariati (servono per il backup del Passo 4).
--
-- NON TOCCA (condivise con Kitchen)
--   `is_staff_for_venue` (16 policy Kitchen), `_walbox_set_updated_at` (trigger Kitchen),
--   nessuna tabella `kitchen_*`, schema `watchdog_obs`, cron, Edge Functions.
--
-- ROLLBACK
--   `ai-ops/current/DB_PULIZIA_rollback_congela.sql` (GRANT originali letti il 2026-10-30).
--   Volutamente fuori da `supabase/migrations/`: `db push` non deve applicarlo.

-- 1. Tabelle -------------------------------------------------------------------------------
revoke all on table
  public.fanta_events,
  public.fanta_fixtures,
  public.fanta_ingestion_runs,
  public.fanta_leagues,
  public.fanta_lineups,
  public.fanta_player_snapshots,
  public.fanta_rosters,
  public.fanta_rounds,
  public.fanta_standings,
  public.fanta_team_members,
  public.fanta_team_scores,
  public.fanta_teams,
  public.fanta_var_adjustments,
  public.fanta_votes,
  public.live_settings,
  public.live_submissions,
  public.party_ferie_assets,
  public.party_ferie_requests,
  public.playback_state,
  public.song_requests,
  public.venue_settings
from anon, authenticated;

revoke all on sequence public.party_ferie_requests_queue_position_seq from anon, authenticated;

-- 2. Funzioni ------------------------------------------------------------------------------
revoke execute on function
  public.create_fanta_team_v1(uuid, text),
  public.save_fanta_roster_v1(uuid, jsonb),
  public.fanta_is_admin(),
  public.fn_enforce_lineup_deadline(),
  public.fn_enforce_max_teams(),
  public.fn_set_updated_at(),
  public.party_ferie_attach_asset(uuid, text, text),
  public.party_ferie_is_operator(),
  public.party_ferie_transition_request(uuid, text)
from public, anon, authenticated;

-- 3. Realtime ------------------------------------------------------------------------------
-- Idempotente: toglie solo le tabelle ancora presenti nella publication.
do $$
declare
  t text;
begin
  foreach t in array array[
    'song_requests', 'playback_state', 'venue_settings',
    'live_settings', 'live_submissions', 'party_ferie_requests'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end
$$;
