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

-- ============================================================
-- create_fanta_team_v1() — atomic team creation (team + owner membership).
-- SECURITY DEFINER: runs as table owner, so it bypasses the RLS insert
-- restriction on fanta_teams/fanta_team_members (see 0003, no direct-insert
-- policy for authenticated). This is the ONLY sanctioned way for a client to
-- create a team: user_id is never accepted as input, it is always auth.uid().
-- search_path is pinned to prevent search_path hijacking in SECURITY DEFINER.
-- ============================================================
create or replace function create_fanta_team_v1(
  p_league_id uuid,
  p_team_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_status text;
  v_max_teams int;
  v_team_count int;
  v_already_member boolean;
  v_team_id uuid;
begin
  if v_user_id is null then
    raise exception 'FANTA_AUTH_REQUIRED: authentication required to create a team';
  end if;

  if p_team_name is null or btrim(p_team_name) = '' then
    raise exception 'FANTA_TEAM_NAME_REQUIRED: team name must not be empty';
  end if;

  -- lock the league row so concurrent creations serialize on the max_teams check
  select status, max_teams into v_league_status, v_max_teams
  from fanta_leagues
  where id = p_league_id
  for update;

  if v_league_status is null then
    raise exception 'FANTA_LEAGUE_NOT_FOUND: league % does not exist', p_league_id;
  end if;

  if v_league_status <> 'active' then
    raise exception 'FANTA_LEAGUE_NOT_ACTIVE: league % is not active (status=%)',
      p_league_id, v_league_status;
  end if;

  select exists(
    select 1 from fanta_team_members where user_id = v_user_id
  ) into v_already_member;

  if v_already_member then
    raise exception 'FANTA_USER_ALREADY_HAS_TEAM: user % already owns a team', v_user_id;
  end if;

  select count(*) into v_team_count
  from fanta_teams
  where league_id = p_league_id;

  if v_team_count >= v_max_teams then
    raise exception 'FANTA_LEAGUE_FULL: league % already has % teams (max %)',
      p_league_id, v_team_count, v_max_teams;
  end if;

  insert into fanta_teams (league_id, name)
  values (p_league_id, btrim(p_team_name))
  returning id into v_team_id;

  insert into fanta_team_members (team_id, user_id, role)
  values (v_team_id, v_user_id, 'owner');

  return v_team_id;
exception
  when unique_violation then
    raise exception 'FANTA_TEAM_CREATE_CONFLICT: team name or membership already in use for this league/user';
end;
$$;

revoke all on function create_fanta_team_v1(uuid, text) from public;
grant execute on function create_fanta_team_v1(uuid, text) to authenticated;;
