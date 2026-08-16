begin;

-- A Supabase access token can remain cryptographically valid until its expiry
-- even after the backing Auth session is revoked. Admin authorization therefore
-- revalidates the token's session_id against auth.sessions on every request.
create or replace function private.current_admin_session_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.user_id = auth.uid()
      and s.id::text = nullif(auth.jwt() ->> 'session_id', '')
      and (s.not_after is null or s.not_after > pg_catalog.now())
  );
$$;

revoke all on function private.current_admin_session_is_active() from public, anon, authenticated;

create or replace function private.admin_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_admin_session_is_active()
    and exists (
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

-- Browser clients call only the guarded public RPCs and storage helper. Keeping
-- this internal predicate non-executable prevents it becoming a public oracle.
revoke all on function private.admin_has_permission(text) from public, anon, authenticated;

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

  if not private.current_admin_session_is_active() then
    raise exception 'Active authentication session required.' using errcode = '42501';
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

commit;
