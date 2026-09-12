create or replace function public.kitchen_promo_pass_issue(
  p_venue_id text,
  p_campaign text default 'personalita_discutibile_v1'::text
)
returns public.kitchen_promo_passes
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_existing public.kitchen_promo_passes;
  v_new      public.kitchen_promo_passes;
  v_code     text;
  v_attempt  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'customer_session_required';
  end if;
  if p_venue_id is null or btrim(p_venue_id) = '' then
    raise exception 'invalid_venue';
  end if;

  begin
    insert into public.kitchen_promo_analytics_events (
      venue_id,
      campaign,
      page_view_id,
      customer_id,
      event_name,
      elapsed_ms,
      metadata
    ) values (
      p_venue_id,
      p_campaign,
      gen_random_uuid(),
      auth.uid(),
      'promo_open',
      0,
      jsonb_build_object('source', 'pass_issue_rpc')
    );
  exception when others then
    null;
  end;

  select * into v_existing
  from public.kitchen_promo_passes
  where venue_id = p_venue_id and customer_id = auth.uid() and campaign = p_campaign;
  if found then
    return v_existing;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'WALRUS-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                (get_byte(extensions.gen_random_bytes(1), 0) % 33) + 1, 1), '')
      from generate_series(1, 5)
    );
    begin
      insert into public.kitchen_promo_passes (venue_id, customer_id, campaign, code)
      values (p_venue_id, auth.uid(), p_campaign, v_code)
      returning * into v_new;
      return v_new;
    exception when unique_violation then
      if v_attempt >= 8 then
        raise exception 'promo_pass_code_generation_failed';
      end if;
      select * into v_existing
      from public.kitchen_promo_passes
      where venue_id = p_venue_id and customer_id = auth.uid() and campaign = p_campaign;
      if found then
        return v_existing;
      end if;
    end;
  end loop;
end;
$function$;
