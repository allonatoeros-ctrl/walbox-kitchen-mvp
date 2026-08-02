-- FantaWalrus Supabase Schema Pack V1
-- Local-only migration draft. NOT applied to any remote project.
-- Decisions locked by Eros (2026-08-02): 1 account = 1 team, single league V1 (max 60 teams),
-- no internal payments, deadline = kickoff of the round's first fixture, admin-only override,
-- persistent + audited VAR room.

create extension if not exists "pgcrypto";

-- ============================================================
-- fanta_leagues — single Walrus league in V1 (1 row expected)
-- ============================================================
create table if not exists fanta_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'finished')),
  max_teams int not null default 60 check (max_teams > 0 and max_teams <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- fanta_teams — fantasy team registered in a league
-- ============================================================
create table if not exists fanta_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  name text not null,
  crest text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, name)
);

-- ============================================================
-- fanta_team_members — owner link, enforces 1 account = 1 team
-- ============================================================
create table if not exists fanta_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner')),
  created_at timestamptz not null default now(),
  unique (user_id), -- single league V1: one team per user, globally
  unique (team_id, user_id)
);

-- ============================================================
-- fanta_player_snapshots — normalized player registry (versioned)
-- ============================================================
create table if not exists fanta_player_snapshots (
  id uuid primary key default gen_random_uuid(),
  external_player_id text not null,
  name text not null,
  role text not null check (role in ('GK', 'DEF', 'MID', 'FWD')),
  club text not null,
  snapshot_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (external_player_id, snapshot_version)
);

-- ============================================================
-- fanta_rosters — 15-player roster owned by a team (no per-round history)
-- ============================================================
create table if not exists fanta_rosters (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  player_id uuid not null references fanta_player_snapshots(id),
  created_at timestamptz not null default now(),
  unique (team_id, player_id)
);

-- ============================================================
-- fanta_rounds — real matchday, carries the deadline
-- ============================================================
create table if not exists fanta_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  round_number int not null check (round_number > 0),
  deadline_at timestamptz not null, -- kickoff of the round's first fixture
  status text not null default 'open' check (status in ('open', 'locked', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, round_number)
);

-- ============================================================
-- fanta_fixtures — real match within a round
-- ============================================================
create table if not exists fanta_fixtures (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  external_fixture_id text,
  home_team text not null,
  away_team text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'postponed', 'played')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, external_fixture_id)
);

-- ============================================================
-- fanta_lineups — 1 snapshot per team per round, locked at deadline
-- ============================================================
create table if not exists fanta_lineups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  roster_snapshot jsonb not null, -- { starters: [...], bench: [...], captain: playerId|null }
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, round_id)
);

-- ============================================================
-- fanta_ingestion_runs — one ingestion attempt per fixture (idempotent)
-- ============================================================
create table if not exists fanta_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references fanta_fixtures(id),
  idempotency_key text not null,
  status text not null check (status in ('pending', 'partial', 'failed', 'completed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (fixture_id, idempotency_key)
);

-- ============================================================
-- fanta_events — normalized in-game event, written only by ingestion
-- ============================================================
create table if not exists fanta_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fanta_fixtures(id) on delete cascade,
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  player_id uuid not null references fanta_player_snapshots(id),
  event_type text not null,
  minute int,
  ingestion_run_id uuid references fanta_ingestion_runs(id),
  created_at timestamptz not null default now(),
  unique (fixture_id, player_id, event_type, minute)
);

-- ============================================================
-- fanta_votes — base vote or NO_VOTE reason per player per round
-- ============================================================
create table if not exists fanta_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  player_id uuid not null references fanta_player_snapshots(id),
  base_vote numeric(4, 2),
  no_vote_reason text,
  ingestion_run_id uuid references fanta_ingestion_runs(id),
  created_at timestamptz not null default now(),
  unique (round_id, player_id),
  check (
    (base_vote is not null and no_vote_reason is null)
    or (base_vote is null and no_vote_reason is not null)
  )
);

-- ============================================================
-- fanta_team_scores — computed score per team per round (batch, upsert)
-- ============================================================
create table if not exists fanta_team_scores (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  total numeric(6, 2) not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (team_id, round_id)
);

-- ============================================================
-- fanta_standings — materialized ranking per round (avoids TV recompute)
-- ============================================================
create table if not exists fanta_standings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references fanta_leagues(id) on delete cascade,
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  team_id uuid not null references fanta_teams(id) on delete cascade,
  position int not null check (position > 0),
  total numeric(6, 2) not null,
  computed_at timestamptz not null default now(),
  unique (round_id, team_id)
);

-- ============================================================
-- fanta_var_adjustments — persistent, audited VAR room log (append-only)
-- ============================================================
create table if not exists fanta_var_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references fanta_teams(id) on delete cascade,
  round_id uuid not null references fanta_rounds(id) on delete cascade,
  before_total numeric(6, 2) not null,
  after_total numeric(6, 2) not null,
  reason text not null,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
