create table public.kitchen_orders(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  total numeric,
  created_at timestamptz default now());
alter table public.kitchen_orders enable row level security;
create policy ko_select on public.kitchen_orders for select to authenticated using (customer_id = auth.uid());
create policy ko_insert on public.kitchen_orders for insert to authenticated with check (customer_id = auth.uid());
grant select, insert on public.kitchen_orders to authenticated;

create table public.kitchen_push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  endpoint text unique);
alter table public.kitchen_push_subscriptions enable row level security;
create policy kps_select on public.kitchen_push_subscriptions for select to authenticated using (customer_id = auth.uid());
create policy kps_insert on public.kitchen_push_subscriptions for insert to authenticated with check (customer_id = auth.uid());
grant select, insert on public.kitchen_push_subscriptions to authenticated;

create table public.identity_merge_tickets(
  ticket_hash text primary key,
  anon_uid uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid);
alter table public.identity_merge_tickets enable row level security;
revoke all on public.identity_merge_tickets from anon, authenticated;

create or replace function public.create_merge_ticket() returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_token text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is not true then
    raise exception 'solo utenti anonimi' using errcode='42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.identity_merge_tickets(ticket_hash, anon_uid, expires_at)
  values (encode(extensions.digest(v_token,'sha256'),'hex'), auth.uid(), now() + interval '10 minutes');
  return v_token;
end $$;

create or replace function public.redeem_merge_ticket(p_ticket text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare t public.identity_merge_tickets; v_orders int; v_push int; v_anon boolean; v_phone timestamptz;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) is true then
    raise exception 'serve utente non anonimo' using errcode='42501';
  end if;
  select phone_confirmed_at into v_phone from auth.users where id = auth.uid();
  if v_phone is null then raise exception 'telefono non confermato' using errcode='42501'; end if;
  select * into t from public.identity_merge_tickets
   where ticket_hash = encode(extensions.digest(p_ticket,'sha256'),'hex') for update;
  if not found then raise exception 'biglietto non valido' using errcode='P0002'; end if;
  if t.redeemed_at is not null then raise exception 'biglietto gia usato' using errcode='P0001'; end if;
  if t.expires_at < now() then raise exception 'biglietto scaduto' using errcode='P0001'; end if;
  if t.anon_uid = auth.uid() then raise exception 'stesso utente' using errcode='P0001'; end if;
  select is_anonymous into v_anon from auth.users where id = t.anon_uid;
  if v_anon is not true then raise exception 'origine non anonima' using errcode='P0001'; end if;
  update public.kitchen_orders set customer_id = auth.uid() where customer_id = t.anon_uid;
  get diagnostics v_orders = row_count;
  update public.kitchen_push_subscriptions set customer_id = auth.uid() where customer_id = t.anon_uid;
  get diagnostics v_push = row_count;
  update public.identity_merge_tickets set redeemed_at = now(), redeemed_by = auth.uid() where ticket_hash = t.ticket_hash;
  return v_orders + v_push;
end $$;

revoke all on function public.create_merge_ticket() from public, anon;
revoke all on function public.redeem_merge_ticket(text) from public, anon;
grant execute on function public.create_merge_ticket() to authenticated;
grant execute on function public.redeem_merge_ticket(text) to authenticated;
