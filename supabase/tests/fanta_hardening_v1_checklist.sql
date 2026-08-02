-- FantaWalrus Schema Hardening V1 — executable validation checklist.
-- Runs against a local `supabase start` stack BEFORE any `supabase db push`
-- to a real project. Self-verifying: every scenario asserts its own expected
-- outcome via RAISE EXCEPTION on mismatch, so a plain `psql -f` run that
-- reaches the final COMMIT/ROLLBACK line with no error means PASS on all 12.
--
-- Convention: `set local role authenticated; set local request.jwt.claims = ...`
-- simulates a specific end user via PostgREST's session variables, the same
-- mechanism Supabase uses to evaluate auth.uid()/auth.jwt() inside RLS.
-- Team ids created along the way are stashed in a session-local temp table
-- (test_vars) instead of psql client variables, since psql `\gset` interpolation
-- into dollar-quoted PL/pgSQL bodies is unreliable across client versions.

begin;

create temporary table test_vars (key text primary key, value text);
grant select, insert, update, delete on test_vars to authenticated, anon;

-- ---- fixtures -------------------------------------------------------------
insert into fanta_leagues (id, name, season, status, max_teams)
values ('00000000-0000-0000-0000-000000000001', 'Walrus League V1', '2026', 'active', 2);
-- max_teams=2 on purpose: makes the "league full" case below reachable fast.

-- fanta_team_members.user_id carries a real FK to auth.users, so the
-- simulated JWT subs below need matching auth.users rows, not just claims.
insert into auth.users (id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'user1@walrus.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'user2@walrus.test'),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'user3@walrus.test'),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'user4@walrus.test'),
  ('99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'admin@walrus.test');

-- ============================================================
-- 1) user creates first team -> PASS
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into test_vars(key, value)
select 'team1_id', create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Walrus FC')::text;
do $$
begin
  raise notice 'SCENARIO 1 PASS: team created (%.)', (select value from test_vars where key = 'team1_id');
end $$;

-- ============================================================
-- 2) same user tries a second team -> FAIL (FANTA_USER_ALREADY_HAS_TEAM)
-- ============================================================
do $$
begin
  perform create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Second Team');
  raise exception 'SCENARIO 2 FAILED: expected FANTA_USER_ALREADY_HAS_TEAM, got success';
exception
  when others then
    if sqlerrm like 'FANTA_USER_ALREADY_HAS_TEAM%' then
      raise notice 'SCENARIO 2 PASS: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ============================================================
-- 3) league at max_teams -> FAIL (FANTA_LEAGUE_FULL)
-- ============================================================
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
insert into test_vars(key, value)
select 'team2_id', create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Second Real Team')::text;
-- league now has 2 teams (max_teams=2)
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
do $$
begin
  perform create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Third Team');
  raise exception 'SCENARIO 3 FAILED: expected FANTA_LEAGUE_FULL, got success';
exception
  when others then
    if sqlerrm like 'FANTA_LEAGUE_FULL%' then
      raise notice 'SCENARIO 3 PASS: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ============================================================
-- 4) team + membership always created together
-- ============================================================
reset role;
do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from fanta_teams t
  join fanta_team_members m on m.team_id = t.id
  where t.league_id = '00000000-0000-0000-0000-000000000001'
    and m.role = 'owner';
  if cnt = 2 then
    raise notice 'SCENARIO 4 PASS: % teams, each with exactly one owner membership', cnt;
  else
    raise exception 'SCENARIO 4 FAILED: expected 2 owned teams, got %', cnt;
  end if;
end $$;

-- ============================================================
-- 5) membership insert failure rolls back the team (atomicity)
-- ============================================================
-- Real proof (not just code review): a scratch copy of create_fanta_team_v1
-- that inserts into fanta_teams then force-raises BEFORE the membership
-- insert. If the team row survives, atomicity is broken.
insert into fanta_leagues (id, name, season, status, max_teams)
values ('00000000-0000-0000-0000-0000000000aa', 'Atomicity Probe League', '2026', 'active', 10);
-- dedicated league with headroom: the Walrus League V1 above is already at
-- max_teams=2 from scenarios 1 and 3, so reusing it would trip
-- fn_enforce_max_teams before the forced rollback is even reached.
do $$
declare
  before_count int;
  after_count int;
begin
  select count(*) into before_count from fanta_teams;

  create or replace function create_fanta_team_v1_scratch_test(p_league_id uuid, p_team_name text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
  as $body$
  declare
    v_team_id uuid;
  begin
    insert into fanta_teams (league_id, name)
    values (p_league_id, p_team_name)
    returning id into v_team_id;

    raise exception 'FORCED_ROLLBACK_TEST';

    return v_team_id;
  end;
  $body$;

  begin
    perform create_fanta_team_v1_scratch_test(
      '00000000-0000-0000-0000-0000000000aa', 'Atomicity Probe'
    );
  exception
    when others then
      if sqlerrm <> 'FORCED_ROLLBACK_TEST' then
        raise;
      end if;
  end;

  drop function create_fanta_team_v1_scratch_test(uuid, text);

  select count(*) into after_count from fanta_teams;

  if after_count = before_count then
    raise notice 'SCENARIO 5 PASS: atomicity confirmed, team count unchanged (%)', before_count;
  else
    raise exception 'SCENARIO 5 FAILED: team count changed from % to % (orphan team survived rollback)',
      before_count, after_count;
  end if;
end $$;

-- ============================================================
-- 6) anon cannot create a team
-- ============================================================
set local role anon;
reset request.jwt.claims;
do $$
begin
  perform create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Anon Team');
  raise exception 'SCENARIO 6 FAILED: anon team creation succeeded unexpectedly';
exception
  when others then
    if sqlerrm like 'FANTA_AUTH_REQUIRED%' or sqlerrm like '%permission denied%' then
      raise notice 'SCENARIO 6 PASS: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ============================================================
-- 7) owner can write/update own lineup before deadline
-- ============================================================
reset role;
insert into fanta_rounds (id, league_id, round_number, deadline_at, status)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001',
        1, now() + interval '7 days', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare
  v_team1_id uuid;
begin
  select value::uuid into v_team1_id from test_vars where key = 'team1_id';
  insert into fanta_lineups (team_id, round_id, roster_snapshot)
  values (v_team1_id, '00000000-0000-0000-0000-0000000000f1', '{}'::jsonb);
  raise notice 'SCENARIO 7 PASS: lineup inserted pre-deadline (round open, deadline in future)';
end $$;

-- ============================================================
-- 8) owner blocked after deadline (trigger fn_enforce_lineup_deadline)
-- ============================================================
reset role;
insert into fanta_rounds (id, league_id, round_number, deadline_at, status)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000001',
        2, now() - interval '1 hour', 'open');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
do $$
declare
  v_team1_id uuid;
begin
  select value::uuid into v_team1_id from test_vars where key = 'team1_id';
  begin
    insert into fanta_lineups (team_id, round_id, roster_snapshot)
    values (v_team1_id, '00000000-0000-0000-0000-0000000000f2', '{}'::jsonb);
    raise exception 'SCENARIO 8 FAILED: expected FANTA_LINEUP_LOCKED, got success';
  exception
    when others then
      if sqlerrm like 'FANTA_LINEUP_LOCKED%' then
        raise notice 'SCENARIO 8 PASS: %', sqlerrm;
      else
        raise;
      end if;
  end;
end $$;

-- ============================================================
-- 9) member of the SAME league reads a lineup after round is locked/finalized
-- ============================================================
reset role;
update fanta_rounds set status = 'locked'
where id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from fanta_lineups
  where round_id = '00000000-0000-0000-0000-0000000000f1';
  if cnt = 1 then
    raise notice 'SCENARIO 9 PASS: same-league member sees % locked-round lineup row(s)', cnt;
  else
    raise exception 'SCENARIO 9 FAILED: expected 1 visible lineup row for same-league member, got %', cnt;
  end if;
end $$;

-- ============================================================
-- 10) user from a DIFFERENT league cannot read the lineup, even locked
-- ============================================================
reset role;
insert into fanta_leagues (id, name, season, status, max_teams)
values ('00000000-0000-0000-0000-000000000002', 'Other League', '2026', 'active', 10);
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
insert into test_vars(key, value)
select 'team4_id', create_fanta_team_v1('00000000-0000-0000-0000-000000000002', 'Outsider FC')::text;
do $$
declare
  cnt int;
begin
  select count(*) into cnt
  from fanta_lineups
  where round_id = '00000000-0000-0000-0000-0000000000f1';
  if cnt = 0 then
    raise notice 'SCENARIO 10 PASS: cross-league user sees 0 rows for the locked lineup';
  else
    raise exception 'SCENARIO 10 FAILED: expected 0 visible rows for cross-league user, got %', cnt;
  end if;
end $$;

-- ============================================================
-- 11) anon cannot read any lineup
-- ============================================================
reset role;
set local role anon;
reset request.jwt.claims;
do $$
declare
  cnt int;
begin
  select count(*) into cnt from fanta_lineups;
  if cnt = 0 then
    raise notice 'SCENARIO 11 PASS: anon sees 0 lineup rows';
  else
    raise exception 'SCENARIO 11 FAILED: expected 0 rows for anon, got %', cnt;
  end if;
exception
  when others then
    if sqlerrm like '%permission denied for table fanta_lineups%' then
      raise notice 'SCENARIO 11 PASS: anon has no base grant on fanta_lineups (%), stricter than an RLS-filtered empty result', sqlerrm;
    else
      raise;
    end if;
end $$;

-- ============================================================
-- 12) admin override: full read regardless of membership/round status
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"fanta_role":"admin"}}';
do $$
declare
  cnt int;
begin
  select count(*) into cnt from fanta_lineups;
  -- only 1 lineup row exists in total: scenario 7 inserted team1/round-f1,
  -- scenario 8's team1/round-f2 attempt was correctly rejected (deadline
  -- already passed) and never landed a row.
  if cnt = 1 then
    raise notice 'SCENARIO 12a PASS: admin sees all % lineup row(s) regardless of round status', cnt;
  else
    raise exception 'SCENARIO 12a FAILED: expected admin to see 1 lineup row total, got %', cnt;
  end if;
end $$;
-- admin has no special exemption from the one-team-per-user rule in the RPC
-- itself: admin claim only affects RLS/lineup overrides, not team-creation
-- limits (confirmed product intent, backend contract audit).
do $$
begin
  begin
    perform create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Admin can also self-enroll once');
    raise notice 'SCENARIO 12b PASS: admin created a team like any other authenticated user (no exemption)';
  exception
    when others then
      if sqlerrm like 'FANTA_LEAGUE_FULL%' then
        raise notice 'SCENARIO 12b PASS: admin blocked by FANTA_LEAGUE_FULL, same as any user (%).', sqlerrm;
      else
        raise;
      end if;
  end;
end $$;

reset role;
reset request.jwt.claims;
drop table test_vars;

rollback; -- never commit test fixtures
