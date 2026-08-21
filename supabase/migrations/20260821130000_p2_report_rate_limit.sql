-- Reporting is free, and that made it a weapon.
--
-- `report_user` had no counter. Sending a message has two — twenty a minute,
-- three hundred an hour — because somebody thought about what a client could do
-- in a loop. Reporting had none, and a report about a stranger opens a
-- moderation case; a report with reason `underage` opens one at priority 100.
--
-- So two things were possible. One account could file ten thousand reports and
-- bury every real case under its own noise. And a group could point at one
-- person, each filing the same report, until the queue said what they wanted it
-- to say — the same report, over and over, is not more evidence.
--
-- The limits below are deliberately generous for a person: nobody reports six
-- people in an hour by accident, and nobody needs to report the same person
-- twice in a day for the same reason. They are ruinous for a loop.
--
--   * At most 6 reports an hour and 20 a day from one account.
--   * The same reporter, the same reported person, the same reason: once a day.
--     A repeat inside that window returns the existing report instead of
--     creating a second case, so the moderator sees one case and not a pile.
--
-- The unique index is what makes the second rule true even if two requests
-- arrive at the same moment, which a counter alone cannot promise.

-- The day is taken in UTC, because `date_trunc` on a timestamptz depends on the
-- session's time zone and an index expression may not.
create unique index if not exists reports_one_per_reason_per_day
  on public.reports (reporter_id, reported_id, reason, ((created_at at time zone 'UTC')::date))
  where reporter_id is not null and reported_id is not null;

create or replace function private.guard_report_rate(p_reporter uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.reports r
      where r.reporter_id = p_reporter and r.created_at > now() - interval '1 hour') >= 6 then
    raise exception 'Too many reports in the last hour.' using errcode = '54000';
  end if;
  if (select count(*) from public.reports r
      where r.reporter_id = p_reporter and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports today.' using errcode = '54000';
  end if;
end;
$$;

revoke all on function private.guard_report_rate(uuid) from public, anon;
grant execute on function private.guard_report_rate(uuid) to authenticated;

-- The production definition, with the counter and the deduplication in it.
CREATE OR REPLACE FUNCTION public.report_user(p_reported_id uuid, p_reason text, p_details text DEFAULT ''::text, p_match_id uuid DEFAULT NULL::uuid, p_message_id uuid DEFAULT NULL::uuid, p_block boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  new_report_id uuid;
  context_match_id uuid := p_match_id;
  snapshot_body text;
  profile_snapshot jsonb;
  message_sender uuid;
  message_match uuid;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_reported_id is null or p_reported_id = uid then
    raise exception 'Invalid report target.' using errcode = '22023';
  end if;

  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'Report details are too long.' using errcode = '23514';
  end if;

  if p_message_id is not null then
    select m.match_id, m.sender_id,
      case when m.kind = 'voice' then '[voice] ' || m.audio_path || ' (' || m.audio_duration_ms || ' ms)' else m.body end
    into message_match, message_sender, snapshot_body
    from public.messages m
    where m.id = p_message_id;

    if not found or message_sender <> p_reported_id then
      raise exception 'Reported message does not belong to the reported user.' using errcode = '23514';
    end if;

    if context_match_id is not null and context_match_id <> message_match then
      raise exception 'Report context mismatch.' using errcode = '23514';
    end if;
    context_match_id := message_match;
  end if;

  if context_match_id is not null then
    if not exists (
      select 1 from public.matches m
      where m.id = context_match_id
        and uid in (m.user_low, m.user_high)
        and p_reported_id in (m.user_low, m.user_high)
        and uid <> p_reported_id
    ) then
      raise exception 'Report match context is invalid.' using errcode = '42501';
    end if;
  elsif not private.is_discovery_candidate(uid, p_reported_id) then
    raise exception 'Reported profile is not in an active Binder interaction.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', p.user_id,
    'first_name', p.first_name,
    'age', extract(year from age(current_date, pr.birth_date))::integer,
    'bio', p.bio,
    'gender', p.gender,
    'interests', p.interests,
    'voice_intro_path', pa.storage_path,
    'voice_intro_duration_ms', pa.duration_ms
  )
  into profile_snapshot
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  left join public.profile_audio pa on pa.user_id = p.user_id
  where p.user_id = p_reported_id;

  if profile_snapshot is null then
    raise exception 'Reported profile not found.' using errcode = '23514';
  end if;

  -- Six an hour, twenty a day: generous for a person, ruinous for a loop.
  perform private.guard_report_rate(uid);

  -- The same person, the same reason, the same day is the same report. Saying
  -- it twice is not more evidence, and it must not become a second case.
  select r.id into new_report_id
  from public.reports r
  where r.reporter_id = uid
    and r.reported_id = p_reported_id
    and r.reason = p_reason
    and (r.created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date
  limit 1;

  if new_report_id is null then
    insert into public.reports (reporter_id, reported_id, reason, details)
    values (uid, p_reported_id, p_reason, coalesce(trim(p_details), ''))
    returning id into new_report_id;

    insert into private.report_context (
      report_id, match_id, message_id, message_body_snapshot, reported_profile_snapshot
    ) values (
      new_report_id, context_match_id, p_message_id, snapshot_body, profile_snapshot
    );
  end if;

  if p_block then
    insert into public.blocks (blocker_id, blocked_id)
    values (uid, p_reported_id)
    on conflict (blocker_id, blocked_id) do nothing;
  end if;

  return new_report_id;
end;
$function$;

revoke all on function public.report_user(uuid,text,text,uuid,uuid,boolean) from public, anon;
grant execute on function public.report_user(uuid,text,text,uuid,uuid,boolean) to authenticated;
