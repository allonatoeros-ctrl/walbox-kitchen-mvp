-- Pulizia DB, strada veloce V1 — CANCELLA le aree non-Kitchen (Jukebox, Live Night, Party Ferie,
-- FantaWalrus): 21 tabelle e 9 funzioni. Gira dopo il congela `20261030120000`.
--
-- LOCAL BUILD ONLY — NOT APPLIED TO REMOTE. Apply = decisione di Eros, solo con
-- `npx supabase db push --linked` (`ai-ops/SECURITY_POLICY.md` §5.1). Decisione di Eros del
-- 2026-10-30: "voglio un DB solo Kitchen" (stato e inventario: `ai-ops/current/DB_PULIZIA.md`).
--
-- BACKUP (V2, 2026-10-30, fuori dal repo): `~/Desktop/03_DOCUMENTI/backup/walbox_non_kitchen_2026-10-30.sql`
--   schema + dati + funzioni delle stesse 21 tabelle, 203 righe.
--
-- COSA FA
--   0. Guardia: se una tabella ha piu' righe del backup, si ferma (qualcuno ci ha scritto dopo).
--   1. DROP delle 2 funzioni che usano il tipo riga di `party_ferie_requests`.
--   2. DROP delle 21 tabelle in un solo comando (policy, trigger, indici, sequence, FK interne e FK
--      verso `auth.users` se ne vanno con loro; escono anche dalla publication Realtime).
--   3. DROP delle altre 7 funzioni (usate da policy e trigger delle tabelle appena tolte).
--   Niente CASCADE: una dipendenza non prevista fa fallire la migration invece di trascinare via altro.
--
-- NON TOCCA (condivise con Kitchen)
--   `is_staff_for_venue` (16 policy Kitchen), `_walbox_set_updated_at` (trigger Kitchen),
--   nessuna tabella `kitchen_*`, schema `watchdog_obs`, cron, Edge Functions, utenti auth.
--
-- ROLLBACK
--   Nessuna migration inversa: ripristino dal file di backup sopra, su un DB dove le tabelle non esistono.

-- 0. Guardia sul backup -------------------------------------------------------------------
do $$
declare
  r record;
  n bigint;
begin
  for r in
    select * from (values
      ('fanta_events', 0), ('fanta_fixtures', 0), ('fanta_ingestion_runs', 0), ('fanta_leagues', 1),
      ('fanta_lineups', 0), ('fanta_player_snapshots', 117), ('fanta_rosters', 15), ('fanta_rounds', 0),
      ('fanta_standings', 0), ('fanta_team_members', 1), ('fanta_team_scores', 0), ('fanta_teams', 1),
      ('fanta_var_adjustments', 0), ('fanta_votes', 0), ('live_settings', 1), ('live_submissions', 2),
      ('party_ferie_assets', 0), ('party_ferie_requests', 0), ('playback_state', 1),
      ('song_requests', 63), ('venue_settings', 1)
    ) as v(tbl, backed_up)
  loop
    execute format('select count(*) from public.%I', r.tbl) into n;
    if n > r.backed_up then
      raise exception 'pulizia DB non-Kitchen: % ha % righe, il backup del 2026-10-30 ne ha %. Rifare il backup.',
        r.tbl, n, r.backed_up;
    end if;
  end loop;
end
$$;

-- 1. Funzioni che dipendono dal tipo riga di party_ferie_requests -------------------------
drop function
  public.party_ferie_attach_asset(uuid, text, text),
  public.party_ferie_transition_request(uuid, text);

-- 2. Tabelle -------------------------------------------------------------------------------
drop table
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
  public.venue_settings;

-- 3. Altre funzioni ------------------------------------------------------------------------
drop function
  public.create_fanta_team_v1(uuid, text),
  public.save_fanta_roster_v1(uuid, jsonb),
  public.fanta_is_admin(),
  public.fn_enforce_lineup_deadline(),
  public.fn_enforce_max_teams(),
  public.fn_set_updated_at(),
  public.party_ferie_is_operator();
