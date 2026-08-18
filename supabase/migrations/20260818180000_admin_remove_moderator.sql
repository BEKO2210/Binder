-- Removing a moderator entry, not just switching it off.
--
-- A mistyped invitation could only ever be disabled, so it stayed in the list
-- for good — an address nobody owns, sitting among the people who really do
-- moderate. Disabling is the right answer for somebody who should stop; it is
-- the wrong answer for an address that was never meant to exist.
--
-- What is deleted is the membership. The audit trail is not touched: what a
-- moderator decided stays recorded whether or not they are still a moderator,
-- which is the whole point of an audit trail.
create or replace function public.admin_remove_moderator(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(p_email));
  target private.admin_members%rowtype;
begin
  perform private.require_admin_permission('manage_moderators');

  select * into target from private.admin_members m
  where m.email = normalized_email;

  if not found then
    raise exception 'Moderator not found.' using errcode = '22023';
  end if;

  -- The owner is the account that can invite everybody else. Deleting it would
  -- leave the dashboard with nobody able to hand out access again.
  if target.role <> 'moderator' then
    raise exception 'Only moderators can be removed.' using errcode = '42501';
  end if;

  delete from private.admin_members m where m.email = normalized_email and m.role = 'moderator';
end;
$$;

revoke all on function public.admin_remove_moderator(text) from public, anon;
grant execute on function public.admin_remove_moderator(text) to authenticated;
