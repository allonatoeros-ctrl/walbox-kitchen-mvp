create table if not exists public.kitchen_promo_analytics_events (
  id uuid primary key default gen_random_uuid(),
  venue_id text not null default 'walrus-main',
  campaign text not null default 'personalita_discutibile_v1',
  page_view_id uuid not null,
  customer_id uuid null references auth.users(id) on delete set null,
  event_name text not null check (event_name = any (array[
    'promo_open'::text,
    'first_screen_view'::text,
    'pass_view'::text,
    'menu_view'::text,
    'menu_card_view'::text,
    'menu_item_click'::text,
    'copy_code'::text,
    'closing_view'::text,
    'heartbeat'::text,
    'page_exit'::text
  ])),
  elapsed_ms integer null check (elapsed_ms is null or (elapsed_ms >= 0 and elapsed_ms <= 86400000)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kitchen_promo_analytics_events enable row level security;

create index if not exists kitchen_promo_analytics_events_created_at_idx
  on public.kitchen_promo_analytics_events (created_at desc);
create index if not exists kitchen_promo_analytics_events_event_name_idx
  on public.kitchen_promo_analytics_events (event_name, created_at desc);
create index if not exists kitchen_promo_analytics_events_page_view_idx
  on public.kitchen_promo_analytics_events (page_view_id, created_at);

revoke all on public.kitchen_promo_analytics_events from anon, authenticated;

drop policy if exists kitchen_promo_analytics_staff_select on public.kitchen_promo_analytics_events;
create policy kitchen_promo_analytics_staff_select
  on public.kitchen_promo_analytics_events
  for select
  to authenticated
  using (public.is_staff_for_venue(venue_id));

create or replace function public.kitchen_promo_analytics_record(
  p_page_view_id uuid,
  p_event_name text,
  p_elapsed_ms integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event text := lower(trim(coalesce(p_event_name, '')));
  v_elapsed integer;
  v_metadata jsonb;
begin
  if p_page_view_id is null then
    raise exception 'page_view_id_required';
  end if;

  if v_event <> all (array[
    'promo_open',
    'first_screen_view',
    'pass_view',
    'menu_view',
    'menu_card_view',
    'menu_item_click',
    'copy_code',
    'closing_view',
    'heartbeat',
    'page_exit'
  ]) then
    raise exception 'invalid_promo_analytics_event';
  end if;

  v_elapsed := case
    when p_elapsed_ms is null then null
    else greatest(0, least(p_elapsed_ms, 86400000))
  end;

  v_metadata := case
    when p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then '{}'::jsonb
    when octet_length(p_metadata::text) > 2048 then '{}'::jsonb
    else p_metadata
  end;

  insert into public.kitchen_promo_analytics_events (
    venue_id,
    campaign,
    page_view_id,
    customer_id,
    event_name,
    elapsed_ms,
    metadata
  ) values (
    'walrus-main',
    'personalita_discutibile_v1',
    p_page_view_id,
    auth.uid(),
    v_event,
    v_elapsed,
    v_metadata
  );
end;
$$;

revoke all on function public.kitchen_promo_analytics_record(uuid, text, integer, jsonb) from public;
grant execute on function public.kitchen_promo_analytics_record(uuid, text, integer, jsonb) to anon, authenticated;

comment on table public.kitchen_promo_analytics_events is
  'Anonymous funnel analytics for /kitchen/promo. No IP or user-agent stored here; customer_id is populated only when an auth session already exists.';
