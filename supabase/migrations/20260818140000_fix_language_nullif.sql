-- `nullif` is SQL syntax, not a function in pg_catalog, so qualifying it the
-- way every real function has to be qualified under `search_path = ''` made the
-- whole procedure fail at runtime: 42883, "function pg_catalog.nullif(text,
-- unknown) does not exist". Every write to the notification preferences failed
-- from the moment the previous migration landed, for everyone, and the client
-- swallowed the error — the only visible symptom was updated_at standing still.
--
-- A dry run cannot catch this. The body of a plpgsql function is not resolved
-- when it is created, only when it runs, so the migration applied cleanly and
-- broke on the first call. Calling it once as the signed-in role is what found
-- it, and that call is now part of how this is checked.
create or replace function public.set_my_notification_preferences(
  p_enabled boolean, p_new_matches boolean, p_messages boolean,
  p_moderation boolean, p_safety boolean, p_product boolean, p_sound boolean,
  p_vibration boolean, p_quiet_hours_enabled boolean,
  p_quiet_start time without time zone, p_quiet_end time without time zone,
  p_timezone text, p_language text default null
)
returns setof public.notification_preferences
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  normalized_timezone text := pg_catalog.btrim(p_timezone);
  normalized_language text := nullif(pg_catalog.btrim(p_language), '');
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
  -- translations. Deliberately a shape check, not a BCP-47 validator.
  if normalized_language is not null and normalized_language !~ '^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$' then
    raise exception 'Language must be a locale code.' using errcode = '22023';
  end if;

  insert into public.notification_preferences as np (
    user_id, enabled, new_matches, messages, moderation, safety, product,
    sound, vibration, quiet_hours_enabled, quiet_start, quiet_end, timezone,
    language, updated_at
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
$function$;

revoke all on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,text,text) from public, anon;
grant execute on function public.set_my_notification_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,time,time,text,text) to authenticated;
