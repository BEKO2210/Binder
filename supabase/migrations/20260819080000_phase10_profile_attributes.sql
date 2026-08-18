-- Profile attributes: height, smoking, drinking, drugs, activity, diet,
-- spirituality, children (has / wants), car. All nullable — an attribute is an
-- offer, never a requirement — and all constrained to a closed vocabulary, so
-- the stored value is a code the app translates, never free text.
--
-- The zodiac sign is deliberately NOT a column. It is a pure function of the
-- birth date the app already holds, and storing it would mean trusting a
-- second copy. `get_public_profile` computes it at read time.
--
-- Signature discipline (the burn of 2026-08-18): the old RPC signatures are
-- DROPPED and each function keeps exactly one signature with defaults, because
-- PostgREST cannot choose between overloads and the Play-store build still
-- calls with the old argument lists — defaults keep those calls working.

alter table public.profiles
  add column if not exists height_cm smallint check (height_cm between 120 and 230),
  add column if not exists smoking text check (smoking in ('never','sometimes','regularly')),
  add column if not exists drinking text check (drinking in ('never','sometimes','regularly')),
  add column if not exists drugs text check (drugs in ('never','sometimes','regularly')),
  add column if not exists activity text check (activity in ('rarely','sometimes','often','daily')),
  add column if not exists diet text check (diet in ('omnivore','flexitarian','pescetarian','vegetarian','vegan','halal','kosher')),
  add column if not exists spirituality text check (spirituality in ('none','spiritual','christian','muslim','jewish','buddhist','hindu','other')),
  add column if not exists children_has text check (children_has in ('no','yes')),
  add column if not exists children_wants text check (children_wants in ('no','maybe','yes')),
  add column if not exists car text check (car in ('no','yes'));

-- The western zodiac from a birth date. Immutable and its own function so a
-- pgTAP test can pin the cusp days instead of trusting a CASE inside a view.
create or replace function private.zodiac_sign(p_birth_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (3, 21)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (4, 19) then 'aries'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (4, 20)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (5, 20) then 'taurus'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (5, 21)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (6, 20) then 'gemini'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (6, 21)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (7, 22) then 'cancer'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (7, 23)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (8, 22) then 'leo'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (8, 23)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (9, 22) then 'virgo'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (9, 23)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (10, 22) then 'libra'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (10, 23)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (11, 21) then 'scorpio'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (11, 22)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (12, 21) then 'sagittarius'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (12, 22)
      or (extract(month from p_birth_date), extract(day from p_birth_date)) <= (1, 19) then 'capricorn'
    when (extract(month from p_birth_date), extract(day from p_birth_date)) >= (1, 20)
     and (extract(month from p_birth_date), extract(day from p_birth_date)) <= (2, 18) then 'aquarius'
    else 'pisces'
  end
$$;

revoke all on function private.zodiac_sign(date) from public, anon, authenticated;

-- One place validates and applies the attributes for both RPCs. jsonb rather
-- than ten scalar parameters: a key that is absent leaves the column alone, a
-- key set to null clears it, a key with a value must pass the same vocabulary
-- the CHECK constraints enforce — so an old client that sends nothing changes
-- nothing, which is what keeps the shipped store build harmless.
create or replace function private.apply_profile_attributes(p_user_id uuid, p_attributes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  allowed constant text[] := array['height_cm','smoking','drinking','drugs','activity','diet','spirituality','children_has','children_wants','car'];
  entry record;
  height integer;
begin
  if p_attributes is null then
    return;
  end if;
  if jsonb_typeof(p_attributes) <> 'object' then
    raise exception 'Attributes must be an object.' using errcode = '23514';
  end if;

  for entry in select key, value from jsonb_each(p_attributes) loop
    if not (entry.key = any (allowed)) then
      raise exception 'Unknown attribute %.', entry.key using errcode = '23514';
    end if;
  end loop;

  if p_attributes ? 'height_cm' and jsonb_typeof(p_attributes->'height_cm') <> 'null' then
    if jsonb_typeof(p_attributes->'height_cm') <> 'number' then
      raise exception 'Height must be a number.' using errcode = '23514';
    end if;
    height := (p_attributes->>'height_cm')::integer;
    if height not between 120 and 230 then
      raise exception 'Height must be between 120 and 230 cm.' using errcode = '23514';
    end if;
  end if;

  -- The enum columns validate through their CHECK constraints on write; the
  -- update below surfaces those as 23514 with the column name in the message.
  update public.profiles set
    height_cm = case when p_attributes ? 'height_cm' then (p_attributes->>'height_cm')::smallint else height_cm end,
    smoking = case when p_attributes ? 'smoking' then p_attributes->>'smoking' else smoking end,
    drinking = case when p_attributes ? 'drinking' then p_attributes->>'drinking' else drinking end,
    drugs = case when p_attributes ? 'drugs' then p_attributes->>'drugs' else drugs end,
    activity = case when p_attributes ? 'activity' then p_attributes->>'activity' else activity end,
    diet = case when p_attributes ? 'diet' then p_attributes->>'diet' else diet end,
    spirituality = case when p_attributes ? 'spirituality' then p_attributes->>'spirituality' else spirituality end,
    children_has = case when p_attributes ? 'children_has' then p_attributes->>'children_has' else children_has end,
    children_wants = case when p_attributes ? 'children_wants' then p_attributes->>'children_wants' else children_wants end,
    car = case when p_attributes ? 'car' then p_attributes->>'car' else car end
  where user_id = p_user_id;
end;
$$;

-- The RPCs above run as the caller (security invoker), so authenticated needs
-- execute here. That grants nothing extra: the helper is invoker too, and RLS
-- limits its UPDATE to the caller's own row whatever p_user_id says.
revoke all on function private.apply_profile_attributes(uuid, jsonb) from public, anon;
grant execute on function private.apply_profile_attributes(uuid, jsonb) to authenticated;

-- ── update_my_profile ────────────────────────────────────────────────────────
-- Body is the production definition of 2026-08-18 verbatim; the only additions
-- are the trailing parameter and the one call that applies it. A client that
-- does not send p_attributes (every shipped build) changes no attribute.
drop function if exists public.update_my_profile(text, text, text, text[], text[], smallint, smallint, smallint);

create function public.update_my_profile(
  p_first_name text,
  p_gender text,
  p_bio text,
  p_interests text[],
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_max_distance_km smallint,
  p_attributes jsonb default null
)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_first_name is null or char_length(trim(p_first_name)) not between 1 and 40 then
    raise exception 'First name is required.' using errcode = '23514';
  end if;

  if p_gender not in ('woman','man','nonbinary') then
    raise exception 'Invalid gender.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interests, '{}')) > 12 then
    raise exception 'Too many interests.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interested_in, '{}')) = 0
     or not (p_interested_in <@ array['woman','man','nonbinary']::text[]) then
    raise exception 'Invalid dating preference.' using errcode = '23514';
  end if;

  if p_min_age < 18 or p_max_age > 100 or p_min_age > p_max_age
     or p_max_distance_km < 1 or p_max_distance_km > 500 then
    raise exception 'Invalid discovery preferences.' using errcode = '23514';
  end if;

  update public.profiles
  set first_name = trim(p_first_name),
      gender = p_gender,
      bio = coalesce(trim(p_bio), ''),
      interests = coalesce(p_interests, '{}')
  where user_id = uid and onboarding_complete = true;

  if not found then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;

  perform private.apply_profile_attributes(uid, p_attributes);

  update public.user_preferences
  set interested_in = p_interested_in,
      min_age = p_min_age,
      max_age = p_max_age,
      max_distance_km = p_max_distance_km
  where user_id = uid;
end;
$function$;

revoke all on function public.update_my_profile(text, text, text, text[], text[], smallint, smallint, smallint, jsonb) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text[], text[], smallint, smallint, smallint, jsonb) to authenticated;

-- ── complete_my_onboarding ───────────────────────────────────────────────────
drop function if exists public.complete_my_onboarding(text, date, text, text, text[], text[], smallint, smallint, smallint);

create function public.complete_my_onboarding(
  p_first_name text,
  p_birth_date date,
  p_gender text,
  p_bio text,
  p_interests text[],
  p_interested_in text[],
  p_min_age smallint,
  p_max_age smallint,
  p_max_distance_km smallint,
  p_attributes jsonb default null
)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  already_complete boolean;
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_first_name is null or char_length(trim(p_first_name)) not between 1 and 40 then
    raise exception 'First name is required.' using errcode = '23514';
  end if;

  if p_gender not in ('woman','man','nonbinary') then
    raise exception 'Invalid gender.' using errcode = '23514';
  end if;

  if p_birth_date > (current_date - interval '18 years')::date
     or p_birth_date < (current_date - interval '100 years')::date then
    raise exception 'Binder is 18+ and birth date must be valid.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interests, '{}')) > 12 then
    raise exception 'Too many interests.' using errcode = '23514';
  end if;

  if cardinality(coalesce(p_interested_in, '{}')) = 0
     or not (p_interested_in <@ array['woman','man','nonbinary']::text[]) then
    raise exception 'Invalid dating preference.' using errcode = '23514';
  end if;

  if p_min_age < 18 or p_max_age > 100 or p_min_age > p_max_age
     or p_max_distance_km < 1 or p_max_distance_km > 500 then
    raise exception 'Invalid discovery preferences.' using errcode = '23514';
  end if;

  select p.onboarding_complete into already_complete
  from public.profiles p
  where p.user_id = uid;

  if coalesce(already_complete, false) then
    raise exception 'Onboarding is already complete.' using errcode = '23514';
  end if;

  insert into public.profiles (user_id, first_name, bio, gender, interests, onboarding_complete)
  values (uid, trim(p_first_name), coalesce(trim(p_bio), ''), p_gender, coalesce(p_interests, '{}'), false)
  on conflict (user_id) do update set
    first_name = excluded.first_name,
    bio = excluded.bio,
    gender = excluded.gender,
    interests = excluded.interests,
    onboarding_complete = false;

  perform private.apply_profile_attributes(uid, p_attributes);

  insert into public.user_private (user_id, birth_date)
  values (uid, p_birth_date)
  on conflict (user_id) do update set birth_date = excluded.birth_date;

  insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
  values (uid, p_interested_in, p_min_age, p_max_age, p_max_distance_km)
  on conflict (user_id) do update set
    interested_in = excluded.interested_in,
    min_age = excluded.min_age,
    max_age = excluded.max_age,
    max_distance_km = excluded.max_distance_km;
end;
$function$;

revoke all on function public.complete_my_onboarding(text, date, text, text, text[], text[], smallint, smallint, smallint, jsonb) from public, anon;
grant execute on function public.complete_my_onboarding(text, date, text, text, text[], text[], smallint, smallint, smallint, jsonb) to authenticated;

-- ── get_public_profile ───────────────────────────────────────────────────────
-- The return type changes, so CREATE OR REPLACE cannot do it. The columns keep
-- their order and only append, so a client selecting by name sees no change.
drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(target_user_id uuid)
returns table(
  user_id uuid,
  first_name text,
  age integer,
  bio text,
  gender text,
  interests text[],
  height_cm smallint,
  zodiac text,
  smoking text,
  drinking text,
  drugs text,
  activity text,
  diet text,
  spirituality text,
  children_has text,
  children_wants text,
  car text
)
language sql
stable security definer
set search_path to ''
as $function$
  select
    p.user_id,
    p.first_name,
    extract(year from age(current_date, pr.birth_date))::integer,
    p.bio,
    p.gender,
    p.interests,
    p.height_cm,
    private.zodiac_sign(pr.birth_date),
    p.smoking,
    p.drinking,
    p.drugs,
    p.activity,
    p.diet,
    p.spirituality,
    p.children_has,
    p.children_wants,
    p.car
  from public.profiles p
  join public.user_private pr on pr.user_id = p.user_id
  where p.user_id = target_user_id
    and private.can_view_profile(target_user_id);
$function$;

revoke all on function public.get_public_profile(uuid) from public, anon;
grant execute on function public.get_public_profile(uuid) to authenticated;
