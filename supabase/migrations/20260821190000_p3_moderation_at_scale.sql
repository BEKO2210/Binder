-- Moderation with more than one moderator, and a queue that does not drown.
--
-- Three things break as soon as the app has real numbers behind it:
--
-- 1. The diagnostics list shows every error the app ever reported. With a
--    hundred users that is a page; with ten thousand it is a wall nobody reads,
--    and the one error that matters is somewhere in it. Errors can be
--    acknowledged now — with a note, by name — and the list shows what nobody
--    has looked at yet. Acknowledging is not deleting: the row stays, the
--    counting stays honest, it simply leaves the queue.
--
-- 2. Ten moderators on the same queue is ten people opening the same case.
--    Whoever gets there first takes it for fifteen minutes; everybody else sees
--    who is on it and how long it is still theirs. A lease, not a lock: a
--    moderator who closes the tab must not block a case forever.
--
-- 3. The operator side had no numbers at all — how many people finished
--    onboarding, how many photos wait, what the app is doing out there. Every
--    number below is an aggregate over the whole platform. No row, no
--    identifier, no location, nothing that says anything about one person.
--    Counts under five are reported as five, so a small group cannot be
--    narrowed down by watching a number move.

-- ── 1. Acknowledging a diagnostic error ──────────────────────────────────────
create table if not exists private.diagnostic_acknowledgements (
  event_id uuid primary key references private.beta_client_events(id) on delete cascade,
  acknowledged_by text not null,
  acknowledged_at timestamptz not null default now(),
  note text
);
alter table private.diagnostic_acknowledgements enable row level security;
revoke all on table private.diagnostic_acknowledgements from public, anon, authenticated;

create or replace function public.admin_acknowledge_diagnostic(p_event_id uuid, p_note text default null)
returns table (out_event_id uuid, out_acknowledged_by text, out_acknowledged_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text;
begin
  perform private.require_admin_permission('dashboard');
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Note is too long.' using errcode = '23514';
  end if;
  if not exists (select 1 from private.beta_client_events e where e.id = p_event_id) then
    raise exception 'No such diagnostic event.' using errcode = '22023';
  end if;
  actor := private.current_admin_actor();

  -- The out parameters carry an `out_` prefix so nothing in this body can be
  -- read as either the column or the parameter.
  insert into private.diagnostic_acknowledgements (event_id, acknowledged_by, note)
  values (p_event_id, actor, nullif(pg_catalog.btrim(coalesce(p_note, '')), ''))
  on conflict (event_id) do update
  set acknowledged_by = excluded.acknowledged_by,
      acknowledged_at = pg_catalog.clock_timestamp(),
      note = excluded.note;

  return query
  select a.event_id, a.acknowledged_by, a.acknowledged_at
  from private.diagnostic_acknowledgements a where a.event_id = p_event_id;
end;
$$;

-- The list a moderator works from: unacknowledged first, and the acknowledged
-- ones only when explicitly asked for.
create or replace function public.admin_diagnostics_client_errors(p_limit integer default 50, p_include_acknowledged boolean default false)
returns table (
  event_id uuid,
  session_id uuid,
  event_name text,
  surface text,
  outcome text,
  duration_ms integer,
  platform text,
  app_version text,
  created_at timestamptz,
  acknowledged_by text,
  acknowledged_at timestamptz,
  acknowledgement_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  if p_limit not between 1 and 200 then
    raise exception 'Invalid diagnostics page.' using errcode = '22023';
  end if;
  return query
  select e.id, e.session_id, e.event_name, e.surface, e.outcome, e.duration_ms,
         e.platform, e.app_version, e.created_at,
         a.acknowledged_by, a.acknowledged_at, a.note
  from private.beta_client_events e
  left join private.diagnostic_acknowledgements a on a.event_id = e.id
  where (e.event_name = 'client_render_error' or e.outcome = 'error')
    and (p_include_acknowledged or a.event_id is null)
  order by e.created_at desc, e.id
  limit p_limit;
end;
$$;

-- ── 2. One case, one moderator, for fifteen minutes ──────────────────────────
alter table private.moderation_cases
  add column if not exists claimed_by text,
  add column if not exists claimed_until timestamptz;

create or replace function public.admin_claim_case(p_case_id bigint)
returns table (case_id bigint, claimed_by text, claimed_until timestamptz, was_free boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text;
  target private.moderation_cases%rowtype;
begin
  select * into target from private.moderation_cases where id = p_case_id for update;
  if not found then
    raise exception 'No such case.' using errcode = '22023';
  end if;
  if target.source_type = 'photo_review' then
    perform private.require_admin_permission('review_media');
  else
    perform private.require_admin_permission('review_reports');
  end if;
  actor := private.current_admin_actor();

  -- Somebody else holds it and the lease has not run out: say who, and do not
  -- take it away. Two moderators writing the same decision is how a case gets
  -- actioned twice and a person suspended for one report.
  if target.claimed_by is not null and target.claimed_by <> actor and target.claimed_until > now() then
    return query select target.id, target.claimed_by, target.claimed_until, false;
    return;
  end if;

  update private.moderation_cases
  set claimed_by = actor,
      claimed_until = now() + interval '15 minutes',
      updated_at = pg_catalog.clock_timestamp()
  where id = p_case_id;

  return query
  select m.id, m.claimed_by, m.claimed_until, true
  from private.moderation_cases m where m.id = p_case_id;
end;
$$;

create or replace function public.admin_release_case(p_case_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := private.current_admin_actor();
begin
  update private.moderation_cases
  set claimed_by = null, claimed_until = null, updated_at = pg_catalog.clock_timestamp()
  where id = p_case_id and claimed_by = actor;
end;
$$;

-- A decision on a case somebody else is holding is refused, with the name of
-- whoever holds it. The queue is shared; the case is not.
create or replace function private.require_case_not_taken(p_case_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  holder text;
  until_when timestamptz;
  actor text := private.current_admin_actor();
begin
  select claimed_by, claimed_until into holder, until_when
  from private.moderation_cases where id = p_case_id;
  if holder is not null and holder <> actor and until_when > now() then
    raise exception 'Dieser Fall wird gerade von % bearbeitet (noch bis %).', holder, to_char(until_when, 'HH24:MI')
      using errcode = '55006';
  end if;
end;
$$;

revoke all on function private.require_case_not_taken(bigint) from public, anon, authenticated;

-- ── 3. What the operator may know about the platform ─────────────────────────
-- Aggregates only, and never a number small enough to point at somebody.
create or replace function public.admin_platform_overview()
returns table (
  metric text,
  value bigint,
  detail text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- A count below this says something about individuals, so it is reported as
  -- the threshold itself rather than as the true number.
  floor_at constant bigint := 5;
  safe bigint;
begin
  perform private.require_admin_permission('dashboard');

  return query
  with numbers as (
    select 'accounts_total' as metric,
           (select count(*) from auth.users) as value,
           'Registrierte Konten' as detail
    union all
    select 'accounts_onboarded',
           (select count(*) from public.profiles where onboarding_complete),
           'Profil fertig eingerichtet'
    union all
    select 'accounts_active',
           (select count(*) from private.account_safety where status = 'active'),
           'Nicht gesperrt'
    union all
    select 'accounts_suspended',
           (select count(*) from private.account_safety where status <> 'active'),
           'Gesperrt oder eingeschraenkt'
    union all
    select 'accounts_new_7d',
           (select count(*) from auth.users where created_at > now() - interval '7 days'),
           'Neu in sieben Tagen'
    union all
    select 'accounts_new_30d',
           (select count(*) from auth.users where created_at > now() - interval '30 days'),
           'Neu in dreissig Tagen'
    union all
    select 'photos_pending',
           (select count(*) from public.profile_media where moderation_status = 'pending'),
           'Fotos in der Pruefung'
    union all
    select 'photos_approved',
           (select count(*) from public.profile_media where moderation_status = 'approved'),
           'Fotos freigegeben'
    union all
    select 'matches_active',
           (select count(*) from public.matches where status = 'active'),
           'Aktive Matches'
    union all
    select 'messages_7d',
           (select count(*) from public.messages where created_at > now() - interval '7 days'),
           'Nachrichten in sieben Tagen'
    union all
    select 'reports_open',
           (select count(*) from private.moderation_cases where status in ('open','reviewing')),
           'Offene Faelle'
    union all
    select 'errors_unacknowledged',
           (select count(*) from private.beta_client_events e
            left join private.diagnostic_acknowledgements a on a.event_id = e.id
            where (e.event_name = 'client_render_error' or e.outcome = 'error') and a.event_id is null),
           'Unquittierte Fehler'
    union all
    select 'sessions_7d',
           (select count(distinct session_id) from private.beta_client_events where created_at > now() - interval '7 days'),
           'Sitzungen in sieben Tagen (nur mit eingeschalteter Diagnose)'
  )
  select n.metric,
         case when n.value > 0 and n.value < floor_at then floor_at else n.value end,
         case when n.value > 0 and n.value < floor_at then n.detail || ' (unter ' || floor_at || ' — gerundet)' else n.detail end
  from numbers n;
end;
$$;

-- Where the app is used and which build: counts by screen and by version, again
-- as aggregates. It answers "is the new version out there and does it work"
-- without saying anything about who.
create or replace function public.admin_platform_usage(p_days integer default 7)
returns table (bucket text, label text, events bigint, errors bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_permission('dashboard');
  if p_days not between 1 and 90 then
    raise exception 'Invalid window.' using errcode = '22023';
  end if;
  return query
  select 'surface'::text, e.surface, count(*), count(*) filter (where e.outcome = 'error')
  from private.beta_client_events e
  where e.created_at > now() - make_interval(days => p_days)
  group by e.surface
  union all
  select 'app_version', e.app_version, count(*), count(*) filter (where e.outcome = 'error')
  from private.beta_client_events e
  where e.created_at > now() - make_interval(days => p_days)
  group by e.app_version
  order by 1, 3 desc;
end;
$$;

revoke all on function public.admin_acknowledge_diagnostic(uuid,text) from public, anon;
revoke all on function public.admin_claim_case(bigint) from public, anon;
revoke all on function public.admin_release_case(bigint) from public, anon;
revoke all on function public.admin_platform_overview() from public, anon;
revoke all on function public.admin_platform_usage(integer) from public, anon;
grant execute on function public.admin_acknowledge_diagnostic(uuid,text) to authenticated;
grant execute on function public.admin_claim_case(bigint) to authenticated;
grant execute on function public.admin_release_case(bigint) to authenticated;
grant execute on function public.admin_platform_overview() to authenticated;
grant execute on function public.admin_platform_usage(integer) to authenticated;
grant execute on function public.admin_diagnostics_client_errors(integer,boolean) to authenticated;


-- The claim only means something if the decisions honour it. Both review
-- functions keep their bodies from phase 8, with two additions: they refuse a
-- case somebody else is holding, and they let go of it once the decision is
-- written — a moderator who is done must not block the next one for fifteen
-- minutes.
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
  -- The queue is shared, the case is not: a decision on a case somebody else
  -- is holding is refused with their name.
  perform private.require_case_not_taken(p_case_id);
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
  update private.moderation_cases set claimed_by = null, claimed_until = null where id = p_case_id;
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
  -- The queue is shared, the case is not: a decision on a case somebody else
  -- is holding is refused with their name.
  perform private.require_case_not_taken(p_case_id);
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
  update private.moderation_cases set claimed_by = null, claimed_until = null where id = p_case_id;
end;
$$;
