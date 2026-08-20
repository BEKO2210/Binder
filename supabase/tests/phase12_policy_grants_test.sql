-- Every helper a policy calls must be executable by the role the policy runs as.
--
-- This exists because of a real outage of exactly one hour: a review said an
-- authenticated caller should not be able to ask
-- private.is_account_active(<stranger>), the grant was revoked, and every photo
-- upload started failing with
--
--   403 permission denied for function is_account_active
--
-- RLS policies are evaluated as the calling role, so a policy that calls a
-- private helper needs that role to hold EXECUTE. Nothing in the schema says so
-- out loud, and no test noticed until an end-to-end run did. Now the rule is
-- checked directly: whatever any policy calls, `authenticated` may execute.
begin;

create extension if not exists pgtap;

select plan(2);

create temporary table policy_helpers as
with expressions as (
  select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as body
  from pg_policy p
),
names as (
  select distinct (regexp_matches(body, '(private|public)\.([a-z_0-9]+)\(', 'g'))[2] as function_name
  from expressions
)
select n.function_name,
       p.oid,
       p.pronamespace::regnamespace::text as schema_name,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_may_execute
from names n
join pg_proc p on p.proname = n.function_name
where p.pronamespace::regnamespace::text in ('private', 'public');

-- The list itself has to be non-empty, or the check above would pass by
-- looking at nothing.
select cmp_ok(
  (select count(*) from policy_helpers)::integer,
  '>=',
  4,
  'policies call at least the four helpers this schema is known to use'
);

select is(
  (select coalesce(string_agg(schema_name || '.' || function_name, ', ' order by function_name), '')
     from policy_helpers
     where not authenticated_may_execute),
  '',
  'every function called from a policy is executable by authenticated'
);

select * from finish();
rollback;
