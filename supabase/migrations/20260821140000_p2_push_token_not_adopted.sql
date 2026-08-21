-- A push token is not a claim ticket — but a phone that changes hands is real.
--
-- register_push_token said "anything that belongs to somebody else is deleted,
-- never adopted" and then adopted it: the foreign row was deleted, the local
-- variable cleared, and the next branch inserted the same token string under the
-- caller's id. Whoever knew another person's token could take their registration
-- and point that phone at their own notifications. Push carries no message
-- content, so nothing private leaked — the victim simply stopped being notified,
-- which is the part nobody notices.
--
-- The legitimate case behind that code is one phone, two people: A signs out, B
-- signs in, and the operating system hands B the same token, because the token
-- belongs to the installation and not to the account. That has to keep working.
--
-- So the question is not who presents the token but which device does:
--
--   * same installation id → the phone changed hands, the registration moves
--   * different installation → a caller holding a string that is not theirs.
--     Refused, and the other person's registration is left alone: taking it
--     away would be the same denial with extra steps.
create or replace function public.register_push_token(p_token text, p_platform text, p_installation_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
  normalized_token text := pg_catalog.btrim(p_token);
  token_row public.device_tokens%rowtype;
  installation_row public.device_tokens%rowtype;
  result_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Current Binder policies and an active account are required.' using errcode = '42501';
  end if;
  if p_installation_id is null then
    raise exception 'Installation ID is required.' using errcode = '22023';
  end if;
  if normalized_token is null or char_length(normalized_token) not between 16 and 512 then
    raise exception 'Invalid push token.' using errcode = '22023';
  end if;
  if p_platform not in ('android','ios') then
    raise exception 'Invalid push platform.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(normalized_token, 7101));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_installation_id::text, 7102));

  select * into token_row from public.device_tokens where token = normalized_token for update;
  select * into installation_row from public.device_tokens where installation_id = p_installation_id for update;

  -- Anything that belongs to somebody else is deleted, never adopted — and the
  -- caller does not get to write it again either. Deleting the foreign row and
  -- then inserting the same token under the caller's id was adoption with an
  -- extra step: whoever knew a token could take the victim's registration and
  -- point that phone at their own notifications.
  --
  -- A device that changes hands re-registers with the token its own operating
  -- system hands out, which is a different string. A caller presenting somebody
  -- else's token is not that case.
  if token_row.id is not null and token_row.user_id <> uid then
    if p_installation_id is not null and token_row.installation_id = p_installation_id then
      -- Same phone, next person: the registration moves with the device.
      delete from public.device_tokens where id = token_row.id;
      token_row := null;
    else
      raise exception 'This push token belongs to another device.' using errcode = '42501';
    end if;
  end if;
  if installation_row.id is not null and installation_row.user_id <> uid then
    delete from public.device_tokens where id = installation_row.id;
    installation_row := null;
  end if;
  -- Two of the caller's own rows that collide: keep the installation, the
  -- token moves onto it.
  if token_row.id is not null and installation_row.id is not null and token_row.id <> installation_row.id then
    delete from public.device_tokens where id = token_row.id;
    token_row := null;
  end if;

  if installation_row.id is not null then
    update public.device_tokens
    set token = normalized_token,
        platform = p_platform,
        enabled = true,
        last_registered_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = installation_row.id
    returning id into result_id;
  elsif token_row.id is not null then
    update public.device_tokens
    set installation_id = p_installation_id,
        platform = p_platform,
        enabled = true,
        last_registered_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where id = token_row.id
    returning id into result_id;
  else
    insert into public.device_tokens (user_id, token, platform, installation_id, enabled, last_registered_at, updated_at)
    values (uid, normalized_token, p_platform, p_installation_id, true, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
    returning id into result_id;
  end if;

  return result_id;
end;
$$;;

revoke all on function public.register_push_token(text,text,uuid) from public, anon;
grant execute on function public.register_push_token(text,text,uuid) to authenticated;
