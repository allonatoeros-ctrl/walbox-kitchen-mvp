-- LIVE_NIGHT_V0 — schema + RLS (DB-2 apply)
-- Fonte: ai-ops/supabase/live_night_v0_schema_rls.sql (draft T1 + hardening fixes)

create extension if not exists pgcrypto;

-- ============================================================
-- 1. TABELLA live_submissions
-- ============================================================
create table if not exists public.live_submissions (
  id                uuid primary key default gen_random_uuid(),
  table_number      text,
  nickname          text not null
                    check (char_length(nickname) <= 40),
  dedication        text not null
                    check (char_length(dedication) <= 200),
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'shown')),
  shown_at          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.live_submissions is
  'LIVE_NIGHT_V0: dediche cliente in coda di moderazione staff prima della TV. Vedi T1 result.md §5.';
comment on column public.live_submissions.table_number is
  'Numero tavolo opzionale, testo libero (es. "12"), nullable.';
comment on column public.live_submissions.status is
  'pending -> approved/rejected (decisione staff) -> shown (mostrata in TV, stato terminale).';

-- ============================================================
-- 2. TABELLA live_settings (singleton, modello venue_settings)
-- ============================================================
create table if not exists public.live_settings (
  id                    text primary key check (id = 'main'),
  mode                  text not null default 'webcam'
                        check (mode in ('webcam', 'takeover', 'poster')),
  current_submission_id uuid references public.live_submissions(id) on delete set null,
  updated_at            timestamptz not null default now()
);

comment on table public.live_settings is
  'LIVE_NIGHT_V0: riga singleton (id=main) stato macchina TV. Modello: venue_settings. Vedi T1 result.md §6.';
comment on column public.live_settings.current_submission_id is
  'FK a live_submissions.id mostrata durante mode=takeover. NULL se non in takeover.';

-- ============================================================
-- 3. SEED live_settings — riga singleton id='main'
-- ============================================================
insert into public.live_settings (id, mode, current_submission_id)
values ('main', 'webcam', null)
on conflict (id) do nothing;

-- ============================================================
-- 4. ROW LEVEL SECURITY — live_submissions
-- ============================================================
alter table public.live_submissions enable row level security;

create policy live_submissions_public_insert
  on public.live_submissions for insert
  to authenticated
  with check (status = 'pending');

create policy live_submissions_public_select_approved
  on public.live_submissions for select
  to authenticated
  using (status in ('approved', 'shown'));

create policy live_submissions_staff_select_all
  on public.live_submissions for select
  to authenticated
  using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

create policy live_submissions_staff_update
  on public.live_submissions for update
  to authenticated
  using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false)
  with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

revoke insert on public.live_submissions from anon, authenticated;
grant insert (table_number, nickname, dedication) on public.live_submissions to authenticated;

grant select, update on public.live_submissions to authenticated;

-- ============================================================
-- 5. ROW LEVEL SECURITY — live_settings
-- ============================================================
alter table public.live_settings enable row level security;

create policy live_settings_public_select
  on public.live_settings for select
  to anon, authenticated
  using (true);

create policy live_settings_staff_update
  on public.live_settings for update
  to authenticated
  using (id = 'main' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false)
  with check (id = 'main' and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

grant select on public.live_settings to anon, authenticated;
grant update (mode, current_submission_id, updated_at) on public.live_settings to authenticated;
;
