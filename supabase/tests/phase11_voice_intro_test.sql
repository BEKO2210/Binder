begin;

create extension if not exists pgtap;

create or replace function pg_temp.did_error(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception when others then
  return true;
end;
$$;

select plan(16);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@binder.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob@binder.test', '{}', '{}', now(), now());
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'owner@binder.test', now(), '{}', '{}', now(), now());
insert into auth.sessions(id, user_id) values ('98000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999');

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('profile-media', '11111111-1111-4111-8111-111111111111/test.webp', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '22222222-2222-4222-8222-222222222222/test.webp', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-voice', '11111111-1111-4111-8111-111111111111/intro1.m4a', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"audio/mp4","size":48000}'::jsonb),
  ('profile-voice', '11111111-1111-4111-8111-111111111111/intro2.m4a', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"audio/mp4","size":48000}'::jsonb);

-- Alice and Bob become full discovery-visible accounts (the report path
-- without a match requires it).
insert into private.admin_members(email, user_id, role, status, can_review_media, can_review_reports, can_suspend_accounts, activated_at)
select 'owner@binder.test', u.id, 'owner', 'active', true, true, true, now()
from auth.users u where u.email = 'owner@binder.test'
on conflict (email) do update set user_id = excluded.user_id, status = 'active';

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Alice', '1992-04-12', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/test.webp', 0, 900, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.897, 9.191);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id='11111111-1111-4111-8111-111111111111';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Bob', '1990-08-20', 'man', 'B', array['Hiking'], array['woman'], 24::smallint, 48::smallint, 100::smallint);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/test.webp', 0, 1080, 900, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.775, 9.182);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id='22222222-2222-4222-8222-222222222222';

-- ── Alice sets, replaces and the world sees. ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select ok(
  pg_temp.did_error($sql$select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/missing.m4a', 5000)$sql$),
  'An intro may not reference an object that does not exist'
);
select ok(
  pg_temp.did_error($sql$select public.set_my_voice_intro('22222222-2222-4222-8222-222222222222/intro1.m4a', 5000)$sql$),
  'An intro path under another account is refused'
);
select ok(
  pg_temp.did_error($sql$select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/intro1.m4a', 90000)$sql$),
  'A duration over one minute is refused'
);

select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/intro1.m4a', 8000);
select is((select duration_ms from public.profile_audio where user_id = auth.uid()), 8000, 'The intro row is saved');

select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/intro2.m4a', 12000);
select is((select storage_path from public.profile_audio where user_id = auth.uid()), '11111111-1111-4111-8111-111111111111/intro2.m4a', 'Setting again replaces the intro');

select is(
  (select (gp.voice_path, gp.voice_duration_ms) from public.get_public_profile(auth.uid()) gp),
  row('11111111-1111-4111-8111-111111111111/intro2.m4a'::text, 12000::integer),
  'The public projection carries the intro'
);

-- Bob can hear it the moment it exists — the owner decision, as a test.
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*) from storage.objects where bucket_id = 'profile-voice' and name = '11111111-1111-4111-8111-111111111111/intro2.m4a'),
  1::bigint,
  'A visible profile means an audible intro, immediately'
);

-- Bob reports Alice; the snapshot names the intro.
select public.report_user('11111111-1111-4111-8111-111111111111', 'harassment', 'voice intro report', null, null, false);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select rc.reported_profile_snapshot->>'voice_intro_path' from private.report_context rc
   join public.reports r on r.id = rc.report_id where r.reporter_id = '22222222-2222-4222-8222-222222222222'),
  '11111111-1111-4111-8111-111111111111/intro2.m4a',
  'The report snapshot names the intro path'
);
select ok(
  (select count(*) from private.moderation_cases c
   join public.reports r on r.id = c.report_id
   where r.reporter_id = '22222222-2222-4222-8222-222222222222') = 1,
  'The report opened a moderation case'
);

-- The admin block below runs as authenticated, which cannot read private
-- tables; this definer helper hands it just the case id.
reset role;
create function pg_temp.reported_case_id() returns bigint language sql security definer as $helper$
  select c.id from private.moderation_cases c
  join public.reports r on r.id = c.report_id
  where r.reporter_id = '22222222-2222-4222-8222-222222222222'
$helper$;

-- ── The moderator takes it down. ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated","session_id":"98000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select ok((select admin_role from public.claim_admin_session()) = 'owner', 'The bootstrap owner claims the session');
select ok(
  pg_temp.did_error($sql$select public.admin_remove_voice_intro(pg_temp.reported_case_id(), 'x')$sql$),
  'A one-letter reason is refused'
);
select public.admin_remove_voice_intro(pg_temp.reported_case_id(), 'Inappropriate voice intro');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*) from public.profile_audio where user_id = '11111111-1111-4111-8111-111111111111'), 0::bigint, 'Removal deletes the intro row');
select is((select count(*) from private.removed_voice_intros where storage_path = '11111111-1111-4111-8111-111111111111/intro2.m4a'), 1::bigint, 'Removal bans the path');
select is(
  (select ma.action from private.moderation_actions ma order by ma.created_at desc, ma.id desc limit 1),
  'remove_voice_intro',
  'Removal leaves an audit row'
);

-- Clearing your own intro needs no moderator.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select ok(
  pg_temp.did_error($sql$select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/intro2.m4a', 5000)$sql$),
  'A moderation-removed recording cannot be set again'
);
select public.set_my_voice_intro('11111111-1111-4111-8111-111111111111/intro1.m4a', 5000);
select public.clear_my_voice_intro();
select is((select count(*) from public.profile_audio where user_id = auth.uid()), 0::bigint, 'Clearing removes the row');

select * from finish();
rollback;
