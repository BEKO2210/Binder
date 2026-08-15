begin;

create or replace function private.deactivate_match_after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matches
  set status = 'blocked', ended_at = pg_catalog.clock_timestamp()
  where user_low = least(new.blocker_id, new.blocked_id)
    and user_high = greatest(new.blocker_id, new.blocked_id)
    and status = 'active';
  return new;
end;
$$;

revoke all on function private.deactivate_match_after_block() from public, anon, authenticated;

create or replace function public.unmatch(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  current_status text;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select m.user_low, m.user_high, m.status
  into low_user, high_user, current_status
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found or uid not in (low_user, high_user) then
    raise exception 'Match membership required.' using errcode = '42501';
  end if;

  if current_status <> 'active' then
    return false;
  end if;

  update public.matches
  set status = 'unmatched', ended_at = pg_catalog.clock_timestamp()
  where id = p_match_id;

  return true;
end;
$$;

revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.unmatch(uuid) to authenticated;

commit;
