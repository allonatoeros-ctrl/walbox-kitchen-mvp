-- PARTY FERIE V0 — schema + RLS + RPC (PF-1)
-- Nessuna integrazione Google Drive: drive_url viene inserito manualmente dallo staff.

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1. REQUESTS — unico stream Realtime del modulo
-- ============================================================
create table public.party_ferie_requests (
  id                 uuid primary key default gen_random_uuid(),
  event_id           text not null default 'party-ferie-v0'
                     check (event_id = 'party-ferie-v0'),
  submitted_by       uuid not null default auth.uid(),
  nickname           text not null check (char_length(nickname) between 1 and 40),
  table_number       text check (table_number is null or char_length(table_number) <= 20),
  dedication         text check (dedication is null or char_length(dedication) <= 200),
  spotify_track_id   text not null check (char_length(spotify_track_id) between 1 and 100),
  spotify_track_uri  text not null check (char_length(spotify_track_uri) between 1 and 200),
  track_name         text not null check (char_length(track_name) between 1 and 200),
  artist_name        text not null check (char_length(artist_name) between 1 and 200),
  artwork_url        text check (artwork_url is null or char_length(artwork_url) <= 1000),
  duration_ms        integer check (duration_ms is null or duration_ms between 1000 and 3600000),
  status             text not null default 'pending'
                     check (status in (
                       'pending', 'sourcing', 'ready', 'loaded',
                       'playing', 'played', 'skipped'
                     )),
  queue_position     bigint generated always as identity,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  played_at          timestamptz
);

comment on table public.party_ferie_requests is
  'PARTY FERIE V0: richieste musicali, metadata Spotify catalog-only e stato operativo. Unica tabella PF pubblicata Realtime.';
comment on column public.party_ferie_requests.submitted_by is
  'auth.uid() della sessione che invia; consente al cliente di leggere solo le proprie richieste non pubbliche.';
comment on column public.party_ferie_requests.queue_position is
  'Ordine server-side monotono; generated always impedisce queue-jump dal client.';

create unique index party_ferie_one_playing_per_event
  on public.party_ferie_requests (event_id)
  where status = 'playing';

create index party_ferie_requests_event_queue_idx
  on public.party_ferie_requests (event_id, queue_position);

-- ============================================================
-- 2. ASSETS — mai pubblicata Realtime, mai leggibile da cliente/TV
-- ============================================================
create table public.party_ferie_assets (
  request_id       uuid primary key
                   references public.party_ferie_requests(id) on delete cascade,
  drive_url        text not null
                   check (char_length(drive_url) between 1 and 2000),
  staff_note       text check (staff_note is null or char_length(staff_note) <= 500),
  updated_by       uuid not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.party_ferie_assets is
  'PARTY FERIE V0: riferimenti Drive e metadati staff. Vietata a cliente e TV; non aggiungere a supabase_realtime.';

-- ============================================================
-- 3. RLS + grant minimi
-- ============================================================
alter table public.party_ferie_requests enable row level security;
alter table public.party_ferie_assets enable row level security;

create policy party_ferie_requests_customer_insert
  on public.party_ferie_requests for insert
  to authenticated
  with check (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is true
    and submitted_by = auth.uid()
    and status = 'pending'
  );

create policy party_ferie_requests_owner_select
  on public.party_ferie_requests for select
  to authenticated
  using (submitted_by = auth.uid());

create policy party_ferie_requests_public_tv_select
  on public.party_ferie_requests for select
  to anon, authenticated
  using (status in ('ready', 'loaded', 'playing', 'played'));

create policy party_ferie_requests_staff_select
  on public.party_ferie_requests for select
  to authenticated
  using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

create policy party_ferie_assets_staff_select
  on public.party_ferie_assets for select
  to authenticated
  using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, true) is false);

revoke all on public.party_ferie_requests from anon, authenticated;
grant select (
  id, event_id, nickname, table_number, dedication,
  spotify_track_id, spotify_track_uri, track_name, artist_name,
  artwork_url, duration_ms, status, queue_position,
  created_at, updated_at, played_at
) on public.party_ferie_requests to anon, authenticated;
grant insert (
  nickname, table_number, dedication,
  spotify_track_id, spotify_track_uri, track_name, artist_name,
  artwork_url, duration_ms
) on public.party_ferie_requests to authenticated;

revoke all on public.party_ferie_assets from anon, authenticated;
grant select on public.party_ferie_assets to authenticated;

grant usage on sequence public.party_ferie_requests_queue_position_seq
  to authenticated;

-- ============================================================
-- 4. Helper RBAC V0 condiviso staff/DJ
-- ============================================================
create or replace function public.party_ferie_is_operator()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select public.is_staff_for_venue('walrus-main');
$$;

revoke all on function public.party_ferie_is_operator() from public;
grant execute on function public.party_ferie_is_operator() to authenticated;

-- ============================================================
-- 5. RPC staff: associa/sostituisce URL Drive e porta sourcing -> ready
-- ============================================================
create or replace function public.party_ferie_attach_asset(
  target_request_id uuid,
  target_drive_url text,
  target_staff_note text default null
)
returns public.party_ferie_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_request public.party_ferie_requests;
begin
  if not public.party_ferie_is_operator() then
    raise exception 'operator access required' using errcode = '42501';
  end if;

  if target_drive_url is null
     or char_length(btrim(target_drive_url)) < 1
     or char_length(target_drive_url) > 2000 then
    raise exception 'invalid drive url' using errcode = '22023';
  end if;

  select * into current_request
    from public.party_ferie_requests
   where id = target_request_id
   for update;

  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if current_request.status not in ('sourcing', 'ready') then
    raise exception 'asset can only be attached while sourcing or ready'
      using errcode = '22023';
  end if;

  insert into public.party_ferie_assets (
    request_id, drive_url, staff_note, updated_by
  ) values (
    target_request_id, btrim(target_drive_url), target_staff_note, auth.uid()
  )
  on conflict (request_id) do update
    set drive_url = excluded.drive_url,
        staff_note = excluded.staff_note,
        updated_by = excluded.updated_by,
        updated_at = now();

  update public.party_ferie_requests
     set status = 'ready', updated_at = now()
   where id = target_request_id
   returning * into current_request;

  return current_request;
end;
$$;

revoke all on function public.party_ferie_attach_asset(uuid, text, text) from public;
grant execute on function public.party_ferie_attach_asset(uuid, text, text)
  to authenticated;

-- ============================================================
-- 6. RPC staff/DJ: transizioni controllate e atomiche
-- ============================================================
create or replace function public.party_ferie_transition_request(
  target_request_id uuid,
  target_status text
)
returns public.party_ferie_requests
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_request public.party_ferie_requests;
begin
  if not public.party_ferie_is_operator() then
    raise exception 'operator access required' using errcode = '42501';
  end if;

  select * into current_request
    from public.party_ferie_requests
   where id = target_request_id
   for update;

  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if target_status = 'playing' then
    perform pg_advisory_xact_lock(hashtextextended(current_request.event_id, 0));

    if exists (
      select 1 from public.party_ferie_requests
       where event_id = current_request.event_id
         and status = 'playing'
         and id <> current_request.id
    ) then
      raise exception 'another request is already playing for this event'
        using errcode = '23505';
    end if;
  end if;

  if not (
    (current_request.status = 'pending'  and target_status = 'sourcing') or
    (current_request.status = 'ready'    and target_status = 'loaded') or
    (current_request.status = 'loaded'   and target_status = 'playing') or
    (current_request.status = 'playing'  and target_status = 'played') or
    (current_request.status in ('pending', 'sourcing', 'ready', 'loaded')
      and target_status = 'skipped')
  ) then
    raise exception 'invalid Party Ferie status transition: % -> %',
      current_request.status, target_status using errcode = '22023';
  end if;

  update public.party_ferie_requests
     set status = target_status,
         updated_at = now(),
         played_at = case when target_status = 'played' then now() else played_at end
   where id = target_request_id
   returning * into current_request;

  return current_request;
end;
$$;

revoke all on function public.party_ferie_transition_request(uuid, text) from public;
grant execute on function public.party_ferie_transition_request(uuid, text)
  to authenticated;

-- ============================================================
-- 7. Realtime — requests soltanto
-- ============================================================
alter publication supabase_realtime add table public.party_ferie_requests;

commit;
;
