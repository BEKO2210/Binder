begin;

alter table public.profile_media
  add constraint profile_media_path_owned
  check (split_part(storage_path, '/', 1) = user_id::text);

create policy profiles_self_insert
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()));

create policy profiles_self_update
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy private_self_insert
on public.user_private for insert to authenticated
with check (user_id = (select auth.uid()));

create policy private_self_update
on public.user_private for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy preferences_self_insert
on public.user_preferences for insert to authenticated
with check (user_id = (select auth.uid()));

create policy preferences_self_update
on public.user_preferences for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy media_self_insert
on public.profile_media for insert to authenticated
with check (user_id = (select auth.uid()));

create policy media_self_update
on public.profile_media for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy media_self_delete
on public.profile_media for delete to authenticated
using (user_id = (select auth.uid()));

create or replace function public.guard_birth_date_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.birth_date is distinct from new.birth_date
     and exists (
       select 1 from public.profiles p
       where p.user_id = new.user_id and p.onboarding_complete = true
     ) then
    raise exception 'Birth date cannot change after onboarding.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger user_private_birth_date_immutable
before update of birth_date on public.user_private
for each row execute function public.guard_birth_date_change();

create or replace function public.guard_onboarding_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.onboarding_complete = true and old.onboarding_complete = false then
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
before update of onboarding_complete on public.profiles
for each row execute function public.guard_onboarding_completion();

alter function public.complete_my_onboarding(text,date,text,text,text[],text[],smallint,smallint,smallint) security invoker;
alter function public.finalize_my_onboarding() security invoker;
alter function public.update_my_profile(text,text,text,text[],text[],smallint,smallint,smallint) security invoker;
alter function public.set_my_location(double precision,double precision) security invoker;

commit;
