-- A distance that can be asked again from a new place is a way to find somebody.
--
-- `set_my_location` checked that the numbers were inside the range of the
-- planet and wrote them down. `distance_to_user` answered in whole kilometres,
-- for anybody the caller was allowed to see, as often as asked. Put together
-- that is a measuring instrument: set a point, read the distance, set another
-- point, read again. Three readings cross to a small area, more readings shrink
-- it. The raw coordinate never left the server — and the person could still be
-- found, which is what the promise was actually about.
--
-- Two things change, and they work on different parts of the attack:
--
--   * The location cannot be moved at will any more. Twenty updates an hour is
--     far above what a moving phone produces and far below what measuring
--     needs, and a jump that would require more than 1000 km/h is refused as
--     what it is.
--   * The answer is coarser: distance comes back in five-kilometre steps, and
--     everything under five reads as five. A step is wide enough that crossing
--     it tells an attacker much less, and it is the same number a person means
--     when they say "about ten kilometres away".
--
-- The whole-kilometre value stays inside the server, where the ranking uses it.

create table if not exists private.location_updates (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists location_updates_user_time_idx on private.location_updates (user_id, created_at desc);
alter table private.location_updates enable row level security;
revoke all on table private.location_updates from public, anon, authenticated;

-- set_my_location runs as the caller — deliberately, so the row-level rules
-- apply to the write. The rate-limit ledger lives in `private`, which the caller
-- cannot touch, so counting and recording happen in one owner-side function.
create or replace function private.note_location_update(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  select count(*)::integer into recent
  from private.location_updates
  where user_id = p_user_id and created_at > now() - interval '1 hour';
  if recent >= 20 then
    return recent;
  end if;
  insert into private.location_updates (user_id) values (p_user_id);
  return recent;
end;
$$;

revoke all on function private.note_location_update(uuid) from public, anon;
grant execute on function private.note_location_update(uuid) to authenticated;

create or replace function public.set_my_location(latitude double precision, longitude double precision)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  previous extensions.geography;
  previous_at timestamptz;
  moved_km double precision;
  elapsed_hours double precision;
  recent integer;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;

  select location, location_updated_at into previous, previous_at
  from public.user_private where user_id = uid;

  if previous is not null and previous_at is not null then
    moved_km := extensions.st_distance(previous, extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography) / 1000.0;
    elapsed_hours := greatest(extract(epoch from (now() - previous_at)) / 3600.0, 1.0 / 3600.0);
    -- Two conditions, because a coarse fix jitters: only a jump that is both
    -- long and impossibly fast counts. A few hundred metres between two fixes a
    -- second apart is a phone deciding where it is, not somebody teleporting.
    if moved_km > 100 and moved_km / elapsed_hours > 1000 then
      raise exception 'Location moved implausibly fast.' using errcode = '22023';
    end if;
  end if;

  -- Measuring needs many points in a short time. A phone in a pocket does not.
  recent := private.note_location_update(uid);
  if recent >= 20 then
    raise exception 'Too many location updates. Try again later.' using errcode = '53400';
  end if;

  update public.user_private
  set location = extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography,
      location_updated_at = now()
  where user_id = uid;
end;
$$;

-- Older rows say nothing about the last hour.
create or replace function private.prune_location_updates()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from private.location_updates where created_at < now() - interval '2 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function private.prune_location_updates() from public, anon, authenticated;
grant execute on function private.prune_location_updates() to service_role;

-- Five-kilometre steps, with everything closer than five reading as five: the
-- resolution a person means by "nearby", and coarse enough that crossing a step
-- boundary is worth much less to somebody measuring.
create or replace function public.distance_to_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.can_view_profile(target_user_id) then null
    when mine.location is null or theirs.location is null then null
    else greatest(5, (ceil(extensions.st_distance(mine.location, theirs.location) / 5000.0) * 5)::integer)
  end
  from public.user_private mine
  join public.user_private theirs on theirs.user_id = target_user_id
  where mine.user_id = auth.uid();
$$;

revoke all on function public.distance_to_user(uuid) from public, anon;
grant execute on function public.distance_to_user(uuid) to authenticated;
