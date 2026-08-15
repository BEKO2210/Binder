#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
RACE_PAIRS=8
RETRY_WORKERS=12

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
create table public._phase3_race_pairs (
  pair_no integer primary key,
  user_a uuid not null unique,
  user_b uuid not null unique,
  match_id uuid not null unique
);

insert into public._phase3_race_pairs (pair_no, user_a, user_b, match_id)
select i, gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
from generate_series(1, ${RACE_PAIRS}) as i;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select user_a, 'authenticated', 'authenticated', 'phase3-a-' || pair_no || '@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase3_race_pairs
union all
select user_b, 'authenticated', 'authenticated', 'phase3-b-' || pair_no || '@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase3_race_pairs;

insert into public.legal_acceptances (user_id, terms_version, privacy_version)
select user_a, '2026-08-15', '2026-08-15' from public._phase3_race_pairs
union all
select user_b, '2026-08-15', '2026-08-15' from public._phase3_race_pairs;

insert into public.matches (id, user_low, user_high)
select match_id, least(user_a, user_b), greatest(user_a, user_b)
from public._phase3_race_pairs;

create table public._phase3_retry_fixture as
select gen_random_uuid() as user_a, gen_random_uuid() as user_b, gen_random_uuid() as match_id;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select user_a, 'authenticated', 'authenticated', 'phase3-retry-a@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase3_retry_fixture
union all
select user_b, 'authenticated', 'authenticated', 'phase3-retry-b@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()
from public._phase3_retry_fixture;

insert into public.legal_acceptances (user_id, terms_version, privacy_version)
select user_a, '2026-08-15', '2026-08-15' from public._phase3_retry_fixture
union all
select user_b, '2026-08-15', '2026-08-15' from public._phase3_retry_fixture;

insert into public.matches (id, user_low, user_high)
select match_id, least(user_a, user_b), greatest(user_a, user_b)
from public._phase3_retry_fixture;
SQL

call_send() {
  local actor="$1"
  local match_id="$2"
  local client_id="$3"
  local body="$4"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"${actor}","role":"authenticated"}', true);
set local role authenticated;
select * from public.send_message('${match_id}'::uuid, '${client_id}'::uuid, '${body}');
commit;
SQL
}

call_unmatch() {
  local actor="$1"
  local match_id="$2"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"${actor}","role":"authenticated"}', true);
set local role authenticated;
select public.unmatch('${match_id}'::uuid);
commit;
SQL
}

RETRY_ROW="$(psql "$DB_URL" -X -At -F '|' -c 'select user_a, match_id from public._phase3_retry_fixture')"
IFS='|' read -r RETRY_ACTOR RETRY_MATCH <<<"$RETRY_ROW"
RETRY_CLIENT='90000000-0000-4000-8000-000000000001'

echo "Running ${RETRY_WORKERS} concurrent retries of one client message..."
pids=()
for _ in $(seq 1 "$RETRY_WORKERS"); do
  call_send "$RETRY_ACTOR" "$RETRY_MATCH" "$RETRY_CLIENT" 'same payload' &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

RETRY_COUNTS="$(psql "$DB_URL" -X -At -F '|' -c "
select
  (select count(*) from public.messages where match_id = '${RETRY_MATCH}'::uuid),
  (select count(*) from private.push_outbox where kind = 'new_message' and match_id = '${RETRY_MATCH}'::uuid);
")"
if [[ "$RETRY_COUNTS" != '1|1' ]]; then
  echo "Concurrent retry invariant failed: expected 1 message|1 push job, got ${RETRY_COUNTS}" >&2
  exit 1
fi

echo "Running send-vs-unmatch races across ${RACE_PAIRS} independent pairs..."
mapfile -t PAIRS < <(psql "$DB_URL" -X -At -F '|' -c 'select pair_no,user_a,user_b,match_id from public._phase3_race_pairs order by pair_no')
pids=()
for row in "${PAIRS[@]}"; do
  IFS='|' read -r pair_no user_a user_b match_id <<<"$row"
  client_id="$(printf '91000000-0000-4000-8000-%012d' "$pair_no")"
  (call_send "$user_a" "$match_id" "$client_id" "race ${pair_no}" || true) &
  pids+=("$!")
  call_unmatch "$user_b" "$match_id" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

BAD_STATUS="$(psql "$DB_URL" -X -At -c "select count(*) from public.matches m join public._phase3_race_pairs p on p.match_id=m.id where m.status <> 'unmatched' or m.ended_at is null")"
if [[ "$BAD_STATUS" != '0' ]]; then
  echo "Unmatch race invariant failed: ${BAD_STATUS} matches did not end cleanly" >&2
  exit 1
fi

TOO_MANY="$(psql "$DB_URL" -X -At -c "select count(*) from public._phase3_race_pairs p where (select count(*) from public.messages m where m.match_id=p.match_id) > 1")"
if [[ "$TOO_MANY" != '0' ]]; then
  echo "Send/unmatch race created duplicate messages for ${TOO_MANY} matches" >&2
  exit 1
fi

LATE_MESSAGES="$(psql "$DB_URL" -X -At -c "
select count(*)
from public.messages msg
join public.matches m on m.id = msg.match_id
join public._phase3_race_pairs p on p.match_id = m.id
where msg.created_at > m.ended_at;
")"
if [[ "$LATE_MESSAGES" != '0' ]]; then
  echo "Safety invariant failed: ${LATE_MESSAGES} messages were committed after conversation end" >&2
  exit 1
fi

COUNT_PAIR="$(psql "$DB_URL" -X -At -F '|' -c "
select
  (select count(*) from public.messages m join public._phase3_race_pairs p on p.match_id=m.match_id),
  (select count(*) from private.push_outbox o join public._phase3_race_pairs p on p.match_id=o.match_id where o.kind='new_message');
")"
IFS='|' read -r MESSAGE_COUNT PUSH_COUNT <<<"$COUNT_PAIR"
if [[ "$MESSAGE_COUNT" != "$PUSH_COUNT" ]]; then
  echo "Outbox invariant failed: ${MESSAGE_COUNT} committed messages but ${PUSH_COUNT} message push jobs" >&2
  exit 1
fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
drop table public._phase3_race_pairs;
drop table public._phase3_retry_fixture;
SQL

echo "PASS: concurrent retry -> 1 message/1 push; ${RACE_PAIRS} send-vs-unmatch races produced no late or duplicate messages."