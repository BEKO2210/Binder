begin;

-- Phase 4 production advisor findings. Do not remove existing indexes simply
-- because an empty beta database has not used them yet.
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

create index beta_feedback_user_created_idx
  on private.beta_feedback(user_id, created_at desc);
create index beta_feedback_created_idx
  on private.beta_feedback(created_at desc, category);

revoke all on table private.beta_preferences from public, anon, authenticated;
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
  if p_enabled is null then
    raise exception 'Diagnostics preference is required.' using errcode = '22023';
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
  diagnostics_on boolean;
  inserted_rows bigint := 0;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_event_id is null or p_session_id is null then
    raise exception 'Event and session IDs are required.' using errcode = '22023';
  end if;

  select bp.diagnostics_enabled into diagnostics_on
  from private.beta_preferences bp
  where bp.user_id = uid;

  if not coalesce(diagnostics_on, false) then
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

  get diagnostics inserted_rows = row_count;
  return inserted_rows > 0;
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
    raise exception 'Active account and current policy acceptance required.' using errcode = '42501';
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

commit;
