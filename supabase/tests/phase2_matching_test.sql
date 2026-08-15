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

select plan(24);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice2@binder.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob2@binder.test', '{}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'charlie2@binder.test', '{}', '{}', now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'dana2@binder.test', '{}', '{}', now(), now());

insert into public.profiles (user_id, first_name, bio, gender, interests, onboarding_complete)
values
  ('11111111-1111-4111-8111-111111111111', 'Alice', 'Coffee and music', 'woman', array['Coffee','Music'], false),
  ('22222222-2222-4222-8222-222222222222', 'Bob', 'Coffee and hiking', 'man', array['Coffee','Hiking'], false),
  ('33333333-3333-4333-8333-333333333333', 'Charlie', 'Too far away', 'man', array['Music'], false),
  ('44444444-4444-4444-8444-444444444444', 'Dana', 'Music and cooking', 'man', array['Music','Cooking'], false);

insert into public.user_private (user_id, birth_date, location, location_updated_at)
values
  ('11111111-1111-4111-8111-111111111111', '1992-04-12', extensions.st_setsrid(extensions.st_makepoint(9.191,48.897),4326)::extensions.geography, now()),
  ('22222222-2222-4222-8222-222222222222', '1990-08-20', extensions.st_setsrid(extensions.st_makepoint(9.182,48.775),4326)::extensions.geography, now()),
  ('33333333-3333-4333-8333-333333333333', '1991-05-20', extensions.st_setsrid(extensions.st_makepoint(13.405,52.520),4326)::extensions.geography, now()),
  ('44444444-4444-4444-8444-444444444444', '1989-07-10', extensions.st_setsrid(extensions.st_makepoint(9.215,48.850),4326)::extensions.geography, now());

insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
values
  ('11111111-1111-4111-8111-111111111111', array['man'], 25, 50, 100),
  ('22222222-2222-4222-8222-222222222222', array['woman'], 25, 50, 100),
  ('33333333-3333-4333-8333-333333333333', array['woman'], 25, 50, 100),
  ('44444444-4444-4444-8444-444444444444', array['woman'], 25, 50, 100);

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('profile-media', '11111111-1111-4111-8111-111111111111/main.webp', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '22222222-2222-4222-8222-222222222222/main.webp', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '33333333-3333-4333-8333-333333333333/main.webp', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '44444444-4444-4444-8444-444444444444/main.webp', '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', '{"mimetype":"image/webp","size":100}'::jsonb);

insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values
  ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444/main.webp', 0, 800, 1080, 100, 'image/webp');

update public.profiles set onboarding_complete = true;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20)), 2::bigint, 'Alice receives exactly two discovery candidates');
select is((select count(*) from public.get_discovery_batch(20) where target_user_id = '22222222-2222-4222-8222-222222222222'), 1::bigint, 'Nearby compatible Bob is discoverable');
select is((select count(*) from public.get_discovery_batch(20) where target_user_id = '44444444-4444-4444-8444-444444444444'), 1::bigint, 'Nearby compatible Dana is discoverable');
select is((select count(*) from public.get_discovery_batch(20) where target_user_id = '33333333-3333-4333-8333-333333333333'), 0::bigint, 'Out-of-range Charlie is excluded');
select ok(pg_temp.did_error($sql$insert into public.decisions (actor_id,target_id,decision) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','bind')$sql$), 'Client cannot directly insert decisions');
select ok(pg_temp.did_error($sql$insert into public.matches (user_low,user_high) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')$sql$), 'Client cannot directly insert matches');
select is((select matched from public.record_decision('22222222-2222-4222-8222-222222222222', 'pass')), false, 'Pass persists without a match');
reset role;
select is((select count(*) from public.decisions where actor_id = '11111111-1111-4111-8111-111111111111' and target_id = '22222222-2222-4222-8222-222222222222'), 1::bigint, 'Pass creates one decision row');
set local role authenticated;
select is((select match_created from public.record_decision('22222222-2222-4222-8222-222222222222', 'pass')), false, 'Retrying the same pass is idempotent');
select ok(pg_temp.did_error($sql$select * from public.record_decision('22222222-2222-4222-8222-222222222222', 'bind')$sql$), 'A recorded pass cannot be silently changed to bind');
select is((select matched from public.record_decision('44444444-4444-4444-8444-444444444444', 'bind')), false, 'First bind waits for reciprocal interest');
reset role;

select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select is((select matched from public.record_decision('11111111-1111-4111-8111-111111111111', 'bind')), true, 'Reciprocal bind returns matched=true');
select is((select match_created from public.record_decision('11111111-1111-4111-8111-111111111111', 'bind')), false, 'Immediate retry reports existing match rather than another creation');
reset role;
select is((select count(*) from public.matches where user_low = least('11111111-1111-4111-8111-111111111111'::uuid, '44444444-4444-4444-8444-444444444444'::uuid) and user_high = greatest('11111111-1111-4111-8111-111111111111'::uuid, '44444444-4444-4444-8444-444444444444'::uuid)), 1::bigint, 'Canonical pair has exactly one match row');
select is((select count(*) from private.match_events where event_type = 'created'), 1::bigint, 'Exactly one match-created outbox event exists');
select is((select count(*) from public.decisions where decision = 'bind'), 2::bigint, 'Both bind decisions are persisted exactly once');
select is((select count(*) from private.match_events where event_type = 'created'), 1::bigint, 'Idempotent retry did not duplicate the outbox event');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.matches), 1::bigint, 'Alice can read her active match');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.matches), 0::bigint, 'Non-member Bob cannot read Alice and Dana match');
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
insert into public.blocks (blocker_id, blocked_id) values ('11111111-1111-4111-8111-111111111111', '44444444-4444-4444-8444-444444444444');
reset role;
select is((select status from public.matches where user_low = least('11111111-1111-4111-8111-111111111111'::uuid, '44444444-4444-4444-8444-444444444444'::uuid) and user_high = greatest('11111111-1111-4111-8111-111111111111'::uuid, '44444444-4444-4444-8444-444444444444'::uuid)), 'blocked', 'Block deactivates an active match');
set local role authenticated;
select is((select count(*) from public.matches), 0::bigint, 'Blocked match disappears from member RLS view');
select is((select count(*) from public.get_discovery_batch(20)), 0::bigint, 'Decided and blocked profiles do not reappear in discovery');
select is((select matched from public.record_decision('44444444-4444-4444-8444-444444444444', 'bind')), false, 'Idempotent retry after block does not resurrect the match');
reset role;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.get_public_profile('11111111-1111-4111-8111-111111111111')), 0::bigint, 'Blocked user cannot see blocker public profile');
reset role;

select * from finish();
rollback;
