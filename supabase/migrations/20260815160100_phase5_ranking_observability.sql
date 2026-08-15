begin;

create table private.discovery_batches (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  rank_variant text not null check (rank_variant in ('baseline_v1')),
  candidate_count smallint not null check (candidate_count between 0 and 50),
  created_at timestamptz not null default now()
);

create index discovery_batches_viewer_created_idx
  on private.discovery_batches(viewer_id, created_at desc);

create table private.discovery_impressions (
  batch_id uuid not null references private.discovery_batches(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null check (position between 1 and 50),
  interest_overlap smallint not null check (interest_overlap between 0 and 50),
  distance_bucket_km smallint not null check (distance_bucket_km between 0 and 500),
  decision text check (decision is null or decision in ('bind','pass')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (batch_id, candidate_id)
);

create index discovery_impressions_viewer_pending_idx
  on private.discovery_impressions(viewer_id, candidate_id, created_at desc)
  where decision is null;
create index discovery_impressions_candidate_created_idx
  on private.discovery_impressions(candidate_id, created_at desc);

revoke all on table private.discovery_batches from public, anon, authenticated;
revoke all on table private.discovery_impressions from public, anon, authenticated;

create or replace function private.attach_decision_to_impression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_batch_id uuid;
begin
  select di.batch_id into target_batch_id
  from private.discovery_impressions di
  where di.viewer_id = new.actor_id
    and di.candidate_id = new.target_id
    and di.decision is null
  order by di.created_at desc
  limit 1;

  if target_batch_id is not null then
    update private.discovery_impressions
    set decision = new.decision,
        decided_at = new.created_at
    where batch_id = target_batch_id
      and candidate_id = new.target_id
      and decision is null;
  end if;

  return new;
end;
$$;

revoke all on function private.attach_decision_to_impression() from public, anon, authenticated;

create trigger decisions_attach_ranking_impression
after insert on public.decisions
for each row execute function private.attach_decision_to_impression();

create or replace function public.get_discovery_batch(p_limit integer default 20)
returns table (
  target_user_id uuid,
  first_name text,
  age integer,
  bio text,
  interests text[],
  distance_km integer,
  primary_photo_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  safe_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  current_batch_id uuid := gen_random_uuid();
  current_variant text := 'baseline_v1';
begin
  if uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = uid and p.onboarding_complete = true
  ) then
    raise exception 'Completed profile required.' using errcode = '23514';
  end if;

  select bp.rank_variant into current_variant
  from private.beta_preferences bp
  where bp.user_id = uid;
  current_variant := coalesce(current_variant, 'baseline_v1');

  delete from private.discovery_batches
  where viewer_id = uid and created_at < now() - interval '90 days';

  return query
  with viewer as (
    select p.interests, pr.location
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    where p.user_id = uid
  ), candidates as (
    select
      p.user_id,
      p.first_name,
      extract(year from age(current_date, pr.birth_date))::integer as candidate_age,
      p.bio,
      p.interests,
      round(extensions.st_distance(v.location, pr.location) / 1000.0)::integer as candidate_distance_km,
      media.storage_path,
      (
        select count(*)::integer
        from unnest(p.interests) interest
        where interest = any(v.interests)
      ) as interest_overlap,
      p.updated_at
    from public.profiles p
    join public.user_private pr on pr.user_id = p.user_id
    cross join viewer v
    join lateral (
      select pm.storage_path
      from public.profile_media pm
      where pm.user_id = p.user_id and pm.position = 0
      limit 1
    ) media on true
    where private.is_discovery_candidate(uid, p.user_id)
  ), ranked as (
    select
      c.*,
      row_number() over (
        order by c.interest_overlap desc, c.candidate_distance_km asc, c.updated_at desc, c.user_id
      )::smallint as rank_position
    from candidates c
    order by c.interest_overlap desc, c.candidate_distance_km asc, c.updated_at desc, c.user_id
    limit safe_limit
  ), batch_insert as (
    insert into private.discovery_batches(id,viewer_id,rank_variant,candidate_count)
    select current_batch_id,uid,current_variant,count(*)::smallint from ranked
    returning id
  ), impression_insert as (
    insert into private.discovery_impressions(
      batch_id,viewer_id,candidate_id,position,interest_overlap,distance_bucket_km,created_at
    )
    select
      current_batch_id,
      uid,
      r.user_id,
      r.rank_position,
      r.interest_overlap::smallint,
      (floor(greatest(r.candidate_distance_km,0)::numeric / 10) * 10)::smallint,
      pg_catalog.clock_timestamp()
    from ranked r
    cross join batch_insert
    returning batch_id
  )
  select
    r.user_id,
    r.first_name,
    r.candidate_age,
    r.bio,
    r.interests,
    r.candidate_distance_km,
    r.storage_path
  from ranked r
  cross join lateral (select count(*) from impression_insert) logged
  order by r.rank_position;
end;
$$;

revoke all on function public.get_discovery_batch(integer) from public, anon;
grant execute on function public.get_discovery_batch(integer) to authenticated;

commit;
