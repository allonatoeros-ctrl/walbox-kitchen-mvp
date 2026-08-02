-- FantaWalrus Supabase Schema Pack V1 — local seed (fittizio)
-- Intended for `supabase start` / local dev only. NEVER run against a remote project.
-- No real personal data. Fixed UUIDs so the seed is deterministic and re-runnable.

-- Admin placeholder (local-dev only: normally created via Supabase Auth, not raw insert).
-- fanta_role app_metadata claim is what fn_is_admin()/RLS policies check.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin-placeholder@fantawalrus.local',
  crypt('fanta-local-placeholder', gen_salt('bf')),
  now(),
  '{"fanta_role": "admin"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into fanta_leagues (id, name, season, status, max_teams)
values (
  '10000000-0000-0000-0000-000000000001',
  'Walrus Fanta League',
  '2025/26',
  'active',
  60
)
on conflict (id) do nothing;

insert into fanta_teams (id, league_id, name, crest)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Demo Team Alpha',
    null
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Demo Team Beta',
    null
  )
on conflict (id) do nothing;

insert into fanta_rounds (id, league_id, round_number, deadline_at, status)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  1,
  now() + interval '7 days',
  'open'
)
on conflict (id) do nothing;

insert into fanta_fixtures (id, round_id, external_fixture_id, home_team, away_team, kickoff_at, status)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'demo-fixture-1',
  'Demo Team Alpha',
  'Demo Team Beta',
  now() + interval '7 days',
  'scheduled'
)
on conflict (id) do nothing;
