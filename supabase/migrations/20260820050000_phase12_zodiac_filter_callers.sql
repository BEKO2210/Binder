-- Both callers hand the filter the sign's visibility, or a hidden sign would
-- still be findable by searching for it.
CREATE OR REPLACE FUNCTION private.is_discovery_candidate(viewer_id uuid, target_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_account_active(viewer_id)
    and private.has_current_legal_acceptance(viewer_id)
    and private.is_account_active(target_user_id)
    and private.has_current_legal_acceptance(target_user_id)
    and exists (
    select 1
    from public.profiles viewer_profile
    join public.user_private viewer_private on viewer_private.user_id = viewer_profile.user_id
    join public.user_preferences viewer_preferences on viewer_preferences.user_id = viewer_profile.user_id
    join public.profiles target_profile on target_profile.user_id = target_user_id
    join public.user_private target_private on target_private.user_id = target_profile.user_id
    join public.user_preferences target_preferences on target_preferences.user_id = target_profile.user_id
    where viewer_profile.user_id = viewer_id
      and viewer_id <> target_user_id
      and viewer_profile.onboarding_complete = true
      and target_profile.onboarding_complete = true
      and viewer_private.location is not null and target_private.location is not null
      and viewer_private.location_updated_at >= now() - interval '30 days'
      and target_private.location_updated_at >= now() - interval '30 days'
      and target_profile.gender = any(viewer_preferences.interested_in)
      and viewer_profile.gender = any(target_preferences.interested_in)
      and extract(year from age(current_date, target_private.birth_date))::integer between viewer_preferences.min_age and viewer_preferences.max_age
      and extract(year from age(current_date, viewer_private.birth_date))::integer between target_preferences.min_age and target_preferences.max_age
      and extensions.st_dwithin(viewer_private.location,target_private.location,least(viewer_preferences.max_distance_km,target_preferences.max_distance_km)::double precision * 1000.0)
      and exists (select 1 from public.profile_media pm where pm.user_id = viewer_id and pm.position = 0 and pm.moderation_status = 'approved')
      and exists (select 1 from public.profile_media pm where pm.user_id = target_user_id and pm.position = 0 and pm.moderation_status = 'approved')
      and not exists (select 1 from public.blocks b where (b.blocker_id = viewer_id and b.blocked_id = target_user_id) or (b.blocker_id = target_user_id and b.blocked_id = viewer_id))
      and not exists (select 1 from public.decisions d where d.actor_id = viewer_id and d.target_id = target_user_id)
      and not exists (select 1 from public.matches m where m.user_low = least(viewer_id,target_user_id) and m.user_high = greatest(viewer_id,target_user_id) and m.status = 'active')
      and private.passes_attribute_filters(viewer_preferences.attribute_filters,
            target_profile.height_cm, target_profile.smoking, target_profile.drinking, target_profile.drugs,
            target_profile.activity, target_profile.diet, target_profile.spirituality,
            target_profile.children_has, target_profile.children_wants, target_profile.car,
            target_private.birth_date, target_profile.zodiac_public)
      and private.passes_attribute_filters(target_preferences.attribute_filters,
            viewer_profile.height_cm, viewer_profile.smoking, viewer_profile.drinking, viewer_profile.drugs,
            viewer_profile.activity, viewer_profile.diet, viewer_profile.spirituality,
            viewer_profile.children_has, viewer_profile.children_wants, viewer_profile.car,
            viewer_private.birth_date, viewer_profile.zodiac_public)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.count_discovery_candidates(p_interested_in text[], p_min_age smallint, p_max_age smallint, p_distance_km smallint, p_attribute_filters jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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
