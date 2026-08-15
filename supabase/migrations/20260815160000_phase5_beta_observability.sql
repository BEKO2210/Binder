begin;

-- Supabase advisor findings after the Phase 4 production rollout.
create index if not exists moderation_actions_case_id_idx
  on private.moderation_actions(case_id);
create index if not exists moderation_cases_media_id_idx
  on private.moderation_cases(media_id)
  where media_id is not null;
create index if not exists moderation_cases_report_id_idx
  on private.moderation_cases(report_id)
  where report_id is not null;

create table private.beta_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diagnostics_enabled boolean not null default false,
  rank_variant text not null default 'baseline_v1'
    check (rank_variant in ('baseline_v1')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.beta_server_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (event_name in (
    'onboarding_completed',
    'decision_bind',
    'decision_pass',
    'match_created',
    'first_message_sent',
    'report_submitted'
  )),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (event_name, user_id, entity_id)
);

create index beta_server_events_created_idx
  on private.beta_server_events(created_at, event_name);
create index beta_server_events_user_created_idx
  on private.beta_server_events(user_id, created_at desc);

create table private.discovery_batches (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  rank_variant text not null check (rank_variant in ('baseline_v1')),
  candidate_count smallint not null check (candidate_count between 0 and 50),
  created_at timestamptz not null default now()
);

create index discovery_batches_viewer_created_idx
  on private.discovery_batches(viewer_id, created_at desc);

create table private.discovery_impressions (
  batch_id uuid not null references private.discovery_batches(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  interest_overlap smallint not null check (interest_overlap between 0 and 50),
  distance_bucket_km smallint not null check (distance_bucket_km between 0 and 500),
  decision text check (decision is null or decision in ('bind','pass')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (batch_id, candidate_id)
);

create index discovery_impressions_pending_idx
  on private.discovery_impressions(viewer_id, candidate_id, created_at desc)
  where decision is null;
create index discovery_impressions_candidate_idx
  on private.discovery_impressions(candidate_id, created_at desc);

create table private.beta_client_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  event_name text not null check (event_name in (
    'app_session',
    'legal_gate_load',
    'discovery_load',
    'matches_load',
    'chat_load',
    'profile_load',
    'client_render_error'
  )),
  surface text not null check (surface in ('app','legal','discover','matches','chat','profile','beta')),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 120000),
  value integer check (value is null or value between 0 and 1000),
  outcome text not null check (outcome in ('ok','error','empty','cancel')),
  platform text not null check (platform in ('android','ios')),
  app_version text not null check (char_length(app_version) between 1 and 32),
  created_at timestamptz not null default now()
);

create index beta_client_events_user_created_idx
  on private.beta_client_events(user_id, created_at desc);
create index beta_client_events_event_created_idx
  on private.beta_client_events(event_name, created_at desc);

create table private.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug','ux','safety','performance','other')),
  rating smallint not null check (rating between 1 and 5),
  details text not null default '' check (char_length(details) <= 1500),
  created_at timestamptz not null default now()
);

create index beta_feedback_created_idx
  on private.beta_feedback(created_at desc, category);

revoke all on table private.beta_preferences from public, anon, authenticated;
revoke all on table private.beta_server_events from public, anon, authenticated;
revoke all on table private.discovery_batches from public, anon, authenticated;
revoke all on table private.discovery_impressions from public, anon, authenticated;
revoke all on table private.beta_client_events from public, anon, authenticated;
revoke all on table private.beta_feedback from public, anon, authenticated;

insert into private.beta_preferences(user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function private.initialize_beta_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.beta_preferences(user_id)
  values(new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_beta_preferences() from public, anon, authenticated;

create trigger binder_auth_user_beta_preferences
after insert on auth.users
for each row execute function private.initialize_beta_preferences();

-- Phase 5 adds private product/ranking instrumentation, so the privacy version
-- changes and existing users must explicitly accept the updated disclosure.
create or replace function private.current_privacy_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-08-15-beta1'::text $$;

create or replace function public.get_beta_settings()
returns table (
  diagnostics_enabled boolean,
  rank_variant text,
  client_retention_days smallint,
  ranking_retention_days smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  return query
  select
    bp.diagnostics_enabled,
    bp.rank_variant,
    30::smallint,
    90::smallint
  from private.beta_preferences bp
  where bp.user_id = uid;
end;
$$;

create or replace function public.set_beta_diagnostics(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_enabled and not private.is_account_active(uid) then
    raise exception 'Active account required.' using errcode = '42501';
  end if;

  insert into private.beta_preferences(user_id, diagnostics_enabled, updated_at)
  values(uid, p_enabled, pg_catalog.clock_timestamp())
  on conflict (user_id) do update
  set diagnostics_enabled = excluded.diagnostics_enabled,
      updated_at = excluded.updated_at;

  if not p_enabled then
    delete from private.beta_client_events where user_id = uid;
  end if;

  return p_enabled;
end;
$$;

create or replace function public.record_beta_client_event(
  p_event_id uuid,
  p_session_id uuid,
  p_event_name text,
  p_surface text,
  p_duration_ms integer,
  p_value integer,
  p_outcome text,
  p_platform text,
  p_app_version text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  enabled boolean;
  inserted boolean := false;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_event_id is null or p_session_id is null then
    raise exception 'Event and session IDs are required.' using errcode = '22023';
  end if;

  select bp.diagnostics_enabled into enabled
  from private.beta_preferences bp
  where bp.user_id = uid;

  if not coalesce(enabled, false) then
    return false;
  end if;

  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    return false;
  end if;

  if p_event_name not in ('app_session','legal_gate_load','discovery_load','matches_load','chat_load','profile_load','client_render_error') then
    raise exception 'Unsupported beta event.' using errcode = '22023';
  end if;
  if p_surface not in ('app','legal','discover','matches','chat','profile','beta') then
    raise exception 'Unsupported beta surface.' using errcode = '22023';
  end if;
  if p_outcome not in ('ok','error','empty','cancel') then
    raise exception 'Unsupported beta outcome.' using errcode = '22023';
  end if;
  if p_platform not in ('android','ios') then
    raise exception 'Unsupported platform.' using errcode = '22023';
  end if;
  if p_duration_ms is not null and p_duration_ms not between 0 and 120000 then
    raise exception 'Invalid beta duration.' using errcode = '22023';
  end if;
  if p_value is not null and p_value not between 0 and 1000 then
    raise exception 'Invalid beta value.' using errcode = '22023';
  end if;
  if p_app_version is null or char_length(trim(p_app_version)) not between 1 and 32 then
    raise exception 'Invalid app version.' using errcode = '22023';
  end if;

  delete from private.beta_client_events
  where user_id = uid and created_at < now() - interval '30 days';

  insert into private.beta_client_events(
    id,user_id,session_id,event_name,surface,duration_ms,value,outcome,platform,app_version
  ) values (
    p_event_id,uid,p_session_id,p_event_name,p_surface,p_duration_ms,p_value,p_outcome,p_platform,trim(p_app_version)
  )
  on conflict (id) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.submit_beta_feedback(
  p_category text,
  p_rating smallint,
  p_details text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  feedback_id uuid;
  clean_details text := trim(coalesce(p_details, ''));
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Active account and current privacy acceptance required.' using errcode = '42501';
  end if;
  if p_category not in ('bug','ux','safety','performance','other') then
    raise exception 'Unsupported feedback category.' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Rating must be from 1 to 5.' using errcode = '22023';
  end if;
  if char_length(clean_details) > 1500 then
    raise exception 'Feedback is too long.' using errcode = '23514';
  end if;

  delete from private.beta_feedback
  where user_id = uid and created_at < now() - interval '180 days';

  insert into private.beta_feedback(user_id,category,rating,details)
  values(uid,p_category,p_rating,clean_details)
  returning id into feedback_id;

  return feedback_id;
end;
$$;

revoke all on function public.get_beta_settings() from public, anon;
revoke all on function public.set_beta_diagnostics(boolean) from public, anon;
revoke all on function public.record_beta_client_event(uuid,uuid,text,text,integer,integer,text,text,text) from public, anon;
revoke all on function public.submit_beta_feedback(text,smallint,text) from public, anon;
grant execute on function public.get_beta_settings() to authenticated;
grant execute on function public.set_beta_diagnostics(boolean) to authenticated;
grant execute on function public.record_beta_client_event(uuid,uuid,text,text,integer,integer,text,text,text) to authenticated;
grant execute on function public.submit_beta_feedback(text,smallint,text) to authenticated;

create or replace function private.capture_onboarding_beta_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.onboarding_complete = false and new.onboarding_complete = true then
    insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
    values(new.user_id,'onboarding_completed',new.user_id,pg_catalog.clock_timestamp())
    on conflict (event_name,user_id,entity_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_beta_onboarding
after update of onboarding_complete on public.profiles
for each row execute function private.capture_onboarding_beta_event();

create or replace function private.capture_decision_beta_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_batch uuid;
begin
  insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
  values(
    new.actor_id,
    case new.decision when 'bind' then 'decision_bind' else 'decision_pass' end,
    new.id,
    new.created_at
  )
  on conflict (event_name,user_id,entity_id) do nothing;

  select di.batch_id into latest_batch
  from private.discovery_impressions di
  where di.viewer_id = new.actor_id
    and di.candidate_id = new.target_id
    and di.decision is null
  order by di.created_at desc
  limit 1;

  if latest_batch is not null then
    update private.discovery_impressions
    set decision = new.decision,
        decided_at = new.created_at
    where batch_id = latest_batch
      and candidate_id = new.target_id
      and decision is null;
  end if;

  return new;
end;
$$;

create trigger decisions_beta_event
after insert on public.decisions
for each row execute function private.capture_decision_beta_event();

create or replace function private.capture_match_beta_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
  values
    (new.user_low,'match_created',new.id,new.created_at),
    (new.user_high,'match_created',new.id,new.created_at)
  on conflict (event_name,user_id,entity_id) do nothing;
  return new;
end;
$$;

create trigger matches_beta_event
after insert on public.matches
for each row execute function private.capture_match_beta_event();

create or replace function private.capture_first_message_beta_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.messages m
    where m.match_id = new.match_id and m.id <> new.id
  ) then
    insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
    values(new.sender_id,'first_message_sent',new.match_id,new.created_at)
    on conflict (event_name,user_id,entity_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger messages_beta_first_message
after insert on public.messages
for each row execute function private.capture_first_message_beta_event();

create or replace function private.capture_report_beta_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
  values(new.reporter_id,'report_submitted',new.id,new.created_at)
  on conflict (event_name,user_id,entity_id) do nothing;
  return new;
end;
$$;

create trigger reports_beta_event
after insert on public.reports
for each row execute function private.capture_report_beta_event();

revoke all on function private.capture_onboarding_beta_event() from public, anon, authenticated;
revoke all on function private.capture_decision_beta_event() from public, anon, authenticated;
revoke all on function private.capture_match_beta_event() from public, anon, authenticated;
revoke all on function private.capture_first_message_beta_event() from public, anon, authenticated;
revoke all on function private.capture_report_beta_event() from public, anon, authenticated;

create or replace function public.get_discovery_batch(p_limit integer default 20)
returns table (
  target_user_id uuid,
  first_name text,
  age integer,
  bio text,
  interests text[],
  distance_km integer,
  primary_photo_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  batch_id uuid := gen_random_uuid();
  variant text := 'baseline_v1';
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = uid and p.onboarding_complete = true
  ) then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;

  select bp.rank_variant into variant
  from private.beta_preferences bp
  where bp.user_id = uid;
  variant := coalesce(variant, 'baseline_v1');

  delete from private.discovery_batches
  where viewer_id = uid and created_at < now() - interval '90 days';

  return query
  with viewer as (
    select p.interests, pr.location
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    where p.user_id = uid
  ), candidates as (
    select
      p.user_id,
      p.first_name,
      extract(year from age(current_date, pr.birth_date))::integer as candidate_age,
      p.bio,
      p.interests,
      round(extensions.st_distance(v.location, pr.location) / 1000.0)::integer as candidate_distance_km,
      media.storage_path,
      (
        select count(*)::integer
        from unnest(p.interests) interest
        where interest = any(v.interests)
      ) as interest_overlap,
      p.updated_at
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    cross join viewer v
    join lateral (
      select pm.storage_path
      from public.profile_media pm
      where pm.user_id = p.user_id and pm.position = 0
      limit 1
    ) media on true
    where private.is_discovery_candidate(uid, p.user_id)
  ), ranked as (
    select
      c.*,
      row_number() over (
        order by c.interest_overlap desc, c.candidate_distance_km asc, c.updated_at desc, c.user_id
      )::smallint as rank_position
    from candidates c
    order by c.interest_overlap desc, c.candidate_distance_km asc, c.updated_at desc, c.user_id
    limit safe_limit
  ), batch_insert as (
    insert into private.discovery_batches(id,viewer_id,rank_variant,candidate_count)
    select batch_id,uid,variant,count(*)::smallint from ranked
    returning id
  ), impression_insert as (
    insert into private.discovery_impressions(
      batch_id,viewer_id,candidate_id,position,interest_overlap,distance_bucket_km,created_at
    )
    select
      batch_id,
      uid,
      r.user_id,
      r.rank_position,
      r.interest_overlap::smallint,
      (floor(greatest(r.candidate_distance_km,0) / 10.0) * 10)::smallint,
      pg_catalog.clock_timestamp()
    from ranked r
    cross join batch_insert b
    returning batch_id
  )
  select
    r.user_id,
    r.first_name,
    r.candidate_age,
    r.bio,
    r.interests,
    r.candidate_distance_km,
    r.storage_path
  from ranked r
  cross join lateral (select count(*) from impression_insert) logged
  order by r.rank_position;
end;
$$;

revoke all on function public.get_discovery_batch(integer) from public, anon;
grant execute on function public.get_discovery_batch(integer) to authenticated;

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
