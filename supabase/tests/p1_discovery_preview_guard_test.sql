-- The filter preview asked nothing about who was asking, and nobody counted
-- how often they asked. Both are checked here.
begin;
create extension if not exists pgtap;

select plan(5);

create or replace function pg_temp.previews_until_refused(p_attempts integer)
returns integer
language plpgsql
as $$
declare
  done integer := 0;
begin
  for i in 1..p_attempts loop
    begin
      perform public.count_discovery_candidates(
        array['woman']::text[], 18::smallint, 99::smallint, 50::smallint, null);
      done := done + 1;
    exception when others then
      return done;
    end;
  end loop;
  return done;
end;
$$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('e1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, 'authenticated', 'authenticated',
       'preview' || n || '@binder.test', '{}', '{}', now(), now()
from generate_series(1, 2) as n;

-- Nobody here is a candidate for anybody: what is under test is what happens
-- to the caller, and the count itself may be zero.
insert into public.profiles(user_id, first_name, bio, gender, onboarding_complete)
select ('e1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, 'Preview' || n, '', 'man', false
from generate_series(1, 2) as n;

insert into public.user_private(user_id, birth_date)
select ('e1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, '1995-04-23'::date
from generate_series(1, 2) as n;

insert into public.user_preferences(user_id, interested_in, min_age, max_age, max_distance_km)
select ('e1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid, array['woman']::text[], 18::smallint, 99::smallint, 50::smallint
from generate_series(1, 2) as n;

insert into public.legal_acceptances(user_id, terms_version, privacy_version, accepted_at)
select ('e1000000-0000-4000-8000-00000000000' || to_hex(n))::uuid,
       private.current_terms_version(), private.current_privacy_version(), now()
from generate_series(1, 2) as n;

-- One active account, one suspended.
insert into private.account_safety(user_id, status)
values ('e1000000-0000-4000-8000-000000000001', 'active')
on conflict (user_id) do update set status = 'active';
insert into private.account_safety(user_id, status)
values ('e1000000-0000-4000-8000-000000000002', 'suspended')
on conflict (user_id) do update set status = 'suspended';

-- The active account gets its number.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select isnt(
  public.count_discovery_candidates(array['woman']::text[], 18::smallint, 99::smallint, 50::smallint, null),
  null,
  'An active account with current terms still gets a preview count'
);
reset role;

-- The suspended one gets nothing at all — not a zero, a refusal. A zero would
-- still be an answer, and answering is what a suspension ends.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.count_discovery_candidates(array['woman']::text[], 18::smallint, 99::smallint, 50::smallint, null) $$,
  '42501',
  'Account is not active.',
  'A suspended account cannot read how many people match a filter'
);
reset role;

-- Terms that were accepted and then superseded are no acceptance.
delete from public.legal_acceptances where user_id = 'e1000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.count_discovery_candidates(array['woman']::text[], 18::smallint, 99::smallint, 50::smallint, null) $$,
  '42501',
  'Account is not active.',
  'Without current terms there is no preview either'
);
reset role;

insert into public.legal_acceptances(user_id, terms_version, privacy_version, accepted_at)
values ('e1000000-0000-4000-8000-000000000001', private.current_terms_version(), private.current_privacy_version(), now());

-- The counter. Dragging a dial does not produce eighty requests in a minute.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select cmp_ok(
  pg_temp.previews_until_refused(80),
  '<',
  80,
  'A loop of previews is refused before it can map the population'
);
reset role;

-- And the refusal is the counter's, not something else going wrong.
select set_config('request.jwt.claims', '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.count_discovery_candidates(array['woman']::text[], 18::smallint, 99::smallint, 50::smallint, null) $$,
  '54000',
  'Too many discovery previews in the last minute.',
  'The refusal says it is a rate limit'
);
reset role;

select * from finish();
rollback;
