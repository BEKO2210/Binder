-- A notification is product copy, and this app advertises fifteen languages.
-- Until now `claim_push_deliveries` built the title and body as English
-- literals and never read who it was writing to, so a Turkish phone was told
-- "Open Binder to continue the conversation."
--
-- The words themselves stay out of the database. They live in the locale files
-- the app already uses and are generated into the dispatcher, so there is one
-- place to change a sentence. What the database contributes is the one fact
-- only it knows: which language this recipient reads. The English text remains
-- here as the fallback for a row that has no language yet.

alter table public.notification_preferences
  add column if not exists language text;

comment on column public.notification_preferences.language is
  'Locale code of the interface language, used to pick notification copy. Null or unknown means English.';

-- Preferences are written as a whole by the client. The language rides along
-- with the timezone, which is the other fact about the device that decides how
-- a notification reads.
--
-- The old twelve-argument version is dropped rather than left beside this one.
-- Two overloads that differ only by an argument with a default are ambiguous to
-- PostgREST, which would break the build already installed from the Play
-- internal test: it sends the twelve it knows, and that call has to keep
-- working. With only this version present the missing argument takes its
-- default and the row keeps whatever language it had.
drop function if exists public.set_my_notification_preferences(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, time, time, text
);

CREATE FUNCTION public.set_my_notification_preferences(p_enabled boolean, p_new_matches boolean, p_messages boolean, p_moderation boolean, p_safety boolean, p_product boolean, p_sound boolean, p_vibration boolean, p_quiet_hours_enabled boolean, p_quiet_start time without time zone, p_quiet_end time without time zone, p_timezone text, p_language text DEFAULT NULL)
 RETURNS SETOF notification_preferences
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  normalized_timezone text := pg_catalog.btrim(p_timezone);
  normalized_language text := pg_catalog.nullif(pg_catalog.btrim(p_language), '');
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_account_active(uid) then
    raise exception 'Account is not active.' using errcode = '42501';
  end if;
  if p_quiet_hours_enabled and p_quiet_start = p_quiet_end then
    raise exception 'Quiet hours must have different start and end times.' using errcode = '22023';
  end if;
  if normalized_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = normalized_timezone
  ) then
    raise exception 'Invalid IANA timezone.' using errcode = '22023';
  end if;
  -- A locale code, not free text: it only ever picks one of the bundled
  -- translations. This is deliberately a shape check and not a BCP-47
  -- validator — it accepts every code Binder ships (including zh-Hant-CN) and
  -- would also accept a well-formed tag that means nothing here, which is
  -- harmless: an unknown code falls back to English.
  if normalized_language is not null and normalized_language !~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$' then
    raise exception 'Language must be a locale code.' using errcode = '22023';
  end if;

  insert into public.notification_preferences as np (
    user_id, enabled, new_matches, messages, moderation, safety, product,
    sound, vibration, quiet_hours_enabled, quiet_start, quiet_end, timezone, language, updated_at
  ) values (
    uid, p_enabled, p_new_matches, p_messages, p_moderation, p_safety, p_product,
    p_sound, p_vibration, p_quiet_hours_enabled, p_quiet_start, p_quiet_end,
    normalized_timezone, normalized_language, pg_catalog.clock_timestamp()
  )
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    new_matches = excluded.new_matches,
    messages = excluded.messages,
    moderation = excluded.moderation,
    safety = excluded.safety,
    product = excluded.product,
    sound = excluded.sound,
    vibration = excluded.vibration,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end,
    timezone = excluded.timezone,
    -- A client that does not send one must not erase a language already known.
    language = coalesce(excluded.language, np.language),
    updated_at = excluded.updated_at;

  return query select p.* from public.notification_preferences p where p.user_id = uid;
end;
$function$
;

revoke all on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,text,text) from public, anon;
grant execute on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,text,text) to authenticated;

-- The claim gains one output column. The English title and body stay exactly
-- as they were: they are the fallback for a recipient whose language is not
-- known yet, and `verify-phase7-push.mjs` freezes that copy on purpose.
drop function if exists public.claim_push_deliveries(uuid, integer);

CREATE FUNCTION public.claim_push_deliveries(p_worker_id uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(delivery_id bigint, token text, kind text, match_id uuid, route text, title text, body text, sound boolean, vibration boolean, language text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  candidate record;
  gate record;
  pref public.notification_preferences%rowtype;
  emitted integer := 0;
begin
  if p_worker_id is null or p_limit not between 1 and 500 then
    raise exception 'Valid worker ID and limit are required.' using errcode = '22023';
  end if;

  perform private.recover_stale_push_claims();
  perform private.expand_push_outbox(least(p_limit * 2,500));

  for candidate in
    select d.id as delivery_id,d.token_snapshot,d.device_token_id,d.attempts,
           o.id as outbox_id,o.recipient_id,o.kind,o.match_id,o.message_id
    from private.push_deliveries d
    join private.push_outbox o on o.id = d.outbox_id
    where d.status in ('queued','retry') and d.next_attempt_at <= pg_catalog.clock_timestamp() and d.attempts < 8
    order by d.next_attempt_at,d.id
    for update of d skip locked
    limit p_limit
  loop
    if not exists (
      select 1 from public.device_tokens t
      where t.id = candidate.device_token_id
        and t.token = candidate.token_snapshot
        and t.user_id = candidate.recipient_id
        and t.enabled
    ) then
      update private.push_deliveries
      set status = 'suppressed',last_error_code = 'token_ownership_changed',last_error = 'token_ownership_changed',updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      perform private.refresh_push_outbox_state(candidate.outbox_id);
      continue;
    end if;

    select * into gate from private.evaluate_push_gate(candidate.recipient_id,candidate.kind,candidate.match_id,candidate.message_id,pg_catalog.clock_timestamp());
    if gate.decision = 'suppress' then
      update private.push_deliveries
      set status = 'suppressed',last_error_code = gate.reason,last_error = gate.reason,updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      perform private.refresh_push_outbox_state(candidate.outbox_id);
      continue;
    elsif gate.decision = 'defer' then
      update private.push_deliveries
      set status = 'retry',next_attempt_at = gate.next_allowed_at,last_error_code = gate.reason,updated_at = pg_catalog.clock_timestamp()
      where id = candidate.delivery_id;
      continue;
    end if;

    select p.* into pref from public.notification_preferences p where p.user_id = candidate.recipient_id;
    update private.push_deliveries
    set status = 'sending',attempts = attempts + 1,claimed_at = pg_catalog.clock_timestamp(),claimed_by = p_worker_id,updated_at = pg_catalog.clock_timestamp()
    where id = candidate.delivery_id;

    delivery_id := candidate.delivery_id;
    token := candidate.token_snapshot;
    kind := candidate.kind;
    match_id := candidate.match_id;
    route := case when candidate.kind = 'new_message' then 'chat' when candidate.kind = 'new_match' then 'matches' else 'profile' end;
    title := case candidate.kind
      when 'new_match' then 'It''s a Bind'
      when 'new_message' then 'New message'
      when 'moderation_status' then 'Photo update'
      when 'safety_alert' then 'Binder safety notice'
      else 'Binder update'
    end;
    body := case candidate.kind
      when 'new_match' then 'Open Binder to see your new match.'
      when 'new_message' then 'Open Binder to continue the conversation.'
      when 'moderation_status' then 'Your profile photo review has an update.'
      when 'safety_alert' then 'Open Binder to review an account safety update.'
      else 'Open Binder to see what changed.'
    end;
    sound := pref.sound;
    vibration := pref.vibration;
    -- The only thing the database contributes to the wording: who is reading.
    -- The sentences themselves are generated into the dispatcher from the
    -- locale files, so a translation is changed in one place.
    language := pref.language;
    emitted := emitted + 1;
    return next;
  end loop;
  return;
end;
$function$;

revoke all on function public.claim_push_deliveries(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(uuid,integer) to service_role;
