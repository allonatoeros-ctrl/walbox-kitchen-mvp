-- FantaWalrus — fanta_rosters.is_starter + save_fanta_roster_v1 structured payload (P0 fix)
-- Local-only migration draft. NOT applied to any remote project.
-- Root cause: fanta_rosters never had a column to persist the starter/bench
-- distinction, yet the frontend contract ({ id, isStarter }, FantaTeamBuilder/
-- FantaHome) and saveRosterV1/loadRosterV1 already assumed one existed.
-- saveRosterV1 silently dropped isStarter before calling the RPC (only
-- p_player_ids was sent) and loadRosterV1 selected a non-existent
-- "isStarter" column, which fails at the PostgREST layer. This migration
-- adds the column and replaces save_fanta_roster_v1 so player_id and
-- is_starter are written atomically in the same delete+insert transaction.

alter table fanta_rosters
  add column if not exists is_starter boolean not null default true;

-- Drop the old (p_team_id uuid, p_player_ids uuid[]) overload: it has no way
-- to carry is_starter, so it must not remain callable alongside the new one.
drop function if exists save_fanta_roster_v1(uuid, uuid[]);

create or replace function save_fanta_roster_v1(
  p_team_id uuid,
  p_roster jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_owner boolean;
  v_saved int;
begin
  if v_user_id is null then
    raise exception 'FANTA_AUTH_REQUIRED: authentication required to save a roster';
  end if;

  if p_team_id is null then
    raise exception 'FANTA_TEAM_ID_REQUIRED: team_id must not be null';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' then
    raise exception 'FANTA_ROSTER_INVALID: roster must be a JSON array';
  end if;

  select exists(
    select 1 from fanta_team_members
    where team_id = p_team_id and user_id = v_user_id
  ) into v_is_owner;

  if not (v_is_owner or fanta_is_admin()) then
    raise exception 'FANTA_TEAM_NOT_OWNED: user % does not own team %', v_user_id, p_team_id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_roster) as elem
    where not (elem ? 'player_id')
       or not (elem ? 'is_starter')
       or jsonb_typeof(elem -> 'player_id') <> 'string'
       or jsonb_typeof(elem -> 'is_starter') <> 'boolean'
  ) then
    raise exception 'FANTA_ROSTER_INVALID: every roster item requires player_id (uuid) and is_starter (boolean)';
  end if;

  select count(*) into v_saved from jsonb_array_elements(p_roster);

  delete from fanta_rosters where team_id = p_team_id;

  if v_saved > 0 then
    insert into fanta_rosters (team_id, player_id, is_starter)
    select
      p_team_id,
      (elem ->> 'player_id')::uuid,
      (elem ->> 'is_starter')::boolean
    from jsonb_array_elements(p_roster) as elem;
  end if;

  return v_saved;
exception
  when foreign_key_violation then
    raise exception 'FANTA_PLAYER_NOT_FOUND: one or more player_ids do not exist in fanta_player_snapshots';
  when unique_violation then
    raise exception 'FANTA_ROSTER_DUPLICATE: player_ids must not contain duplicates';
  when invalid_text_representation then
    raise exception 'FANTA_ROSTER_INVALID: player_id must be a valid uuid';
end;
$$;

revoke all on function save_fanta_roster_v1(uuid, jsonb) from public;
grant execute on function save_fanta_roster_v1(uuid, jsonb) to authenticated;
