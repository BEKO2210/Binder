-- The voice intro: up to sixty seconds of yourself, on your profile.
--
-- Owner decision, recorded in AGENTS.md: intros are visible IMMEDIATELY and
-- moderated through reports, not through a pre-approval queue like photos.
-- The report path therefore carries the intro with it: the profile snapshot
-- names the path, moderators with review_media can listen to exactly the
-- intros a row references, and a report case gains a remove_voice_intro
-- action that takes the intro down and leaves an audit row.

-- ── Table ────────────────────────────────────────────────────────────────────
create table if not exists public.profile_audio (
  user_id uuid primary key references auth.users(id) on delete cascade,
  storage_path text not null,
  duration_ms integer not null check (duration_ms between 1000 and 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_audio enable row level security;

-- This project strips default table privileges; RLS narrows what a grant
-- allows, it does not replace the grant. Reads only — writes go through the
-- definer RPCs below.
grant select on table public.profile_audio to authenticated, service_role;

-- Readable wherever the profile itself is; written only through the RPCs.
drop policy if exists profile_audio_select_visible on public.profile_audio;
create policy profile_audio_select_visible on public.profile_audio for select to authenticated
using (user_id = (select auth.uid()) or private.can_view_profile(user_id));

-- ── Bucket ───────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-voice', 'profile-voice', false, 2097152, array['audio/mp4','audio/x-m4a','audio/m4a','audio/mp4a-latm'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_voice_insert_own on storage.objects;
create policy profile_voice_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-voice'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and private.has_current_legal_acceptance((select auth.uid()))
);

drop policy if exists profile_voice_delete_own on storage.objects;
create policy profile_voice_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'profile-voice' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Immediately visible: whoever may view the profile may hear the intro the
-- row references. An uploaded object nobody references stays owner-only.
drop policy if exists profile_voice_read_visible on storage.objects;
create policy profile_voice_read_visible on storage.objects for select to authenticated
using (
  bucket_id = 'profile-voice'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profile_audio pa
      where pa.storage_path = name and private.can_view_profile(pa.user_id)
    )
  )
);

-- Moderators reach chat voice AND intro objects through the one function.
create or replace function private.admin_can_read_voice_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_has_permission('review_media')
    and (
      exists (select 1 from public.messages msg where msg.audio_path = p_storage_path)
      or exists (select 1 from public.profile_audio pa where pa.storage_path = p_storage_path)
    );
$$;

drop policy if exists profile_voice_read_admin on storage.objects;
create policy profile_voice_read_admin on storage.objects for select to authenticated
using (bucket_id = 'profile-voice' and private.admin_can_read_voice_object(name));

-- ── The owner's RPCs ─────────────────────────────────────────────────────────
create or replace function public.set_my_voice_intro(p_storage_path text, p_duration_ms integer)
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
  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Current Binder terms and an active account are required before sharing content.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = uid and p.onboarding_complete = true) then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;
  if p_duration_ms is null or p_duration_ms not between 1000 and 60000 then
    raise exception 'Voice intros run from one second to one minute.' using errcode = '23514';
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> uid::text then
    raise exception 'Voice path must belong to the authenticated user.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'profile-voice' and so.name = p_storage_path
  ) then
    raise exception 'Voice object must exist before the intro is saved.' using errcode = '23514';
  end if;
  if exists (select 1 from private.removed_voice_intros rvi where rvi.storage_path = p_storage_path) then
    raise exception 'This recording was removed by moderation.' using errcode = '23514';
  end if;

  insert into public.profile_audio (user_id, storage_path, duration_ms)
  values (uid, p_storage_path, p_duration_ms)
  on conflict (user_id) do update
  set storage_path = excluded.storage_path,
      duration_ms = excluded.duration_ms,
      updated_at = now();
end;
$$;

revoke all on function public.set_my_voice_intro(text, integer) from public, anon;
grant execute on function public.set_my_voice_intro(text, integer) to authenticated;

create or replace function public.clear_my_voice_intro()
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
  delete from public.profile_audio where user_id = uid;
end;
$$;

revoke all on function public.clear_my_voice_intro() from public, anon;
grant execute on function public.clear_my_voice_intro() to authenticated;

-- ── Report-based removal ─────────────────────────────────────────────────────
alter table private.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table private.moderation_actions
  add constraint moderation_actions_action_check
  check (action in ('approve_media','reject_media','remove_media','warn','suspend','dismiss','remove_voice_intro'));

-- Removal cannot delete the storage object — SQL deletion of storage rows is
-- blocked project-wide, photos work the same way. What removal does: the row
-- disappears (nobody but the owner can hear the object any more) and the
-- path lands on a ban list so the same recording cannot simply be set again.
-- Account deletion and the owner's own replace/delete clean the object up.
create table if not exists private.removed_voice_intros (
  storage_path text primary key,
  case_id bigint references private.moderation_cases(id) on delete set null,
  created_at timestamptz not null default now()
);
revoke all on table private.removed_voice_intros from public, anon, authenticated;

create or replace function public.admin_remove_voice_intro(p_case_id bigint, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject uuid;
  intro_path text;
begin
  perform private.require_admin_permission('review_media');
  if char_length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'A moderation reason is required.' using errcode = '23514';
  end if;

  select c.subject_user_id into subject
  from private.moderation_cases c
  where c.id = p_case_id and c.source_type = 'report';
  if subject is null then
    raise exception 'Report case with a subject required.' using errcode = '22023';
  end if;

  select pa.storage_path into intro_path from public.profile_audio pa where pa.user_id = subject;
  if intro_path is null then
    raise exception 'This profile has no voice intro.' using errcode = '22023';
  end if;

  delete from public.profile_audio where user_id = subject;
  insert into private.removed_voice_intros (storage_path, case_id)
  values (intro_path, p_case_id)
  on conflict (storage_path) do nothing;

  insert into private.moderation_actions (case_id, action, actor, notes)
  values (p_case_id, 'remove_voice_intro', private.current_admin_actor(), trim(p_notes));

  update private.moderation_cases set status = 'actioned', updated_at = now() where id = p_case_id;
end;
$$;

revoke all on function public.admin_remove_voice_intro(bigint, text) from public, anon;
grant execute on function public.admin_remove_voice_intro(bigint, text) to authenticated;

-- ── get_public_profile ───────────────────────────────────────────────────────
-- Derived from the production definition; the intro columns append.
drop function if exists public.get_public_profile(uuid);

CREATE FUNCTION public.get_public_profile(target_user_id uuid)
 RETURNS TABLE(user_id uuid, first_name text, age integer, bio text, gender text, interests text[], height_cm smallint, zodiac text, smoking text, drinking text, drugs text, activity text, diet text, spirituality text, children_has text, children_wants text, car text, voice_path text, voice_duration_ms integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p.user_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    p.gender,
    p.interests,
    p.height_cm,
    private.zodiac_sign(pr.birth_date),
    p.smoking,
    p.drinking,
    p.drugs,
    p.activity,
    p.diet,
    p.spirituality,
    p.children_has,
    p.children_wants,
    p.car,
    pa.storage_path,
    pa.duration_ms
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  left join public.profile_audio pa on pa.user_id = p.user_id
  where p.user_id = target_user_id
    and private.can_view_profile(target_user_id);
$function$

;

revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;

-- ── report_user ──────────────────────────────────────────────────────────────
-- Verbatim production definition; the profile snapshot now names the intro,
-- so the moderation queue knows there is something to listen to.
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
    'interests', p.interests,
    'voice_intro_path', pa.storage_path,
    'voice_intro_duration_ms', pa.duration_ms
  )
  into profile_snapshot
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  left join public.profile_audio pa on pa.user_id = p.user_id
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
