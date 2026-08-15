begin;

create or replace function private.moderate_case(
  p_case_id bigint,
  p_action text,
  p_actor text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item private.moderation_cases%rowtype;
  next_case_status text;
begin
  if p_actor is null or char_length(trim(p_actor)) not between 2 and 120 then
    raise exception 'Moderator identity is required.' using errcode = '22023';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception 'Moderation notes are too long.' using errcode = '23514';
  end if;

  select * into item
  from private.moderation_cases
  where id = p_case_id
  for update;

  if not found then
    raise exception 'Moderation case not found.' using errcode = '22023';
  end if;

  if item.status not in ('open','reviewing') then
    raise exception 'Moderation case is already terminal.' using errcode = '23514';
  end if;

  if p_action not in ('approve_media','reject_media','remove_media','warn','suspend','dismiss') then
    raise exception 'Unsupported moderation action.' using errcode = '22023';
  end if;

  if p_action in ('approve_media','reject_media','remove_media') then
    if item.source_type <> 'photo_review' or item.media_id is null then
      raise exception 'Media action requires a photo review case.' using errcode = '23514';
    end if;

    update public.profile_media
    set moderation_status = case p_action
          when 'approve_media' then 'approved'
          when 'reject_media' then 'rejected'
          else 'removed'
        end,
        moderation_reason = case when p_action = 'approve_media' then null else nullif(trim(coalesce(p_notes,'')), '') end,
        moderated_at = pg_catalog.clock_timestamp()
    where id = item.media_id;
  elsif p_action = 'suspend' then
    if item.subject_user_id is null then
      raise exception 'Suspension requires an account subject.' using errcode = '23514';
    end if;

    update private.account_safety
    set status = 'suspended',
        reason = coalesce(nullif(trim(p_notes),''), 'moderation')
    where user_id = item.subject_user_id;
  end if;

  next_case_status := case when p_action = 'dismiss' then 'dismissed' else 'actioned' end;

  update private.moderation_cases
  set status = next_case_status,
      updated_at = pg_catalog.clock_timestamp()
  where id = item.id;

  insert into private.moderation_actions(case_id, action, actor, notes)
  values(item.id, p_action, trim(p_actor), nullif(trim(coalesce(p_notes,'')),''));
end;
$$;

revoke all on function private.moderate_case(bigint,text,text,text) from public, anon, authenticated;
grant execute on function private.moderate_case(bigint,text,text,text) to service_role;

commit;
