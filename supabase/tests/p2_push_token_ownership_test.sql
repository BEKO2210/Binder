-- "Anything that belongs to somebody else is deleted, never adopted" said the
-- comment, while the code deleted the foreign row and then inserted the same
-- token under the caller. This suite separates the two cases that look alike:
-- a phone that changed hands, and a caller holding a string that is not theirs.
begin;
create extension if not exists pgtap;

select plan(4);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@binder.test', '{}', '{}', now(), now()),
('e1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'nextperson@binder.test', '{}', '{}', now(), now()),
('e1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'stranger@binder.test', '{}', '{}', now(), now());

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into private.account_safety(user_id, status) values
('e1000000-0000-4000-8000-000000000001', 'active'),
('e1000000-0000-4000-8000-000000000002', 'active'),
('e1000000-0000-4000-8000-000000000003', 'active')
on conflict (user_id) do nothing;
insert into public.legal_acceptances(user_id, terms_version, privacy_version) values
('e1000000-0000-4000-8000-000000000001', '2026-08-15', '2026-08-15'),
('e1000000-0000-4000-8000-000000000002', '2026-08-15', '2026-08-15'),
('e1000000-0000-4000-8000-000000000003', '2026-08-15', '2026-08-15')
on conflict do nothing;

select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select isnt(
  public.register_push_token('ExponentPushToken[p2-owner-device-token]', 'android', 'e2000000-0000-4000-8000-000000000001'),
  null,
  'A phone registers for its signed-in account'
);
reset role;

-- The stranger knows the token but sits on another device.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.register_push_token('ExponentPushToken[p2-owner-device-token]', 'android', 'e2000000-0000-4000-8000-000000000009')$$,
  '42501',
  'This push token belongs to another device.',
  'A token presented from another device is refused'
);
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select user_id from public.device_tokens where token = 'ExponentPushToken[p2-owner-device-token]'),
  'e1000000-0000-4000-8000-000000000001'::uuid,
  'And the first account keeps its registration — taking it away is the same denial'
);

-- The same phone, the next person signing in.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[p2-owner-device-token]', 'android', 'e2000000-0000-4000-8000-000000000001');
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select user_id from public.device_tokens where token = 'ExponentPushToken[p2-owner-device-token]'),
  'e1000000-0000-4000-8000-000000000002'::uuid,
  'A phone that changes hands moves its registration with it'
);

select * from finish();
rollback;
