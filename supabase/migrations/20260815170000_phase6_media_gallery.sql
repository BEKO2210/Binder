begin;

-- Position 0 remains the primary profile image. Make the uniqueness constraint
-- deferrable so one transaction can atomically reorder an entire gallery without
-- temporary duplicate-position failures.
alter table public.profile_media
  drop constraint if exists profile_media_user_id_position_key;

alter table public.profile_media
  add constraint profile_media_user_position_unique
  unique (user_id, position)
  deferrable initially immediate;

-- Phase 4 used ON DELETE SET NULL for photo-review cases while simultaneously
-- requiring media_id NOT NULL for those cases. That made legitimate media
-- deletion contradictory. A photo review is scoped to the concrete photo, so its
-- case/action history is deleted with that photo (Binder is delete-by-default).
alter table private.moderation_cases
  drop constraint if exists moderation_cases_media_id_fkey;

alter table private.moderation_cases
  add constraint moderation_cases_media_id_fkey
  foreign key (media_id) references public.profile_media(id) on delete cascade;

create or replace function private.lock_profile_media_owner(target_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_user_id::text), 624600);
$$;

revoke all on function private.lock_profile_media_owner(uuid) from public, anon, authenticated;

create or replace function private.profile_media_owner_lock_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.lock_profile_media_owner(case when tg_op = 'DELETE' then old.user_id else new.user_id end);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.profile_media_owner_lock_trigger() from public, anon, authenticated;

drop trigger if exists phase6_profile_media_owner_lock on public.profile_media;
create trigger phase6_profile_media_owner_lock
before insert or update or delete on public.profile_media
for each row execute function private.profile_media_owner_lock_trigger();

create or replace function private.require_profile_media_write_access(target_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or auth.uid() <> target_user_id then
    raise exception 'Own profile media only.' using errcode = '42501';
  end if;
  if not private.is_account_active(target_user_id)
     or not private.has_current_legal_acceptance(target_user_id) then
    raise exception 'Current Binder terms and an active account are required before changing profile media.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_profile_media_write_access(uuid) from public, anon, authenticated;

create or replace function public.register_profile_media(
  p_storage_path text,
  p_width smallint,
  p_height smallint,
  p_byte_size integer,
  p_mime_type text default 'image/webp'
)
returns table (
  id uuid,
  storage_path text,
  media_position smallint,
  moderation_status text,
  moderation_reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  next_position smallint;
  inserted public.profile_media%rowtype;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  perform private.require_profile_media_write_access(uid);
  perform private.lock_profile_media_owner(uid);

  if p_storage_path is null or pg_catalog.split_part(p_storage_path, '/', 1) <> uid::text then
    raise exception 'Media path must belong to the authenticated user.' using errcode = '23514';
  end if;
  if p_width is null or p_height is null or p_width not between 1 and 1080 or p_height not between 1 and 1080 then
    raise exception 'Prepared image dimensions must be at most 1080 px per edge.' using errcode = '23514';
  end if;
  if p_byte_size is null or p_byte_size not between 1 and 3145728 then
    raise exception 'Prepared image must be at most 3 MB.' using errcode = '23514';
  end if;
  if p_mime_type is distinct from 'image/webp' then
    raise exception 'Profile media must be WebP.' using errcode = '23514';
  end if;

  select slot::smallint into next_position
  from pg_catalog.generate_series(0, 5) as slot
  where not exists (
    select 1 from public.profile_media pm
    where pm.user_id = uid and pm.position = slot
  )
  order by slot
  limit 1;

  if next_position is null then
    raise exception 'Binder profiles support at most six photos.' using errcode = '23514';
  end if;

  insert into public.profile_media(user_id, storage_path, position, width, height, byte_size, mime_type)
  values(uid, p_storage_path, next_position, p_width, p_height, p_byte_size, p_mime_type)
  returning * into inserted;

  return query select inserted.id, inserted.storage_path, inserted.position,
    inserted.moderation_status, inserted.moderation_reason, inserted.created_at;
end;
$$;

create or replace function public.reorder_my_profile_media(p_media_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  expected_count integer;
  first_status text;
  profile_complete boolean;
begin
  if uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.require_profile_media_write_access(uid);
  perform private.lock_profile_media_owner(uid);

  expected_count := (select count(*) from public.profile_media pm where pm.user_id = uid);
  if p_media_ids is null or pg_catalog.cardinality(p_media_ids) <> expected_count or expected_count not between 1 and 6 then
    raise exception 'Reorder must contain every profile photo exactly once.' using errcode = '23514';
  end if;
  if (select count(distinct value) from pg_catalog.unnest(p_media_ids) as value) <> expected_count then
    raise exception 'Reorder contains duplicate media IDs.' using errcode = '23514';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(p_media_ids) as requested(id)
    where not exists (select 1 from public.profile_media pm where pm.id = requested.id and pm.user_id = uid)
  ) then
    raise exception 'Reorder contains media not owned by this account.' using errcode = '42501';
  end if;

  select p.onboarding_complete into profile_complete from public.profiles p where p.user_id = uid;
  if pg_catalog.coalesce(profile_complete, false) then
    select pm.moderation_status into first_status from public.profile_media pm where pm.id = p_media_ids[1] and pm.user_id = uid;
    if first_status is distinct from 'approved' then
      raise exception 'A completed profile can only make an approved photo primary.' using errcode = '23514';
    end if;
  end if;

  set constraints public.profile_media_user_position_unique deferred;
  update public.profile_media pm
  set position = requested.ordinality::smallint - 1
  from pg_catalog.unnest(p_media_ids) with ordinality as requested(id, ordinality)
  where pm.user_id = uid and pm.id = requested.id;
  set constraints public.profile_media_user_position_unique immediate;
end;
$$;

create or replace function public.set_primary_profile_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_ids uuid[];
  reordered uuid[];
  target_status text;
  profile_complete boolean;
begin
  if uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.require_profile_media_write_access(uid);
  perform private.lock_profile_media_owner(uid);

  select pm.moderation_status into target_status from public.profile_media pm where pm.id = p_media_id and pm.user_id = uid;
  if not found then raise exception 'Profile photo not found.' using errcode = '22023'; end if;

  select p.onboarding_complete into profile_complete from public.profiles p where p.user_id = uid;
  if pg_catalog.coalesce(profile_complete, false) and target_status <> 'approved' then
    raise exception 'A completed profile can only make an approved photo primary.' using errcode = '23514';
  end if;

  select pg_catalog.array_agg(pm.id order by pm.position) into current_ids from public.profile_media pm where pm.user_id = uid;
  reordered := array[p_media_id] || array(select value from pg_catalog.unnest(current_ids) as value where value <> p_media_id);

  set constraints public.profile_media_user_position_unique deferred;
  update public.profile_media pm
  set position = requested.ordinality::smallint - 1
  from pg_catalog.unnest(reordered) with ordinality as requested(id, ordinality)
  where pm.user_id = uid and pm.id = requested.id;
  set constraints public.profile_media_user_position_unique immediate;
end;
$$;

create or replace function public.remove_my_profile_media(p_media_id uuid)
returns table(storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  removing public.profile_media%rowtype;
  replacement_id uuid;
  media_count integer;
  profile_complete boolean;
begin
  if uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform private.require_profile_media_write_access(uid);
  perform private.lock_profile_media_owner(uid);

  select pm.* into removing from public.profile_media pm where pm.id = p_media_id and pm.user_id = uid;
  if not found then raise exception 'Profile photo not found.' using errcode = '22023'; end if;

  select count(*) into media_count from public.profile_media pm where pm.user_id = uid;
  select p.onboarding_complete into profile_complete from public.profiles p where p.user_id = uid;
  if pg_catalog.coalesce(profile_complete, false) and media_count <= 1 then
    raise exception 'A completed profile must keep at least one profile photo.' using errcode = '23514';
  end if;

  if removing.position = 0 and pg_catalog.coalesce(profile_complete, false) then
    select pm.id into replacement_id
    from public.profile_media pm
    where pm.user_id = uid and pm.id <> removing.id and pm.moderation_status = 'approved'
    order by pm.position
    limit 1;
    if replacement_id is null then
      raise exception 'Approve another photo before removing the current primary photo.' using errcode = '23514';
    end if;
  end if;

  delete from public.profile_media pm where pm.id = removing.id and pm.user_id = uid;

  if replacement_id is not null then
    perform public.set_primary_profile_media(replacement_id);
  else
    set constraints public.profile_media_user_position_unique deferred;
    with ordered as (
      select pm.id, pg_catalog.row_number() over(order by pm.position)::smallint - 1 as next_position
      from public.profile_media pm where pm.user_id = uid
    )
    update public.profile_media pm set position = ordered.next_position
    from ordered where pm.id = ordered.id;
    set constraints public.profile_media_user_position_unique immediate;
  end if;

  return query select removing.storage_path;
end;
$$;

revoke all on function public.register_profile_media(text,smallint,smallint,integer,text) from public, anon;
revoke all on function public.reorder_my_profile_media(uuid[]) from public, anon;
revoke all on function public.set_primary_profile_media(uuid) from public, anon;
revoke all on function public.remove_my_profile_media(uuid) from public, anon;
grant execute on function public.register_profile_media(text,smallint,smallint,integer,text) to authenticated;
grant execute on function public.reorder_my_profile_media(uuid[]) to authenticated;
grant execute on function public.set_primary_profile_media(uuid) to authenticated;
grant execute on function public.remove_my_profile_media(uuid) to authenticated;

commit;
