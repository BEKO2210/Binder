-- The fastest way to make a moderation case disappear used to be to be its
-- subject: reports hung on the user row with `on delete cascade`. This suite is
-- the rule that replaced it — evidence survives the person, and it still ends.
begin;
create extension if not exists pgtap;

select plan(9);

insert into auth.users (
  id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'victim@binder.test', now(), '{}', '{}', now(), now()),
('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'offender@binder.test', now(), '{}', '{}', now(), now());

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete) values
('a1000000-0000-4000-8000-000000000001', 'Victim', '', 'woman', false),
('a1000000-0000-4000-8000-000000000002', 'Offender', '', 'man', false);

insert into public.reports(id, reporter_id, reported_id, reason, details) values
('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'harassment', 'Kept messaging after being asked to stop');
insert into private.report_context(report_id, reported_profile_snapshot) values
('a2000000-0000-4000-8000-000000000001', '{"first_name":"Offender","age":31}'::jsonb);

select is(
  (select reported_pseudonym from public.reports where id = 'a2000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000002',
  'A report records who it is about, in a field that no deletion can clear'
);
select is(
  (select count(*)::integer from private.moderation_cases where report_id = 'a2000000-0000-4000-8000-000000000001' and status = 'open'),
  1,
  'The report opened a moderation case'
);

-- The reported account deletes itself, which is its right.
delete from auth.users where id = 'a1000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::integer from public.reports where id = 'a2000000-0000-4000-8000-000000000001'),
  1,
  'The report survives the deletion of the account it is about'
);
select ok(
  (select reported_id is null from public.reports where id = 'a2000000-0000-4000-8000-000000000001'),
  'The pointer to the person is gone'
);
select is(
  (select reported_pseudonym from public.reports where id = 'a2000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000002',
  'The pseudonym remains, so two reports about the same account still group'
);
select is(
  (select count(*)::integer from private.moderation_cases where report_id = 'a2000000-0000-4000-8000-000000000001'),
  1,
  'The open case survives too'
);
select is(
  (select reported_profile_snapshot->>'first_name' from private.report_context where report_id = 'a2000000-0000-4000-8000-000000000001'),
  'Offender',
  'The evidence snapshot is still readable for the moderator'
);

-- Evidence has an end, but only after the case is decided.
select is(
  private.prune_report_evidence(interval '0 days'),
  0,
  'An open case is never pruned, however old it is'
);

update private.moderation_cases
set status = 'actioned', updated_at = now() - interval '200 days'
where report_id = 'a2000000-0000-4000-8000-000000000001';

select is(
  private.prune_report_evidence(interval '180 days'),
  1,
  'A case decided longer ago than the retention window is removed with its evidence'
);

select * from finish();
rollback;
