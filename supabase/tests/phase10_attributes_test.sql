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

select plan(23);

-- ── The zodiac is arithmetic, so its edges are testable without a profile. ───
select is(private.zodiac_sign('2000-03-21'), 'aries', 'Aries starts on 21 March');
select is(private.zodiac_sign('2000-03-20'), 'pisces', 'The day before is still Pisces');
select is(private.zodiac_sign('2000-12-22'), 'capricorn', 'Capricorn starts on 22 December');
select is(private.zodiac_sign('2000-01-19'), 'capricorn', 'Capricorn spans the year boundary');
select is(private.zodiac_sign('2000-01-20'), 'aquarius', 'Aquarius starts on 20 January');

-- ── One signature per RPC — PostgREST cannot choose between overloads. ───────
select ok(
  not exists (select 1 from pg_proc where proname = 'update_my_profile'
    and pronamespace = 'public'::regnamespace
    and pg_get_function_identity_arguments(oid) = 'p_first_name text, p_gender text, p_bio text, p_interests text[], p_interested_in text[], p_min_age smallint, p_max_age smallint, p_max_distance_km smallint'),
  'The old update_my_profile signature is gone'
);
select ok(
  not exists (select 1 from pg_proc where proname = 'complete_my_onboarding'
    and pronamespace = 'public'::regnamespace
    and pg_get_function_identity_arguments(oid) = 'p_first_name text, p_birth_date date, p_gender text, p_bio text, p_interests text[], p_interested_in text[], p_min_age smallint, p_max_age smallint, p_max_distance_km smallint'),
  'The old complete_my_onboarding signature is gone'
);
select is((select count(*) from pg_proc where proname = 'update_my_profile' and pronamespace = 'public'::regnamespace), 1::bigint, 'update_my_profile has exactly one signature');
select is((select count(*) from pg_proc where proname = 'complete_my_onboarding' and pronamespace = 'public'::regnamespace), 1::bigint, 'complete_my_onboarding has exactly one signature');

-- ── Alice onboards through the same authenticated path as the app. ───────────
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@binder.test', '{}', '{}', now(), now());

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('profile-media', '11111111-1111-4111-8111-111111111111/test.webp', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":100}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Alice', '1992-04-12', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint,
  '{"height_cm": 178, "smoking": "never"}'::jsonb);
select is((select height_cm from public.profiles where user_id = auth.uid()), 178::smallint, 'Onboarding stores an attribute sent with it');
select is((select smoking from public.profiles where user_id = auth.uid()), 'never', 'Onboarding stores a vocabulary attribute');

insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/test.webp', 0, 900, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();

-- ── The jsonb semantics: absent = untouched, null = cleared, value = set. ────
-- An old client calls with nine arguments and must not wipe anything.
select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint);
select is((select height_cm from public.profiles where user_id = auth.uid()), 178::smallint, 'A nine-argument call from the shipped build leaves attributes untouched');

select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, null::jsonb);
select is((select smoking from public.profiles where user_id = auth.uid()), 'never', 'An explicit null attribute object changes nothing');

select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '{"drinking": "sometimes"}'::jsonb);
select is((select height_cm from public.profiles where user_id = auth.uid()), 178::smallint, 'A key that is absent leaves its column alone');
select is((select drinking from public.profiles where user_id = auth.uid()), 'sometimes', 'A key with a value sets its column');

select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '{"smoking": null}'::jsonb);
select is((select smoking from public.profiles where user_id = auth.uid()), null, 'A key set to null clears its column');

-- ── Whatever arrives outside the vocabulary is refused, not stored. ──────────
select ok(
  pg_temp.did_error($sql$select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '{"smoking": "daily"}'::jsonb)$sql$),
  'A value outside the vocabulary is rejected'
);
select ok(
  pg_temp.did_error($sql$select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '{"height_cm": 250}'::jsonb)$sql$),
  'A height outside 120-230 is rejected'
);
select ok(
  pg_temp.did_error($sql$select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '{"favourite_colour": "red"}'::jsonb)$sql$),
  'An unknown attribute key is rejected'
);
select ok(
  pg_temp.did_error($sql$select public.update_my_profile('Alice', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint, '[1,2]'::jsonb)$sql$),
  'A non-object attribute payload is rejected'
);
select ok(
  pg_temp.did_error($sql$update public.profiles set diet = 'air' where user_id = auth.uid()$sql$),
  'The CHECK constraint refuses invalid values even on a direct table write'
);

-- ── The public projection carries the attributes and the computed zodiac. ────
select is((select zodiac from public.get_public_profile(auth.uid())), 'aries', 'The zodiac is computed from the birth date, never stored');
select is((select height_cm from public.get_public_profile(auth.uid())), 178::smallint, 'The public projection carries the new attributes');

select * from finish();
rollback;
