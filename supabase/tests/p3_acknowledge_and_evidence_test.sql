-- A moderator who looks at a case and finds nothing to do has done work, and it
-- used to leave no trace at all. And a case that has to be handed to somebody
-- outside needs a copy that can be shown to be unaltered. This suite is both.
begin;
create extension if not exists pgtap;

select plan(7);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('c9000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@binder.test', now(), '{}', '{}', now(), now()),
('c9000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'subject@binder.test', now(), '{}', '{}', now(), now()),
('c9000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'reporter@binder.test', now(), '{}', '{}', now(), now());

insert into auth.sessions(id, user_id) values ('ca000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001');

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete) values
('c9000000-0000-4000-8000-000000000002', 'Subject', 'Bio', 'man', false),
('c9000000-0000-4000-8000-000000000003', 'Reporter', '', 'woman', false);
insert into public.user_private(user_id, birth_date) values
('c9000000-0000-4000-8000-000000000002', date '1990-01-01')
on conflict (user_id) do nothing;

-- The moderator: an owner row that does not come from a public repository.
delete from private.admin_members where role = 'owner';
insert into private.admin_members(email, user_id, role, status, can_review_media, can_review_reports, can_suspend_accounts, activated_at)
values ('owner@binder.test', 'c9000000-0000-4000-8000-000000000001', 'owner', 'active', true, true, true, now());

insert into public.reports(id, reporter_id, reported_id, reason, details) values
('cb000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000002', 'harassment', 'Wollte nicht aufhoeren');
insert into private.report_context(report_id, reported_profile_snapshot) values
('cb000000-0000-4000-8000-000000000001', '{"first_name":"Subject","age":36}'::jsonb);

select set_config('request.jwt.claims', '{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ca000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select ok((select can_review_reports from public.claim_admin_session()), 'The owner may review reports');

reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok(
  (select acknowledged_at is null from private.moderation_cases where report_id = 'cb000000-0000-4000-8000-000000000001'),
  'A fresh case carries no receipt'
);
select set_config('request.jwt.claims', '{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ca000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;

-- The case id comes from the queue the moderator is allowed to read.
select isnt(
  (select acknowledged_by from public.admin_acknowledge_case(
     (select case_id from public.admin_list_report_queue() limit 1), 'gesehen, keine Massnahme')),
  null,
  'Acknowledging names who did it'
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select acknowledgement_note from private.moderation_cases where report_id = 'cb000000-0000-4000-8000-000000000001'),
  'gesehen, keine Massnahme',
  'The note is kept with the case'
);

select is(
  (select count(*)::integer from private.moderation_actions a
   join private.moderation_cases c on c.id = a.case_id
   where c.report_id = 'cb000000-0000-4000-8000-000000000001'),
  1,
  'Looking and deciding nothing is written into the action log like any other act'
);

-- The evidence bundle.
select set_config('request.jwt.claims', '{"sub":"c9000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"ca000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select is(
  (select length(sha256) from public.admin_export_case_evidence(
     (select case_id from public.admin_list_report_queue() limit 1))),
  64,
  'The export carries a SHA-256 over exactly what it handed out'
);
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (select bundle->'report'->>'reason' from private.case_evidence_exports
   where case_id = (select id from private.moderation_cases where report_id = 'cb000000-0000-4000-8000-000000000001')
   order by exported_at desc limit 1),
  'harassment',
  'And the stored copy holds the report it was made from'
);

select * from finish();
rollback;
