-- Set a point, read the distance, set another point, read again: three answers
-- cross to a small area. The raw coordinate never left the server and the
-- person could be found anyway. This suite is what stops the instrument.
begin;
create extension if not exists pgtap;

select plan(6);

-- Twenty allowed updates, then the twenty-first: the loop is the instrument
-- this rule exists to stop, so the test builds it on purpose.
create or replace function pg_temp.exhausts_updates()
returns boolean
language plpgsql
as $$
declare
  step integer;
begin
  for step in 1..25 loop
    begin
      perform public.set_my_location(52.52 + (step * 0.001), 13.40);
    exception when others then
      return true;
    end;
  end loop;
  return false;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('c1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'seeker@binder.test', '{}', '{}', now(), now()),
('c1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'target@binder.test', '{}', '{}', now(), now());

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Seeker', '1993-05-05', 'woman', 'Bio', array['Coffee'], array['man'], 24::smallint, 44::smallint, 150::smallint);
select public.set_my_location(52.5200, 13.4050);
insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('profile-media', 'c1000000-0000-4000-8000-000000000001/one.webp', 'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', '{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001/one.webp', 0, 1080, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
reset role;

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Target', '1990-02-02', 'man', 'Bio', array['Coffee'], array['woman'], 24::smallint, 44::smallint, 150::smallint);
select public.set_my_location(52.5300, 13.4200);
insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('profile-media', 'c1000000-0000-4000-8000-000000000002/one.webp', 'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002', '{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000002/one.webp', 0, 1080, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status = 'approved';

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Roughly 1.5 km apart: the honest answer is "close", not a measurement.
select is(
  public.distance_to_user('c1000000-0000-4000-8000-000000000002'),
  5,
  'Anything closer than five kilometres reads as five'
);

-- Moving a normal distance is allowed, and the answer moves in steps.
select public.set_my_location(52.7000, 13.4050);
select is(
  public.distance_to_user('c1000000-0000-4000-8000-000000000002') % 5,
  0,
  'Every answer lands on a five-kilometre step'
);
select ok(
  public.distance_to_user('c1000000-0000-4000-8000-000000000002') >= 5,
  'And never below the floor'
);

-- The instrument needs many points in a short time. It does not get them.
select ok(
  pg_temp.exhausts_updates(),
  'A run of location updates hits the hourly limit and is refused'
);

reset role;

-- The ledger is owner-side; only the server may count it.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*)::integer from private.location_updates where user_id = 'c1000000-0000-4000-8000-000000000001'),
  20,
  'The ledger recorded exactly the updates that were allowed through'
);

select set_config('request.jwt.claims', '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.set_my_location(-33.8688, 151.2093)$$,
  '22023',
  'Location moved implausibly fast.',
  'Berlin to Sydney in a moment is an instrument, not a journey'
);
reset role;

select * from finish();
rollback;
