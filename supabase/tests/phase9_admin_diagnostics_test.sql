-- Phase 9 · the diagnostics bridge is readable by an admin and by nobody else.
begin;
create extension if not exists pgtap;
create or replace function pg_temp.did_error(statement text) returns boolean language plpgsql as $$ begin execute statement; return false; exception when others then return true; end $$;
select plan(14);

-- Shape and reach of the four functions.
select has_function('public','admin_diagnostics_summary',array['integer'],'Diagnostics summary is exposed to the dashboard');
select has_function('public','admin_diagnostics_health',array[]::text[],'Diagnostics health is exposed to the dashboard');
select has_function('public','admin_diagnostics_client_errors',array['integer'],'Client error stream is exposed to the dashboard');
select has_function('public','admin_diagnostics_feedback',array['integer'],'Feedback list is exposed to the dashboard');

select ok(not has_function_privilege('anon','public.admin_diagnostics_summary(integer)','execute'),'Anonymous visitors cannot read the diagnostics summary');
select ok(not has_function_privilege('anon','public.admin_diagnostics_health()','execute'),'Anonymous visitors cannot read diagnostics health');
select ok(not has_function_privilege('anon','public.admin_diagnostics_client_errors(integer)','execute'),'Anonymous visitors cannot read client errors');
select ok(not has_function_privilege('anon','public.admin_diagnostics_feedback(integer)','execute'),'Anonymous visitors cannot read beta feedback');

-- The raw tables stay unreachable: the bridge is the only way in.
select ok(not has_table_privilege('authenticated','private.beta_client_events','select'),'Diagnostics tables stay closed to signed-in users');
select ok(not has_table_privilege('authenticated','private.beta_feedback','select'),'Feedback table stays closed to signed-in users');

-- A signed-in user who is not an admin is refused by the permission gate.
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('d9999999-9999-4999-8999-999999999999','authenticated','authenticated','diagnostics-outsider@binder.test','{}','{}',now(),now());
select set_config('request.jwt.claims','{"sub":"d9999999-9999-4999-8999-999999999999","role":"authenticated"}',true); set local role authenticated;
select ok(pg_temp.did_error('select * from public.admin_diagnostics_summary(7)'),'A signed-in non-admin cannot read the diagnostics summary');
select ok(pg_temp.did_error('select * from public.admin_diagnostics_health()'),'A signed-in non-admin cannot read diagnostics health');
select ok(pg_temp.did_error('select * from public.admin_diagnostics_client_errors(10)'),'A signed-in non-admin cannot read client errors');
select ok(pg_temp.did_error('select * from public.admin_diagnostics_feedback(10)'),'A signed-in non-admin cannot read beta feedback');

reset role;
select * from finish();
rollback;
