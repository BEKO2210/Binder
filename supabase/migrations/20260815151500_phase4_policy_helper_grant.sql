begin;

grant execute on function private.has_other_profile_media(uuid, uuid) to authenticated;

commit;
