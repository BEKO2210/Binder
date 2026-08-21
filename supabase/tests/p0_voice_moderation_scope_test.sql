-- The privacy policy promises that a moderator hears a voice message only when
-- it has been reported or belongs to a conversation under review. This suite is
-- that sentence, in both directions: what must be refused, and what must still
-- work once a report exists.
begin;
create extension if not exists pgtap;

select plan(7);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'belkis.aslani@gmail.com', now(), '{}', '{}', now(), now()),
('91000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'speaker@binder.test', now(), '{}', '{}', now(), now()),
('91000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'listener@binder.test', now(), '{}', '{}', now(), now());

insert into auth.sessions(id, user_id) values
('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001');

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete) values
-- Onboarding state is irrelevant here and its guard wants a birth date, so the
-- profiles stay minimal: this suite is about who may hear a recording.
('91000000-0000-4000-8000-000000000002', 'Speaker', '', 'woman', false),
('91000000-0000-4000-8000-000000000003', 'Listener', '', 'man', false);

-- Two conversations: one that nobody reported, one that gets reported later.
insert into public.matches(id, user_low, user_high) values
('93000000-0000-4000-8000-000000000001',
  least('91000000-0000-4000-8000-000000000002'::uuid, '91000000-0000-4000-8000-000000000003'::uuid),
  greatest('91000000-0000-4000-8000-000000000002'::uuid, '91000000-0000-4000-8000-000000000003'::uuid));

-- The reference guard wants the object first, under match/sender, in its bucket.
insert into storage.objects(bucket_id, name, owner, owner_id, metadata) values
('voice-media', '93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/quiet.m4a',
 '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '{"mimetype":"audio/mp4","size":100}'::jsonb),
('voice-media', '93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/reported.m4a',
 '91000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000002', '{"mimetype":"audio/mp4","size":100}'::jsonb);

-- A voice message carries no body: that coupling is its own constraint.
insert into public.messages(id, match_id, sender_id, client_message_id, kind, body, audio_path, audio_duration_ms) values
('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000001',
 'voice', '', '93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/quiet.m4a', 4000),
('94000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002',
 'voice', '', '93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/reported.m4a', 4000);

select set_config('request.jwt.claims', '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"92000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select ok((select can_review_media from public.claim_admin_session()), 'The owner holds the media review permission');
reset role;

set local role authenticated;
select ok(
  not private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/quiet.m4a'),
  'A recording nobody reported stays closed to a moderator'
);
select ok(
  not private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/reported.m4a'),
  'The second recording is closed too, while no report exists'
);
reset role;

-- Somebody reports that one message. The context points at the message itself.
insert into public.reports(id, reporter_id, reported_id, reason, details) values
('96000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000002', 'harassment', 'Unwanted recording');
insert into private.report_context(report_id, match_id, message_id, reported_profile_snapshot) values
('96000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', '{"first_name":"Speaker"}'::jsonb);

set local role authenticated;
select ok(
  private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/reported.m4a'),
  'The reported recording opens for a moderator'
);
select ok(
  private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/quiet.m4a'),
  'The other recording in that conversation opens while the case is open'
);
reset role;

-- The case is finished. A closed review is not a review.
update private.moderation_cases
set status = 'actioned'
where report_id = '96000000-0000-4000-8000-000000000001';

set local role authenticated;
select ok(
  private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/reported.m4a'),
  'The reported recording itself stays readable after the case closes'
);
select ok(
  not private.admin_can_read_voice_object('93000000-0000-4000-8000-000000000001/91000000-0000-4000-8000-000000000002/quiet.m4a'),
  'The rest of the conversation closes again once the case is decided'
);
reset role;

select * from finish();
rollback;
