begin;

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

revoke all on table private.beta_server_events from public, anon, authenticated;

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
begin
  insert into private.beta_server_events(user_id,event_name,entity_id,created_at)
  values(
    new.actor_id,
    case new.decision when 'bind' then 'decision_bind' else 'decision_pass' end,
    new.id,
    new.created_at
  )
  on conflict (event_name,user_id,entity_id) do nothing;
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

commit;
