begin;

drop index if exists public.profile_media_user_id_position_idx;

create index if not exists reports_reporter_id_created_at_idx
  on public.reports (reporter_id, created_at desc);

commit;
