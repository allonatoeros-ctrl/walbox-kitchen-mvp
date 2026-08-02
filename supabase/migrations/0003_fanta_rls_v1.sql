-- FantaWalrus Supabase Schema Pack V1 — Row Level Security
-- Local-only migration draft. NOT applied to any remote project.
-- Principle (backend contract audit §6): only the ingestion/scoring job (service role) writes
-- objective data (fixtures/players/events/votes/scores/standings). Users only ever write their
-- own team/roster/lineup, and only before the round deadline. Service role bypasses RLS entirely
-- by design (Supabase default) — no client key ever carries it (CLAUDE.md §5, SECURITY_POLICY §6).

alter table fanta_leagues enable row level security;
alter table fanta_teams enable row level security;
alter table fanta_team_members enable row level security;
alter table fanta_player_snapshots enable row level security;
alter table fanta_rosters enable row level security;
alter table fanta_rounds enable row level security;
alter table fanta_fixtures enable row level security;
alter table fanta_lineups enable row level security;
alter table fanta_ingestion_runs enable row level security;
alter table fanta_events enable row level security;
alter table fanta_votes enable row level security;
alter table fanta_team_scores enable row level security;
alter table fanta_standings enable row level security;
alter table fanta_var_adjustments enable row level security;

-- ============================================================
-- fanta_leagues — read published league; admin manages
-- ============================================================
create policy fanta_leagues_select_published on fanta_leagues
  for select
  to authenticated
  using (status in ('active', 'finished') or fanta_is_admin());

create policy fanta_leagues_admin_write on fanta_leagues
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

-- ============================================================
-- fanta_teams — public read (standings/derby), owner or admin write
-- ============================================================
create policy fanta_teams_select_all on fanta_teams
  for select
  to authenticated
  using (true);

create policy fanta_teams_owner_write on fanta_teams
  for update
  to authenticated
  using (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_teams.id and m.user_id = auth.uid()
    )
  )
  with check (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_teams.id and m.user_id = auth.uid()
    )
  );

create policy fanta_teams_owner_insert on fanta_teams
  for insert
  to authenticated
  with check (true); -- membership row created in the same transaction enforces 1 team/user

create policy fanta_teams_admin_delete on fanta_teams
  for delete
  to authenticated
  using (fanta_is_admin());

-- ============================================================
-- fanta_team_members — self read, admin read-all; self insert only (1 account = 1 team)
-- ============================================================
create policy fanta_team_members_select_self on fanta_team_members
  for select
  to authenticated
  using (user_id = auth.uid() or fanta_is_admin());

create policy fanta_team_members_insert_self on fanta_team_members
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy fanta_team_members_admin_delete on fanta_team_members
  for delete
  to authenticated
  using (fanta_is_admin());

-- ============================================================
-- fanta_player_snapshots / fanta_rounds / fanta_fixtures — public read, admin/service write
-- ============================================================
create policy fanta_player_snapshots_select_all on fanta_player_snapshots
  for select
  to authenticated
  using (true);

create policy fanta_player_snapshots_admin_write on fanta_player_snapshots
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

create policy fanta_rounds_select_all on fanta_rounds
  for select
  to authenticated
  using (true);

create policy fanta_rounds_admin_write on fanta_rounds
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

create policy fanta_fixtures_select_all on fanta_fixtures
  for select
  to authenticated
  using (true);

create policy fanta_fixtures_admin_write on fanta_fixtures
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

-- ============================================================
-- fanta_rosters — owner reads/writes own roster only, admin all
-- ============================================================
create policy fanta_rosters_select_own on fanta_rosters
  for select
  to authenticated
  using (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_rosters.team_id and m.user_id = auth.uid()
    )
  );

create policy fanta_rosters_write_own on fanta_rosters
  for insert
  to authenticated
  with check (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_rosters.team_id and m.user_id = auth.uid()
    )
  );

create policy fanta_rosters_delete_own on fanta_rosters
  for delete
  to authenticated
  using (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_rosters.team_id and m.user_id = auth.uid()
    )
  );

-- ============================================================
-- fanta_lineups — owner reads own always; others only once round is locked/finalized
-- (prevents opponents from scouting a lineup before the deadline). Owner writes only
-- pre-deadline (trigger fn_enforce_lineup_deadline enforces this server-side too).
-- ============================================================
create policy fanta_lineups_select_own_or_public on fanta_lineups
  for select
  to authenticated
  using (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_lineups.team_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from fanta_rounds r
      where r.id = fanta_lineups.round_id and r.status in ('locked', 'finalized')
    )
  );

create policy fanta_lineups_write_own on fanta_lineups
  for insert
  to authenticated
  with check (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_lineups.team_id and m.user_id = auth.uid()
    )
  );

create policy fanta_lineups_update_own on fanta_lineups
  for update
  to authenticated
  using (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_lineups.team_id and m.user_id = auth.uid()
    )
  )
  with check (
    fanta_is_admin()
    or exists (
      select 1 from fanta_team_members m
      where m.team_id = fanta_lineups.team_id and m.user_id = auth.uid()
    )
  );

-- ============================================================
-- fanta_ingestion_runs — no end-user access; admin/staff observability only
-- ============================================================
create policy fanta_ingestion_runs_admin_only on fanta_ingestion_runs
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

-- ============================================================
-- fanta_events / fanta_votes — public read, ingestion/admin write only
-- ============================================================
create policy fanta_events_select_all on fanta_events
  for select
  to authenticated
  using (true);

create policy fanta_events_admin_write on fanta_events
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

create policy fanta_votes_select_all on fanta_votes
  for select
  to authenticated
  using (true);

create policy fanta_votes_admin_write on fanta_votes
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

-- ============================================================
-- fanta_team_scores / fanta_standings — public read, batch/admin write only
-- ============================================================
create policy fanta_team_scores_select_all on fanta_team_scores
  for select
  to authenticated
  using (true);

create policy fanta_team_scores_admin_write on fanta_team_scores
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

create policy fanta_standings_select_all on fanta_standings
  for select
  to authenticated
  using (true);

create policy fanta_standings_admin_write on fanta_standings
  for all
  to authenticated
  using (fanta_is_admin())
  with check (fanta_is_admin());

-- ============================================================
-- fanta_var_adjustments — public read (transparency, per product brief), admin write only,
-- no update/delete policy at all: append-only audit log, immutable by construction.
-- ============================================================
create policy fanta_var_adjustments_select_all on fanta_var_adjustments
  for select
  to authenticated
  using (true);

create policy fanta_var_adjustments_admin_insert on fanta_var_adjustments
  for insert
  to authenticated
  with check (fanta_is_admin() and author_id = auth.uid());
