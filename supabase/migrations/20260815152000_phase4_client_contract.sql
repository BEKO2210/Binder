begin;

create or replace function public.get_my_primary_media_state()
returns table (
  storage_path text,
  moderation_status text,
  moderation_reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pm.storage_path, pm.moderation_status, pm.moderation_reason
  from public.profile_media pm
  where pm.user_id = auth.uid() and pm.position = 0
  limit 1;
$$;

revoke all on function public.get_my_primary_media_state() from public, anon;
grant execute on function public.get_my_primary_media_state() to authenticated;

commit;
