-- The filter preview asked nothing about who was asking.
--
-- Two holes, both in public.count_discovery_candidates, and both because it
-- inlines discovery's rules instead of delegating to
-- private.is_discovery_candidate the way the deck does.
--
--   * It checked the *target* for an active account and current terms, and
--     never the caller. A suspended account could keep reading how many people
--     match any combination of filters it cared to send — which is exactly the
--     thing a suspension is supposed to end.
--   * It is the only discovery call with no counter. It returns one number, so
--     nobody scrapes a profile with it; what a loop gets is the shape of the
--     population — by age, by distance, by every attribute — for the price of
--     one request each.
--
-- The counter is generic and lives in private, so the next read-only RPC that
-- needs one does not invent a third mechanism. Rows are pruned for the caller
-- on every call, so the table never holds more than an hour of anybody.
--
-- Sixty a minute is roughly twice what dragging a dial across its whole range
-- produces with the sheet's debounce; six hundred an hour is a person changing
-- their mind all evening. Both are nothing to a loop.
begin;

create table if not exists private.rpc_rate (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  called_at timestamptz not null default now()
);

create index if not exists rpc_rate_user_kind_time
  on private.rpc_rate (user_id, kind, called_at desc);

alter table private.rpc_rate enable row level security;
revoke all on table private.rpc_rate from public, anon, authenticated;

create or replace function private.guard_discovery_preview_rate(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  in_minute integer;
  in_hour integer;
begin
  delete from private.rpc_rate
  where user_id = p_user and kind = 'discovery_preview' and called_at < now() - interval '1 hour';

  select
    count(*) filter (where called_at > now() - interval '1 minute'),
    count(*)
  into in_minute, in_hour
  from private.rpc_rate
  where user_id = p_user and kind = 'discovery_preview';

  if in_minute >= 60 then
    raise exception 'Too many discovery previews in the last minute.' using errcode = '54000';
  end if;
  if in_hour >= 600 then
    raise exception 'Too many discovery previews in the last hour.' using errcode = '54000';
  end if;

  insert into private.rpc_rate (user_id, kind) values (p_user, 'discovery_preview');
end;
$$;

revoke all on function private.guard_discovery_preview_rate(uuid) from public, anon;
grant execute on function private.guard_discovery_preview_rate(uuid) to authenticated;

-- The 2026-08-20 definition verbatim, with the caller's own state checked and
-- the counter in front of the query.
CREATE OR REPLACE FUNCTION public.count_discovery_candidates(p_interested_in text[], p_min_age smallint, p_max_age smallint, p_distance_km smallint, p_attribute_filters jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  proposed jsonb;
  total integer;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  -- The deck asks private.is_discovery_candidate, which has always checked the
  -- viewer as well as the target. This function inlines its own conditions and
  -- so checked only the target: a suspended account, or one that has not
  -- accepted the current terms, could still read how many people match any
  -- combination of filters it liked.
  if not private.is_account_active(uid) or not private.has_current_legal_acceptance(uid) then
    raise exception 'Account is not active.' using errcode = '42501';
  end if;
  -- And it is the one discovery call with no counter on it. It answers a
  -- number, which is small, and it answers it for any filter combination the
  -- caller invents — which in a loop is a map of the population by age, by
  -- distance, by every attribute. The limits below are far above what dragging
  -- a dial produces and ruinous for a loop.
  perform private.guard_discovery_preview_rate(uid);
  if p_interested_in is null or cardinality(p_interested_in) = 0 then
    return 0;
  end if;
  if p_min_age is null or p_max_age is null or p_distance_km is null
     or p_min_age < 18 or p_max_age > 120 or p_min_age > p_max_age
     or p_distance_km < 1 or p_distance_km > 500 then
    raise exception 'Invalid discovery preview.' using errcode = '22023';
  end if;
  if p_attribute_filters is not null and not private.valid_attribute_filters(p_attribute_filters) then
    raise exception 'Invalid attribute filters.' using errcode = '22023';
  end if;

  select coalesce(p_attribute_filters, up.attribute_filters, '{}'::jsonb) into proposed
  from public.user_preferences up
  where up.user_id = uid;

  select count(*)::integer into total
  from public.profiles target_profile
  join public.user_private target_private on target_private.user_id = target_profile.user_id
  join public.user_preferences target_preferences on target_preferences.user_id = target_profile.user_id
  cross join lateral (
    select p.gender, p.height_cm, p.smoking, p.drinking, p.drugs, p.activity, p.diet,
           p.spirituality, p.children_has, p.children_wants, p.car, p.zodiac_public,
           pr.birth_date, pr.location
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    where p.user_id = uid
  ) viewer
  where target_profile.user_id <> uid
    and target_profile.onboarding_complete = true
    and private.is_account_active(target_profile.user_id)
    and private.has_current_legal_acceptance(target_profile.user_id)
    and target_private.location is not null
    and viewer.location is not null
    and target_private.location_updated_at >= now() - interval '30 days'
    and target_profile.gender = any(p_interested_in)
    and viewer.gender = any(target_preferences.interested_in)
    and extract(year from age(current_date, target_private.birth_date))::integer between p_min_age and p_max_age
    and extract(year from age(current_date, viewer.birth_date))::integer between target_preferences.min_age and target_preferences.max_age
    and extensions.st_dwithin(viewer.location, target_private.location,
        least(p_distance_km, target_preferences.max_distance_km)::double precision * 1000.0)
    and exists (select 1 from public.profile_media pm where pm.user_id = target_profile.user_id and pm.position = 0 and pm.moderation_status = 'approved')
    and not exists (select 1 from public.blocks b where (b.blocker_id = uid and b.blocked_id = target_profile.user_id) or (b.blocker_id = target_profile.user_id and b.blocked_id = uid))
    and not exists (select 1 from public.decisions d where d.actor_id = uid and d.target_id = target_profile.user_id)
    and not exists (select 1 from public.matches m where m.user_low = least(uid, target_profile.user_id) and m.user_high = greatest(uid, target_profile.user_id) and m.status = 'active')
    and private.passes_attribute_filters(proposed,
          target_profile.height_cm, target_profile.smoking, target_profile.drinking, target_profile.drugs,
          target_profile.activity, target_profile.diet, target_profile.spirituality,
          target_profile.children_has, target_profile.children_wants, target_profile.car,
          target_private.birth_date, target_profile.zodiac_public)
    and private.passes_attribute_filters(target_preferences.attribute_filters,
          viewer.height_cm, viewer.smoking, viewer.drinking, viewer.drugs,
          viewer.activity, viewer.diet, viewer.spirituality,
          viewer.children_has, viewer.children_wants, viewer.car,
          viewer.birth_date, viewer.zodiac_public);

  return coalesce(total, 0);
end;
$function$
;

revoke all on function public.count_discovery_candidates(text[], smallint, smallint, smallint, jsonb) from public, anon;
grant execute on function public.count_discovery_candidates(text[], smallint, smallint, smallint, jsonb) to authenticated;

commit;
