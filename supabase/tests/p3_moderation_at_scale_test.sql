-- Ten moderators on one queue, and a diagnostics list that has to stay readable
-- at ten thousand users. This suite is what happens when two people reach for
-- the same case, and what "acknowledged" does to a list.
begin;
create extension if not exists pgtap;

select plan(7);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('d5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'first@binder.test', now(), '{}', '{}', now(), now()),
('d5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'second@binder.test', now(), '{}', '{}', now(), now()),
('d5000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'subject@binder.test', now(), '{}', '{}', now(), now()),
('d5000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'reporter@binder.test', now(), '{}', '{}', now(), now());

insert into auth.sessions(id, user_id) values
('d6000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001'),
('d6000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000002');

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete) values
('d5000000-0000-4000-8000-000000000003', 'Subject', '', 'man', false);
insert into public.user_private(user_id, birth_date) values
('d5000000-0000-4000-8000-000000000003', date '1992-02-02') on conflict (user_id) do nothing;

delete from private.admin_members where role = 'owner';
insert into private.admin_members(email, user_id, role, status, can_review_media, can_review_reports, can_suspend_accounts, activated_at) values
('first@binder.test', 'd5000000-0000-4000-8000-000000000001', 'owner', 'active', true, true, true, now()),
('second@binder.test', 'd5000000-0000-4000-8000-000000000002', 'moderator', 'active', true, true, false, now());

insert into public.reports(id, reporter_id, reported_id, reason, details) values
('d7000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000004', 'd5000000-0000-4000-8000-000000000003', 'spam', 'Werbung');
insert into private.report_context(report_id, reported_profile_snapshot) values
('d7000000-0000-4000-8000-000000000001', '{"first_name":"Subject"}'::jsonb);

-- The first moderator takes the case.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d6000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select ok((select can_review_reports from public.claim_admin_session()), 'The first moderator may review reports');
select ok(
  (select was_free from public.admin_claim_case((select case_id from public.admin_list_report_queue() limit 1))),
  'An untouched case is free to take'
);
reset role;

-- The second one sees that it is taken, and by whom.
select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"d6000000-0000-4000-8000-000000000002"}', true);
set local role authenticated;
select ok((select can_review_reports from public.claim_admin_session()), 'The second moderator may review reports too');
select is(
  (select was_free from public.admin_claim_case((select case_id from public.admin_list_report_queue() limit 1))),
  false,
  'A case somebody is holding is not handed over'
);
select throws_ok(
  format($$select public.admin_review_report(%s, 'dismiss', 'zweite Meinung')$$,
         (select case_id from public.admin_list_report_queue() limit 1)),
  '55006',
  null,
  'And a decision on it is refused, so one report cannot be actioned twice'
);
reset role;

-- Diagnostics: acknowledging takes an error out of the working list without
-- deleting anything.
insert into private.beta_client_events(id, user_id, session_id, event_name, surface, outcome, platform, app_version, duration_ms)
values ('d8000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000003',
        'd8000000-0000-4000-8000-000000000009', 'profile_load', 'profile', 'error', 'android', '1.0.8', 900);

select set_config('request.jwt.claims', '{"sub":"d5000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"d6000000-0000-4000-8000-000000000001"}', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.admin_diagnostics_client_errors(50, false)),
  1,
  'An unacknowledged error is in the working list'
);
select public.admin_acknowledge_diagnostic('d8000000-0000-4000-8000-000000000001', 'bekannt, kommt mit 1.0.9');
select is(
  (select count(*)::integer from public.admin_diagnostics_client_errors(50, false)),
  0,
  'Acknowledging takes it out of the list — and asking for everything still finds it'
);
reset role;

select * from finish();
rollback;
