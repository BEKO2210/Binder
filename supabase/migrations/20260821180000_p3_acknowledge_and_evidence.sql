-- Three things the moderation side was missing: a receipt, a way to keep proof,
-- and an owner who is not written into the source code.
--
-- 1. A receipt. `moderation_actions` records decisions — approve, reject,
--    suspend, dismiss. It records nothing when a moderator looks at a case and
--    concludes there is nothing to do, which is most of them. So the queue could
--    not tell "nobody has looked at this yet" from "somebody looked and it was
--    fine", and neither could anybody afterwards. Acknowledging is now its own
--    act, with a name, a time and an optional note.
--
-- 2. Proof. A case is evidence about a person, and it lives in a database that
--    keeps changing. Once a moderator has to hand something to a platform, a
--    lawyer or the police, they need a copy that can be shown to be unaltered.
--    `admin_export_case_evidence` builds that copy — report, context snapshot,
--    the messages of the conversation it came from, every action taken, every
--    acknowledgement — and stores its SHA-256 alongside. The bundle can be
--    checked against that hash years later.
--
-- 3. The owner. The bootstrap row named one email address, in a migration, in a
--    public repository. It is now read from Vault (`binder_owner_email`) when
--    the project has one, and the address in the repository is gone.

alter table private.moderation_cases
  add column if not exists acknowledged_by text,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledgement_note text;

create table if not exists private.case_evidence_exports (
  id bigint generated always as identity primary key,
  case_id bigint not null references private.moderation_cases(id) on delete cascade,
  exported_by text not null,
  exported_at timestamptz not null default now(),
  sha256 text not null,
  bytes integer not null,
  bundle jsonb not null
);
alter table private.case_evidence_exports enable row level security;
revoke all on table private.case_evidence_exports from public, anon, authenticated;
create index if not exists case_evidence_exports_case_idx on private.case_evidence_exports (case_id, exported_at desc);

-- Seeing a case and deciding it needs nothing is work, and it leaves a mark.
create or replace function public.admin_acknowledge_case(p_case_id bigint, p_note text default null)
returns table (case_id bigint, acknowledged_by text, acknowledged_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text;
  target private.moderation_cases%rowtype;
begin
  select * into target from private.moderation_cases where id = p_case_id;
  if not found then
    raise exception 'No such case.' using errcode = '22023';
  end if;

  -- The permission follows the kind of case: whoever may review photos may
  -- acknowledge a photo case, and the same for reports.
  if target.source_type = 'photo_review' then
    perform private.require_admin_permission('review_media');
  else
    perform private.require_admin_permission('review_reports');
  end if;

  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Acknowledgement note is too long.' using errcode = '23514';
  end if;

  actor := private.current_admin_actor();

  update private.moderation_cases
  set acknowledged_by = actor,
      acknowledged_at = pg_catalog.clock_timestamp(),
      acknowledgement_note = nullif(pg_catalog.btrim(coalesce(p_note, '')), ''),
      updated_at = pg_catalog.clock_timestamp()
  where id = p_case_id;

  insert into private.moderation_actions (case_id, action, actor, notes)
  values (p_case_id, 'dismiss', actor, coalesce(nullif(pg_catalog.btrim(coalesce(p_note, '')), ''), 'gesehen, nichts zu tun'));

  return query
  select m.id, m.acknowledged_by, m.acknowledged_at
  from private.moderation_cases m where m.id = p_case_id;
end;
$$;

-- Everything about one case, in one document, with a checksum over exactly the
-- bytes that were handed out.
create or replace function public.admin_export_case_evidence(p_case_id bigint)
returns table (export_id bigint, sha256 text, bytes integer, bundle jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text;
  target private.moderation_cases%rowtype;
  document jsonb;
  serialized text;
  digest_hex text;
  new_id bigint;
begin
  select * into target from private.moderation_cases where id = p_case_id;
  if not found then
    raise exception 'No such case.' using errcode = '22023';
  end if;

  if target.source_type = 'photo_review' then
    perform private.require_admin_permission('review_media');
  else
    perform private.require_admin_permission('review_reports');
  end if;

  actor := private.current_admin_actor();

  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', target.id,
      'source_type', target.source_type,
      'status', target.status,
      'priority', target.priority,
      'created_at', target.created_at,
      'acknowledged_by', target.acknowledged_by,
      'acknowledged_at', target.acknowledged_at,
      'acknowledgement_note', target.acknowledgement_note
    ),
    'report', (
      select jsonb_build_object(
        'id', r.id,
        'reason', r.reason,
        'details', r.details,
        'created_at', r.created_at,
        'reporter', r.reporter_pseudonym,
        'reported', r.reported_pseudonym
      )
      from public.reports r where r.id = target.report_id
    ),
    'context', (
      select jsonb_build_object(
        'match_id', rc.match_id,
        'message_id', rc.message_id,
        'message_body_snapshot', rc.message_body_snapshot,
        'reported_profile_snapshot', rc.reported_profile_snapshot,
        'created_at', rc.created_at
      )
      from private.report_context rc where rc.report_id = target.report_id
    ),
    -- The conversation the report came out of, so a single quoted line cannot
    -- be read without what stood around it.
    'conversation', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender', case when m.sender_id = (select r2.reported_id from public.reports r2 where r2.id = target.report_id)
                       then 'reported' else 'other' end,
        'kind', m.kind,
        'body', m.body,
        'audio_path', m.audio_path,
        'created_at', m.created_at
      ) order by m.created_at), '[]'::jsonb)
      from public.messages m
      where m.match_id = (select rc.match_id from private.report_context rc where rc.report_id = target.report_id)
    ),
    'actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action, 'actor', a.actor, 'notes', a.notes, 'created_at', a.created_at
      ) order by a.created_at), '[]'::jsonb)
      from private.moderation_actions a where a.case_id = target.id
    ),
    'exported_by', actor,
    'exported_at', pg_catalog.clock_timestamp()
  ) into document;

  -- The checksum is taken over the exact text that leaves here. Anything else
  -- would prove nothing about what the moderator actually holds.
  serialized := pg_catalog.jsonb_pretty(document);
  digest_hex := encode(extensions.digest(serialized, 'sha256'), 'hex');

  insert into private.case_evidence_exports (case_id, exported_by, sha256, bytes, bundle)
  values (target.id, actor, digest_hex, pg_catalog.octet_length(serialized), document)
  returning id into new_id;

  insert into private.moderation_actions (case_id, action, actor, notes)
  values (target.id, 'dismiss', actor, format('Beweispaket erstellt (sha256 %s)', left(digest_hex, 16)));

  return query select new_id, digest_hex, pg_catalog.octet_length(serialized), document;
end;
$$;

revoke all on function public.admin_acknowledge_case(bigint,text) from public, anon;
revoke all on function public.admin_export_case_evidence(bigint) from public, anon;
grant execute on function public.admin_acknowledge_case(bigint,text) to authenticated;
grant execute on function public.admin_export_case_evidence(bigint) to authenticated;

-- The owner comes out of Vault. Where there is none — a laptop, a fresh
-- project — the table simply has no owner yet, and the dashboard says so
-- instead of letting an address in a public repository decide who is in charge.
do $$
declare
  owner_email text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'No Vault here — the owner row is left as it is.';
    return;
  end if;
  select decrypted_secret into owner_email from vault.decrypted_secrets where name = 'binder_owner_email';
  if owner_email is null then
    raise notice 'No binder_owner_email in Vault — the owner row is left as it is.';
    return;
  end if;

  insert into private.admin_members (email, user_id, role, status, can_review_media, can_review_reports, can_suspend_accounts, activated_at)
  values (
    lower(owner_email),
    (select u.id from auth.users u where lower(u.email) = lower(owner_email) and u.email_confirmed_at is not null limit 1),
    'owner',
    case when exists (select 1 from auth.users u where lower(u.email) = lower(owner_email) and u.email_confirmed_at is not null)
      then 'active' else 'invited' end,
    true, true, true,
    case when exists (select 1 from auth.users u where lower(u.email) = lower(owner_email) and u.email_confirmed_at is not null)
      then pg_catalog.clock_timestamp() else null end
  )
  on conflict (email) do update
  set role = 'owner', can_review_media = true, can_review_reports = true, can_suspend_accounts = true;
end;
$$;
