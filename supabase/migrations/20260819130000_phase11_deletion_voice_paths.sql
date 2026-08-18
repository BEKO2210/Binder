-- The deletion function needs the voice paths an account leaves behind, but
-- service_role deliberately holds no table grants here. One definer function,
-- executable by service_role alone, hands out exactly that list and nothing
-- else — the hardening stays intact.
create or replace function public.deletion_voice_paths(p_user_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select msg.audio_path
  from public.messages msg
  where msg.sender_id = p_user_id
    and msg.kind = 'voice'
    and msg.audio_path is not null;
$$;

revoke all on function public.deletion_voice_paths(uuid) from public, anon, authenticated;
grant execute on function public.deletion_voice_paths(uuid) to service_role;
