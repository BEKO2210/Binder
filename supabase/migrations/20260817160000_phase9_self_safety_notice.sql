-- Phase 9 · a warned account can find out that it was warned.
--
-- Moderation can warn or suspend an account, and both are recorded in
-- private.moderation_actions. Neither was readable by the person it concerns,
-- so the app could not tell them — a warning nobody sees is not moderation, it
-- is bookkeeping.
--
-- This returns only what belongs to the caller: the current account status, the
-- most recent warning, and the note the moderator wrote as the reason. It never
-- exposes who reported whom, which case it came from, or any other account.
begin;

create or replace function public.get_my_safety_notice()
returns table (
  account_status text,
  warned boolean,
  warning_reason text,
  warned_at timestamptz,
  suspended_reason text
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
  with latest_warning as (
    select a.notes, a.created_at
    from private.moderation_actions a
    join private.moderation_cases c on c.id = a.case_id
    where c.subject_user_id = uid and a.action = 'warn'
    order by a.created_at desc
    limit 1
  )
  select
    coalesce(s.status, 'active'),
    (select count(*) > 0 from latest_warning),
    (select w.notes from latest_warning w),
    (select w.created_at from latest_warning w),
    case when s.status = 'suspended' then s.reason else null end
  from (select 1) one
  left join private.account_safety s on s.user_id = uid;
end;
$$;

revoke all on function public.get_my_safety_notice() from public, anon;
grant execute on function public.get_my_safety_notice() to authenticated;

commit;
