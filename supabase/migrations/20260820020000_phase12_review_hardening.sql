-- Findings from an external review before the open test (Kimi + Codex, both
-- pointed at the same two holes independently).
--
-- 1. A voice message survived the block that ended the conversation.
-- 2. A push registration could take over a row belonging to somebody else.
-- 3. Internal boolean helpers were executable by every logged-in user.

-- 1 ---------------------------------------------------------------------------
-- Text messages need `status = 'active'` to be readable, and blocking flips a
-- match to 'blocked'. The storage policy for voice objects only ever asked
-- "are you one of the two people", so after a block the other person could
-- still fetch every voice message whose path they had seen — the most personal
-- data in the app outliving the control meant to stop it.
drop policy if exists voice_media_read_member on storage.objects;
create policy voice_media_read_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-media'
    and exists (
      select 1
      from public.matches m
      where m.id::text = (storage.foldername(name))[1]
        and m.status = 'active'
        and (select auth.uid()) in (m.user_low, m.user_high)
    )
  );

-- 2 ---------------------------------------------------------------------------
-- register_push_token used to move an existing row to the caller: whoever knew
-- a token could inherit the device it addresses, so the victim stopped getting
-- notifications and the attacker's notifications arrived on the victim's phone.
-- A device that changes accounts is a real case, so the row is not kept and
-- rewritten — it is removed and written fresh for the caller. The victim's app
-- registers again on its next start.
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

  -- Anything that belongs to somebody else is deleted, never adopted.
  if token_row.id is not null and token_row.user_id <> uid then
    delete from public.device_tokens where id = token_row.id;
    token_row := null;
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
$$;

-- 3 ---------------------------------------------------------------------------
-- These are helpers for policies and security-definer functions, which run as
-- the owner and keep working. Granting them to `authenticated` only ever gave a
-- logged-in caller an oracle about strangers: is this account suspended, has it
-- accepted the terms, would these two people see each other. The `private`
-- schema is not exposed through the API today, so this closes a door that is
-- currently behind another door.
revoke execute on function private.is_discovery_candidate(uuid, uuid) from authenticated;
revoke execute on function private.is_account_active(uuid) from authenticated;
revoke execute on function private.has_current_legal_acceptance(uuid) from authenticated;
