-- Three functions could delete what has outlived its purpose. None of them had
-- a caller, while the privacy policy named the windows to the reader. This
-- suite is the one that runs them, and the record it leaves behind.
begin;
create extension if not exists pgtap;

select plan(4);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'enforce_retention') = 1,
  'One function calls all three, so none can be forgotten separately'
);

-- A ledger entry two days old is past its two hours.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'retention@binder.test', '{}', '{}', now(), now());
insert into private.location_updates (user_id, created_at)
values ('f1000000-0000-4000-8000-000000000001', now() - interval '2 days');

select is(
  (select location_rows from private.enforce_retention()),
  1,
  'The run deletes the stale rate-limit ledger entry'
);

select is(
  (select count(*)::integer from private.location_updates where user_id = 'f1000000-0000-4000-8000-000000000001'),
  0,
  'And the row is really gone'
);

select is(
  (select count(*)::integer from private.retention_runs),
  1,
  'Every run writes down that it happened — otherwise "enforced" is a claim again'
);

select * from finish();
rollback;
