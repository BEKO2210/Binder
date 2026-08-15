begin;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.user_private to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update, delete on public.profile_media to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant insert on public.reports to authenticated;

commit;
