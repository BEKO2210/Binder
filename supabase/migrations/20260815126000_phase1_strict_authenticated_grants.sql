begin;

revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.user_private from authenticated;
revoke all privileges on table public.user_preferences from authenticated;
revoke all privileges on table public.profile_media from authenticated;
revoke all privileges on table public.blocks from authenticated;
revoke all privileges on table public.reports from authenticated;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.user_private to authenticated;
grant select, insert, update on table public.user_preferences to authenticated;
grant select, insert, update, delete on table public.profile_media to authenticated;
grant select, insert, delete on table public.blocks to authenticated;
grant insert on table public.reports to authenticated;

commit;
