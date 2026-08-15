begin;

create extension if not exists pgcrypto;
create extension if not exists postgis;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 500),
  gender text not null check (gender in ('woman','man','nonbinary')),
  interests text[] not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  location geography(point, 4326),
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
  check (min_age <= max_age)
);

create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  position smallint not null check (position between 0 and 8),
  width smallint not null check (width between 1 and 1080),
  height smallint not null check (height between 1 and 1080),
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

create or replace view public.public_profiles
with (security_invoker = true)
as
select
  p.user_id,
  p.first_name,
  extract(year from age(current_date, pr.birth_date))::int as age,
  p.bio,
  p.gender,
  p.interests,
  p.created_at
from public.profiles p
join public.user_private pr on pr.user_id = p.user_id
where p.onboarding_complete = true;

alter table public.profiles enable row level security;
alter table public.user_private enable row level security;
alter table public.user_preferences enable row level security;
alter table public.profile_media enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy profiles_read_authenticated
on public.profiles for select to authenticated
using (onboarding_complete or user_id = (select auth.uid()));

create policy profiles_write_self
on public.profiles for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy private_read_self
on public.user_private for select to authenticated
using (user_id = (select auth.uid()));

create policy private_write_self
on public.user_private for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy preferences_self
on public.user_preferences for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy media_read_authenticated
on public.profile_media for select to authenticated
using (true);

create policy media_write_self
on public.profile_media for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy blocks_self
on public.blocks for all to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

create policy reports_insert_self
on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

create policy reports_read_self
on public.reports for select to authenticated
using (reporter_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 3145728, array['image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy profile_media_objects_read_authenticated
on storage.objects for select to authenticated
using (bucket_id = 'profile-media');

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

revoke all on public.user_private from anon;
revoke all on public.user_preferences from anon;
revoke all on public.blocks from anon;
revoke all on public.reports from anon;
revoke all on public.profile_media from anon;

grant select on public.public_profiles to authenticated;

commit;
