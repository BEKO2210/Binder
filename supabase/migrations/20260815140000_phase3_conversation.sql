begin;

alter table public.matches drop constraint if exists matches_status_check;
alter table public.matches
  add constraint matches_status_check check (status in ('active', 'blocked', 'unmatched'));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  client_message_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (sender_id, client_message_id)
);

create index messages_match_created_idx on public.messages (match_id, created_at desc, id desc);
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);

create table public.match_read_state (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 16 and 512),
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index device_tokens_user_enabled_idx on public.device_tokens (user_id, enabled);

create table private.report_context (
  report_id uuid primary key references public.reports(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  message_body_snapshot text,
  reported_profile_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table private.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('new_match', 'new_message')),
  match_id uuid not null references public.matches(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  attempts smallint not null default 0 check (attempts between 0 and 20),
  last_error text
);

create unique index push_outbox_match_once_idx
on private.push_outbox (recipient_id, match_id)
where kind = 'new_match';

create unique index push_outbox_message_once_idx
on private.push_outbox (recipient_id, message_id)
where kind = 'new_message';

create index push_outbox_pending_idx
on private.push_outbox (created_at, id)
where dispatched_at is null and attempts < 20;

alter table public.messages enable row level security;
alter table public.match_read_state enable row level security;
alter table public.device_tokens enable row level security;

create policy messages_active_match_member_select
on public.messages for select to authenticated
using (
  exists (
    select 1
    from public.matches m
    where m.id = messages.match_id
      and m.status = 'active'
      and ((select auth.uid()) = m.user_low or (select auth.uid()) = m.user_high)
  )
);

create policy match_read_state_self_select
on public.match_read_state for select to authenticated
using (user_id = (select auth.uid()));

create policy device_tokens_self_select
on public.device_tokens for select to authenticated
using (user_id = (select auth.uid()));

revoke all privileges on table public.messages from anon, authenticated;
revoke all privileges on table public.match_read_state from anon, authenticated;
revoke all privileges on table public.device_tokens from anon, authenticated;
revoke all privileges on table private.report_context from public, anon, authenticated;
revoke all privileges on table private.push_outbox from public, anon, authenticated;
revoke insert on table public.reports from authenticated;

grant select on table public.messages to authenticated;
grant select on table public.match_read_state to authenticated;
grant select on table public.device_tokens to authenticated;

create or replace function private.enqueue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  select case when m.user_low = new.sender_id then m.user_high else m.user_low end
  into recipient
  from public.matches m
  where m.id = new.match_id;

  if recipient is not null then
    insert into private.push_outbox (recipient_id, kind, match_id, message_id)
    values (recipient, 'new_message', new.match_id, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.enqueue_message_push() from public, anon, authenticated;

create trigger messages_enqueue_push
after insert on public.messages
for each row execute function private.enqueue_message_push();

create or replace function private.enqueue_match_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'created' then
    insert into private.push_outbox (recipient_id, kind, match_id)
    select m.user_low, 'new_match', m.id from public.matches m where m.id = new.match_id
    union all
    select m.user_high, 'new_match', m.id from public.matches m where m.id = new.match_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_match_push() from public, anon, authenticated;

create trigger match_events_enqueue_push
after insert on private.match_events
for each row execute function private.enqueue_match_push();

create or replace function public.send_message(
  p_match_id uuid,
  p_client_message_id uuid,
  p_body text
)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  match_status text;
  existing public.messages%rowtype;
  inserted public.messages%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_match_id is null or p_client_message_id is null then
    raise exception 'Match and client message IDs are required.' using errcode = '22023';
  end if;

  if p_body is null or char_length(trim(p_body)) not between 1 and 2000 then
    raise exception 'Message must contain 1 to 2000 characters.' using errcode = '23514';
  end if;

  select m.* into existing
  from public.messages m
  where m.sender_id = uid and m.client_message_id = p_client_message_id;

  if found then
    if existing.match_id <> p_match_id or existing.body <> trim(p_body) then
      raise exception 'Client message ID was already used for a different payload.' using errcode = '23505';
    end if;
    return query select existing.id, existing.match_id, existing.sender_id, existing.body, existing.created_at;
    return;
  end if;

  select m.user_low, m.user_high, m.status
  into low_user, high_user, match_status
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found or uid not in (low_user, high_user) then
    raise exception 'Active match membership required.' using errcode = '42501';
  end if;

  if match_status <> 'active' then
    raise exception 'This conversation is no longer active.' using errcode = '23514';
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Message rate limit exceeded.' using errcode = '54000';
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Hourly message rate limit exceeded.' using errcode = '54000';
  end if;

  insert into public.messages (match_id, sender_id, client_message_id, body)
  values (p_match_id, uid, p_client_message_id, trim(p_body))
  returning * into inserted;

  return query select inserted.id, inserted.match_id, inserted.sender_id, inserted.body, inserted.created_at;
end;
$$;

revoke all on function public.send_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;

create or replace function public.mark_match_read(p_match_id uuid)
returns void
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

  if not exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and m.status = 'active'
      and uid in (m.user_low, m.user_high)
  ) then
    raise exception 'Active match membership required.' using errcode = '42501';
  end if;

  insert into public.match_read_state (match_id, user_id, last_read_at)
  values (p_match_id, uid, now())
  on conflict (match_id, user_id) do update
  set last_read_at = greatest(public.match_read_state.last_read_at, excluded.last_read_at);
end;
$$;

revoke all on function public.mark_match_read(uuid) from public, anon;
grant execute on function public.mark_match_read(uuid) to authenticated;

create or replace function public.get_my_matches()
returns table (
  match_id uuid,
  other_user_id uuid,
  first_name text,
  age integer,
  bio text,
  primary_photo_path text,
  matched_at timestamptz,
  last_message_body text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select
      m.id,
      m.created_at,
      case when m.user_low = auth.uid() then m.user_high else m.user_low end as other_id
    from public.matches m
    where m.status = 'active'
      and auth.uid() in (m.user_low, m.user_high)
  )
  select
    mine.id,
    mine.other_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    media.storage_path,
    mine.created_at,
    left(last_message.body, 140),
    last_message.created_at,
    (
      select count(*)
      from public.messages unread
      where unread.match_id = mine.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > coalesce(read_state.last_read_at, mine.created_at)
    )
  from mine
  join public.profiles p on p.user_id = mine.other_id
  join public.user_private pr on pr.user_id = mine.other_id
  left join public.match_read_state read_state on read_state.match_id = mine.id and read_state.user_id = auth.uid()
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = mine.other_id and pm.position = 0
    limit 1
  ) media on true
  left join lateral (
    select msg.body, msg.created_at
    from public.messages msg
    where msg.match_id = mine.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) last_message on true
  order by coalesce(last_message.created_at, mine.created_at) desc, mine.id;
$$;

revoke all on function public.get_my_matches() from public, anon;
grant execute on function public.get_my_matches() to authenticated;

create or replace function public.unmatch(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  current_status text;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select m.user_low, m.user_high, m.status
  into low_user, high_user, current_status
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found or uid not in (low_user, high_user) then
    raise exception 'Match membership required.' using errcode = '42501';
  end if;

  if current_status <> 'active' then
    return false;
  end if;

  update public.matches
  set status = 'unmatched', ended_at = now()
  where id = p_match_id;

  return true;
end;
$$;

revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.unmatch(uuid) to authenticated;

create or replace function public.report_user(
  p_reported_id uuid,
  p_reason text,
  p_details text default '',
  p_match_id uuid default null,
  p_message_id uuid default null,
  p_block boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_report_id uuid;
  context_match_id uuid := p_match_id;
  snapshot_body text;
  profile_snapshot jsonb;
  message_sender uuid;
  message_match uuid;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_reported_id is null or p_reported_id = uid then
    raise exception 'Invalid report target.' using errcode = '22023';
  end if;

  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'Report details are too long.' using errcode = '23514';
  end if;

  if p_message_id is not null then
    select m.match_id, m.sender_id, m.body
    into message_match, message_sender, snapshot_body
    from public.messages m
    where m.id = p_message_id;

    if not found or message_sender <> p_reported_id then
      raise exception 'Reported message does not belong to the reported user.' using errcode = '23514';
    end if;

    if context_match_id is not null and context_match_id <> message_match then
      raise exception 'Report context mismatch.' using errcode = '23514';
    end if;
    context_match_id := message_match;
  end if;

  if context_match_id is not null then
    if not exists (
      select 1 from public.matches m
      where m.id = context_match_id
        and uid in (m.user_low, m.user_high)
        and p_reported_id in (m.user_low, m.user_high)
        and uid <> p_reported_id
    ) then
      raise exception 'Report match context is invalid.' using errcode = '42501';
    end if;
  elsif not private.is_discovery_candidate(uid, p_reported_id) then
    raise exception 'Reported profile is not in an active Binder interaction.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', p.user_id,
    'first_name', p.first_name,
    'age', extract(year from age(current_date, pr.birth_date))::integer,
    'bio', p.bio,
    'gender', p.gender,
    'interests', p.interests
  )
  into profile_snapshot
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  where p.user_id = p_reported_id;

  if profile_snapshot is null then
    raise exception 'Reported profile not found.' using errcode = '23514';
  end if;

  insert into public.reports (reporter_id, reported_id, reason, details)
  values (uid, p_reported_id, p_reason, coalesce(trim(p_details), ''))
  returning id into new_report_id;

  insert into private.report_context (
    report_id, match_id, message_id, message_body_snapshot, reported_profile_snapshot
  ) values (
    new_report_id, context_match_id, p_message_id, snapshot_body, profile_snapshot
  );

  if p_block then
    insert into public.blocks (blocker_id, blocked_id)
    values (uid, p_reported_id)
    on conflict (blocker_id, blocked_id) do nothing;
  end if;

  return new_report_id;
end;
$$;

revoke all on function public.report_user(uuid, text, text, uuid, uuid, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, uuid, uuid, boolean) to authenticated;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
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
  if p_token is null or char_length(trim(p_token)) not between 16 and 512 then
    raise exception 'Invalid push token.' using errcode = '22023';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'Invalid push platform.' using errcode = '22023';
  end if;

  insert into public.device_tokens (user_id, token, platform, enabled)
  values (uid, trim(p_token), p_platform, true)
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      enabled = true,
      updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.device_tokens
  set enabled = false, updated_at = now()
  where token = trim(p_token) and user_id = auth.uid();
end;
$$;

revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- Realtime Postgres Changes applies the messages table RLS before delivering rows.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

commit;
