begin;

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('bind', 'pass')),
  created_at timestamptz not null default now(),
  unique (actor_id, target_id),
  check (actor_id <> target_id)
);

create index decisions_reciprocal_bind_idx
on public.decisions (target_id, actor_id)
where decision = 'bind';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (user_low, user_high),
  check (user_low < user_high),
  check (
    (status = 'active' and ended_at is null)
    or (status <> 'active' and ended_at is not null)
  )
);

create index matches_user_high_status_idx on public.matches (user_high, status);
create index matches_user_low_status_idx on public.matches (user_low, status);

create table private.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  event_type text not null check (event_type = 'created'),
  created_at timestamptz not null default now(),
  unique (match_id, event_type)
);

revoke all on table private.match_events from public, anon, authenticated;

create or replace function private.lock_pair(first_user uuid, second_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  low_user uuid;
  high_user uuid;
begin
  if first_user is null or second_user is null or first_user = second_user then
    raise exception 'A valid user pair is required.' using errcode = '22023';
  end if;

  low_user := least(first_user, second_user);
  high_user := greatest(first_user, second_user);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(low_user::text),
    pg_catalog.hashtext(high_user::text)
  );
end;
$$;

revoke all on function private.lock_pair(uuid, uuid) from public, anon, authenticated;

create or replace function private.is_discovery_candidate(viewer_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles viewer_profile
    join public.user_private viewer_private on viewer_private.user_id = viewer_profile.user_id
    join public.user_preferences viewer_preferences on viewer_preferences.user_id = viewer_profile.user_id
    join public.profiles target_profile on target_profile.user_id = target_user_id
    join public.user_private target_private on target_private.user_id = target_profile.user_id
    join public.user_preferences target_preferences on target_preferences.user_id = target_profile.user_id
    where viewer_profile.user_id = viewer_id
      and viewer_id <> target_user_id
      and viewer_profile.onboarding_complete = true
      and target_profile.onboarding_complete = true
      and viewer_private.location is not null
      and target_private.location is not null
      and viewer_private.location_updated_at >= now() - interval '30 days'
      and target_private.location_updated_at >= now() - interval '30 days'
      and target_profile.gender = any(viewer_preferences.interested_in)
      and viewer_profile.gender = any(target_preferences.interested_in)
      and extract(year from age(current_date, target_private.birth_date))::integer
          between viewer_preferences.min_age and viewer_preferences.max_age
      and extract(year from age(current_date, viewer_private.birth_date))::integer
          between target_preferences.min_age and target_preferences.max_age
      and extensions.st_dwithin(
        viewer_private.location,
        target_private.location,
        least(viewer_preferences.max_distance_km, target_preferences.max_distance_km)::double precision * 1000.0
      )
      and exists (
        select 1 from public.profile_media media
        where media.user_id = target_user_id and media.position = 0
      )
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = viewer_id and block.blocked_id = target_user_id)
           or (block.blocker_id = target_user_id and block.blocked_id = viewer_id)
      )
      and not exists (
        select 1 from public.decisions existing_decision
        where existing_decision.actor_id = viewer_id
          and existing_decision.target_id = target_user_id
      )
      and not exists (
        select 1 from public.matches existing_match
        where existing_match.user_low = least(viewer_id, target_user_id)
          and existing_match.user_high = greatest(viewer_id, target_user_id)
          and existing_match.status = 'active'
      )
  );
$$;

revoke all on function private.is_discovery_candidate(uuid, uuid) from public, anon, authenticated;

create or replace function private.emit_match_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.match_events (match_id, event_type)
  values (new.id, 'created')
  on conflict (match_id, event_type) do nothing;
  return new;
end;
$$;

revoke all on function private.emit_match_created() from public, anon, authenticated;

create trigger matches_created_outbox
  after insert on public.matches
  for each row execute function private.emit_match_created();

create or replace function private.lock_block_pair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_pair(new.blocker_id, new.blocked_id);
  return new;
end;
$$;

revoke all on function private.lock_block_pair() from public, anon, authenticated;

create trigger blocks_pair_lock
  before insert on public.blocks
  for each row execute function private.lock_block_pair();

create or replace function private.deactivate_match_after_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.matches
  set status = 'blocked', ended_at = now()
  where user_low = least(new.blocker_id, new.blocked_id)
    and user_high = greatest(new.blocker_id, new.blocked_id)
    and status = 'active';
  return new;
end;
$$;

revoke all on function private.deactivate_match_after_block() from public, anon, authenticated;

create trigger blocks_deactivate_match
  after insert on public.blocks
  for each row execute function private.deactivate_match_after_block();

alter table public.decisions enable row level security;
alter table public.matches enable row level security;

create policy decisions_self_select
on public.decisions for select to authenticated
using (actor_id = (select auth.uid()));

create policy matches_member_select
on public.matches for select to authenticated
using (
  status = 'active'
  and ((select auth.uid()) = user_low or (select auth.uid()) = user_high)
  and not exists (
    select 1 from public.blocks block
    where (block.blocker_id = user_low and block.blocked_id = user_high)
       or (block.blocker_id = user_high and block.blocked_id = user_low)
  )
);

revoke all privileges on table public.decisions from anon, authenticated;
revoke all privileges on table public.matches from anon, authenticated;
grant select on table public.decisions to authenticated;
grant select on table public.matches to authenticated;

create or replace function public.get_discovery_batch(p_limit integer default 20)
returns table (
  target_user_id uuid,
  first_name text,
  age integer,
  bio text,
  interests text[],
  distance_km integer,
  primary_photo_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = uid and p.onboarding_complete = true
  ) then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;

  return query
  with viewer as (
    select p.interests, pr.location
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    where p.user_id = uid
  ), candidates as (
    select
      p.user_id,
      p.first_name,
      extract(year from age(current_date, pr.birth_date))::integer as candidate_age,
      p.bio,
      p.interests,
      round(extensions.st_distance(v.location, pr.location) / 1000.0)::integer as candidate_distance_km,
      media.storage_path,
      (
        select count(*)::integer
        from unnest(p.interests) interest
        where interest = any(v.interests)
      ) as interest_overlap,
      p.updated_at
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    cross join viewer v
    join lateral (
      select pm.storage_path
      from public.profile_media pm
      where pm.user_id = p.user_id and pm.position = 0
      limit 1
    ) media on true
    where private.is_discovery_candidate(uid, p.user_id)
  )
  select
    c.user_id,
    c.first_name,
    c.candidate_age,
    c.bio,
    c.interests,
    c.candidate_distance_km,
    c.storage_path
  from candidates c
  order by c.interest_overlap desc, c.candidate_distance_km asc, c.updated_at desc, c.user_id
  limit safe_limit;
end;
$$;

revoke all on function public.get_discovery_batch(integer) from public, anon;
grant execute on function public.get_discovery_batch(integer) to authenticated;

create or replace function public.record_decision(p_target_user_id uuid, p_decision text)
returns table (
  target_user_id uuid,
  decision text,
  matched boolean,
  match_id uuid,
  match_created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_decision text;
  low_user uuid;
  high_user uuid;
  current_match_id uuid;
  inserted_match_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_target_user_id = uid then
    raise exception 'Invalid decision target.' using errcode = '22023';
  end if;

  if p_decision not in ('bind', 'pass') then
    raise exception 'Decision must be bind or pass.' using errcode = '22023';
  end if;

  low_user := least(uid, p_target_user_id);
  high_user := greatest(uid, p_target_user_id);

  perform private.lock_pair(uid, p_target_user_id);

  select d.decision into existing_decision
  from public.decisions d
  where d.actor_id = uid and d.target_id = p_target_user_id;

  if existing_decision is not null then
    if existing_decision <> p_decision then
      raise exception 'Decision already recorded and cannot be changed.' using errcode = '23505';
    end if;

    select m.id into current_match_id
    from public.matches m
    where m.user_low = low_user
      and m.user_high = high_user
      and m.status = 'active';

    return query select p_target_user_id, p_decision, current_match_id is not null, current_match_id, false;
    return;
  end if;

  if not private.is_discovery_candidate(uid, p_target_user_id) then
    raise exception 'Profile is no longer discoverable.' using errcode = '23514';
  end if;

  insert into public.decisions (actor_id, target_id, decision)
  values (uid, p_target_user_id, p_decision);

  if p_decision = 'bind' and exists (
    select 1 from public.decisions reciprocal
    where reciprocal.actor_id = p_target_user_id
      and reciprocal.target_id = uid
      and reciprocal.decision = 'bind'
  ) then
    insert into public.matches (user_low, user_high)
    values (low_user, high_user)
    on conflict (user_low, user_high) do nothing
    returning id into inserted_match_id;

    if inserted_match_id is not null then
      current_match_id := inserted_match_id;
    else
      select m.id into current_match_id
      from public.matches m
      where m.user_low = low_user
        and m.user_high = high_user
        and m.status = 'active';
    end if;
  end if;

  return query select p_target_user_id, p_decision, current_match_id is not null, current_match_id, inserted_match_id is not null;
end;
$$;

revoke all on function public.record_decision(uuid, text) from public, anon;
grant execute on function public.record_decision(uuid, text) to authenticated;

commit;
