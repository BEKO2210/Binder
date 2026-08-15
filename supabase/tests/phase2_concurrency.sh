#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PAIR_COUNT=8

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
create table public._phase2_concurrency_pairs (
  pair_no integer primary key,
  user_a uuid not null unique,
  user_b uuid not null unique
);

insert into public._phase2_concurrency_pairs (pair_no, user_a, user_b)
select i, gen_random_uuid(), gen_random_uuid()
from generate_series(1, ${PAIR_COUNT}) as i;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select user_a, 'authenticated', 'authenticated', 'race-a-' || pair_no || '@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase2_concurrency_pairs
union all
select user_b, 'authenticated', 'authenticated', 'race-b-' || pair_no || '@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase2_concurrency_pairs;

insert into public.profiles (user_id, first_name, bio, gender, interests, onboarding_complete)
select user_a, 'RaceA' || pair_no, '', 'woman', array['Coffee','Music'], false
from public._phase2_concurrency_pairs
union all
select user_b, 'RaceB' || pair_no, '', 'man', array['Coffee','Music'], false
from public._phase2_concurrency_pairs;

insert into public.user_private (user_id, birth_date, location, location_updated_at)
select user_a, '1992-01-01'::date,
       extensions.st_setsrid(extensions.st_makepoint(9.191,48.897),4326)::extensions.geography,
       now()
from public._phase2_concurrency_pairs
union all
select user_b, '1991-01-01'::date,
       extensions.st_setsrid(extensions.st_makepoint(9.192,48.898),4326)::extensions.geography,
       now()
from public._phase2_concurrency_pairs;

insert into public.user_preferences (user_id, interested_in, min_age, max_age, max_distance_km)
select user_a, array['man'], 18, 60, 100
from public._phase2_concurrency_pairs
union all
select user_b, array['woman'], 18, 60, 100
from public._phase2_concurrency_pairs;

insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
select 'profile-media', user_a::text || '/race.webp', user_a, user_a::text,
       '{"mimetype":"image/webp","size":100}'::jsonb
from public._phase2_concurrency_pairs
union all
select 'profile-media', user_b::text || '/race.webp', user_b, user_b::text,
       '{"mimetype":"image/webp","size":100}'::jsonb
from public._phase2_concurrency_pairs;

insert into public.profile_media (user_id, storage_path, position, width, height, byte_size, mime_type)
select user_a, user_a::text || '/race.webp', 0, 800, 1080, 100, 'image/webp'
from public._phase2_concurrency_pairs
union all
select user_b, user_b::text || '/race.webp', 0, 800, 1080, 100, 'image/webp'
from public._phase2_concurrency_pairs;

update public.profiles
set onboarding_complete = true
where user_id in (
  select user_a from public._phase2_concurrency_pairs
  union all
  select user_b from public._phase2_concurrency_pairs
);
SQL

call_bind() {
  local actor="$1"
  local target="$2"

  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"${actor}","role":"authenticated"}', true);
set local role authenticated;
select * from public.record_decision('${target}'::uuid, 'bind');
commit;
SQL
}

mapfile -t PAIRS < <(
  psql "$DB_URL" -X -At -F '|' -c \
    "select user_a, user_b from public._phase2_concurrency_pairs order by pair_no"
)

run_parallel_round() {
  local -a pids=()
  local row user_a user_b

  for row in "${PAIRS[@]}"; do
    IFS='|' read -r user_a user_b <<<"$row"
    call_bind "$user_a" "$user_b" &
    pids+=("$!")
    call_bind "$user_b" "$user_a" &
    pids+=("$!")
  done

  for pid in "${pids[@]}"; do
    wait "$pid"
  done
}

assert_counts() {
  local actual expected
  actual="$(psql "$DB_URL" -X -At -F '|' -c "
    with test_users as (
      select user_a as user_id from public._phase2_concurrency_pairs
      union all
      select user_b from public._phase2_concurrency_pairs
    ), test_matches as (
      select m.id
      from public.matches m
      join public._phase2_concurrency_pairs p
        on m.user_low = least(p.user_a, p.user_b)
       and m.user_high = greatest(p.user_a, p.user_b)
    )
    select
      (select count(*) from public.decisions d where d.actor_id in (select user_id from test_users)),
      (select count(*) from test_matches),
      (select count(*) from private.match_events e where e.match_id in (select id from test_matches));
  ")"
  expected="$((PAIR_COUNT * 2))|${PAIR_COUNT}|${PAIR_COUNT}"

  if [[ "$actual" != "$expected" ]]; then
    echo "Concurrency invariant failed: expected ${expected}, got ${actual}" >&2
    exit 1
  fi
}

echo "Running fresh reciprocal-bind race across ${PAIR_COUNT} independent pairs..."
run_parallel_round
assert_counts

echo "Running two parallel idempotency retry rounds..."
run_parallel_round
run_parallel_round
assert_counts

BAD_EVENTS="$(psql "$DB_URL" -X -At -c "
  select count(*)
  from (
    select e.match_id
    from private.match_events e
    join public.matches m on m.id = e.match_id
    join public._phase2_concurrency_pairs p
      on m.user_low = least(p.user_a, p.user_b)
     and m.user_high = greatest(p.user_a, p.user_b)
    group by e.match_id
    having count(*) <> 1
  ) bad;
")"

if [[ "$BAD_EVENTS" != "0" ]]; then
  echo "Exactly-once outbox invariant failed for ${BAD_EVENTS} matches" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -c 'drop table public._phase2_concurrency_pairs;' >/dev/null

echo "PASS: ${PAIR_COUNT} simultaneous reciprocal pairs -> ${PAIR_COUNT} matches and ${PAIR_COUNT} events; retries created no duplicates."
