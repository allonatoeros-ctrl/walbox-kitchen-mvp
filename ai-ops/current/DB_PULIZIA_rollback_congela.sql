-- ROLLBACK della migration 20261030120000_freeze_non_kitchen_access_v1.
-- Ripristina i GRANT e la publication Realtime come letti in produzione il 2026-10-30
-- (query read-only su pg_class.relacl / pg_proc.proacl / pg_publication_tables).
--
-- NON e' una migration: sta fuori da `supabase/migrations/` apposta, cosi' `db push` non lo applica.
-- Si usa solo se, durante la settimana di congelamento, salta fuori qualcosa che usava ancora queste aree.
-- Per applicarlo va trasformato in una migration nuova con timestamp successivo (gate di Eros).

-- Tabelle con accesso pieno per anon + authenticated (acl originale: arwdDxtm)
grant all on table
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
  public.playback_state,
  public.song_requests,
  public.venue_settings
to anon, authenticated;

-- live_submissions: tutto tranne INSERT (acl originale: rwdDxtm)
grant select, update, delete, truncate, references, trigger, maintain
  on table public.live_submissions to anon, authenticated;

-- party_ferie_assets: solo SELECT per authenticated. party_ferie_requests: nessun grant (invariato).
grant select on table public.party_ferie_assets to authenticated;

grant select, update, usage on sequence public.party_ferie_requests_queue_position_seq to anon, authenticated;

-- Funzioni con EXECUTE anche a PUBLIC
grant execute on function
  public.fanta_is_admin(),
  public.fn_enforce_lineup_deadline(),
  public.fn_enforce_max_teams(),
  public.fn_set_updated_at()
to public, anon, authenticated;

grant execute on function
  public.create_fanta_team_v1(uuid, text),
  public.save_fanta_roster_v1(uuid, jsonb)
to anon, authenticated;

grant execute on function
  public.party_ferie_attach_asset(uuid, text, text),
  public.party_ferie_is_operator(),
  public.party_ferie_transition_request(uuid, text)
to authenticated;

alter publication supabase_realtime add table
  public.song_requests,
  public.playback_state,
  public.venue_settings,
  public.live_settings,
  public.live_submissions,
  public.party_ferie_requests;
