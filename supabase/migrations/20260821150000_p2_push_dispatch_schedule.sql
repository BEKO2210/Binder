-- The thing that makes push actually happen, written down.
--
-- `dispatch-push` is an HTTP endpoint. Something has to call it, once a minute,
-- forever — and until now that something existed only inside the hosted project,
-- created by hand. It works: `cron.job_run_details` shows a minute-by-minute run
-- history. But it was invisible here. Nobody reviewing this repository could
-- tell whether notifications were delivered or silently dropped, and a project
-- rebuilt from these migrations would have come up with push permanently dead
-- and no error anywhere to say so.
--
-- Two things are fixed by writing it down:
--
--   * The schedule is now part of the schema, so it survives a re-provision and
--     shows up in review like everything else.
--   * Both credentials come out of Vault. The hand-made job carried its bearer
--     token inline in `cron.job.command`, in clear text, where anybody with
--     database access could read it — including a moderator with a SQL console.
--     The dispatch secret was already in Vault; now the token is too.
--
-- Nothing here runs on a machine without pg_cron, pg_net and the two secrets,
-- which is exactly the local development database. It skips with a notice
-- rather than failing: a developer's laptop does not need to notify anybody.
do $$
declare
  project_url text;
begin
  if to_regclass('cron.job') is null or to_regnamespace('net') is null then
    raise notice 'pg_cron or pg_net is absent — skipping the push dispatch schedule.';
    return;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'Vault is absent — skipping the push dispatch schedule.';
    return;
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'binder_functions_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'binder_dispatch_bearer')
     or not exists (select 1 from vault.decrypted_secrets where name = 'binder_dispatch_secret') then
    raise notice 'The dispatch secrets are not in this Vault — skipping the schedule.';
    return;
  end if;

  perform cron.unschedule('binder-dispatch-push')
  where exists (select 1 from cron.job where jobname = 'binder-dispatch-push');

  perform cron.schedule(
    'binder-dispatch-push',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'binder_functions_url') || '/dispatch-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'binder_dispatch_bearer'),
          'x-binder-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'binder_dispatch_secret')
        ),
        body := '{}'::jsonb
      );
    $job$
  );
  raise notice 'Push dispatch is scheduled every minute.';
end;
$$;

-- What a dead dispatcher looks like from the database: deliveries that were
-- queued and never claimed. Nothing else in the system notices this — a person
-- who stops getting notifications assumes nobody wrote to them.
create or replace function private.push_backlog_age_seconds()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select extract(epoch from (now() - min(created_at)))::integer
     from private.push_deliveries
     where status in ('queued', 'sending')),
    0);
$$;

revoke all on function private.push_backlog_age_seconds() from public, anon, authenticated;
grant execute on function private.push_backlog_age_seconds() to service_role;
