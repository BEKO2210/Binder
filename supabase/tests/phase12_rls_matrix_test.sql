-- The security matrix, stated as questions instead of assumptions.
--
-- Every row here is "identity X asks for Y" with the answer the product
-- promises. They are written as negatives on purpose: a policy that grants too
-- much passes every test that only checks what should work.
--
-- Identities: A and B are an active match. C blocked A. D was matched with A
-- and unmatched. anon is nobody.
begin;
create extension if not exists pgtap;
create or replace function pg_temp.did_error(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end $$;

select plan(26);

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('aa111111-1111-4111-8111-111111111111','authenticated','authenticated','matrix-a@binder.test','{}','{}',now(),now()),
('bb222222-2222-4222-8222-222222222222','authenticated','authenticated','matrix-b@binder.test','{}','{}',now(),now()),
('cc333333-3333-4333-8333-333333333333','authenticated','authenticated','matrix-c@binder.test','{}','{}',now(),now()),
('dd444444-4444-4444-8444-444444444444','authenticated','authenticated','matrix-d@binder.test','{}','{}',now(),now());

-- Four complete profiles.
create or replace function pg_temp.onboard(uid uuid, name text, born date, gender text, wants text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.accept_legal_terms('2026-08-15','2026-08-15');
  perform public.complete_my_onboarding(name, born, gender, name || ' bio', array['Coffee'], array[wants], 18::smallint, 60::smallint, 100::smallint);
  insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
  values ('profile-media', uid::text || '/m.webp', uid, uid::text, '{"mimetype":"image/webp","size":100}'::jsonb);
  insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type)
  values (uid, uid::text || '/m.webp', 0, 900, 1080, 100, 'image/webp');
  perform public.finalize_my_onboarding();
  perform public.set_my_location(48.90, 9.19);
  execute 'reset role';
  perform set_config('request.jwt.claims','{"role":"service_role"}', true);
  update public.profile_media set moderation_status='approved', moderated_at=clock_timestamp() where user_id = uid;
end $$;

select pg_temp.onboard('aa111111-1111-4111-8111-111111111111','Ava', date '1992-01-01','woman','man');
select pg_temp.onboard('bb222222-2222-4222-8222-222222222222','Ben', date '1990-01-01','man','woman');
select pg_temp.onboard('cc333333-3333-4333-8333-333333333333','Cleo', date '1991-01-01','woman','man');
select pg_temp.onboard('dd444444-4444-4444-8444-444444444444','Dee', date '1989-01-01','man','woman');

-- A and B match; D matched A and then unmatched; C blocks A.
select set_config('request.jwt.claims','{"sub":"aa111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.record_decision('bb222222-2222-4222-8222-222222222222','bind');
select public.record_decision('dd444444-4444-4444-8444-444444444444','bind');
reset role;
select set_config('request.jwt.claims','{"sub":"bb222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select public.record_decision('aa111111-1111-4111-8111-111111111111','bind');
reset role;
select set_config('request.jwt.claims','{"sub":"dd444444-4444-4444-8444-444444444444","role":"authenticated"}',true); set local role authenticated;
select public.record_decision('aa111111-1111-4111-8111-111111111111','bind');
reset role;

-- One message in each conversation, so there is something to protect.
select set_config('request.jwt.claims','{"sub":"aa111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select public.send_message((select id from public.matches where status='active' and 'bb222222-2222-4222-8222-222222222222' in (user_low,user_high) limit 1), gen_random_uuid(), 'to ben');
select public.send_message((select id from public.matches where status='active' and 'dd444444-4444-4444-8444-444444444444' in (user_low,user_high) limit 1), gen_random_uuid(), 'to dee');
reset role;

-- D unmatches A; C blocks A.
select set_config('request.jwt.claims','{"sub":"dd444444-4444-4444-8444-444444444444","role":"authenticated"}',true); set local role authenticated;
select public.unmatch((select id from public.matches where 'aa111111-1111-4111-8111-111111111111' in (user_low,user_high) and 'dd444444-4444-4444-8444-444444444444' in (user_low,user_high) limit 1));
reset role;
select set_config('request.jwt.claims','{"sub":"cc333333-3333-4333-8333-333333333333","role":"authenticated"}',true); set local role authenticated;
insert into public.blocks(blocker_id, blocked_id) values (auth.uid(), 'aa111111-1111-4111-8111-111111111111');
reset role;

-- ── anon asks ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{}',true); set local role anon;
-- Not "returns nothing" but "is not allowed to ask": the grant itself is
-- absent, which is a stronger answer than an empty result.
select ok(pg_temp.did_error($sql$select count(*) from public.profiles$sql$), 'anon may not even ask for profiles');
select ok(pg_temp.did_error($sql$select count(*) from public.user_private$sql$), 'anon may not ask for birth dates or locations');
select ok(pg_temp.did_error($sql$select count(*) from public.messages$sql$), 'anon may not ask for messages');
select ok(pg_temp.did_error($sql$select count(*) from public.matches$sql$), 'anon may not ask for matches');
select ok(pg_temp.did_error($sql$select count(*) from public.device_tokens$sql$), 'anon may not ask for push tokens');
select ok(pg_temp.did_error($sql$select public.get_discovery_batch(5)$sql$), 'anon gets no deck');
reset role;

-- ── B, an active match of A ──────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"bb222222-2222-4222-8222-222222222222","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.user_private where user_id <> auth.uid())::integer, 0, 'a match still cannot read the other birth date or location');
select is((select count(*) from public.messages where match_id in (select id from public.matches where status='active'))::integer, 1, 'a match reads the conversation it belongs to');
select isnt((select age from public.get_public_profile('aa111111-1111-4111-8111-111111111111')), null, 'a match sees the profile');
select is((select count(*) from public.user_preferences where user_id <> auth.uid())::integer, 0, 'nobody reads what somebody else is looking for');
reset role;

-- ── D, who unmatched A ───────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"dd444444-4444-4444-8444-444444444444","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.messages)::integer, 0, 'an ended conversation stops answering');
select is((select count(*) from public.matches where status = 'active')::integer, 0, 'an unmatched pair has no active match');
select ok(pg_temp.did_error($sql$select public.send_message((select id from public.matches limit 1), gen_random_uuid(), 'still here?')$sql$), 'an unmatched person cannot send into it');
reset role;

-- ── C, who blocked A ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"cc333333-3333-4333-8333-333333333333","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20) where target_user_id='aa111111-1111-4111-8111-111111111111')::integer, 0, 'a blocked person never appears in the deck');
select is((select age from public.get_public_profile('aa111111-1111-4111-8111-111111111111')), null, 'a block closes the profile in both directions');
reset role;

-- and the person who was blocked sees the same wall from the other side
select set_config('request.jwt.claims','{"sub":"aa111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
select is((select count(*) from public.get_discovery_batch(20) where target_user_id='cc333333-3333-4333-8333-333333333333')::integer, 0, 'the blocker never appears either');
select is((select age from public.get_public_profile('cc333333-3333-4333-8333-333333333333')), null, 'and their profile stays closed');

-- ── A asks for things that are nobody else's business ────────────────────────
-- An UPDATE that policy filters away affects zero rows and raises nothing, so
-- the honest assertion is about the row afterwards, not about an exception.
update public.profiles set first_name='Hijacked' where user_id='bb222222-2222-4222-8222-222222222222';
reset role;
select is((select first_name from public.profiles where user_id='bb222222-2222-4222-8222-222222222222'), 'Ben', 'nobody edits another profile');
select set_config('request.jwt.claims','{"sub":"aa111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;

select ok(pg_temp.did_error($sql$insert into public.device_tokens(user_id,token,platform,installation_id) values ('bb222222-2222-4222-8222-222222222222','stolen-token-value-0123456789','android',gen_random_uuid())$sql$), 'nobody registers a push token for somebody else');

-- A second photo of A's own, freshly uploaded and therefore pending: the
-- interesting question is whether the person can wave it through themselves.
insert into storage.objects(bucket_id,name,owner,owner_id,metadata)
values ('profile-media','aa111111-1111-4111-8111-111111111111/second.webp','aa111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":100}'::jsonb);
insert into public.profile_media(user_id,storage_path,position,width,height,byte_size,mime_type)
values ('aa111111-1111-4111-8111-111111111111','aa111111-1111-4111-8111-111111111111/second.webp',1,900,1080,100,'image/webp');
-- Here the database does raise: a trigger says moderation is server-controlled.
select ok(pg_temp.did_error($sql$update public.profile_media set moderation_status='approved' where storage_path like '%second.webp'$sql$), 'nobody approves their own photo');
select is((select moderation_status from public.profile_media where storage_path like '%second.webp'), 'pending', 'and the photo is still waiting');

select ok(pg_temp.did_error($sql$select count(*) from public.reports$sql$), 'reports are not readable by the people they are about');
select is((select count(*) from public.blocks where blocker_id <> auth.uid())::integer, 0, 'nobody reads who blocked them');
reset role;

-- ── the private helpers are not an oracle over strangers ─────────────────────
select set_config('request.jwt.claims','{"sub":"aa111111-1111-4111-8111-111111111111","role":"authenticated"}',true); set local role authenticated;
-- `authenticated` does hold USAGE on the private schema — policies are
-- evaluated as the calling role and call helpers there, and taking that away
-- broke every photo upload once already. What must not be reachable is the
-- data: no table in that schema answers a logged-in caller.
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relkind in ('r','v','m')
      and has_table_privilege('authenticated', c.oid, 'select'))::integer,
  0,
  'no private table or view answers a logged-in caller'
);
-- distance is only answered for a profile the caller may actually see
select is((select public.distance_to_user('cc333333-3333-4333-8333-333333333333')), null, 'no distance to somebody who blocked you');
select isnt((select public.distance_to_user('bb222222-2222-4222-8222-222222222222')), null, 'distance to a visible profile still works');
reset role;

select * from finish();
rollback;
