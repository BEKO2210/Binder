begin;

create extension if not exists pgcrypto;
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 500),
  gender text not null check (gender in ('woman','man','nonbinary')),
  interests text[] not null default '{}' check (cardinality(interests) <= 12),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  location extensions.geography(point, 4326),
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interested_in text[] not null default array['woman','man','nonbinary']::text[],
  min_age smallint not null default 18 check (min_age between 18 and 100),
  max_age smallint not null default 45 check (max_age between 18 and 100),
  max_distance_km smallint not null default 50 check (max_distance_km between 1 and 500),
  updated_at timestamptz not null default now(),
  check (min_age <= max_age),
  check (cardinality(interested_in) > 0),
  check (interested_in <@ array['woman','man','nonbinary']::text[])
);

create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  position smallint not null check (position between 0 and 5),
  width smallint not null check (width between 1 and 1080),
  height smallint not null check (height between 1 and 1080),
  byte_size integer not null check (byte_size between 1 and 3145728),
  mime_type text not null check (mime_type = 'image/webp'),
  created_at timestamptz not null default now(),
  unique (user_id, position),
  unique (storage_path)
);

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam','harassment','underage','fake','sexual_content','violence','other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index user_private_location_gix on public.user_private using gist (location);
create index blocks_blocked_id_idx on public.blocks (blocked_id);
create index profile_media_user_id_position_idx on public.profile_media (user_id, position);
create index reports_reported_id_created_at_idx on public.reports (reported_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_private_updated_at
before update on public.user_private
for each row execute function public.set_updated_at();

create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

create or replace function public.enforce_adult_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'Binder is 18+.' using errcode = '23514';
  end if;
  if new.birth_date < (current_date - interval '100 years')::date then
    raise exception 'Birth date outside supported range.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_private_adult_gate
before insert or update of birth_date on public.user_private
for each row execute function public.enforce_adult_birth_date();

alter table public.profiles enable row level security;
alter table public.user_private enable row level security;
alter table public.user_preferences enable row level security;
alter table public.profile_media enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy profiles_self_select
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy private_self_select
on public.user_private for select to authenticated
using (user_id = (select auth.uid()));

create policy preferences_self_select
on public.user_preferences for select to authenticated
using (user_id = (select auth.uid()));

create policy blocks_self_all
on public.blocks for all to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

create policy reports_insert_self
on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when target_user_id = auth.uid() then true
    else
      exists (
        select 1 from public.profiles p
        where p.user_id = target_user_id
          and p.onboarding_complete = true
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = target_user_id)
           or (b.blocker_id = target_user_id and b.blocked_id = auth.uid())
      )
  end;
$$;

create policy media_visible_profiles_select
on public.profile_media for select to authenticated
using (public.can_view_profile(user_id));

create or replace function public.get_public_profile(target_user_id uuid)
returns table (
  user_id uuid,
  first_name text,
  age integer,
  bio text,
  gender text,
  interests text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.user_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    p.gender,
    p.interests
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  where p.user_id = target_user_id
    and public.can_view_profile(target_user_id);
$$;

create or replace function public.distance_to_user(target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not public.can_view_profile(target_user_id) then null
    when mine.location is null or theirs.location is null then null
    else round(extensions.st_distance(mine.location, theirs.location) / 1000.0)::integer
  end
  from public.user_private mine
  join public.user_private theirs on theirs.user_id = target_user_id
  where mine.user_id = auth.uid();
$$;

create or replace function public.complete_my_onboarding(
  p_first_name text,
  p_birth_date date,
  p_gender text,
  p_bio text,
  p_interests text[],
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_max_distance_km smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  already_complete boolean;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_first_name is null or char_length(trim(p_first_name)) not between 1 and 40 then
    raise exception 'First name is required.' using errcode = '23514';
  end if;

  if p_gender not in ('woman','man','nonbinary') then
    raise exception 'Invalid gender.' using errcode = '23514';
  end if;

  if p_birth_date > (current_date - interval '18 years')::date
     or p_birth_date < (current_date - interval '100 years')::date then
    raise exception 'Binder is 18+ and birth date must be valid.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interests, '{}')) > 12 then
    raise exception 'Too many interests.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interested_in, '{}')) = 0
     or not (p_interested_in <@ array['woman','man','nonbinary']::text[]) then
    raise exception 'Invalid dating preference.' using errcode = '23514';
  end if;

  if p_min_age < 18 or p_max_age > 100 or p_min_age > p_max_age
     or p_max_distance_km < 1 or p_max_distance_km > 500 then
    raise exception 'Invalid discovery preferences.' using errcode = '23514';
  end if;

  select p.onboarding_complete into already_complete
  from public.profiles p
  where p.user_id = uid;

  if coalesce(already_complete, false) then
    raise exception 'Onboarding is already complete.' using errcode = '23514';
  end if;

  insert into public.profiles (user_id, first_name, bio, gender, interests, onboarding_complete)
  values (uid, trim(p_first_name), coalesce(trim(p_bio), ''), p_gender, coalesce(p_interests, '{}'), false)
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    bio = excluded.bio,
    gender = excluded.gender,
    interests = excluded.interests,
    onboarding_complete = false;

  insert into public.user_private (user_id, birth_date)
  values (uid, p_birth_date)
  on conflict (user_id) do update set birth_date = excluded.birth_date;

  insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
  values (uid, p_interested_in, p_min_age, p_max_age, p_max_distance_km)
  on conflict (user_id) do update set
    interested_in = excluded.interested_in,
    min_age = excluded.min_age,
    max_age = excluded.max_age,
    max_distance_km = excluded.max_distance_km;
end;
$$;

create or replace function public.finalize_my_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_private where user_id = uid) then
    raise exception 'Birth date is required.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.user_preferences where user_id = uid) then
    raise exception 'Preferences are required.' using errcode = '23514';
  end if;

  if not exists (select 1 from public.profile_media where user_id = uid) then
    raise exception 'At least one profile photo is required.' using errcode = '23514';
  end if;

  update public.profiles
  set onboarding_complete = true
  where user_id = uid;

  if not found then
    raise exception 'Profile is required.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.update_my_profile(
  p_first_name text,
  p_gender text,
  p_bio text,
  p_interests text[],
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_max_distance_km smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_first_name is null or char_length(trim(p_first_name)) not between 1 and 40 then
    raise exception 'First name is required.' using errcode = '23514';
  end if;

  if p_gender not in ('woman','man','nonbinary') then
    raise exception 'Invalid gender.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interests, '{}')) > 12 then
    raise exception 'Too many interests.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interested_in, '{}')) = 0
     or not (p_interested_in <@ array['woman','man','nonbinary']::text[]) then
    raise exception 'Invalid dating preference.' using errcode = '23514';
  end if;

  if p_min_age < 18 or p_max_age > 100 or p_min_age > p_max_age
     or p_max_distance_km < 1 or p_max_distance_km > 500 then
    raise exception 'Invalid discovery preferences.' using errcode = '23514';
  end if;

  update public.profiles
  set first_name = trim(p_first_name),
      gender = p_gender,
      bio = coalesce(trim(p_bio), ''),
      interests = coalesce(p_interests, '{}')
  where user_id = uid and onboarding_complete = true;

  if not found then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;

  update public.user_preferences
  set interested_in = p_interested_in,
      min_age = p_min_age,
      max_age = p_max_age,
      max_distance_km = p_max_distance_km
  where user_id = uid;
end;
$$;

create or replace function public.set_my_location(latitude double precision, longitude double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;

  update public.user_private
  set location = extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography,
      location_updated_at = now()
  where user_id = uid;

  if not found then
    raise exception 'Complete identity onboarding first.' using errcode = '23514';
  end if;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 3145728, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_media_objects_read_visible
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-media'
  and array_length(storage.foldername(name), 1) >= 1
  and public.can_view_profile((storage.foldername(name))[1]::uuid)
);

create policy profile_media_objects_insert_own_folder
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_media_objects_update_own_folder
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_media_objects_delete_own_folder
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

revoke all on public.profiles from anon;
revoke all on public.user_private from anon;
revoke all on public.user_preferences from anon;
revoke all on public.profile_media from anon;
revoke all on public.blocks from anon;
revoke all on public.reports from anon;

revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.get_public_profile(uuid) from public, anon;
revoke all on function public.distance_to_user(uuid) from public, anon;
revoke all on function public.complete_my_onboarding(text,date,text,text,text[],text[],smallint,smallint,smallint) from public, anon;
revoke all on function public.finalize_my_onboarding() from public, anon;
revoke all on function public.update_my_profile(text,text,text,text[],text[],smallint,smallint,smallint) from public, anon;
revoke all on function public.set_my_location(double precision,double precision) from public, anon;

grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.get_public_profile(uuid) to authenticated;
grant execute on function public.distance_to_user(uuid) to authenticated;
grant execute on function public.complete_my_onboarding(text,date,text,text,text[],text[],smallint,smallint,smallint) to authenticated;
grant execute on function public.finalize_my_onboarding() to authenticated;
grant execute on function public.update_my_profile(text,text,text,text[],text[],smallint,smallint,smallint) to authenticated;
grant execute on function public.set_my_location(double precision,double precision) to authenticated;

commit;
