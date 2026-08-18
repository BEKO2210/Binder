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

select plan(18);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'alice@binder.test', '{}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'bob@binder.test', '{}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'charlie@binder.test', '{}', '{}', now(), now());

-- Minimal complete accounts, same path as the app.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Alice', '1992-04-12', 'woman', 'A', array['Coffee'], array['man'], 25::smallint, 45::smallint, 80::smallint);
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
select public.complete_my_onboarding('Bob', '1990-08-20', 'man', 'B', array['Hiking'], array['woman'], 24::smallint, 48::smallint, 100::smallint);
reset role;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select public.accept_legal_terms('2026-08-15','2026-08-15');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.matches (id, user_low, user_high)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

-- Alice's uploaded voice object (the storage API would create this row).
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('voice-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a',
        '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '{"mimetype":"audio/mp4","size":48000}'::jsonb);

-- One signature only.
select is((select count(*) from pg_proc where proname = 'send_message' and pronamespace = 'public'::regnamespace), 1::bigint, 'send_message has exactly one signature');

-- ── Alice sends. ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select body from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000001','  Hello Bob  ')), 'Hello Bob', 'A three-argument text call from the shipped build still works');

select is(
  (select (msg.kind, msg.body, msg.audio_duration_ms) from public.send_message(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000002',
     null, 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a', 12000) msg),
  row('voice'::text,''::text,12000::integer),
  'A voice message stores its kind, an empty body and the duration'
);

select is(
  (select msg.audio_path from public.send_message(
     'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000002',
     null, 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a', 12000) msg),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a',
  'Retrying the same client ID returns the original voice message'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000002', null, 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/other.m4a', 12000)$sql$),
  'The same client ID with a different audio path is refused'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000003', null, 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/missing.m4a', 12000)$sql$),
  'A voice message may not reference an object that does not exist'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000004', null, 'voice', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/11111111-1111-4111-8111-111111111111/v1.m4a', 12000)$sql$),
  'A voice path under another match is refused'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000005', null, 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a', 90000)$sql$),
  'A duration over sixty seconds is refused'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000006', 'sneaky text', 'voice', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/v1.m4a', 12000)$sql$),
  'A voice message with a text body is refused'
);

select ok(
  pg_temp.did_error($sql$select * from public.send_message('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','10000000-0000-4000-8000-000000000007', null, 'hologram', null, null)$sql$),
  'An unknown kind is refused'
);

-- Inside one transaction both rows share now(); nudge the voice row later so
-- "latest" is deterministic, as it is in real time.
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.messages set created_at = created_at + interval '1 second' where kind = 'voice';
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- The page carries the voice columns.
select is(
  (select (page.kind, page.audio_duration_ms) from public.get_match_messages_page('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1') page order by page.created_at desc limit 1),
  row('voice'::text,12000::integer),
  'The message page returns kind and duration'
);

-- ── Bob's side: preview, unread, storage read. ───────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select (m.last_message_kind, m.last_message_body) from public.get_my_matches() m where m.match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'),
  row('voice'::text,''::text),
  'The inbox preview says voice and carries no text to mistranslate'
);
select is((select m.unread_count from public.get_my_matches() m where m.match_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 2::bigint, 'Both messages count as unread for Bob');

select is(
  (select count(*) from storage.objects where bucket_id = 'voice-media' and name like 'aaaaaaaa%'),
  1::bigint,
  'The other match member may read the voice object'
);

-- Bob reports the voice message; the snapshot names the payload.
select public.report_user(
  '11111111-1111-4111-8111-111111111111', 'harassment', 'voice report',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  (select msg.id from public.messages msg where msg.kind = 'voice' limit 1),
  false
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select rc.message_body_snapshot like '[voice] aaaaaaaa%(12000 ms)' from private.report_context rc
   join public.reports r on r.id = rc.report_id
   where r.reporter_id = '22222222-2222-4222-8222-222222222222' limit 1),
  'A reported voice message leaves a named trace in the audit row'
);

-- ── Outsider: no read, no write. ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from storage.objects where bucket_id = 'voice-media' and name like 'aaaaaaaa%'),
  0::bigint,
  'An outsider cannot see the voice object'
);
select ok(
  pg_temp.did_error($sql$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('voice-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/33333333-3333-4333-8333-333333333333/x.m4a', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '{}'::jsonb)$sql$),
  'An outsider cannot upload into a match they are not part of'
);
select ok(
  pg_temp.did_error($sql$insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values ('voice-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/11111111-1111-4111-8111-111111111111/y.m4a', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '{}'::jsonb)$sql$),
  'Nobody can upload under somebody else''s folder'
);

select * from finish();
rollback;
