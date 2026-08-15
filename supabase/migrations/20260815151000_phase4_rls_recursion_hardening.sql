begin;

-- Integrity triggers need to inspect Storage/profile metadata independently of
-- client-visible RLS policies. Making these trigger functions definer-only
-- prevents the profile_media -> storage.objects -> profile_media policy cycle.
alter function public.guard_onboarding_completion() security definer;
alter function public.guard_profile_media_reference() security definer;
revoke all on function public.guard_onboarding_completion() from public, anon, authenticated;
revoke all on function public.guard_profile_media_reference() from public, anon, authenticated;

create or replace function private.has_other_profile_media(owner_id uuid, excluded_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profile_media pm
    where pm.user_id = owner_id
      and pm.id <> excluded_media_id
  );
$$;

revoke all on function private.has_other_profile_media(uuid, uuid) from public, anon, authenticated;

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
    or private.has_other_profile_media((select auth.uid()), profile_media.id)
  )
);

commit;
