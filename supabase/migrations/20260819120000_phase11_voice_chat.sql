-- Voice messages in chat.
--
-- A voice message is a normal message whose payload lives in Storage: the
-- messages row carries kind='voice', the object's path and its duration, and
-- everything a message already has — idempotency, the advisory lock, both
-- rate limits, match membership, realtime — applies to voice for free
-- because it is the same table and the same send_message.

-- ── Schema ───────────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists kind text not null default 'text' check (kind in ('text','voice')),
  add column if not exists audio_path text,
  add column if not exists audio_duration_ms integer;

-- The payload coupling: a text message has a body and no audio; a voice
-- message has audio (1s to 60s) and an empty body. Nothing in between.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_payload_coupling;
alter table public.messages
  add constraint messages_payload_coupling check (
    (kind = 'text' and audio_path is null and audio_duration_ms is null
      and char_length(trim(body)) between 1 and 2000)
    or
    (kind = 'voice' and audio_path is not null and body = ''
      and audio_duration_ms between 1000 and 60000)
  );

-- ── Bucket ───────────────────────────────────────────────────────────────────
-- 60 s of AAC is well under 1 MiB; 2 MiB leaves headroom without inviting
-- abuse. Paths are {match_id}/{sender_id}/{uuid}.m4a.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-media', 'voice-media', false, 2097152, array['audio/mp4','audio/x-m4a','audio/m4a','audio/mp4a-latm'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage rules ────────────────────────────────────────────────────────────
-- Write: only into an active match you belong to, under your own folder,
-- with an active account and current legal acceptance — the same bar
-- send_message itself sets.
drop policy if exists voice_media_insert_member on storage.objects;
create policy voice_media_insert_member on storage.objects for insert to authenticated
with check (
  bucket_id = 'voice-media'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and private.has_current_legal_acceptance((select auth.uid()))
  and exists (
    select 1 from public.matches m
    where m.id::text = (storage.foldername(name))[1]
      and m.status = 'active'
      and (select auth.uid()) in (m.user_low, m.user_high)
  )
);

-- Read: both members of the match, as long as they are members. An ended
-- match keeps its transcript, so playback stays with the conversation.
drop policy if exists voice_media_read_member on storage.objects;
create policy voice_media_read_member on storage.objects for select to authenticated
using (
  bucket_id = 'voice-media'
  and exists (
    select 1 from public.matches m
    where m.id::text = (storage.foldername(name))[1]
      and (select auth.uid()) in (m.user_low, m.user_high)
  )
);

-- Moderators with review_media may read a voice object exactly when a
-- messages row references it — mirrors the photo rule.
create or replace function private.admin_can_read_voice_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_has_permission('review_media')
    and exists (
      select 1 from public.messages msg where msg.audio_path = p_storage_path
    );
$$;

revoke all on function private.admin_can_read_voice_object(text) from public, anon;
grant execute on function private.admin_can_read_voice_object(text) to authenticated;

drop policy if exists voice_media_read_admin on storage.objects;
create policy voice_media_read_admin on storage.objects for select to authenticated
using (bucket_id = 'voice-media' and private.admin_can_read_voice_object(name));

-- ── Reference guard ──────────────────────────────────────────────────────────
-- The messages row may only point at an object that exists, lives in the
-- right bucket, and sits under this match and this sender — the mirror of
-- guard_profile_media_reference.
create or replace function public.guard_voice_message_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> 'voice' then
    return new;
  end if;

  if split_part(new.audio_path, '/', 1) <> new.match_id::text
     or split_part(new.audio_path, '/', 2) <> new.sender_id::text then
    raise exception 'Voice path must belong to this match and sender.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'voice-media' and so.name = new.audio_path
  ) then
    raise exception 'Voice object must exist before the message is saved.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists voice_message_reference_guard on public.messages;
create trigger voice_message_reference_guard
before insert or update of audio_path, kind on public.messages
for each row execute function public.guard_voice_message_reference();

-- ── send_message ─────────────────────────────────────────────────────────────
-- Derived from the production definition of 2026-08-18; one signature with
-- defaults (the overload rule), so the shipped three-argument text call keeps
-- working unchanged. The return rows gain the voice columns at the end.
drop function if exists public.send_message(uuid, uuid, text);

CREATE FUNCTION public.send_message(p_match_id uuid, p_client_message_id uuid, p_body text DEFAULT NULL, p_kind text DEFAULT 'text', p_audio_path text DEFAULT NULL, p_audio_duration_ms integer DEFAULT NULL)
 RETURNS TABLE(id uuid, match_id uuid, sender_id uuid, body text, created_at timestamp with time zone, kind text, audio_path text, audio_duration_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid(); low_user uuid; high_user uuid; match_status text;
  existing public.messages%rowtype; inserted public.messages%rowtype;
begin
  if uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_match_id is null or p_client_message_id is null then raise exception 'Match and client message IDs are required.' using errcode='22023'; end if;
  if p_kind not in ('text','voice') then raise exception 'Unknown message kind.' using errcode='22023'; end if;
  if p_kind = 'text' then
    if p_body is null or char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Message must contain 1 to 2000 characters.' using errcode='23514'; end if;
  else
    if p_audio_path is null or p_audio_duration_ms is null or p_audio_duration_ms not between 1000 and 60000 then
      raise exception 'Voice messages need an audio object and a duration between 1 and 60 seconds.' using errcode='23514';
    end if;
    if p_body is not null and trim(p_body) <> '' then
      raise exception 'A voice message carries no text body.' using errcode='23514';
    end if;
  end if;

  select m.* into existing from public.messages m where m.sender_id=uid and m.client_message_id=p_client_message_id;
  if found then
    if existing.match_id<>p_match_id or existing.kind<>p_kind or (p_kind='text' and existing.body<>trim(p_body)) or (p_kind='voice' and existing.audio_path<>p_audio_path) then raise exception 'Client message ID was already used for a different payload.' using errcode='23505'; end if;
    return query select existing.id,existing.match_id,existing.sender_id,existing.body,existing.created_at,existing.kind,existing.audio_path,existing.audio_duration_ms; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text),117953);

  select m.* into existing from public.messages m where m.sender_id=uid and m.client_message_id=p_client_message_id;
  if found then
    if existing.match_id<>p_match_id or existing.kind<>p_kind or (p_kind='text' and existing.body<>trim(p_body)) or (p_kind='voice' and existing.audio_path<>p_audio_path) then raise exception 'Client message ID was already used for a different payload.' using errcode='23505'; end if;
    return query select existing.id,existing.match_id,existing.sender_id,existing.body,existing.created_at,existing.kind,existing.audio_path,existing.audio_duration_ms; return;
  end if;

  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Current Binder terms and an active account are required before sending content.' using errcode='42501';
  end if;

  select m.user_low,m.user_high,m.status into low_user,high_user,match_status from public.matches m where m.id=p_match_id for update;
  if not found or uid not in (low_user,high_user) then raise exception 'Active match membership required.' using errcode='42501'; end if;
  if match_status<>'active' then raise exception 'This conversation is no longer active.' using errcode='23514'; end if;
  if not private.is_account_active(case when uid=low_user then high_user else low_user end)
     or not private.has_current_legal_acceptance(case when uid=low_user then high_user else low_user end) then
    raise exception 'This conversation is temporarily unavailable.' using errcode='23514';
  end if;
  if (select count(*) from public.messages m where m.sender_id=uid and m.created_at>now()-interval '1 minute')>=20 then raise exception 'Message rate limit exceeded.' using errcode='54000'; end if;
  if (select count(*) from public.messages m where m.sender_id=uid and m.created_at>now()-interval '1 hour')>=300 then raise exception 'Hourly message rate limit exceeded.' using errcode='54000'; end if;
  insert into public.messages(match_id,sender_id,client_message_id,body,kind,audio_path,audio_duration_ms)
  values(p_match_id,uid,p_client_message_id,case when p_kind='text' then trim(p_body) else '' end,p_kind,p_audio_path,p_audio_duration_ms)
  returning * into inserted;
  return query select inserted.id,inserted.match_id,inserted.sender_id,inserted.body,inserted.created_at,inserted.kind,inserted.audio_path,inserted.audio_duration_ms;
end;
$function$

;

revoke all on function public.send_message(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.send_message(uuid, uuid, text, text, text, integer) to authenticated;

-- ── get_match_messages_page ──────────────────────────────────────────────────
drop function if exists public.get_match_messages_page(uuid, timestamptz, uuid, integer);

CREATE FUNCTION public.get_match_messages_page(p_match_id uuid, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, match_id uuid, sender_id uuid, client_message_id uuid, body text, created_at timestamp with time zone, kind text, audio_path text, audio_duration_ms integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select msg.id,msg.match_id,msg.sender_id,msg.client_message_id,msg.body,msg.created_at,msg.kind,msg.audio_path,msg.audio_duration_ms
  from public.messages msg
  where msg.match_id = p_match_id
    and (p_before_created_at is null or (msg.created_at,msg.id) < (p_before_created_at,p_before_id))
  order by msg.created_at desc,msg.id desc
  limit p_limit;
end;
$function$

;

revoke all on function public.get_match_messages_page(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_match_messages_page(uuid, timestamptz, uuid, integer) to authenticated;

-- ── get_my_matches ───────────────────────────────────────────────────────────
-- The preview text of a voice message is empty on purpose: the client says
-- "voice message" in the viewer's language; the server has no language.
drop function if exists public.get_my_matches();

CREATE FUNCTION public.get_my_matches()
 RETURNS TABLE(match_id uuid, other_user_id uuid, first_name text, age integer, bio text, primary_photo_path text, matched_at timestamp with time zone, last_message_body text, last_message_at timestamp with time zone, unread_count bigint, last_message_kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        and (read_state.last_read_at is null or unread.created_at > read_state.last_read_at)
    ),
    last_message.kind
  from mine
  join public.profiles p on p.user_id = mine.other_id
  join public.user_private pr on pr.user_id = mine.other_id
  left join public.match_read_state read_state
    on read_state.match_id = mine.id and read_state.user_id = auth.uid()
  left join lateral (
    select pm.storage_path
    from public.profile_media pm
    where pm.user_id = mine.other_id and pm.position = 0
    limit 1
  ) media on true
  left join lateral (
    select msg.body, msg.created_at, msg.kind
    from public.messages msg
    where msg.match_id = mine.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) last_message on true
  order by coalesce(last_message.created_at, mine.created_at) desc, mine.id;
$function$

;

revoke all on function public.get_my_matches() from public, anon;
grant execute on function public.get_my_matches() to authenticated;

-- ── report_user ──────────────────────────────────────────────────────────────
-- Verbatim production definition; only the message snapshot line changes so a
-- reported voice message leaves a named trace. The audio object itself is not
-- copied — deleting the account removes the content, the audit row stays.
CREATE OR REPLACE FUNCTION public.report_user(p_reported_id uuid, p_reason text, p_details text DEFAULT ''::text, p_match_id uuid DEFAULT NULL::uuid, p_message_id uuid DEFAULT NULL::uuid, p_block boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select m.match_id, m.sender_id,
      case when m.kind = 'voice' then '[voice] ' || m.audio_path || ' (' || m.audio_duration_ms || ' ms)' else m.body end
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
$function$

;
