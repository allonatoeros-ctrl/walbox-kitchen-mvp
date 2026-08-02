-- FantaWalrus Supabase Schema Pack V1 — functions & constraints
-- Local-only migration draft. NOT applied to any remote project.
-- Keep DB logic minimal: scoring/lineup validation business logic stays in the pure engine
-- (src/fanta/engine/scoreEngine.js). These functions only enforce structural/product invariants
-- that must hold regardless of which client writes the row.

-- ============================================================
-- fanta_is_admin() — reads the admin claim from the JWT (app_metadata.fanta_role = 'admin')
-- Convention only: the auth provider/claim shape is not finalized (see backend contract audit D1).
-- ============================================================
create or replace function fanta_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'fanta_role') = 'admin',
    false
  );
$$;

-- ============================================================
-- fn_set_updated_at() — generic updated_at bump, reused by every mutable table
-- ============================================================
create or replace function fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_fanta_leagues_updated_at
  before update on fanta_leagues
  for each row execute function fn_set_updated_at();

create trigger trg_fanta_teams_updated_at
  before update on fanta_teams
  for each row execute function fn_set_updated_at();

create trigger trg_fanta_rounds_updated_at
  before update on fanta_rounds
  for each row execute function fn_set_updated_at();

create trigger trg_fanta_fixtures_updated_at
  before update on fanta_fixtures
  for each row execute function fn_set_updated_at();

create trigger trg_fanta_lineups_updated_at
  before update on fanta_lineups
  for each row execute function fn_set_updated_at();

-- ============================================================
-- fn_enforce_max_teams() — hard cap on fanta_teams per league (approved: max 60)
-- ============================================================
create or replace function fn_enforce_max_teams()
returns trigger
language plpgsql
as $$
declare
  team_count int;
  league_cap int;
begin
  select count(*) into team_count from fanta_teams where league_id = new.league_id;
  select max_teams into league_cap from fanta_leagues where id = new.league_id;

  if team_count >= league_cap then
    raise exception 'FANTA_LEAGUE_FULL: league % already has % teams (max %)',
      new.league_id, team_count, league_cap;
  end if;

  return new;
end;
$$;

create trigger trg_fanta_teams_max_cap
  before insert on fanta_teams
  for each row execute function fn_enforce_max_teams();

-- ============================================================
-- fn_enforce_lineup_deadline() — blocks lineup writes/updates after round deadline,
-- unless the caller carries the admin claim (approved: override solo admin).
-- ============================================================
create or replace function fn_enforce_lineup_deadline()
returns trigger
language plpgsql
as $$
declare
  round_deadline timestamptz;
begin
  if fanta_is_admin() then
    return new;
  end if;

  select deadline_at into round_deadline from fanta_rounds where id = new.round_id;

  if round_deadline is null then
    raise exception 'FANTA_ROUND_NOT_FOUND: round % does not exist', new.round_id;
  end if;

  if now() >= round_deadline then
    raise exception 'FANTA_LINEUP_LOCKED: round % deadline (%) already passed',
      new.round_id, round_deadline;
  end if;

  return new;
end;
$$;

create trigger trg_fanta_lineups_deadline
  before insert or update on fanta_lineups
  for each row execute function fn_enforce_lineup_deadline();
