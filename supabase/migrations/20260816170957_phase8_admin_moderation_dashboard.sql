begin;

-- The admin dashboard is a public static application, so authorization must
-- live entirely in Postgres. This table is private and is never exposed through
-- the Data API. The first owner is bootstrapped by confirmed email; moderators
-- can only be added by that owner through the RPC/Edge Function boundary below.
create table private.admin_members (
  email text primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  role text not null check (role in ('owner', 'moderator')),
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  can_review_media boolean not null default false,
  can_review_reports boolean not null default false,
  can_suspend_accounts boolean not null default false,
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(trim(email))),
  check (char_length(email) between 5 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  check (not can_suspend_accounts or can_review_reports),
  check (role <> 'owner' or (can_review_media and can_review_reports and can_suspend_accounts)),
  check (status <> 'active' or user_id is not null),
  check ((status = 'disabled') = (disabled_at is not null))
);

create unique index admin_members_single_owner_idx
on private.admin_members (role)
where role = 'owner';

revoke all on table private.admin_members from public, anon, authenticated;

create or replace function private.normalize_admin_membership_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and old.user_id is not null and new.status = 'active' then
    new.status := 'invited';
    new.activated_at := null;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function private.normalize_admin_membership_identity() from public, anon, authenticated;
create trigger admin_members_identity_normalization
before update of user_id on private.admin_members
for each row execute function private.normalize_admin_membership_identity();

insert into private.admin_members as current_member (
  email, user_id, role, status,
  can_review_media, can_review_reports, can_suspend_accounts,
  activated_at
)
values (
  'belkis.aslani@gmail.com',
  (select u.id from auth.users u where lower(u.email) = 'belkis.aslani@gmail.com' and u.email_confirmed_at is not null limit 1),
  'owner',
  case when exists (
    select 1 from auth.users u
    where lower(u.email) = 'belkis.aslani@gmail.com' and u.email_confirmed_at is not null
  ) then 'active' else 'invited' end,
  true, true, true,
  case when exists (
    select 1 from auth.users u
    where lower(u.email) = 'belkis.aslani@gmail.com' and u.email_confirmed_at is not null
  ) then pg_catalog.clock_timestamp() else null end
)
on conflict (email) do update
set user_id = coalesce(excluded.user_id, current_member.user_id),
    role = 'owner',
    status = case when coalesce(excluded.user_id, current_member.user_id) is null then 'invited' else 'active' end,
    can_review_media = true,
    can_review_reports = true,
    can_suspend_accounts = true,
    activated_at = coalesce(current_member.activated_at, excluded.activated_at),
    disabled_at = null,
    updated_at = pg_catalog.clock_timestamp();

create or replace function private.admin_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.admin_members m
    join auth.users u on u.id = m.user_id
    where m.user_id = auth.uid()
      and m.status = 'active'
      and u.email_confirmed_at is not null
      and lower(u.email) = m.email
      and case p_permission
        when 'dashboard' then true
        when 'review_media' then m.can_review_media
        when 'review_reports' then m.can_review_reports
        when 'suspend_accounts' then m.can_suspend_accounts
        when 'view_audit' then true
        when 'manage_moderators' then m.role = 'owner'
        else false
      end
  );
$$;

create or replace function private.require_admin_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.admin_has_permission(p_permission) then
    raise exception 'Admin permission required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.current_admin_actor()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_email text;
begin
  perform private.require_admin_permission('dashboard');
  select lower(u.email) into actor_email
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if actor_email is null then
    raise exception 'Confirmed admin identity required.' using errcode = '42501';
  end if;
  return actor_email;
end;
$$;

create or replace function private.admin_can_read_media_object(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_has_permission('review_media')
    and exists (
      select 1 from public.profile_media pm where pm.storage_path = p_storage_path
    );
$$;

revoke all on function private.admin_has_permission(text) from public, anon;
revoke all on function private.require_admin_permission(text) from public, anon, authenticated;
revoke all on function private.current_admin_actor() from public, anon, authenticated;
revoke all on function private.admin_can_read_media_object(text) from public, anon;
grant execute on function private.admin_has_permission(text) to authenticated;
grant execute on function private.admin_can_read_media_object(text) to authenticated;

create or replace function public.claim_admin_session()
returns table (
  admin_email text,
  admin_role text,
  can_review_media boolean,
  can_review_reports boolean,
  can_suspend_accounts boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  confirmed_email text;
  member private.admin_members%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select lower(u.email) into confirmed_email
  from auth.users u
  where u.id = uid and u.email_confirmed_at is not null;

  if confirmed_email is null then
    raise exception 'A confirmed email address is required.' using errcode = '42501';
  end if;

  update private.admin_members m
  set user_id = uid,
      status = 'active',
      activated_at = coalesce(m.activated_at, pg_catalog.clock_timestamp()),
      disabled_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where m.email = confirmed_email
    and m.status in ('invited', 'active')
    and (m.user_id is null or m.user_id = uid);

  select m.* into member
  from private.admin_members m
  where m.user_id = uid and m.email = confirmed_email and m.status = 'active';

  if not found then
    raise exception 'This account is not authorized for Binder Admin.' using errcode = '42501';
  end if;

  return query select member.email, member.role, member.can_review_media,
    member.can_review_reports, member.can_suspend_accounts;
end;
$$;

create or replace function public.admin_dashboard_summary()
returns table (
  pending_media bigint,
  open_reports bigint,
  suspended_accounts bigint,
  active_moderators bigint,
  audit_actions bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  return query select
    (select count(*) from private.moderation_cases c where c.source_type = 'photo_review' and c.status in ('open', 'reviewing')),
    (select count(*) from private.moderation_cases c where c.source_type = 'report' and c.status in ('open', 'reviewing')),
    (select count(*) from private.account_safety s where s.status = 'suspended'),
    (select count(*) from private.admin_members m where m.role = 'moderator' and m.status = 'active'),
    (select count(*) from private.moderation_actions a);
end;
$$;

create or replace function public.admin_list_media_queue(p_limit integer default 50, p_offset integer default 0)
returns table (
  case_id bigint,
  media_id uuid,
  subject_user_id uuid,
  profile_first_name text,
  storage_path text,
  media_position smallint,
  moderation_status text,
  priority smallint,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('review_media');
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid queue page.' using errcode = '22023';
  end if;
  return query
  select c.id, pm.id, pm.user_id, p.first_name, pm.storage_path, pm.position,
    pm.moderation_status, c.priority, c.created_at
  from private.moderation_cases c
  join public.profile_media pm on pm.id = c.media_id
  left join public.profiles p on p.user_id = pm.user_id
  where c.source_type = 'photo_review' and c.status in ('open', 'reviewing')
  order by c.priority desc, c.created_at, c.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_list_report_queue(p_limit integer default 50, p_offset integer default 0)
returns table (
  case_id bigint,
  report_id uuid,
  reported_user_id uuid,
  profile_first_name text,
  reason text,
  details text,
  message_body_snapshot text,
  reported_profile_snapshot jsonb,
  account_status text,
  priority smallint,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('review_reports');
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception 'Invalid queue page.' using errcode = '22023';
  end if;
  return query
  select c.id, r.id, r.reported_id, p.first_name, r.reason, r.details,
    rc.message_body_snapshot, rc.reported_profile_snapshot, s.status,
    c.priority, c.created_at
  from private.moderation_cases c
  join public.reports r on r.id = c.report_id
  left join private.report_context rc on rc.report_id = r.id
  left join public.profiles p on p.user_id = r.reported_id
  left join private.account_safety s on s.user_id = r.reported_id
  where c.source_type = 'report' and c.status in ('open', 'reviewing')
  order by c.priority desc, c.created_at, c.id
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.admin_list_audit(p_limit integer default 100)
returns table (
  action_id bigint,
  case_id bigint,
  source_type text,
  action text,
  actor text,
  notes text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('view_audit');
  if p_limit not between 1 and 250 then
    raise exception 'Invalid audit page.' using errcode = '22023';
  end if;
  return query
  select a.id, a.case_id, c.source_type, a.action, a.actor, a.notes, a.created_at
  from private.moderation_actions a
  join private.moderation_cases c on c.id = a.case_id
  order by a.created_at desc, a.id desc
  limit p_limit;
end;
$$;

create or replace function public.admin_review_media(p_case_id bigint, p_action text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
  original_claims text;
  original_claim_sub text;
begin
  perform private.require_admin_permission('review_media');
  if p_action not in ('approve_media', 'reject_media', 'remove_media') then
    raise exception 'Unsupported media action.' using errcode = '22023';
  end if;
  if p_action <> 'approve_media' and char_length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'A moderation reason is required.' using errcode = '23514';
  end if;

  -- The Phase 4 media trigger deliberately rejects moderation-field changes
  -- whenever a client JWT is present. Capture the verified actor first, then
  -- remove only the transaction-local JWT context while the already-private
  -- operator function performs its server-owned update. Always restore the
  -- caller context, including when moderation raises.
  actor_email := private.current_admin_actor();
  original_claims := pg_catalog.current_setting('request.jwt.claims', true);
  original_claim_sub := pg_catalog.current_setting('request.jwt.claim.sub', true);
  perform pg_catalog.set_config('request.jwt.claims', '{}', true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  begin
    perform private.moderate_case(p_case_id, p_action, actor_email, p_notes);
  exception when others then
    perform pg_catalog.set_config('request.jwt.claims', coalesce(original_claims, ''), true);
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(original_claim_sub, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(original_claims, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(original_claim_sub, ''), true);
end;
$$;

create or replace function public.admin_review_report(p_case_id bigint, p_action text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('review_reports');
  if p_action not in ('warn', 'suspend', 'dismiss') then
    raise exception 'Unsupported report action.' using errcode = '22023';
  end if;
  if p_action in ('warn', 'suspend') and char_length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Action notes are required.' using errcode = '23514';
  end if;
  if p_action = 'suspend' then
    perform private.require_admin_permission('suspend_accounts');
  end if;
  perform private.moderate_case(p_case_id, p_action, private.current_admin_actor(), p_notes);
end;
$$;

create or replace function public.admin_list_moderators()
returns table (
  moderator_email text,
  moderator_status text,
  can_review_media boolean,
  can_review_reports boolean,
  can_suspend_accounts boolean,
  invited_at timestamptz,
  activated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('manage_moderators');
  return query
  select m.email, m.status, m.can_review_media, m.can_review_reports,
    m.can_suspend_accounts, m.invited_at, m.activated_at
  from private.admin_members m
  where m.role = 'moderator'
  order by m.created_at desc, m.email;
end;
$$;

create or replace function public.admin_prepare_moderator_invite(
  p_email text,
  p_can_review_media boolean default true,
  p_can_review_reports boolean default true,
  p_can_suspend_accounts boolean default false
)
returns table (
  moderator_email text,
  moderator_status text,
  needs_invite boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
  target_user uuid;
  next_status text;
begin
  perform private.require_admin_permission('manage_moderators');
  if normalized_email = 'belkis.aslani@gmail.com'
     or char_length(normalized_email) not between 5 and 254
     or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid moderator email is required.' using errcode = '22023';
  end if;
  if p_can_suspend_accounts and not p_can_review_reports then
    raise exception 'Suspension permission requires report review permission.' using errcode = '23514';
  end if;

  select u.id into target_user
  from auth.users u
  where lower(u.email) = normalized_email and u.email_confirmed_at is not null
  limit 1;
  next_status := case when target_user is null then 'invited' else 'active' end;

  insert into private.admin_members as current_member (
    email, user_id, role, status,
    can_review_media, can_review_reports, can_suspend_accounts,
    invited_by, activated_at
  ) values (
    normalized_email, target_user, 'moderator', next_status,
    p_can_review_media, p_can_review_reports, p_can_suspend_accounts,
    auth.uid(), case when target_user is null then null else pg_catalog.clock_timestamp() end
  )
  on conflict (email) do update
  set user_id = coalesce(current_member.user_id, excluded.user_id),
      status = case when coalesce(current_member.user_id, excluded.user_id) is null then 'invited' else 'active' end,
      can_review_media = excluded.can_review_media,
      can_review_reports = excluded.can_review_reports,
      can_suspend_accounts = excluded.can_suspend_accounts,
      invited_by = auth.uid(),
      invited_at = pg_catalog.clock_timestamp(),
      activated_at = case
        when coalesce(current_member.user_id, excluded.user_id) is null then null
        else coalesce(current_member.activated_at, pg_catalog.clock_timestamp())
      end,
      disabled_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where current_member.role = 'moderator';

  if not found then
    raise exception 'Owner membership cannot be changed.' using errcode = '42501';
  end if;

  return query select normalized_email,
    (select m.status from private.admin_members m where m.email = normalized_email),
    target_user is null;
end;
$$;

create or replace function public.admin_update_moderator(
  p_email text,
  p_enabled boolean,
  p_can_review_media boolean,
  p_can_review_reports boolean,
  p_can_suspend_accounts boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
begin
  perform private.require_admin_permission('manage_moderators');
  if p_can_suspend_accounts and not p_can_review_reports then
    raise exception 'Suspension permission requires report review permission.' using errcode = '23514';
  end if;

  update private.admin_members m
  set status = case
        when not p_enabled then 'disabled'
        when m.user_id is null then 'invited'
        else 'active'
      end,
      can_review_media = p_can_review_media,
      can_review_reports = p_can_review_reports,
      can_suspend_accounts = p_can_suspend_accounts,
      disabled_at = case when p_enabled then null else pg_catalog.clock_timestamp() end,
      updated_at = pg_catalog.clock_timestamp()
  where m.email = normalized_email and m.role = 'moderator';

  if not found then
    raise exception 'Moderator not found.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.claim_admin_session() from public, anon;
revoke all on function public.admin_dashboard_summary() from public, anon;
revoke all on function public.admin_list_media_queue(integer,integer) from public, anon;
revoke all on function public.admin_list_report_queue(integer,integer) from public, anon;
revoke all on function public.admin_list_audit(integer) from public, anon;
revoke all on function public.admin_review_media(bigint,text,text) from public, anon;
revoke all on function public.admin_review_report(bigint,text,text) from public, anon;
revoke all on function public.admin_list_moderators() from public, anon;
revoke all on function public.admin_prepare_moderator_invite(text,boolean,boolean,boolean) from public, anon;
revoke all on function public.admin_update_moderator(text,boolean,boolean,boolean,boolean) from public, anon;

grant execute on function public.claim_admin_session() to authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
grant execute on function public.admin_list_media_queue(integer,integer) to authenticated;
grant execute on function public.admin_list_report_queue(integer,integer) to authenticated;
grant execute on function public.admin_list_audit(integer) to authenticated;
grant execute on function public.admin_review_media(bigint,text,text) to authenticated;
grant execute on function public.admin_review_report(bigint,text,text) to authenticated;
grant execute on function public.admin_list_moderators() to authenticated;
grant execute on function public.admin_prepare_moderator_invite(text,boolean,boolean,boolean) to authenticated;
grant execute on function public.admin_update_moderator(text,boolean,boolean,boolean,boolean) to authenticated;

-- The bucket remains private. This policy only lets an authorized photo
-- reviewer download paths that are registered in profile_media.
drop policy if exists profile_media_objects_admin_read on storage.objects;
create policy profile_media_objects_admin_read
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-media'
  and private.admin_can_read_media_object(name)
);

create index if not exists moderation_actions_case_created_idx
on private.moderation_actions (case_id, created_at desc, id desc);

commit;
