-- A report is evidence. Deleting your own account must not delete it.
--
-- `public.reports.reporter_id` and `reported_id` both pointed at `auth.users`
-- with `on delete cascade`. So the account that was reported for harassment or
-- for being under age could delete itself and take with it: every report about
-- it, the context snapshot that recorded what was said, and — through
-- `moderation_cases.report_id` — the open case a moderator was working on. The
-- fastest way to make a case disappear was to be its subject.
--
-- What changes here:
--
--   * The two foreign keys become `on delete set null`. The report survives the
--     person; what it loses is the pointer to them.
--   * Each report carries the two account ids as text from the moment it is
--     written. After deletion these are pseudonyms: they no longer resolve to a
--     person — a returning user gets a new id — but two reports about the same
--     deleted account still group together, which is what a moderator needs.
--   * Evidence does not live forever. `private.prune_report_evidence()` removes
--     reports whose case has been decided and whose decision is older than the
--     retention window. Open cases are never pruned.
--
-- What deliberately does NOT change: `public.blocks` keeps its cascade. A block
-- names an account id, and once that account is deleted the id can never come
-- back. Keeping the row would retain a record about a deleted person that
-- protects nobody. Blocks are safety state, not evidence.
--
-- Retention is 180 days after a case is decided. That number is written down
-- here, enforced by the function below, and stated in the privacy policy;
-- scheduling the call is tracked separately (the same gap `prune_beta_data`
-- has today).

alter table public.reports
  alter column reporter_id drop not null,
  alter column reported_id drop not null;

alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports drop constraint if exists reports_reported_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references auth.users(id) on delete set null,
  add constraint reports_reported_id_fkey foreign key (reported_id) references auth.users(id) on delete set null;

alter table public.reports
  add column if not exists reporter_pseudonym text,
  add column if not exists reported_pseudonym text;

-- Existing rows keep what they still know.
update public.reports
set reporter_pseudonym = coalesce(reporter_pseudonym, reporter_id::text),
    reported_pseudonym = coalesce(reported_pseudonym, reported_id::text)
where reporter_pseudonym is null or reported_pseudonym is null;

-- Written at insert time, by the database, so no caller can forget it and no
-- caller can fake it.
create or replace function private.stamp_report_pseudonyms()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reporter_pseudonym := coalesce(new.reporter_pseudonym, new.reporter_id::text);
  new.reported_pseudonym := coalesce(new.reported_pseudonym, new.reported_id::text);
  return new;
end;
$$;

drop trigger if exists report_pseudonym_stamp on public.reports;
create trigger report_pseudonym_stamp
before insert on public.reports
for each row execute function private.stamp_report_pseudonyms();

-- The check that both sides are different people compared two ids; one of them
-- may now be null, and `null <> null` is not false but unknown, which a check
-- constraint accepts. The pseudonyms carry the comparison instead, because they
-- are never null after the trigger.
alter table public.reports drop constraint if exists reports_check;
alter table public.reports drop constraint if exists reports_reporter_not_reported;
alter table public.reports
  add constraint reports_reporter_not_reported check (reporter_pseudonym <> reported_pseudonym);

-- Evidence has an end. A decided case is kept for the retention window and then
-- goes, subject snapshot included. An open or reviewing case is never touched.
create or replace function private.prune_report_evidence(p_retention interval default interval '180 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  with decided as (
    select c.report_id
    from private.moderation_cases c
    where c.source_type = 'report'
      and c.status in ('actioned', 'dismissed')
      and c.updated_at < now() - p_retention
      and not exists (
        select 1 from private.moderation_cases open_case
        where open_case.report_id = c.report_id
          and open_case.status in ('open', 'reviewing')
      )
  )
  delete from public.reports r
  using decided
  where r.id = decided.report_id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function private.prune_report_evidence(interval) from public, anon, authenticated;
grant execute on function private.prune_report_evidence(interval) to service_role;
