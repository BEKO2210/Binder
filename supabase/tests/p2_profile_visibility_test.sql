-- A user id used to be a key: whoever had one could read that profile, its
-- photos and its rounded distance for as long as the account existed, whether
-- or not there was any reason to. This suite is the reason, in three cases.
begin;
create extension if not exists pgtap;

select plan(6);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@binder.test', '{}', '{}', now(), now()),
('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ben@binder.test', '{}', '{}', now(), now());

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Ana', '1994-03-02', 'woman', 'Bio', array['Coffee'], array['man'], 24::smallint, 44::smallint, 90::smallint);
select public.set_my_location(52.5200, 13.4050);
-- A candidate needs an approved first photo; the guard only accepts your own.
insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('profile-media', 'b1000000-0000-4000-8000-000000000001/one.webp', 'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', '{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001/one.webp', 0, 1080, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
reset role;

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Ben', '1991-07-19', 'man', 'Bio', array['Coffee'], array['woman'], 24::smallint, 44::smallint, 90::smallint);
select public.set_my_location(52.5205, 13.4060);
insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('profile-media', 'b1000000-0000-4000-8000-000000000002/one.webp', 'b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', '{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002/one.webp', 0, 1080, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
reset role;

-- Both photos pass moderation, the way the queue would clear them.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status = 'approved';
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1. Two people who could be shown each other may look at each other.
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select ok(
  private.can_view_profile('b1000000-0000-4000-8000-000000000002'),
  'A candidate for your deck may be looked at'
);
select public.record_decision('b1000000-0000-4000-8000-000000000002', 'bind');
reset role;

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.record_decision('b1000000-0000-4000-8000-000000000001', 'bind');
select is(
  (select count(*)::integer from public.matches where status = 'active'),
  1,
  'Two binds made exactly one match'
);
reset role;

-- 2. A live match is a reason of its own — even when the filters would no
--    longer put these two in each other's decks.
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.update_my_profile('Ana', 'woman', 'Bio', array['Coffee'], array['woman'], 24::smallint, 44::smallint, 90::smallint);
select ok(
  private.can_view_profile('b1000000-0000-4000-8000-000000000002'),
  'A live match keeps the profile readable after the filters stop matching'
);
reset role;

-- 3. The unmatch. It sets a status and creates no block — and that used to be
--    the moment the old rule stopped protecting anybody.
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.unmatch((select id from public.matches limit 1));
select ok(
  not private.can_view_profile('b1000000-0000-4000-8000-000000000002'),
  'After an unmatch the profile closes, without anybody having to block'
);
select is(
  (select count(*)::integer from public.get_public_profile('b1000000-0000-4000-8000-000000000002')),
  0,
  'The public profile returns nothing to somebody with no reason to look'
);
select ok(
  public.distance_to_user('b1000000-0000-4000-8000-000000000002') is null,
  'And the distance oracle answers nothing either'
);
reset role;

select * from finish();
rollback;
