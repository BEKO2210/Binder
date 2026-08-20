-- The star sign stays, but it becomes the person's own decision.
--
-- A review pointed out that age in years plus a star sign narrows a birth date
-- to the roughly thirty days of that sign — and the birth date is the one field
-- this system otherwise never gives out. The sign is a product feature people
-- like, so it stays; what was wrong is that it was published for everybody
-- without anybody choosing it. Now it is a switch, on by default because that
-- is what every existing profile already looks like, and off means off
-- everywhere: the profile does not show it, and a search by sign no longer
-- finds that profile either. A filter that still matched would hand out exactly
-- the information the switch was turned off to keep.
alter table public.profiles
  add column if not exists zodiac_public boolean not null default true;

comment on column public.profiles.zodiac_public is
  'Whether this person publishes their star sign. Off also removes them from searches by sign.';

create or replace function public.set_my_zodiac_visibility(p_public boolean)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_public is null then
    raise exception 'A visibility choice is required.' using errcode = '22023';
  end if;
  update public.profiles set zodiac_public = p_public, updated_at = pg_catalog.now() where user_id = uid;
  if not found then
    raise exception 'No profile to update.' using errcode = 'P0002';
  end if;
  return p_public;
end;
$$;

revoke all on function public.set_my_zodiac_visibility(boolean) from public, anon;
grant execute on function public.set_my_zodiac_visibility(boolean) to authenticated;

-- The profile only carries the sign while it is published.
create or replace function public.get_public_profile(target_user_id uuid)
returns table(user_id uuid, first_name text, age integer, bio text, gender text, interests text[], height_cm smallint, zodiac text, smoking text, drinking text, drugs text, activity text, diet text, spirituality text, children_has text, children_wants text, car text, voice_path text, voice_duration_ms integer)
language sql
stable security definer
set search_path to ''
as $$
  select
    p.user_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    p.gender,
    p.interests,
    p.height_cm,
    case when p.zodiac_public then private.zodiac_sign(pr.birth_date) end,
    p.smoking,
    p.drinking,
    p.drugs,
    p.activity,
    p.diet,
    p.spirituality,
    p.children_has,
    p.children_wants,
    p.car,
    pa.storage_path,
    pa.duration_ms
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  left join public.profile_audio pa on pa.user_id = p.user_id
  where p.user_id = target_user_id
    and private.can_view_profile(target_user_id);
$$;

-- And a search by sign passes over the people who do not publish theirs.
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
  p_birth_date date,
  p_zodiac_public boolean default true
)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select (
    p_filters is null
    or p_filters = '{}'::jsonb
    or (
      (jsonb_typeof(p_filters->'height_cm') is distinct from 'object'
            or p_height_cm is null
            or (p_height_cm >= coalesce((p_filters->'height_cm'->>'min')::smallint, p_height_cm)
                and p_height_cm <= coalesce((p_filters->'height_cm'->>'max')::smallint, p_height_cm)))
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
      -- A sign that is not published cannot be searched for. Anything else
      -- would let a filter answer the question the switch turned off.
      and (jsonb_typeof(p_filters->'zodiac') is distinct from 'array'
            or (coalesce(p_zodiac_public, true)
                and p_filters->'zodiac' @> to_jsonb(private.zodiac_sign(p_birth_date))))
    )
  );
$$;
