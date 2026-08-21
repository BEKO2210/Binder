-- Retention that nobody runs is a sentence in a policy, not a limit on storage.
--
-- Three functions exist to delete what has outlived its purpose:
-- `prune_beta_data` (diagnostics after 30 days, ranking observations after 90,
-- feedback and funnel records after 180), `prune_report_evidence` (a decided
-- case 180 days after the decision) and `prune_location_updates` (the rate-limit
-- ledger after two hours). Not one of them had a caller. Anywhere. The privacy
-- policy names those windows to the reader, and the database kept everything.
--
-- Article 5(1)(e) GDPR is not satisfied by a function that could delete.
--
-- So: one nightly job, in the schema, next to the functions it calls. It needs
-- no secrets and no network — plain SQL on a schedule — and it skips on a
-- machine without pg_cron, which is the local development database.
-- What ran, and when. Without it, "retention is enforced" is again something
-- somebody says rather than something anybody can check.
create table if not exists private.retention_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  beta_rows integer not null,
  report_rows integer not null,
  location_rows integer not null
);
alter table private.retention_runs enable row level security;
revoke all on table private.retention_runs from public, anon, authenticated;

create or replace function private.enforce_retention()
returns table (beta_rows integer, report_rows integer, location_rows integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Each one is independent: a failure in one must not leave the others
  -- unenforced, and the row counts are what the check reads afterwards.
  begin
    perform private.prune_beta_data();
    beta_rows := 0;
  exception when others then
    raise warning 'prune_beta_data failed: %', sqlerrm;
    beta_rows := -1;
  end;

  begin
    report_rows := private.prune_report_evidence();
  exception when others then
    raise warning 'prune_report_evidence failed: %', sqlerrm;
    report_rows := -1;
  end;

  begin
    location_rows := private.prune_location_updates();
  exception when others then
    raise warning 'prune_location_updates failed: %', sqlerrm;
    location_rows := -1;
  end;

  insert into private.retention_runs (beta_rows, report_rows, location_rows)
  values (beta_rows, report_rows, location_rows);
  return next;
end;
$$;

revoke all on function private.enforce_retention() from public, anon, authenticated;
grant execute on function private.enforce_retention() to service_role;

do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is absent — retention will not be scheduled here.';
    return;
  end if;

  perform cron.unschedule('binder-nightly-retention')
  where exists (select 1 from cron.job where jobname = 'binder-nightly-retention');

  -- 03:25 UTC: after the daily traffic, before anybody is awake to notice the
  -- load, and not on the hour where every other scheduler in the world starts.
  perform cron.schedule('binder-nightly-retention', '25 3 * * *', $job$select private.enforce_retention();$job$);
  raise notice 'Retention runs nightly at 03:25 UTC.';
end;
$$;
