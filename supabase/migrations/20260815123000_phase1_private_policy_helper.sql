begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.can_view_profile(target_user_id uuid)
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

revoke all on function private.can_view_profile(uuid) from public, anon;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop policy if exists media_visible_profiles_select on public.profile_media;
create policy media_visible_profiles_select
on public.profile_media for select to authenticated
using (private.can_view_profile(user_id));

drop policy if exists profile_media_objects_read_visible on storage.objects;
create policy profile_media_objects_read_visible
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-media'
  and array_length(storage.foldername(name), 1) >= 1
  and private.can_view_profile((storage.foldername(name))[1]::uuid)
);

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
    and private.can_view_profile(target_user_id);
$$;

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
    else round(extensions.st_distance(mine.location, theirs.location) / 1000.0)::integer
  end
  from public.user_private mine
  join public.user_private theirs on theirs.user_id = target_user_id
  where mine.user_id = auth.uid();
$$;

revoke all on function public.can_view_profile(uuid) from public, anon, authenticated;
drop function public.can_view_profile(uuid);

commit;
