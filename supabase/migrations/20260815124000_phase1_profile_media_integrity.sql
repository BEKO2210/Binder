begin;

drop trigger if exists profiles_onboarding_completion_guard on public.profiles;

create or replace function public.guard_onboarding_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarding_complete = true
     and (tg_op = 'INSERT' or old.onboarding_complete = false) then
    if not exists (select 1 from public.user_private where user_id = new.user_id) then
      raise exception 'Birth date is required.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.user_preferences where user_id = new.user_id) then
      raise exception 'Preferences are required.' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.profile_media pm
      join storage.objects so
        on so.bucket_id = 'profile-media' and so.name = pm.storage_path
      where pm.user_id = new.user_id
    ) then
      raise exception 'At least one uploaded profile photo is required.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_onboarding_completion_guard
before insert or update of onboarding_complete on public.profiles
for each row execute function public.guard_onboarding_completion();

create or replace function public.guard_profile_media_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if split_part(new.storage_path, '/', 1) <> new.user_id::text then
    raise exception 'Media path must belong to the authenticated user.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'profile-media' and so.name = new.storage_path
  ) then
    raise exception 'Media object must exist before metadata is saved.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profile_media_reference_guard
before insert or update of storage_path on public.profile_media
for each row execute function public.guard_profile_media_reference();

drop policy if exists media_self_delete on public.profile_media;
create policy media_self_delete
on public.profile_media for delete to authenticated
using (
  user_id = (select auth.uid())
  and (
    not exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.onboarding_complete = true
    )
    or exists (
      select 1 from public.profile_media other
      where other.user_id = (select auth.uid()) and other.id <> profile_media.id
    )
  )
);

drop policy if exists profile_media_objects_delete_own_folder on storage.objects;
create policy profile_media_objects_delete_own_folder
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.profile_media pm
    where pm.storage_path = storage.objects.name
  )
);

commit;
