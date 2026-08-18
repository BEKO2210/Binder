-- Filters over the ten profile attributes plus the computed zodiac.
--
-- One jsonb column instead of twelve: the discovery predicate exists three
-- times (is_discovery_candidate, count_discovery_candidates, the batch CTE),
-- and every extra column is one more thing those three can disagree about.
-- All three now share literally one function, and the stored shape is the
-- same object the preview RPC receives, so "saved" and "proposed" cannot
-- drift apart either.
--
-- Semantics, decided for a small launch userbase:
--   · filter key absent or null            → anything passes
--   · candidate attribute NULL             → passes every filter (an attribute
--     is an offer; silence must not hide a person)
--   · filters apply in BOTH directions, like gender/age/distance already do —
--     somebody who filtered you out must not receive your like into nothing.

alter table public.user_preferences
  add column if not exists attribute_filters jsonb not null default '{}'::jsonb;

-- The vocabulary the filters accept: exactly the profile vocabulary, plus the
-- twelve zodiac signs. Kept in one place for the CHECK and the setter alike.
create or replace function private.valid_attribute_filters(p_filters jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  vocab constant jsonb := '{
    "smoking": ["never","sometimes","regularly"],
    "drinking": ["never","sometimes","regularly"],
    "drugs": ["never","sometimes","regularly"],
    "activity": ["rarely","sometimes","often","daily"],
    "diet": ["omnivore","flexitarian","pescetarian","vegetarian","vegan","halal","kosher"],
    "spirituality": ["none","spiritual","christian","muslim","jewish","buddhist","hindu","other"],
    "children_has": ["no","yes"],
    "children_wants": ["no","maybe","yes"],
    "car": ["no","yes"],
    "zodiac": ["aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces"]
  }'::jsonb;
  entry record;
  height_min integer;
  height_max integer;
begin
  if p_filters is null or p_filters = 'null'::jsonb then
    return true;
  end if;
  if jsonb_typeof(p_filters) <> 'object' then
    return false;
  end if;

  for entry in select key, value from jsonb_each(p_filters) loop
    if entry.key in ('height_min_cm', 'height_max_cm') then
      if jsonb_typeof(entry.value) not in ('number', 'null') then
        return false;
      end if;
      if jsonb_typeof(entry.value) = 'number'
         and (entry.value::text)::numeric not between 120 and 230 then
        return false;
      end if;
    elsif vocab ? entry.key then
      -- A vocabulary filter is a non-empty array of known codes, or null.
      if jsonb_typeof(entry.value) = 'null' then
        continue;
      end if;
      if jsonb_typeof(entry.value) <> 'array'
         or jsonb_array_length(entry.value) = 0
         or exists (
           select 1 from jsonb_array_elements(entry.value) chosen
           where jsonb_typeof(chosen.value) <> 'string'
              or not (vocab->entry.key) @> chosen.value
         ) then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;

  height_min := case when jsonb_typeof(p_filters->'height_min_cm') = 'number' then (p_filters->>'height_min_cm')::integer end;
  height_max := case when jsonb_typeof(p_filters->'height_max_cm') = 'number' then (p_filters->>'height_max_cm')::integer end;
  if height_min is not null and height_max is not null and height_min > height_max then
    return false;
  end if;

  return true;
end;
$$;

-- The CHECK constraint below runs with the table writer's rights, and the
-- writers are invoker-mode RPCs — so authenticated (and the service role's
-- admin paths) must be able to execute the validator. It reads nothing.
revoke all on function private.valid_attribute_filters(jsonb) from public, anon;
grant execute on function private.valid_attribute_filters(jsonb) to authenticated, service_role;

alter table public.user_preferences
  drop constraint if exists user_preferences_attribute_filters_valid,
  add constraint user_preferences_attribute_filters_valid
    check (private.valid_attribute_filters(attribute_filters));

-- THE shared predicate. Every place that decides discovery visibility calls
-- this and nothing else; if the semantics ever change, they change here once.
create or replace function private.passes_attribute_filters(
  p_filters jsonb,
  p_height_cm smallint,
  p_smoking text,
  p_drinking text,
  p_drugs text,
  p_activity text,
  p_diet text,
  p_spirituality text,
  p_children_has text,
  p_children_wants text,
  p_car text,
  p_birth_date date
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_filters is null or p_filters = 'null'::jsonb or (
        (jsonb_typeof(p_filters->'height_min_cm') is distinct from 'number'
          or p_height_cm is null or p_height_cm >= (p_filters->>'height_min_cm')::integer)
    and (jsonb_typeof(p_filters->'height_max_cm') is distinct from 'number'
          or p_height_cm is null or p_height_cm <= (p_filters->>'height_max_cm')::integer)
    and (jsonb_typeof(p_filters->'smoking') is distinct from 'array'
          or p_smoking is null or p_filters->'smoking' @> to_jsonb(p_smoking))
    and (jsonb_typeof(p_filters->'drinking') is distinct from 'array'
          or p_drinking is null or p_filters->'drinking' @> to_jsonb(p_drinking))
    and (jsonb_typeof(p_filters->'drugs') is distinct from 'array'
          or p_drugs is null or p_filters->'drugs' @> to_jsonb(p_drugs))
    and (jsonb_typeof(p_filters->'activity') is distinct from 'array'
          or p_activity is null or p_filters->'activity' @> to_jsonb(p_activity))
    and (jsonb_typeof(p_filters->'diet') is distinct from 'array'
          or p_diet is null or p_filters->'diet' @> to_jsonb(p_diet))
    and (jsonb_typeof(p_filters->'spirituality') is distinct from 'array'
          or p_spirituality is null or p_filters->'spirituality' @> to_jsonb(p_spirituality))
    and (jsonb_typeof(p_filters->'children_has') is distinct from 'array'
          or p_children_has is null or p_filters->'children_has' @> to_jsonb(p_children_has))
    and (jsonb_typeof(p_filters->'children_wants') is distinct from 'array'
          or p_children_wants is null or p_filters->'children_wants' @> to_jsonb(p_children_wants))
    and (jsonb_typeof(p_filters->'car') is distinct from 'array'
          or p_car is null or p_filters->'car' @> to_jsonb(p_car))
    -- The zodiac is never null (the birth date is mandatory), so it has no
    -- silence rule: filtering by sign always compares a real sign.
    and (jsonb_typeof(p_filters->'zodiac') is distinct from 'array'
          or p_filters->'zodiac' @> to_jsonb(private.zodiac_sign(p_birth_date)))
  );
$$;

revoke all on function private.passes_attribute_filters(jsonb, smallint, text, text, text, text, text, text, text, text, text, date) from public, anon, authenticated;

-- The setter the sheet calls: each call replaces the whole filter object.
-- The sheet always knows all of its controls, so replace-everything is the
-- semantics with no hidden state; {} means "no attribute filters".
create or replace function public.set_my_attribute_filters(p_filters jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_filters is null or jsonb_typeof(p_filters) <> 'object' then
    raise exception 'Filters must be an object.' using errcode = '23514';
  end if;
  if not private.valid_attribute_filters(p_filters) then
    raise exception 'Invalid attribute filters.' using errcode = '23514';
  end if;

  update public.user_preferences
  set attribute_filters = p_filters
  where user_id = uid;

  if not found then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.set_my_attribute_filters(jsonb) from public, anon;
grant execute on function public.set_my_attribute_filters(jsonb) to authenticated;

-- ── is_discovery_candidate ───────────────────────────────────────────────────
-- The 2026-08-15 definition verbatim plus the two attribute-filter lines.
-- get_discovery_batch delegates here, so the deck inherits the filters
-- without being touched — one less copy to keep in step.
create or replace function private.is_discovery_candidate(viewer_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
            target_private.birth_date)
      and private.passes_attribute_filters(target_preferences.attribute_filters,
            viewer_profile.height_cm, viewer_profile.smoking, viewer_profile.drinking, viewer_profile.drugs,
            viewer_profile.activity, viewer_profile.diet, viewer_profile.spirituality,
            viewer_profile.children_has, viewer_profile.children_wants, viewer_profile.car,
            viewer_private.birth_date)
  );
$$;

-- ── count_discovery_candidates ───────────────────────────────────────────────
-- Old signature dropped, one new signature with a default (the overload rule).
-- p_attribute_filters null means "count with my SAVED filters": a shipped
-- client that cannot send filters still gets the number discovery will
-- actually show, which is the only honest number.
drop function if exists public.count_discovery_candidates(text[], smallint, smallint, smallint);

create function public.count_discovery_candidates(
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_distance_km smallint,
  p_attribute_filters jsonb default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
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
           p.spirituality, p.children_has, p.children_wants, p.car,
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
          target_private.birth_date)
    and private.passes_attribute_filters(target_preferences.attribute_filters,
          viewer.height_cm, viewer.smoking, viewer.drinking, viewer.drugs,
          viewer.activity, viewer.diet, viewer.spirituality,
          viewer.children_has, viewer.children_wants, viewer.car,
          viewer.birth_date);

  return coalesce(total, 0);
end;
$$;

revoke all on function public.count_discovery_candidates(text[], smallint, smallint, smallint, jsonb) from public, anon;
grant execute on function public.count_discovery_candidates(text[], smallint, smallint, smallint, jsonb) to authenticated;
