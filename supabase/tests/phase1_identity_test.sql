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
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob@binder.test', '{}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'charlie@binder.test', '{}', '{}', now(), now());

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('profile-media', '11111111-1111-4111-8111-111111111111/test.webp', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '22222222-2222-4222-8222-222222222222/test.webp', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '{"mimetype":"image/webp","size":100}'::jsonb);

-- Alice goes through the same authenticated RPC/RLS path as the app.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.complete_my_onboarding('Alice', '1992-04-12', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/test.webp', 0, 900, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.897, 9.191);
select is((select onboarding_complete from public.profiles where user_id = auth.uid()), true, 'Alice completes onboarding');
reset role;

-- Bob does the same.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.complete_my_onboarding('Bob', '1990-08-20', 'man', 'B', array['Hiking'], array['woman'], 24::smallint, 48::smallint, 100::smallint);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/test.webp', 0, 1080, 900, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.775, 9.182);
select is((select onboarding_complete from public.profiles where user_id = auth.uid()), true, 'Bob completes onboarding');
reset role;

-- Alice must only see Bob through safe server projections.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.user_private where user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'Bob raw birth date and coordinates are hidden');
select is((select count(*) from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint, 'Bob raw profile table row is hidden');
select is((select count(*) from public.get_public_profile('22222222-2222-4222-8222-222222222222')), 1::bigint, 'Safe public profile projection is visible');
select ok(public.distance_to_user('22222222-2222-4222-8222-222222222222') between 10 and 20, 'Distance is calculated server-side in km');

update public.profiles
set bio = 'hacked'
where user_id = '22222222-2222-4222-8222-222222222222';
reset role;
select is(
  (select bio from public.profiles where user_id = '22222222-2222-4222-8222-222222222222'),
  'B',
  'Cross-user profile update is blocked by RLS'
);
set local role authenticated;

select ok(
  pg_temp.did_error($sql$update public.user_private set birth_date = '1995-01-01' where user_id = '11111111-1111-4111-8111-111111111111'$sql$),
  'Birth date is immutable after onboarding'
);

select ok(
  pg_temp.did_error($sql$insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type) values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/fake.webp', 1, 100, 100, 10, 'image/webp')$sql$),
  'Media metadata cannot point to a nonexistent Storage object'
);

delete from public.profile_media
where user_id = '11111111-1111-4111-8111-111111111111' and position = 0;
reset role;
select is(
  (select count(*) from public.profile_media where user_id = '11111111-1111-4111-8111-111111111111' and position = 0),
  1::bigint,
  'Completed profile cannot delete its last photo metadata'
);
set local role authenticated;

select ok(
  pg_temp.did_error($sql$delete from storage.objects where bucket_id = 'profile-media' and name = '11111111-1111-4111-8111-111111111111/test.webp'$sql$),
  'Direct SQL deletion of an active Storage object is rejected'
);

insert into public.blocks (blocker_id, blocked_id)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
select is((select count(*) from public.get_public_profile('22222222-2222-4222-8222-222222222222')), 0::bigint, 'Block hides public profile projection');
select is(public.distance_to_user('22222222-2222-4222-8222-222222222222'), null::integer, 'Block hides distance');
reset role;

-- A block is reciprocal for visibility.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.get_public_profile('11111111-1111-4111-8111-111111111111')), 0::bigint, 'Blocked user cannot see blocker either');
reset role;

-- Charlie tries to bypass onboarding and age checks.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select ok(
  pg_temp.did_error($sql$insert into public.profiles (user_id, first_name, gender, onboarding_complete) values ('33333333-3333-4333-8333-333333333333', 'Charlie', 'man', true)$sql$),
  'Direct completed-profile insert is rejected without required identity/media state'
);
select ok(
  pg_temp.did_error($sql$select public.complete_my_onboarding('Charlie', '2012-01-01', 'man', '', array[]::text[], array['woman'], 18::smallint, 40::smallint, 50::smallint)$sql$),
  'Under-18 onboarding is rejected server-side'
);
reset role;

select * from finish();
rollback;
