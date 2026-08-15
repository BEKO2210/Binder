begin;

create table private.account_safety (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended','deletion_requested')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.account_safety from public, anon, authenticated;

insert into private.account_safety (user_id, status)
select id, 'active' from auth.users
on conflict (user_id) do nothing;

create or replace function private.initialize_account_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.account_safety (user_id, status)
  values (new.id, 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.initialize_account_safety() from public, anon, authenticated;

create trigger binder_auth_user_safety
after insert on auth.users
for each row execute function private.initialize_account_safety();

create table public.legal_acceptances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now()
);

alter table public.legal_acceptances enable row level security;
create policy legal_acceptances_self_select
on public.legal_acceptances for select to authenticated
using (user_id = (select auth.uid()));
revoke all privileges on table public.legal_acceptances from anon, authenticated;
grant select on table public.legal_acceptances to authenticated;

create or replace function private.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-08-15'::text $$;

create or replace function private.current_privacy_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-08-15'::text $$;

create or replace function private.is_account_active(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.account_safety s
    where s.user_id = target_user_id and s.status = 'active'
  );
$$;

create or replace function private.has_current_legal_acceptance(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.legal_acceptances a
    where a.user_id = target_user_id
      and a.terms_version = private.current_terms_version()
      and a.privacy_version = private.current_privacy_version()
  );
$$;

revoke all on function private.current_terms_version() from public, anon, authenticated;
revoke all on function private.current_privacy_version() from public, anon, authenticated;
revoke all on function private.is_account_active(uuid) from public, anon;
revoke all on function private.has_current_legal_acceptance(uuid) from public, anon;
grant execute on function private.is_account_active(uuid) to authenticated;
grant execute on function private.has_current_legal_acceptance(uuid) to authenticated;

create or replace function public.get_legal_gate()
returns table (terms_version text, privacy_version text, accepted boolean)
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
  select private.current_terms_version(), private.current_privacy_version(), private.has_current_legal_acceptance(uid);
end;
$$;

create or replace function public.accept_legal_terms(p_terms_version text, p_privacy_version text)
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
  if not private.is_account_active(uid) then
    raise exception 'Account is not active.' using errcode = '42501';
  end if;
  if p_terms_version is distinct from private.current_terms_version()
     or p_privacy_version is distinct from private.current_privacy_version() then
    raise exception 'Current Binder policies must be accepted.' using errcode = '23514';
  end if;
  insert into public.legal_acceptances (user_id, terms_version, privacy_version, accepted_at)
  values (uid, p_terms_version, p_privacy_version, pg_catalog.clock_timestamp())
  on conflict (user_id) do update
  set terms_version = excluded.terms_version,
      privacy_version = excluded.privacy_version,
      accepted_at = excluded.accepted_at;
end;
$$;

revoke all on function public.get_legal_gate() from public, anon;
revoke all on function public.accept_legal_terms(text,text) from public, anon;
grant execute on function public.get_legal_gate() to authenticated;
grant execute on function public.accept_legal_terms(text,text) to authenticated;

create table private.moderation_cases (
  id bigint generated always as identity primary key,
  source_type text not null check (source_type in ('report','photo_review')),
  report_id uuid references public.reports(id) on delete cascade,
  media_id uuid references public.profile_media(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  priority smallint not null default 50 check (priority between 0 and 100),
  status text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source_type = 'report' and report_id is not null) or (source_type = 'photo_review' and media_id is not null))
);

create index moderation_cases_open_idx on private.moderation_cases (priority desc, created_at, id) where status in ('open','reviewing');
create index moderation_cases_subject_idx on private.moderation_cases (subject_user_id, created_at desc);

create table private.moderation_actions (
  id bigint generated always as identity primary key,
  case_id bigint not null references private.moderation_cases(id) on delete cascade,
  action text not null check (action in ('approve_media','reject_media','remove_media','warn','suspend','dismiss')),
  actor text not null default 'operator',
  notes text,
  created_at timestamptz not null default now()
);

revoke all on table private.moderation_cases from public, anon, authenticated;
revoke all on table private.moderation_actions from public, anon, authenticated;

alter table public.profile_media
  add column moderation_status text not null default 'approved' check (moderation_status in ('pending','approved','rejected','removed')),
  add column moderation_reason text,
  add column moderated_at timestamptz;

alter table public.profile_media alter column moderation_status set default 'pending';

create or replace function private.guard_profile_media_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is not null then
    if new.user_id <> uid then
      raise exception 'Own media only.' using errcode = '42501';
    end if;
    if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
      raise exception 'Current Binder terms and an active account are required before uploading content.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' or old.storage_path is distinct from new.storage_path then
    new.moderation_status := 'pending';
    new.moderation_reason := null;
    new.moderated_at := null;
  elsif uid is not null and (
    new.moderation_status is distinct from old.moderation_status
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at is distinct from old.moderated_at
  ) then
    raise exception 'Media moderation state is server-controlled.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_profile_media_moderation() from public, anon, authenticated;
create trigger profile_media_moderation_guard
before insert or update on public.profile_media
for each row execute function private.guard_profile_media_moderation();

create or replace function private.queue_profile_media_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.storage_path is distinct from new.storage_path then
    insert into private.moderation_cases (source_type, media_id, subject_user_id, priority)
    values ('photo_review', new.id, new.user_id, 40);
  end if;
  return new;
end;
$$;

revoke all on function private.queue_profile_media_review() from public, anon, authenticated;
create trigger profile_media_queue_review
after insert or update on public.profile_media
for each row execute function private.queue_profile_media_review();

create or replace function private.queue_report_for_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.moderation_cases (source_type, report_id, subject_user_id, priority)
  values (
    'report', new.id, new.reported_id,
    case new.reason
      when 'underage' then 100
      when 'violence' then 90
      when 'sexual_content' then 80
      when 'harassment' then 70
      else 50
    end
  );
  return new;
end;
$$;

revoke all on function private.queue_report_for_moderation() from public, anon, authenticated;
create trigger reports_queue_moderation
after insert on public.reports
for each row execute function private.queue_report_for_moderation();

create or replace function private.enforce_profile_ugc_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is not null then
    if new.user_id <> uid then
      raise exception 'Own profile only.' using errcode = '42501';
    end if;
    if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
      raise exception 'Current Binder terms and an active account are required before creating profile content.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_profile_ugc_gate() from public, anon, authenticated;
create trigger profiles_ugc_gate
before insert or update of first_name, bio, gender, interests on public.profiles
for each row execute function private.enforce_profile_ugc_gate();

create or replace function private.lock_account_safety_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(new.user_id::text), 117953);
  return new;
end;
$$;

create or replace function private.apply_account_restriction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  if new.status <> 'active' and old.status is distinct from new.status then
    update public.profiles set onboarding_complete = false where user_id = new.user_id;
    update public.matches
      set status = 'unmatched', ended_at = pg_catalog.clock_timestamp()
      where status = 'active' and new.user_id in (user_low, user_high);
    update public.device_tokens set enabled = false, updated_at = pg_catalog.clock_timestamp() where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function private.lock_account_safety_transition() from public, anon, authenticated;
revoke all on function private.apply_account_restriction() from public, anon, authenticated;
create trigger account_safety_lock before update of status on private.account_safety for each row execute function private.lock_account_safety_transition();
create trigger account_safety_restriction before update on private.account_safety for each row execute function private.apply_account_restriction();

create or replace function public.prepare_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  update private.account_safety
  set status = 'deletion_requested', reason = 'user_request'
  where user_id = uid;
  if not found then
    raise exception 'Account safety record missing.' using errcode = '23514';
  end if;
  return true;
end;
$$;

revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.prepare_account_deletion() to authenticated;

create or replace function private.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when target_user_id = auth.uid() then true
    else
      private.is_account_active(auth.uid())
      and private.has_current_legal_acceptance(auth.uid())
      and private.is_account_active(target_user_id)
      and private.has_current_legal_acceptance(target_user_id)
      and exists (
        select 1 from public.profiles p
        where p.user_id = target_user_id and p.onboarding_complete = true
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = target_user_id)
           or (b.blocker_id = target_user_id and b.blocked_id = auth.uid())
      )
  end;
$$;

create or replace function private.is_discovery_candidate(viewer_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_account_active(viewer_id)
    and private.has_current_legal_acceptance(viewer_id)
    and private.is_account_active(target_user_id)
    and private.has_current_legal_acceptance(target_user_id)
    and exists (
    select 1
    from public.profiles viewer_profile
    join public.user_private viewer_private on viewer_private.user_id = viewer_profile.user_id
    join public.user_preferences viewer_preferences on viewer_preferences.user_id = viewer_profile.user_id
    join public.profiles target_profile on target_profile.user_id = target_user_id
    join public.user_private target_private on target_private.user_id = target_profile.user_id
    join public.user_preferences target_preferences on target_preferences.user_id = target_profile.user_id
    where viewer_profile.user_id = viewer_id
      and viewer_id <> target_user_id
      and viewer_profile.onboarding_complete = true
      and target_profile.onboarding_complete = true
      and viewer_private.location is not null and target_private.location is not null
      and viewer_private.location_updated_at >= now() - interval '30 days'
      and target_private.location_updated_at >= now() - interval '30 days'
      and target_profile.gender = any(viewer_preferences.interested_in)
      and viewer_profile.gender = any(target_preferences.interested_in)
      and extract(year from age(current_date, target_private.birth_date))::integer between viewer_preferences.min_age and viewer_preferences.max_age
      and extract(year from age(current_date, viewer_private.birth_date))::integer between target_preferences.min_age and target_preferences.max_age
      and extensions.st_dwithin(viewer_private.location,target_private.location,least(viewer_preferences.max_distance_km,target_preferences.max_distance_km)::double precision * 1000.0)
      and exists (select 1 from public.profile_media pm where pm.user_id = viewer_id and pm.position = 0 and pm.moderation_status = 'approved')
      and exists (select 1 from public.profile_media pm where pm.user_id = target_user_id and pm.position = 0 and pm.moderation_status = 'approved')
      and not exists (select 1 from public.blocks b where (b.blocker_id = viewer_id and b.blocked_id = target_user_id) or (b.blocker_id = target_user_id and b.blocked_id = viewer_id))
      and not exists (select 1 from public.decisions d where d.actor_id = viewer_id and d.target_id = target_user_id)
      and not exists (select 1 from public.matches m where m.user_low = least(viewer_id,target_user_id) and m.user_high = greatest(viewer_id,target_user_id) and m.status = 'active')
  );
$$;

revoke all on function private.can_view_profile(uuid) from public, anon;
revoke all on function private.is_discovery_candidate(uuid,uuid) from public, anon;
grant execute on function private.can_view_profile(uuid) to authenticated;
grant execute on function private.is_discovery_candidate(uuid,uuid) to authenticated;

drop policy if exists media_visible_profiles_select on public.profile_media;
create policy media_visible_profiles_select on public.profile_media for select to authenticated
using (user_id = (select auth.uid()) or (moderation_status = 'approved' and private.can_view_profile(user_id)));

drop policy if exists profile_media_objects_read_visible on storage.objects;
create policy profile_media_objects_read_visible on storage.objects for select to authenticated
using (
  bucket_id = 'profile-media' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profile_media pm
      where pm.storage_path = name and pm.moderation_status = 'approved' and private.can_view_profile(pm.user_id)
    )
  )
);

drop policy if exists profile_media_objects_insert_own_folder on storage.objects;
create policy profile_media_objects_insert_own_folder on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and private.has_current_legal_acceptance((select auth.uid()))
);

drop policy if exists profile_media_objects_update_own_folder on storage.objects;
create policy profile_media_objects_update_own_folder on storage.objects for update to authenticated
using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and private.is_account_active((select auth.uid()))
  and private.has_current_legal_acceptance((select auth.uid()))
);

create or replace function public.send_message(p_match_id uuid,p_client_message_id uuid,p_body text)
returns table (id uuid,match_id uuid,sender_id uuid,body text,created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid(); low_user uuid; high_user uuid; match_status text;
  existing public.messages%rowtype; inserted public.messages%rowtype;
begin
  if uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_match_id is null or p_client_message_id is null then raise exception 'Match and client message IDs are required.' using errcode='22023'; end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 2000 then raise exception 'Message must contain 1 to 2000 characters.' using errcode='23514'; end if;

  select m.* into existing from public.messages m where m.sender_id=uid and m.client_message_id=p_client_message_id;
  if found then
    if existing.match_id<>p_match_id or existing.body<>trim(p_body) then raise exception 'Client message ID was already used for a different payload.' using errcode='23505'; end if;
    return query select existing.id,existing.match_id,existing.sender_id,existing.body,existing.created_at; return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(uid::text),117953);

  select m.* into existing from public.messages m where m.sender_id=uid and m.client_message_id=p_client_message_id;
  if found then
    if existing.match_id<>p_match_id or existing.body<>trim(p_body) then raise exception 'Client message ID was already used for a different payload.' using errcode='23505'; end if;
    return query select existing.id,existing.match_id,existing.sender_id,existing.body,existing.created_at; return;
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
  insert into public.messages(match_id,sender_id,client_message_id,body) values(p_match_id,uid,p_client_message_id,trim(p_body)) returning * into inserted;
  return query select inserted.id,inserted.match_id,inserted.sender_id,inserted.body,inserted.created_at;
end;
$$;

revoke all on function public.send_message(uuid,uuid,text) from public,anon;
grant execute on function public.send_message(uuid,uuid,text) to authenticated;

commit;
