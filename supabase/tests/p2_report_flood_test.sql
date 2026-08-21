-- Sending a message has two rate limits. Reporting had none — and a report
-- opens a moderation case, `underage` at priority 100. This suite is the
-- counter that was missing, and the rule that the same report twice is still
-- one report.
begin;
create extension if not exists pgtap;

select plan(4);

create or replace function pg_temp.reports_until_refused(p_targets uuid[])
returns integer
language plpgsql
as $$
declare
  target uuid;
  filed integer := 0;
begin
  foreach target in array p_targets loop
    begin
      perform public.report_user(target, 'spam', 'noise', null, null, false);
      filed := filed + 1;
    exception when others then
      return filed;
    end;
  end loop;
  return filed;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('d1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, 'authenticated', 'authenticated',
       'flood' || n || '@binder.test', '{}', '{}', now(), now()
from generate_series(1, 9) as n;

insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete)
select ('d1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, 'User' || n, '', 'woman', false
from generate_series(2, 9) as n;

-- The snapshot reads the birth date, so every target needs its private row.
insert into public.user_private(user_id, birth_date)
select ('d1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, date '1993-01-01'
from generate_series(2, 9) as n
on conflict (user_id) do nothing;

-- The reporter and one target share a live match, which is a valid context.
insert into public.matches(id, user_low, user_high) values
('d2000000-0000-4000-8000-000000000001',
  least('d1000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid),
  greatest('d1000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000002'::uuid));

select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select isnt(
  public.report_user('d1000000-0000-4000-8000-000000000002', 'harassment', 'first', 'd2000000-0000-4000-8000-000000000001', null, false),
  null,
  'A report about somebody you are matched with is filed'
);

select isnt(
  public.report_user('d1000000-0000-4000-8000-000000000002', 'harassment', 'again', 'd2000000-0000-4000-8000-000000000001', null, false),
  null,
  'Reporting the same person again on the same day still answers'
);
reset role;

-- Counting rows is the server's job: a client cannot read the reports table.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  (select count(*)::integer from private.moderation_cases c
   join public.reports r on r.id = c.report_id
   where r.reporter_id = 'd1000000-0000-4000-8000-000000000001'),
  1,
  'The second report created no second case — the moderator sees one'
);

-- The hourly counter, tried against seven different people.
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select cmp_ok(
  pg_temp.reports_until_refused(array(
    select ('d1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid from generate_series(3, 9) as n
  )),
  '<',
  7,
  'A run of reports hits the hourly limit before it can bury the queue'
);
reset role;

select * from finish();
rollback;
