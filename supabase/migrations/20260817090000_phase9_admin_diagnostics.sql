-- Phase 9 · diagnostics reach the operator.
--
-- The app already collects opt-in diagnostics (private.beta_client_events,
-- private.beta_feedback, private.beta_server_events) and private.beta_daily_summary()
-- already aggregates them, but every one of those objects is service_role only.
-- The admin dashboard runs as an authenticated admin in the browser, so until
-- now nothing a tester reported could actually be read by the operator.
--
-- These functions are the whole bridge: read-only, security definer, gated by
-- the same private.require_admin_permission('dashboard') the rest of the
-- dashboard uses, and returning aggregates plus the fields an operator needs to
-- act on. No new grant to anon, no service-role key in a browser, and no
-- identity attached to a client event beyond what moderation already exposes.
begin;

create or replace function public.admin_diagnostics_summary(p_days integer default 14)
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
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  if p_days not between 1 and 90 then
    raise exception 'Diagnostics window must be between 1 and 90 days.' using errcode = '22023';
  end if;
  return query select * from private.beta_daily_summary(p_days);
end;
$$;

-- Health of the collection itself: how many devices report, how many opted in,
-- and when the newest event arrived. An empty diagnostics tab is ambiguous
-- otherwise — nobody reporting looks exactly like collection being broken.
create or replace function public.admin_diagnostics_health()
returns table (
  diagnostics_opted_in bigint,
  diagnostics_opted_out bigint,
  reporting_devices_7d bigint,
  client_events_24h bigint,
  client_errors_24h bigint,
  feedback_30d bigint,
  newest_event_at timestamptz,
  client_event_retention_days integer,
  feedback_retention_days integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  return query select
    (select count(*) from private.beta_preferences p where p.diagnostics_enabled),
    (select count(*) from private.beta_preferences p where not p.diagnostics_enabled),
    (select count(distinct e.session_id) from private.beta_client_events e where e.created_at >= now() - interval '7 days'),
    (select count(*) from private.beta_client_events e where e.created_at >= now() - interval '24 hours'),
    (select count(*) from private.beta_client_events e where e.event_name = 'client_render_error' and e.created_at >= now() - interval '24 hours'),
    (select count(*) from private.beta_feedback f where f.created_at >= now() - interval '30 days'),
    (select max(e.created_at) from private.beta_client_events e),
    30,
    180;
end;
$$;

-- The error stream an operator works from. The user is identified only by the
-- session that produced the event: a render error needs a build, a surface and
-- a time, not a person.
create or replace function public.admin_diagnostics_client_errors(p_limit integer default 50)
returns table (
  event_id uuid,
  session_id uuid,
  event_name text,
  surface text,
  outcome text,
  duration_ms integer,
  platform text,
  app_version text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  if p_limit not between 1 and 200 then
    raise exception 'Invalid diagnostics page.' using errcode = '22023';
  end if;
  return query
  select e.id, e.session_id, e.event_name, e.surface, e.outcome, e.duration_ms,
         e.platform, e.app_version, e.created_at
  from private.beta_client_events e
  where e.event_name = 'client_render_error' or e.outcome = 'error'
  order by e.created_at desc, e.id
  limit p_limit;
end;
$$;

-- Feedback is written by a person about the product, so it keeps its author:
-- an operator has to be able to answer it and to see repeat reporters.
create or replace function public.admin_diagnostics_feedback(p_limit integer default 50)
returns table (
  feedback_id uuid,
  user_id uuid,
  profile_first_name text,
  category text,
  rating smallint,
  details text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  if p_limit not between 1 and 200 then
    raise exception 'Invalid diagnostics page.' using errcode = '22023';
  end if;
  return query
  select f.id, f.user_id, p.first_name, f.category, f.rating, f.details, f.created_at
  from private.beta_feedback f
  left join public.profiles p on p.user_id = f.user_id
  order by f.created_at desc, f.id
  limit p_limit;
end;
$$;

revoke all on function public.admin_diagnostics_summary(integer) from public, anon;
revoke all on function public.admin_diagnostics_health() from public, anon;
revoke all on function public.admin_diagnostics_client_errors(integer) from public, anon;
revoke all on function public.admin_diagnostics_feedback(integer) from public, anon;

grant execute on function public.admin_diagnostics_summary(integer) to authenticated;
grant execute on function public.admin_diagnostics_health() to authenticated;
grant execute on function public.admin_diagnostics_client_errors(integer) to authenticated;
grant execute on function public.admin_diagnostics_feedback(integer) to authenticated;

commit;
