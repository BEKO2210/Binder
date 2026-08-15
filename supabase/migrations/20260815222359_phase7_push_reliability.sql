begin;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  new_matches boolean not null default true,
  messages boolean not null default true,
  moderation boolean not null default true,
  safety boolean not null default true,
  product boolean not null default false,
  sound boolean not null default true,
  vibration boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_start time without time zone not null default time '22:00',
  quiet_end time without time zone not null default time '08:00',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  updated_at timestamptz not null default now(),
  check (not quiet_hours_enabled or quiet_start <> quiet_end)
);

alter table public.notification_preferences enable row level security;
create policy notification_preferences_self_select
on public.notification_preferences for select to authenticated
using (user_id = (select auth.uid()));

revoke all privileges on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to authenticated;

insert into public.notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function private.initialize_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_notification_preferences() from public, anon, authenticated;

create trigger binder_auth_user_notification_preferences
after insert on auth.users
for each row execute function private.initialize_notification_preferences();

create or replace function public.get_my_notification_preferences()
returns setof public.notification_preferences
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
  from public.notification_preferences p
  where p.user_id = auth.uid();
$$;

create or replace function public.set_my_notification_preferences(
  p_enabled boolean,
  p_new_matches boolean,
  p_messages boolean,
  p_moderation boolean,
  p_safety boolean,
  p_product boolean,
  p_sound boolean,
  p_vibration boolean,
  p_quiet_hours_enabled boolean,
  p_quiet_start time without time zone,
  p_quiet_end time without time zone,
  p_timezone text
)
returns setof public.notification_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_timezone text := pg_catalog.btrim(p_timezone);
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_account_active(uid) then
    raise exception 'Account is not active.' using errcode = '42501';
  end if;
  if p_quiet_hours_enabled and p_quiet_start = p_quiet_end then
    raise exception 'Quiet hours must have different start and end times.' using errcode = '22023';
  end if;
  if normalized_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = normalized_timezone
  ) then
    raise exception 'Invalid IANA timezone.' using errcode = '22023';
  end if;

  insert into public.notification_preferences (
    user_id, enabled, new_matches, messages, moderation, safety, product,
    sound, vibration, quiet_hours_enabled, quiet_start, quiet_end, timezone, updated_at
  ) values (
    uid, p_enabled, p_new_matches, p_messages, p_moderation, p_safety, p_product,
    p_sound, p_vibration, p_quiet_hours_enabled, p_quiet_start, p_quiet_end,
    normalized_timezone, pg_catalog.clock_timestamp()
  )
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    new_matches = excluded.new_matches,
    messages = excluded.messages,
    moderation = excluded.moderation,
    safety = excluded.safety,
    product = excluded.product,
    sound = excluded.sound,
    vibration = excluded.vibration,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end,
    timezone = excluded.timezone,
    updated_at = excluded.updated_at;

  return query select p.* from public.notification_preferences p where p.user_id = uid;
end;
$$;

revoke all on function public.get_my_notification_preferences() from public, anon;
revoke all on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone,text) from public, anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time without time zone,time without time zone,text) to authenticated;

alter table public.device_tokens
  add column installation_id uuid,
  add column last_registered_at timestamptz not null default now();

update public.device_tokens set installation_id = id where installation_id is null;
alter table public.device_tokens alter column installation_id set not null;
create unique index device_tokens_installation_unique on public.device_tokens (installation_id);

alter table private.push_outbox drop constraint if exists push_outbox_kind_check;
alter table private.push_outbox
  alter column match_id drop not null,
  add constraint push_outbox_kind_check check (kind in ('new_match','new_message','moderation_status','safety_alert','product_notice')),
  add column dedupe_key text,
  add column subject_id uuid,
  add column status text not null default 'pending' check (status in ('pending','expanded','delivered','suppressed','dead')),
  add column next_attempt_at timestamptz not null default now(),
  add column completed_at timestamptz,
  add column last_error_code text;

update private.push_outbox
set dedupe_key = case
  when kind = 'new_match' then match_id::text
  when kind = 'new_message' then message_id::text
  else id::text
end
where dedupe_key is null;

alter table private.push_outbox alter column dedupe_key set not null;
create unique index push_outbox_logical_event_unique
on private.push_outbox (recipient_id, kind, dedupe_key);

drop index if exists private.push_outbox_pending_idx;
create index push_outbox_pending_idx
on private.push_outbox (next_attempt_at, id)
where status = 'pending' and attempts < 20;

create table private.push_deliveries (
  id bigint generated always as identity primary key,
  outbox_id bigint not null references private.push_outbox(id) on delete cascade,
  device_token_id uuid references public.device_tokens(id) on delete set null,
  token_snapshot text not null check (char_length(token_snapshot) between 16 and 512),
  status text not null default 'queued' check (status in ('queued','sending','retry','ticketed','receipt_checking','delivered','suppressed','dead')),
  attempts smallint not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid,
  expo_ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  delivered_at timestamptz,
  dead_lettered_at timestamptz,
  last_error_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, token_snapshot)
);

create index push_deliveries_send_idx
on private.push_deliveries (next_attempt_at, id)
where status in ('queued','retry');

create index push_deliveries_receipt_idx
on private.push_deliveries (ticketed_at, id)
where status = 'ticketed';

revoke all on table private.push_deliveries from public, anon, authenticated;
revoke all on sequence private.push_deliveries_id_seq from public, anon, authenticated;

revoke all on function public.register_push_token(text,text) from public, anon, authenticated;
drop function public.register_push_token(text,text);

create or replace function public.register_push_token(p_token text,p_platform text,p_installation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized_token text := pg_catalog.btrim(p_token);
  token_row_id uuid;
  installation_row_id uuid;
  result_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Current Binder policies and an active account are required.' using errcode = '42501';
  end if;
  if p_installation_id is null then
    raise exception 'Installation ID is required.' using errcode = '22023';
  end if;
  if normalized_token is null or char_length(normalized_token) not between 16 and 512 then
    raise exception 'Invalid push token.' using errcode = '22023';
  end if;
  if p_platform not in ('android','ios') then
    raise exception 'Invalid push platform.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_token, 7101));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_installation_id::text, 7102));

  select id into token_row_id from public.device_tokens where token = normalized_token for update;
  select id into installation_row_id from public.device_tokens where installation_id = p_installation_id for update;

  if token_row_id is not null and installation_row_id is not null and token_row_id <> installation_row_id then
    delete from public.device_tokens where id = token_row_id;
    token_row_id := null;
  end if;

  if installation_row_id is not null then
    update public.device_tokens
    set user_id = uid,
        token = normalized_token,
        platform = p_platform,
        enabled = true,
        last_registered_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = installation_row_id
    returning id into result_id;
  elsif token_row_id is not null then
    update public.device_tokens
    set user_id = uid,
        installation_id = p_installation_id,
        platform = p_platform,
        enabled = true,
        last_registered_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = token_row_id
    returning id into result_id;
  else
    insert into public.device_tokens (user_id,token,platform,installation_id,enabled,last_registered_at,updated_at)
    values (uid,normalized_token,p_platform,p_installation_id,true,pg_catalog.clock_timestamp(),pg_catalog.clock_timestamp())
    returning id into result_id;
  end if;

  return result_id;
end;
$$;

revoke all on function public.register_push_token(text,text,uuid) from public, anon;
grant execute on function public.register_push_token(text,text,uuid) to authenticated;

create or replace function public.unregister_push_installation(p_installation_id uuid)
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
  set enabled = false, updated_at = pg_catalog.clock_timestamp()
  where user_id = auth.uid() and installation_id = p_installation_id;
end;
$$;

revoke all on function public.unregister_push_installation(uuid) from public, anon;
grant execute on function public.unregister_push_installation(uuid) to authenticated;

create or replace function public.get_match_messages_page(
  p_match_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  client_message_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_limit not between 1 and 100 then
    raise exception 'Message page limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both message cursor fields are required together.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.matches m
    where m.id = p_match_id and m.status = 'active' and uid in (m.user_low,m.user_high)
  ) then
    raise exception 'Active match membership required.' using errcode = '42501';
  end if;

  return query
  select msg.id,msg.match_id,msg.sender_id,msg.client_message_id,msg.body,msg.created_at
  from public.messages msg
  where msg.match_id = p_match_id
    and (p_before_created_at is null or (msg.created_at,msg.id) < (p_before_created_at,p_before_id))
  order by msg.created_at desc,msg.id desc
  limit p_limit;
end;
$$;

revoke all on function public.get_match_messages_page(uuid,timestamptz,uuid,integer) from public, anon;
grant execute on function public.get_match_messages_page(uuid,timestamptz,uuid,integer) to authenticated;

create or replace function private.enqueue_message_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid;
begin
  select case when m.user_low = new.sender_id then m.user_high else m.user_low end
  into recipient
  from public.matches m
  where m.id = new.match_id;

  if recipient is not null then
    insert into private.push_outbox (recipient_id,kind,match_id,message_id,dedupe_key)
    values (recipient,'new_message',new.match_id,new.id,new.id::text)
    on conflict (recipient_id,kind,dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.enqueue_match_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type = 'created' then
    insert into private.push_outbox (recipient_id,kind,match_id,dedupe_key)
    select m.user_low,'new_match',m.id,m.id::text from public.matches m where m.id = new.match_id
    union all
    select m.user_high,'new_match',m.id,m.id::text from public.matches m where m.id = new.match_id
    on conflict (recipient_id,kind,dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.enqueue_media_status_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.moderation_status is distinct from old.moderation_status
     and new.moderation_status in ('approved','rejected','removed') then
    insert into private.push_outbox (recipient_id,kind,match_id,message_id,dedupe_key,subject_id)
    values (
      new.user_id,
      'moderation_status',
      null,
      null,
      new.id::text || ':' || new.moderation_status || ':' || coalesce(new.moderated_at::text,pg_catalog.clock_timestamp()::text),
      new.id
    )
    on conflict (recipient_id,kind,dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_media_status_push() from public, anon, authenticated;
create trigger profile_media_enqueue_status_push
after update of moderation_status on public.profile_media
for each row execute function private.enqueue_media_status_push();

create or replace function private.enqueue_safety_warning_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid;
begin
  if new.action = 'warn' then
    select c.subject_user_id into recipient from private.moderation_cases c where c.id = new.case_id;
    if recipient is not null then
      insert into private.push_outbox (recipient_id,kind,match_id,message_id,dedupe_key,subject_id)
      values (recipient,'safety_alert',null,null,new.id::text,recipient)
      on conflict (recipient_id,kind,dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enqueue_safety_warning_push() from public, anon, authenticated;
create trigger moderation_actions_enqueue_safety_push
after insert on private.moderation_actions
for each row execute function private.enqueue_safety_warning_push();

create or replace function private.evaluate_push_gate(
  p_recipient_id uuid,
  p_kind text,
  p_match_id uuid,
  p_message_id uuid,
  p_at timestamptz
)
returns table (decision text,next_allowed_at timestamptz,reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pref public.notification_preferences%rowtype;
  account_status text;
  category_enabled boolean;
  local_now timestamp without time zone;
  local_end timestamp without time zone;
  quiet boolean;
begin
  select s.status into account_status from private.account_safety s where s.user_id = p_recipient_id;
  if account_status is null or account_status = 'deletion_requested' or (p_kind <> 'safety_alert' and account_status <> 'active') then
    return query select 'suppress'::text,null::timestamptz,'account_ineligible'::text;
    return;
  end if;

  if p_kind <> 'safety_alert' and not private.has_current_legal_acceptance(p_recipient_id) then
    return query select 'suppress'::text,null::timestamptz,'legal_ineligible'::text;
    return;
  end if;

  if p_kind in ('new_match','new_message') and not exists (
    select 1 from public.matches m
    where m.id = p_match_id and m.status = 'active' and p_recipient_id in (m.user_low,m.user_high)
  ) then
    return query select 'suppress'::text,null::timestamptz,'match_inactive'::text;
    return;
  end if;

  if p_kind = 'new_message' and not exists (
    select 1 from public.messages msg
    where msg.id = p_message_id and msg.match_id = p_match_id and msg.sender_id <> p_recipient_id
  ) then
    return query select 'suppress'::text,null::timestamptz,'message_ineligible'::text;
    return;
  end if;

  select p.* into pref from public.notification_preferences p where p.user_id = p_recipient_id;
  if not found then
    return query select 'suppress'::text,null::timestamptz,'preferences_missing'::text;
    return;
  end if;

  category_enabled := case p_kind
    when 'new_match' then pref.new_matches
    when 'new_message' then pref.messages
    when 'moderation_status' then pref.moderation
    when 'safety_alert' then pref.safety
    when 'product_notice' then pref.product
    else false
  end;

  if not pref.enabled or not category_enabled then
    return query select 'suppress'::text,null::timestamptz,'category_disabled'::text;
    return;
  end if;

  if pref.quiet_hours_enabled and p_kind <> 'safety_alert' then
    local_now := p_at at time zone pref.timezone;
    quiet := case
      when pref.quiet_start < pref.quiet_end then local_now::time >= pref.quiet_start and local_now::time < pref.quiet_end
      else local_now::time >= pref.quiet_start or local_now::time < pref.quiet_end
    end;
    if quiet then
      local_end := case
        when pref.quiet_start < pref.quiet_end then local_now::date + pref.quiet_end
        when local_now::time >= pref.quiet_start then (local_now::date + 1) + pref.quiet_end
        else local_now::date + pref.quiet_end
      end;
      return query select 'defer'::text,local_end at time zone pref.timezone,'quiet_hours'::text;
      return;
    end if;
  end if;

  return query select 'allow'::text,p_at,null::text;
end;
$$;

revoke all on function private.evaluate_push_gate(uuid,text,uuid,uuid,timestamptz) from public, anon, authenticated;

create or replace function private.refresh_push_outbox_state(p_outbox_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare pending_count bigint; delivered_count bigint; delivery_count bigint;
begin
  select
    count(*) filter (where status in ('queued','sending','retry','ticketed','receipt_checking')),
    count(*) filter (where status = 'delivered'),
    count(*)
  into pending_count,delivered_count,delivery_count
  from private.push_deliveries where outbox_id = p_outbox_id;

  if pending_count > 0 then
    update private.push_outbox set status = 'expanded' where id = p_outbox_id;
  elsif delivered_count > 0 then
    update private.push_outbox
    set status = 'delivered',dispatched_at = coalesce(dispatched_at,pg_catalog.clock_timestamp()),completed_at = pg_catalog.clock_timestamp()
    where id = p_outbox_id;
  elsif delivery_count > 0 then
    update private.push_outbox set status = 'dead',completed_at = pg_catalog.clock_timestamp() where id = p_outbox_id;
  end if;
end;
$$;

revoke all on function private.refresh_push_outbox_state(bigint) from public, anon, authenticated;

create or replace function private.recover_stale_push_claims()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovered record;
  recovered_count integer := 0;
begin
  for recovered in
    update private.push_deliveries
    set status = case when attempts < 8 then 'retry' else 'dead' end,
        next_attempt_at = case when attempts < 8 then pg_catalog.clock_timestamp() else next_attempt_at end,
        dead_lettered_at = case when attempts < 8 then dead_lettered_at else pg_catalog.clock_timestamp() end,
        claimed_at = null,
        claimed_by = null,
        last_error_code = 'worker_lease_expired',
        last_error = 'worker_lease_expired',
        updated_at = pg_catalog.clock_timestamp()
    where status = 'sending'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes'
    returning outbox_id
  loop
    recovered_count := recovered_count + 1;
    perform private.refresh_push_outbox_state(recovered.outbox_id);
  end loop;

  for recovered in
    update private.push_deliveries
    set status = 'ticketed',
        claimed_at = null,
        claimed_by = null,
        last_error_code = 'receipt_lease_expired',
        last_error = 'receipt_lease_expired',
        updated_at = pg_catalog.clock_timestamp()
    where status = 'receipt_checking'
      and claimed_at < pg_catalog.clock_timestamp() - interval '2 minutes'
    returning outbox_id
  loop
    recovered_count := recovered_count + 1;
  end loop;

  return recovered_count;
end;
$$;

revoke all on function private.recover_stale_push_claims() from public, anon, authenticated;

create or replace function private.expand_push_outbox(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job private.push_outbox%rowtype;
  gate record;
  inserted_count integer;
  expanded_count integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception 'Push expansion limit must be between 1 and 500.' using errcode = '22023';
  end if;

  for job in
    select o.* from private.push_outbox o
    where o.status = 'pending' and o.next_attempt_at <= pg_catalog.clock_timestamp() and o.attempts < 20
    order by o.next_attempt_at,o.id
    for update skip locked
    limit p_limit
  loop
    select * into gate from private.evaluate_push_gate(job.recipient_id,job.kind,job.match_id,job.message_id,pg_catalog.clock_timestamp());
    if gate.decision = 'suppress' then
      update private.push_outbox
      set status = 'suppressed',completed_at = pg_catalog.clock_timestamp(),last_error_code = gate.reason,last_error = gate.reason
      where id = job.id;
      continue;
    elsif gate.decision = 'defer' then
      update private.push_outbox set next_attempt_at = gate.next_allowed_at,last_error_code = gate.reason where id = job.id;
      continue;
    end if;

    insert into private.push_deliveries (outbox_id,device_token_id,token_snapshot)
    select job.id,t.id,t.token
    from public.device_tokens t
    where t.user_id = job.recipient_id and t.enabled
    on conflict (outbox_id,token_snapshot) do nothing;
    get diagnostics inserted_count = row_count;

    if not exists (select 1 from private.push_deliveries d where d.outbox_id = job.id) then
      update private.push_outbox
      set status = 'suppressed',completed_at = pg_catalog.clock_timestamp(),last_error_code = 'no_enabled_device',last_error = 'no_enabled_device'
      where id = job.id;
    else
      update private.push_outbox set status = 'expanded',attempts = attempts + 1,last_error_code = null,last_error = null where id = job.id;
      expanded_count := expanded_count + 1;
    end if;
  end loop;
  return expanded_count;
end;
$$;

revoke all on function private.expand_push_outbox(integer) from public, anon, authenticated;

create or replace function public.claim_push_deliveries(p_worker_id uuid,p_limit integer default 100)
returns table (
  delivery_id bigint,
  token text,
  kind text,
  match_id uuid,
  route text,
  title text,
  body text,
  sound boolean,
  vibration boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  gate record;
  pref public.notification_preferences%rowtype;
  emitted integer := 0;
begin
  if p_worker_id is null or p_limit not between 1 and 500 then
    raise exception 'Valid worker ID and limit are required.' using errcode = '22023';
  end if;

  perform private.recover_stale_push_claims();
  perform private.expand_push_outbox(least(p_limit * 2,500));

  for candidate in
    select d.id as delivery_id,d.token_snapshot,d.device_token_id,d.attempts,
           o.id as outbox_id,o.recipient_id,o.kind,o.match_id,o.message_id
    from private.push_deliveries d
    join private.push_outbox o on o.id = d.outbox_id
    where d.status in ('queued','retry') and d.next_attempt_at <= pg_catalog.clock_timestamp() and d.attempts < 8
    order by d.next_attempt_at,d.id
    for update of d skip locked
    limit p_limit
  loop
    if not exists (
      select 1 from public.device_tokens t
      where t.id = candidate.device_token_id
        and t.token = candidate.token_snapshot
        and t.user_id = candidate.recipient_id
        and t.enabled
    ) then
      update private.push_deliveries
      set status = 'suppressed',last_error_code = 'token_ownership_changed',last_error = 'token_ownership_changed',updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      perform private.refresh_push_outbox_state(candidate.outbox_id);
      continue;
    end if;

    select * into gate from private.evaluate_push_gate(candidate.recipient_id,candidate.kind,candidate.match_id,candidate.message_id,pg_catalog.clock_timestamp());
    if gate.decision = 'suppress' then
      update private.push_deliveries
      set status = 'suppressed',last_error_code = gate.reason,last_error = gate.reason,updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      perform private.refresh_push_outbox_state(candidate.outbox_id);
      continue;
    elsif gate.decision = 'defer' then
      update private.push_deliveries
      set status = 'retry',next_attempt_at = gate.next_allowed_at,last_error_code = gate.reason,updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      continue;
    end if;

    select p.* into pref from public.notification_preferences p where p.user_id = candidate.recipient_id;
    update private.push_deliveries
    set status = 'sending',attempts = attempts + 1,claimed_at = pg_catalog.clock_timestamp(),claimed_by = p_worker_id,updated_at = pg_catalog.clock_timestamp()
    where id = candidate.delivery_id;

    delivery_id := candidate.delivery_id;
    token := candidate.token_snapshot;
    kind := candidate.kind;
    match_id := candidate.match_id;
    route := case when candidate.kind = 'new_message' then 'chat' when candidate.kind = 'new_match' then 'matches' else 'profile' end;
    title := case candidate.kind
      when 'new_match' then 'It''s a Bind'
      when 'new_message' then 'New message'
      when 'moderation_status' then 'Photo update'
      when 'safety_alert' then 'Binder safety notice'
      else 'Binder update'
    end;
    body := case candidate.kind
      when 'new_match' then 'Open Binder to see your new match.'
      when 'new_message' then 'Open Binder to continue the conversation.'
      when 'moderation_status' then 'Your profile photo review has an update.'
      when 'safety_alert' then 'Open Binder to review an account safety update.'
      else 'Open Binder to see what changed.'
    end;
    sound := pref.sound;
    vibration := pref.vibration;
    emitted := emitted + 1;
    return next;
  end loop;
  return;
end;
$$;

revoke all on function public.claim_push_deliveries(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(uuid,integer) to service_role;

create or replace function private.push_retry_at(p_attempts integer)
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  select pg_catalog.clock_timestamp()
    + pg_catalog.make_interval(secs => least(3600,15 * pg_catalog.power(2,p_attempts)::integer));
$$;

revoke all on function private.push_retry_at(integer) from public, anon, authenticated;

create or replace function public.record_push_ticket(
  p_delivery_id bigint,
  p_worker_id uuid,
  p_ticket_id text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare delivery private.push_deliveries%rowtype;
begin
  select * into delivery from private.push_deliveries where id = p_delivery_id for update;
  if not found or delivery.status <> 'sending' or delivery.claimed_by is distinct from p_worker_id then
    raise exception 'Delivery is not claimed by this worker.' using errcode = '42501';
  end if;

  if p_error_code is null and p_ticket_id is not null then
    update private.push_deliveries
    set status = 'ticketed',expo_ticket_id = p_ticket_id,ticketed_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = null,last_error = null,updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update private.push_deliveries
    set status = 'dead',dead_lettered_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = p_error_code,last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
    update public.device_tokens set enabled = false,updated_at = pg_catalog.clock_timestamp() where token = delivery.token_snapshot;
  elsif p_retryable and delivery.attempts < 8 then
    update private.push_deliveries
    set status = 'retry',next_attempt_at = private.push_retry_at(delivery.attempts),claimed_by = null,claimed_at = null,last_error_code = coalesce(p_error_code,'transient_error'),last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  else
    update private.push_deliveries
    set status = 'dead',dead_lettered_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = coalesce(p_error_code,'permanent_error'),last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  end if;
  perform private.refresh_push_outbox_state(delivery.outbox_id);
end;
$$;

revoke all on function public.record_push_ticket(bigint,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.record_push_ticket(bigint,uuid,text,text,text,boolean) to service_role;

create or replace function public.claim_push_receipts(p_worker_id uuid,p_limit integer default 300)
returns table (delivery_id bigint,ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_worker_id is null or p_limit not between 1 and 1000 then
    raise exception 'Valid worker ID and limit are required.' using errcode = '22023';
  end if;
  perform private.recover_stale_push_claims();
  return query
  with claimed as (
    select d.id
    from private.push_deliveries d
    where d.status = 'ticketed' and d.ticketed_at <= pg_catalog.clock_timestamp() - interval '15 seconds'
    order by d.ticketed_at,d.id
    for update skip locked
    limit p_limit
  ), updated as (
    update private.push_deliveries d
    set status = 'receipt_checking',claimed_by = p_worker_id,claimed_at = pg_catalog.clock_timestamp(),updated_at = pg_catalog.clock_timestamp()
    from claimed c where d.id = c.id
    returning d.id,d.expo_ticket_id
  )
  select u.id,u.expo_ticket_id from updated u;
end;
$$;

revoke all on function public.claim_push_receipts(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_push_receipts(uuid,integer) to service_role;

create or replace function public.record_push_receipt(
  p_delivery_id bigint,
  p_worker_id uuid,
  p_ok boolean,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare delivery private.push_deliveries%rowtype;
begin
  select * into delivery from private.push_deliveries where id = p_delivery_id for update;
  if not found or delivery.status <> 'receipt_checking' or delivery.claimed_by is distinct from p_worker_id then
    raise exception 'Receipt is not claimed by this worker.' using errcode = '42501';
  end if;

  if p_ok then
    update private.push_deliveries
    set status = 'delivered',receipt_checked_at = pg_catalog.clock_timestamp(),delivered_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = null,last_error = null,updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  elsif p_error_code = 'ReceiptUnavailable' then
    update private.push_deliveries
    set status = 'ticketed',ticketed_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = p_error_code,last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update private.push_deliveries
    set status = 'dead',receipt_checked_at = pg_catalog.clock_timestamp(),dead_lettered_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = p_error_code,last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
    update public.device_tokens set enabled = false,updated_at = pg_catalog.clock_timestamp() where token = delivery.token_snapshot;
  elsif p_retryable and delivery.attempts < 8 then
    update private.push_deliveries
    set status = 'retry',next_attempt_at = private.push_retry_at(delivery.attempts),expo_ticket_id = null,ticketed_at = null,receipt_checked_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = coalesce(p_error_code,'transient_receipt_error'),last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  else
    update private.push_deliveries
    set status = 'dead',receipt_checked_at = pg_catalog.clock_timestamp(),dead_lettered_at = pg_catalog.clock_timestamp(),claimed_by = null,claimed_at = null,last_error_code = coalesce(p_error_code,'permanent_receipt_error'),last_error = left(p_error_message,500),updated_at = pg_catalog.clock_timestamp()
    where id = p_delivery_id;
  end if;
  perform private.refresh_push_outbox_state(delivery.outbox_id);
end;
$$;

revoke all on function public.record_push_receipt(bigint,uuid,boolean,text,text,boolean) from public, anon, authenticated;
grant execute on function public.record_push_receipt(bigint,uuid,boolean,text,text,boolean) to service_role;

commit;
