-- The database took any string of the right length as a push token.
begin;
create extension if not exists pgtap;

select plan(3);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'token1@binder.test', '{}', '{}', now(), now());

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete)
values ('f1000000-0000-4000-8000-000000000001', 'Token', '', 'man', false);
insert into public.user_private(user_id, birth_date)
values ('f1000000-0000-4000-8000-000000000001', '1995-04-23'::date);
insert into public.legal_acceptances(user_id, terms_version, privacy_version, accepted_at)
values ('f1000000-0000-4000-8000-000000000001', private.current_terms_version(), private.current_privacy_version(), now());
insert into private.account_safety(user_id, status)
values ('f1000000-0000-4000-8000-000000000001', 'active')
on conflict (user_id) do update set status = 'active';

select set_config('request.jwt.claims', '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select isnt(
  public.register_push_token('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'android', 'f2000000-0000-4000-8000-000000000001'),
  null,
  'A token that looks like one Expo issued is registered'
);

select throws_ok(
  $$ select public.register_push_token('aaaaaaaaaaaaaaaaaaaaaaaa', 'android', 'f2000000-0000-4000-8000-000000000002') $$,
  '23514',
  null,
  'A string of the right length that is not a token is refused'
);

select throws_ok(
  $$ select public.register_push_token('ExponentPushToken[has a space]', 'android', 'f2000000-0000-4000-8000-000000000003') $$,
  '23514',
  null,
  'Nearly a token is not a token'
);

reset role;
select * from finish();
rollback;
