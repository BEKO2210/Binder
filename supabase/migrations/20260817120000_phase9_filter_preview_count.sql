-- Phase 9 · the number under the filters has to be the truth.
--
-- The sheet promised "X people currently fit" while the client counted profiles
-- by gender and onboarding state alone. Age, distance, blocks, decisions,
-- suspensions and legal acceptance were all ignored, so the number a user
-- watched while dragging the distance dial did not move with it — the one
-- promise the control makes was the one it broke.
--
-- This counts with exactly the rules discovery itself applies, but against the
-- preferences the sheet is *proposing* rather than the ones already saved.
begin;

create or replace function public.count_discovery_candidates(
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_distance_km smallint
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  total integer;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_interested_in is null or cardinality(p_interested_in) = 0 then
    return 0;
  end if;
  if p_min_age is null or p_max_age is null or p_distance_km is null
     or p_min_age < 18 or p_max_age > 120 or p_min_age > p_max_age
     or p_distance_km < 1 or p_distance_km > 500 then
    raise exception 'Invalid discovery preview.' using errcode = '22023';
  end if;

  select count(*)::integer into total
  from public.profiles target_profile
  join public.user_private target_private on target_private.user_id = target_profile.user_id
  join public.user_preferences target_preferences on target_preferences.user_id = target_profile.user_id
  cross join lateral (
    select p.gender, pr.birth_date, pr.location
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
    and not exists (select 1 from public.matches m where m.user_low = least(uid, target_profile.user_id) and m.user_high = greatest(uid, target_profile.user_id) and m.status = 'active');

  return coalesce(total, 0);
end;
$$;

revoke all on function public.count_discovery_candidates(text[], smallint, smallint, smallint) from public, anon;
grant execute on function public.count_discovery_candidates(text[], smallint, smallint, smallint) to authenticated;

commit;
