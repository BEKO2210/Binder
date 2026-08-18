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

-- The number under the filter sheet and the deck the person then swipes both
-- have to come from the same rules. This file sets up three real accounts and
-- asserts, for every filter branch, that count_discovery_candidates and
-- get_discovery_batch answer identically — the three-way sync as a test.

select plan(21);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@binder.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob@binder.test', '{}', '{}', now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'dave@binder.test', '{}', '{}', now(), now());

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('profile-media', '11111111-1111-4111-8111-111111111111/test.webp', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '22222222-2222-4222-8222-222222222222/test.webp', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '44444444-4444-4444-8444-444444444444/test.webp', '44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', '{"mimetype":"image/webp","size":100}'::jsonb);

-- Alice: smokes regularly (matters for the mutual test at the end).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Alice', '1992-04-12', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint,
  '{"smoking": "regularly"}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111/test.webp', 0, 900, 1080, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.897, 9.191);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id='11111111-1111-4111-8111-111111111111';

-- Bob: 178 cm, never smokes, eats everything. Born 1990-08-20 → Leo.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Bob', '1990-08-20', 'man', 'B', array['Hiking'], array['woman'], 24::smallint, 48::smallint, 100::smallint,
  '{"height_cm": 178, "smoking": "never", "diet": "omnivore"}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222/test.webp', 0, 1080, 900, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.775, 9.182);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id='22222222-2222-4222-8222-222222222222';

-- Dave: 190 cm, smokes regularly, diet unanswered. Born 1992-04-12 → Aries.
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Dave', '1992-04-12', 'man', 'D', array['Gaming'], array['woman'], 24::smallint, 48::smallint, 100::smallint,
  '{"height_cm": 190, "smoking": "regularly"}'::jsonb);
insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values ('44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444/test.webp', 0, 1080, 900, 100, 'image/webp');
select public.finalize_my_onboarding();
select public.set_my_location(48.780, 9.180);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id='44444444-4444-4444-8444-444444444444';

-- One signature only, old one gone.
select is((select count(*) from pg_proc where proname = 'count_discovery_candidates' and pronamespace = 'public'::regnamespace), 1::bigint, 'count_discovery_candidates has exactly one signature');

-- ── Alice looks at her deck under each filter branch. ────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- Branch 0: no filters at all.
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 2, 'no filters: both men are counted');
select is((select count(*) from public.get_discovery_batch(50))::integer, 2, 'no filters: the deck agrees with the count');

-- Branch 1: height at least 185 — only Dave.
select public.set_my_attribute_filters('{"height_min_cm": 185}'::jsonb);
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 1, 'height filter: one man is counted');
select is((select count(*) from public.get_discovery_batch(50))::integer, 1, 'height filter: the deck agrees');
select is((select first_name from public.get_discovery_batch(50) limit 1), 'Dave', 'height filter: and it is the tall one');

-- Branch 2: replace-everything semantics — the new call carries no height key,
-- so the height filter is gone and only the smoking filter remains.
select public.set_my_attribute_filters('{"smoking": ["never"]}'::jsonb);
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 1, 'smoking filter: one man is counted');
select is((select first_name from public.get_discovery_batch(50) limit 1), 'Bob', 'smoking filter: the non-smoker');

-- Branch 3: an unanswered attribute passes every filter. Dave never answered
-- the diet question; Bob answered "omnivore". Filtering for vegans must keep
-- the silent one and drop only the explicit non-match.
select public.set_my_attribute_filters('{"diet": ["vegan"]}'::jsonb);
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 1, 'diet filter: silence passes, an explicit other answer does not');
select is((select first_name from public.get_discovery_batch(50) limit 1), 'Dave', 'diet filter: the silent one stays');

-- Branch 4: the zodiac filter runs against the computed sign.
select public.set_my_attribute_filters('{"zodiac": ["leo"]}'::jsonb);
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 1, 'zodiac filter: one Leo');
select is((select first_name from public.get_discovery_batch(50) limit 1), 'Bob', 'zodiac filter: the August one');

-- Branch 5: a proposed filter object overrides the saved one for the count.
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint, '{}'::jsonb), 2, 'proposed {} previews with no attribute filters');
-- And a null proposal falls back to the saved filters — the shipped client.
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint, null::jsonb), 1, 'a nine-argument client is answered with the saved filters');

-- Clear Alice's filters again.
select public.set_my_attribute_filters('{}'::jsonb);

-- Refusals: garbage never reaches the column.
select ok(pg_temp.did_error($sql$select public.set_my_attribute_filters('{"smoking": []}'::jsonb)$sql$), 'an empty vocabulary array is refused');
select ok(pg_temp.did_error($sql$select public.set_my_attribute_filters('{"smoking": ["daily"]}'::jsonb)$sql$), 'an unknown code is refused');
select ok(pg_temp.did_error($sql$select public.set_my_attribute_filters('{"favourite_colour": ["red"]}'::jsonb)$sql$), 'an unknown filter key is refused');
select ok(pg_temp.did_error($sql$select public.set_my_attribute_filters('{"height_min_cm": 190, "height_max_cm": 150}'::jsonb)$sql$), 'an inverted height range is refused');
select ok(pg_temp.did_error($sql$select public.set_my_attribute_filters('[1]'::jsonb)$sql$), 'a non-object payload is refused');

-- ── The filter cuts both ways. ───────────────────────────────────────────────
-- Bob rules out smokers. Alice smokes regularly, so Bob leaves her deck even
-- though Alice herself filters nothing — her like could only land in nothing.
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.set_my_attribute_filters('{"smoking": ["never"]}'::jsonb);
reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(public.count_discovery_candidates(array['man'], 25::smallint, 45::smallint, 80::smallint), 1, 'mutual: whoever filtered me out is not in my count');
select is((select first_name from public.get_discovery_batch(50) limit 1), 'Dave', 'mutual: and not in my deck');

select * from finish();
rollback;
