begin;

create or replace function public.send_message(
  p_match_id uuid,
  p_client_message_id uuid,
  p_body text
)
returns table (
  id uuid,
  match_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  low_user uuid;
  high_user uuid;
  match_status text;
  existing public.messages%rowtype;
  inserted public.messages%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_match_id is null or p_client_message_id is null then
    raise exception 'Match and client message IDs are required.' using errcode = '22023';
  end if;

  if p_body is null or char_length(trim(p_body)) not between 1 and 2000 then
    raise exception 'Message must contain 1 to 2000 characters.' using errcode = '23514';
  end if;

  -- Fast idempotent retry path. This also lets a client recover the result of an
  -- already-committed send if the conversation was ended immediately afterwards.
  select m.* into existing
  from public.messages m
  where m.sender_id = uid and m.client_message_id = p_client_message_id;

  if found then
    if existing.match_id <> p_match_id or existing.body <> trim(p_body) then
      raise exception 'Client message ID was already used for a different payload.' using errcode = '23505';
    end if;
    return query select existing.id, existing.match_id, existing.sender_id, existing.body, existing.created_at;
    return;
  end if;

  -- Serialize sends with unmatch/block transitions for this match.
  select m.user_low, m.user_high, m.status
  into low_user, high_user, match_status
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found or uid not in (low_user, high_user) then
    raise exception 'Active match membership required.' using errcode = '42501';
  end if;

  -- Another transaction may have inserted the same client message while this
  -- transaction was waiting for the match row lock. Re-check under the lock.
  select m.* into existing
  from public.messages m
  where m.sender_id = uid and m.client_message_id = p_client_message_id;

  if found then
    if existing.match_id <> p_match_id or existing.body <> trim(p_body) then
      raise exception 'Client message ID was already used for a different payload.' using errcode = '23505';
    end if;
    return query select existing.id, existing.match_id, existing.sender_id, existing.body, existing.created_at;
    return;
  end if;

  if match_status <> 'active' then
    raise exception 'This conversation is no longer active.' using errcode = '23514';
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Message rate limit exceeded.' using errcode = '54000';
  end if;

  if (select count(*) from public.messages m where m.sender_id = uid and m.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Hourly message rate limit exceeded.' using errcode = '54000';
  end if;

  insert into public.messages (match_id, sender_id, client_message_id, body)
  values (p_match_id, uid, p_client_message_id, trim(p_body))
  returning * into inserted;

  return query select inserted.id, inserted.match_id, inserted.sender_id, inserted.body, inserted.created_at;
end;
$$;

revoke all on function public.send_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;

commit;
