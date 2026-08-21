-- The schedule reads every credential out of Vault, including the one that was
-- sitting in the job's own command in clear text.
--
-- The previous migration described the right end state and then skipped: it
-- looked for three Vault entries by the names it had invented, the hosted
-- project had exactly one (`binder_push_dispatch_secret`), so nothing was
-- rescheduled and the hand-made job kept running with a bearer token spelled
-- out inside `cron.job.command` — readable by anybody with a SQL console.
--
-- This one works with what is actually there. The two missing values are lifted
-- out of the existing command **inside the database**: they are read by a
-- regular expression and written straight into Vault, so no credential is ever
-- printed, logged or carried through a shell. Then the job is rewritten to read
-- all three from Vault, and the clear-text copy is gone with the old command.
--
-- On a machine without pg_cron, pg_net or Vault — the local development
-- database — this skips with a notice, like its predecessor.
do $$
declare
  existing_command text;
  functions_url text;
  bearer_token text;
  secret_name text;
begin
  if to_regclass('cron.job') is null or to_regnamespace('net') is null or to_regclass('vault.secrets') is null then
    raise notice 'pg_cron, pg_net or Vault is absent — leaving the push schedule alone.';
    return;
  end if;

  select command into existing_command from cron.job where jobname = 'binder-dispatch-push';
  if existing_command is null then
    raise notice 'No push dispatch job to rewrite.';
    return;
  end if;

  -- Which name the dispatch secret already has here. Both spellings are
  -- accepted so this migration is not the reason a project breaks.
  select name into secret_name from vault.secrets
  where name in ('binder_push_dispatch_secret', 'binder_dispatch_secret')
  limit 1;
  if secret_name is null then
    raise notice 'The dispatch secret is not in this Vault — leaving the schedule alone.';
    return;
  end if;

  functions_url := (regexp_match(existing_command, 'url\s*:=\s*''([^'']+)/dispatch-push'''))[1];
  -- Only the inline spelling carries a value worth lifting; a command that
  -- already reads Vault has nothing to copy.
  bearer_token := (regexp_match(existing_command, '''Bearer ([A-Za-z0-9._-]{20,})'''))[1];

  if functions_url is null then
    raise notice 'Could not read the functions URL from the existing job — leaving it alone.';
    return;
  end if;

  if not exists (select 1 from vault.secrets where name = 'binder_functions_url') then
    perform vault.create_secret(functions_url, 'binder_functions_url', 'Base URL of the deployed edge functions');
  end if;

  if bearer_token is not null and not exists (select 1 from vault.secrets where name = 'binder_dispatch_bearer') then
    perform vault.create_secret(bearer_token, 'binder_dispatch_bearer', 'Bearer the dispatch endpoint expects; lifted out of the old cron command');
  end if;

  if not exists (select 1 from vault.secrets where name = 'binder_dispatch_bearer') then
    raise notice 'No bearer available for the schedule — leaving the existing job in place.';
    return;
  end if;

  perform cron.unschedule('binder-dispatch-push');
  perform cron.schedule(
    'binder-dispatch-push',
    '* * * * *',
    format($job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'binder_functions_url') || '/dispatch-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'binder_dispatch_bearer'),
          'x-binder-dispatch-secret', (select decrypted_secret from vault.decrypted_secrets where name = %L)
        ),
        body := '{}'::jsonb
      );
    $job$, secret_name)
  );
  raise notice 'Push dispatch now reads every credential from Vault.';
end;
$$;
