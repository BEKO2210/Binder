-- Repair of 20260820040000: that migration rewrote passes_attribute_filters from
-- memory and lost the height branch — it compared `height_cm.min` while the
-- stored shape is `height_min_cm`, so every height filter matched everybody.
-- The filter-agreement test caught it. This is the original function from phase
-- 10 with exactly one change: a sign that is not published is not searchable.
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
    -- A sign that is not published cannot be searched for. Anything else would
    -- let a filter answer the question the switch turned off.
    and (jsonb_typeof(p_filters->'zodiac') is distinct from 'array'
          or (coalesce(p_zodiac_public, true)
              and p_filters->'zodiac' @> to_jsonb(private.zodiac_sign(p_birth_date))))
  );
$$;
