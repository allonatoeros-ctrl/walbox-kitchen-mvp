-- FantaWalrus — save_fanta_roster_v1(): atomic roster replace (P0 fix)
-- Local-only migration draft. NOT applied to any remote project.
-- Replaces the previous client-side delete()+insert() pair in
-- fantaRosterPersistence.js (non-atomic: an insert failure after a
-- successful delete left the roster empty) with a single SECURITY DEFINER
-- function. Delete and insert run inside the function's own transaction
-- scope: any exception (auth, ownership, unknown player_id, duplicate
-- player_id) rolls back the delete too, so the caller never observes a
-- partially-replaced roster. Same SECURITY DEFINER shape as
-- create_fanta_team_v1 (0002): search_path pinned, user_id always taken
-- from auth.uid(), never accepted as input.
create or replace function save_fanta_roster_v1(
  p_team_id uuid,
  p_player_ids uuid[]
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

  if p_player_ids is null then
    raise exception 'FANTA_ROSTER_INVALID: player_ids must not be null';
  end if;

  select exists(
    select 1 from fanta_team_members
    where team_id = p_team_id and user_id = v_user_id
  ) into v_is_owner;

  if not (v_is_owner or fanta_is_admin()) then
    raise exception 'FANTA_TEAM_NOT_OWNED: user % does not own team %', v_user_id, p_team_id;
  end if;

  v_saved := coalesce(array_length(p_player_ids, 1), 0);

  delete from fanta_rosters where team_id = p_team_id;

  if v_saved > 0 then
    insert into fanta_rosters (team_id, player_id)
    select p_team_id, pid from unnest(p_player_ids) as pid;
  end if;

  return v_saved;
exception
  when foreign_key_violation then
    raise exception 'FANTA_PLAYER_NOT_FOUND: one or more player_ids do not exist in fanta_player_snapshots';
  when unique_violation then
    raise exception 'FANTA_ROSTER_DUPLICATE: player_ids must not contain duplicates';
end;
$$;

revoke all on function save_fanta_roster_v1(uuid, uuid[]) from public;
grant execute on function save_fanta_roster_v1(uuid, uuid[]) to authenticated;
