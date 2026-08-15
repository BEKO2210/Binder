begin;

create or replace function private.beta_daily_summary(p_days integer default 14)
returns table (
  day date,
  new_users bigint,
  onboarding_users bigint,
  decisions bigint,
  binds bigint,
  matches bigint,
  first_messages bigint,
  reports bigint,
  feedback bigint,
  client_errors bigint,
  discovery_p95_ms double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
      current_date - (least(greatest(coalesce(p_days,14),1),90) - 1),
      current_date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    (select count(*) from auth.users u where u.created_at >= d.day and u.created_at < d.day + 1)::bigint,
    (select count(distinct e.user_id) from private.beta_server_events e where e.event_name='onboarding_completed' and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(*) from private.beta_server_events e where e.event_name in ('decision_bind','decision_pass') and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(*) from private.beta_server_events e where e.event_name='decision_bind' and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(distinct e.entity_id) from private.beta_server_events e where e.event_name='match_created' and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(distinct e.entity_id) from private.beta_server_events e where e.event_name='first_message_sent' and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(*) from private.beta_server_events e where e.event_name='report_submitted' and e.created_at >= d.day and e.created_at < d.day + 1)::bigint,
    (select count(*) from private.beta_feedback f where f.created_at >= d.day and f.created_at < d.day + 1)::bigint,
    (select count(*) from private.beta_client_events c where c.event_name='client_render_error' and c.created_at >= d.day and c.created_at < d.day + 1)::bigint,
    (select percentile_cont(0.95) within group (order by c.duration_ms)::double precision
       from private.beta_client_events c
       where c.event_name='discovery_load' and c.outcome='ok' and c.duration_ms is not null
         and c.created_at >= d.day and c.created_at < d.day + 1)
  from days d
  order by d.day;
$$;

create or replace function private.prune_beta_data()
returns table (
  client_events_deleted bigint,
  ranking_batches_deleted bigint,
  feedback_deleted bigint,
  server_events_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c bigint;
  r bigint;
  f bigint;
  s bigint;
begin
  delete from private.beta_client_events where created_at < now() - interval '30 days';
  get diagnostics c = row_count;
  delete from private.discovery_batches where created_at < now() - interval '90 days';
  get diagnostics r = row_count;
  delete from private.beta_feedback where created_at < now() - interval '180 days';
  get diagnostics f = row_count;
  delete from private.beta_server_events where created_at < now() - interval '180 days';
  get diagnostics s = row_count;
  return query select c,r,f,s;
end;
$$;

revoke all on function private.beta_daily_summary(integer) from public, anon, authenticated;
revoke all on function private.prune_beta_data() from public, anon, authenticated;
grant execute on function private.beta_daily_summary(integer) to service_role;
grant execute on function private.prune_beta_data() to service_role;

commit;
