-- FantaWalrus Schema Hardening V1 — manual validation checklist.
-- NOT executed automatically: no Supabase CLI / local Postgres instance was
-- available in this environment (see hardening report FASE 0). This file is a
-- documented, copy-pasteable checklist to run against a local `supabase start`
-- stack (or a disposable branch) BEFORE any `supabase db push` to a real
-- project. Each block is self-contained; run top to bottom, one league.
--
-- Convention: `set local role authenticated; set local request.jwt.claims = ...`
-- simulates a specific end user via PostgREST's session variables, the same
-- mechanism Supabase uses to evaluate auth.uid()/auth.jwt() inside RLS.
-- Replace the placeholder UUIDs before running.

begin;

-- ---- fixtures -------------------------------------------------------------
insert into fanta_leagues (id, name, season, status, max_teams)
values ('00000000-0000-0000-0000-000000000001', 'Walrus League V1', '2026', 'active', 2);
-- max_teams=2 on purpose: makes the "league full" case below reachable fast.

-- two distinct auth users, simulated (no real auth.users insert needed for
-- auth.uid() checks below since we set the claim directly)

-- ============================================================
-- 1) user creates first team -> PASS
-- ============================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Walrus FC');
-- expect: returns a uuid, no exception.

-- ============================================================
-- 2) same user tries a second team -> FAIL (FANTA_USER_ALREADY_HAS_TEAM)
-- ============================================================
select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Second Team');
-- expect: raises FANTA_USER_ALREADY_HAS_TEAM

-- ============================================================
-- 3) league at max_teams -> FAIL (FANTA_LEAGUE_FULL)
-- ============================================================
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Second Real Team');
-- league now has 2 teams (max_teams=2)
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Third Team');
-- expect: raises FANTA_LEAGUE_FULL

-- ============================================================
-- 4) team + membership always created together
-- ============================================================
reset role;
select t.id, t.name, m.user_id, m.role
from fanta_teams t
join fanta_team_members m on m.team_id = t.id
where t.league_id = '00000000-0000-0000-0000-000000000001';
-- expect: exactly 2 rows (from steps 1 and 3), each team has exactly one
-- 'owner' membership row, no orphan team without a membership row.

-- ============================================================
-- 5) membership insert failure rolls back the team (atomicity)
-- ============================================================
-- Cannot be forced without breaking a constraint; verified by code review:
-- both inserts run inside the same PL/pgSQL function body -> same implicit
-- transaction. If the second insert (fanta_team_members) raises, Postgres
-- rolls back the whole function invocation, including the first insert.
-- Manual proof: temporarily add `raise exception 'forced'` right after the
-- fanta_team_members insert in a scratch copy of the function, call it, then
-- confirm `select count(*) from fanta_teams` did NOT increase.

-- ============================================================
-- 6) anon cannot create a team
-- ============================================================
set local role anon;
select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Anon Team');
-- expect: raises FANTA_AUTH_REQUIRED (auth.uid() is null for anon), OR a
-- permission-denied error if EXECUTE was also revoked from anon (it is: only
-- `authenticated` was granted EXECUTE in 0002).

-- ============================================================
-- 7) owner can write/update own lineup before deadline
-- ============================================================
reset role;
insert into fanta_rounds (id, league_id, round_number, deadline_at, status)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000001',
        1, now() + interval '7 days', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- (use the team_id returned in step 1)
-- insert into fanta_lineups (team_id, round_id, roster_snapshot)
--   values ('<team_id_from_step_1>', '00000000-0000-0000-0000-0000000000f1', '{}'::jsonb);
-- expect: PASS (round is 'open', deadline in the future)

-- ============================================================
-- 8) owner blocked after deadline (trigger fn_enforce_lineup_deadline)
-- ============================================================
reset role;
insert into fanta_rounds (id, league_id, round_number, deadline_at, status)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000001',
        2, now() - interval '1 hour', 'open');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
-- insert into fanta_lineups (team_id, round_id, roster_snapshot)
--   values ('<team_id_from_step_1>', '00000000-0000-0000-0000-0000000000f2', '{}'::jsonb);
-- expect: raises FANTA_LINEUP_LOCKED (deadline_at already passed)

-- ============================================================
-- 9) member of the SAME league reads a lineup after round is locked/finalized
-- ============================================================
reset role;
update fanta_rounds set status = 'locked'
where id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
-- select * from fanta_lineups where round_id = '00000000-0000-0000-0000-0000000000f1';
-- expect: the row from step 7 IS visible (user 2 owns a team in the same
-- league, round is locked)

-- ============================================================
-- 10) user from a DIFFERENT league cannot read the lineup, even locked
-- ============================================================
reset role;
insert into fanta_leagues (id, name, season, status, max_teams)
values ('00000000-0000-0000-0000-000000000002', 'Other League', '2026', 'active', 10);
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select create_fanta_team_v1('00000000-0000-0000-0000-000000000002', 'Outsider FC');
-- select * from fanta_lineups where round_id = '00000000-0000-0000-0000-0000000000f1';
-- expect: 0 rows for user 4 (member of league 2, not league 1) — this is the
-- exact regression the hardened fanta_lineups_select_own_or_public prevents;
-- before the fix, ANY authenticated user could read a locked lineup.

-- ============================================================
-- 11) anon cannot read any lineup
-- ============================================================
reset role;
set local role anon;
-- select * from fanta_lineups where round_id = '00000000-0000-0000-0000-0000000000f1';
-- expect: 0 rows (no policy grants anon anything on fanta_lineups; RLS
-- default-denies with no matching policy)

-- ============================================================
-- 12) admin override: full read regardless of membership/round status
-- ============================================================
reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","app_metadata":{"fanta_role":"admin"}}';
-- select * from fanta_lineups; -- expect: all rows visible, any round status
-- select create_fanta_team_v1('00000000-0000-0000-0000-000000000001', 'Admin can also self-enroll once');
-- expect: PASS (admin has no special exemption from the one-team-per-user
-- rule in the RPC itself — by design, admin claim only affects RLS/lineup
-- overrides, not team-creation limits; confirm this matches product intent).

rollback; -- never commit test fixtures
