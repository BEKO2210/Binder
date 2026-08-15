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

select plan(35);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'alice3@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'bob3@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('77777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'charlie3@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('88888888-8888-4888-8888-888888888888', 'authenticated', 'authenticated', 'dana3@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, first_name, bio, gender, interests, onboarding_complete)
values
  ('55555555-5555-4555-8555-555555555555', 'Alice', 'Alpha', 'woman', array['Coffee'], false),
  ('66666666-6666-4666-8666-666666666666', 'Bob', 'Beta', 'man', array['Music'], false),
  ('77777777-7777-4777-8777-777777777777', 'Charlie', 'Gamma', 'man', array['Hiking'], false),
  ('88888888-8888-4888-8888-888888888888', 'Dana', 'Delta', 'woman', array['Cooking'], false);

insert into public.user_private (user_id, birth_date)
values
  ('55555555-5555-4555-8555-555555555555', '1992-01-01'),
  ('66666666-6666-4666-8666-666666666666', '1991-01-01'),
  ('77777777-7777-4777-8777-777777777777', '1990-01-01'),
  ('88888888-8888-4888-8888-888888888888', '1989-01-01');

insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
values
  ('55555555-5555-4555-8555-555555555555', array['man'], 18, 60, 100),
  ('66666666-6666-4666-8666-666666666666', array['woman'], 18, 60, 100),
  ('77777777-7777-4777-8777-777777777777', array['woman'], 18, 60, 100),
  ('88888888-8888-4888-8888-888888888888', array['man'], 18, 60, 100);

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values
  ('profile-media', '55555555-5555-4555-8555-555555555555/main.webp', '55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '66666666-6666-4666-8666-666666666666/main.webp', '66666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '77777777-7777-4777-8777-777777777777/main.webp', '77777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777', '{"mimetype":"image/webp","size":100}'::jsonb),
  ('profile-media', '88888888-8888-4888-8888-888888888888/main.webp', '88888888-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888888', '{"mimetype":"image/webp","size":100}'::jsonb);

insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
values
  ('55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('66666666-6666-4666-8666-666666666666', '66666666-6666-4666-8666-666666666666/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('77777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777777/main.webp', 0, 800, 1080, 100, 'image/webp'),
  ('88888888-8888-4888-8888-888888888888', '88888888-8888-4888-8888-888888888888/main.webp', 0, 800, 1080, 100, 'image/webp');

update public.profiles set onboarding_complete = true
where user_id in (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
);

insert into public.matches (id, user_low, user_high)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');

select is((select count(*) from private.push_outbox where kind = 'new_match' and match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 2::bigint, 'A new match queues one push for each member');

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$insert into public.messages (match_id,sender_id,client_message_id,body) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','55555555-5555-4555-8555-555555555555','10000000-0000-4000-8000-000000000000','bypass')$sql$), 'Client cannot directly insert a message');
select is((select body from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000001','  Hello Bob  ')), 'Hello Bob', 'Server trims and stores an authorized message');
reset role;
select is((select count(*) from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'Authorized send persists exactly one message');
select is((select count(*) from private.push_outbox where kind = 'new_message' and match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'New message queues one recipient push');
select is((select recipient_id from private.push_outbox where kind = 'new_message' and match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), '66666666-6666-4666-8666-666666666666'::uuid, 'Sender never receives their own message push');
set local role authenticated;
select is((select id from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000001','Hello Bob')), (select id from public.messages where client_message_id = '10000000-0000-4000-8000-000000000001'), 'Retry with same client ID returns original message');
select ok(pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000001','Different body')$sql$), 'Client message ID cannot be reused for another payload');
reset role;
select is((select count(*) from public.messages where client_message_id = '10000000-0000-4000-8000-000000000001'), 1::bigint, 'Idempotent retry creates no duplicate');

select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'Other member can read active conversation');
select is((select unread_count from public.get_my_matches() where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 1::bigint, 'Recipient sees one unread message');
select public.mark_match_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1');
select is((select unread_count from public.get_my_matches() where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 0::bigint, 'Mark-read clears unread count');
reset role;

select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 0::bigint, 'Outsider cannot read messages');
select ok(pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000002','intrude')$sql$), 'Outsider cannot send');
select ok(pg_temp.did_error($sql$select public.mark_match_read('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')$sql$), 'Outsider cannot alter read state');
reset role;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.get_my_matches()), 1::bigint, 'Inbox returns active conversation');
select is(public.unmatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), true, 'Member can unmatch');
select is(public.unmatch('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), false, 'Unmatch retry is idempotent');
select ok(pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000003','too late')$sql$), 'Cannot send after unmatch');
reset role;
select is((select status from public.matches where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 'unmatched', 'Unmatch persists terminal status');

select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 0::bigint, 'History disappears after unmatch');
select ok(pg_temp.did_error($sql$insert into public.reports (reporter_id,reported_id,reason,details) values ('66666666-6666-4666-8666-666666666666','55555555-5555-4555-8555-555555555555','other','bypass')$sql$), 'Client cannot direct-insert reports');
select ok(pg_temp.did_error($sql$insert into public.device_tokens (user_id,token,platform) values ('66666666-6666-4666-8666-666666666666','ExponentPushToken[direct-bypass-token]','android')$sql$), 'Client cannot direct-insert device tokens');
reset role;

insert into public.matches (id, user_low, user_high)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','55555555-5555-4555-8555-555555555555','88888888-8888-4888-8888-888888888888');
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
set local role authenticated;
select public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','20000000-0000-4000-8000-000000000001','Unsafe message');
reset role;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select isnt(public.report_user('88888888-8888-4888-8888-888888888888','harassment','Report with context','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',(select id from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'),true), null::uuid, 'Report RPC returns durable report ID');
reset role;
select is((select count(*) from public.reports where reporter_id = '55555555-5555-4555-8555-555555555555' and reported_id = '88888888-8888-4888-8888-888888888888'), 1::bigint, 'Report stored append-only');
select is((select message_body_snapshot from private.report_context limit 1), 'Unsafe message', 'Moderation context snapshots message');
select is((select count(*) from public.blocks where blocker_id = '55555555-5555-4555-8555-555555555555' and blocked_id = '88888888-8888-4888-8888-888888888888'), 1::bigint, 'Report-and-block creates block');
select is((select status from public.matches where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'), 'blocked', 'Report block deactivates match');
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
set local role authenticated;
select ok(pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','20000000-0000-4000-8000-000000000002','after block')$sql$), 'Blocked user cannot send');
reset role;

select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[shared-device-token-1234567890]', 'android');
select is((select count(*) from public.device_tokens where enabled), 1::bigint, 'User sees registered push token');
reset role;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
set local role authenticated;
select public.register_push_token('ExponentPushToken[shared-device-token-1234567890]', 'android');
reset role;
select is((select user_id from public.device_tokens where token = 'ExponentPushToken[shared-device-token-1234567890]'), '66666666-6666-4666-8666-666666666666'::uuid, 'Token transfers to newly authenticated account');
set local role authenticated;
select public.unregister_push_token('ExponentPushToken[shared-device-token-1234567890]');
reset role;
select is((select enabled from public.device_tokens where token = 'ExponentPushToken[shared-device-token-1234567890]'), false, 'Unregister disables token');

insert into public.matches (id, user_low, user_high)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888');
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
set local role authenticated;
do $$
declare i integer;
begin
  for i in 1..20 loop
    perform public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,'rate ' || i);
  end loop;
end;
$$;
select ok(pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','30000000-0000-4000-8000-000000000021','rate 21')$sql$), 'Twenty-first message in minute rejected');
reset role;
select is((select count(*) from public.messages where match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 20::bigint, 'Rate limiter leaves twenty messages');
select is((select count(*) from private.push_outbox where kind = 'new_message' and match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'), 20::bigint, 'Accepted messages create one push job each');
select ok((select c.relrowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'messages'), 'Messages table has RLS');
select is((select count(*) from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'), 1::bigint, 'Messages enabled for Realtime');

select * from finish();
rollback;
