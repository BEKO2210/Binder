#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ATTEMPTS=24
EXPECTED_ACCEPTED=20

read -r SENDER RECIPIENT_A RECIPIENT_B MATCH_A MATCH_B < <(
  psql "$DB_URL" -X -At -F ' ' -c "select gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()"
)

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('${SENDER}', 'authenticated', 'authenticated', 'rate-sender@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('${RECIPIENT_A}', 'authenticated', 'authenticated', 'rate-a@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('${RECIPIENT_B}', 'authenticated', 'authenticated', 'rate-b@binder.test', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.matches (id, user_low, user_high)
values
  ('${MATCH_A}', least('${SENDER}'::uuid, '${RECIPIENT_A}'::uuid), greatest('${SENDER}'::uuid, '${RECIPIENT_A}'::uuid)),
  ('${MATCH_B}', least('${SENDER}'::uuid, '${RECIPIENT_B}'::uuid), greatest('${SENDER}'::uuid, '${RECIPIENT_B}'::uuid));
SQL

call_send() {
  local match_id="$1"
  local client_id="$2"
  local body="$3"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
begin;
select set_config('request.jwt.claims', '{"sub":"${SENDER}","role":"authenticated"}', true);
set local role authenticated;
select * from public.send_message('${match_id}'::uuid, '${client_id}'::uuid, '${body}');
commit;
SQL
}

echo "Running ${ATTEMPTS} simultaneous sends by one user across two matches..."
pids=()
for i in $(seq 1 "$ATTEMPTS"); do
  if (( i % 2 == 0 )); then match_id="$MATCH_A"; else match_id="$MATCH_B"; fi
  client_id="$(printf '92000000-0000-4000-8000-%012d' "$i")"
  (call_send "$match_id" "$client_id" "parallel rate ${i}" || true) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

COUNTS="$(psql "$DB_URL" -X -At -F '|' -c "
select
  (select count(*) from public.messages where sender_id='${SENDER}'::uuid),
  (select count(*) from private.push_outbox where kind='new_message' and match_id in ('${MATCH_A}'::uuid, '${MATCH_B}'::uuid));
")"
EXPECTED="${EXPECTED_ACCEPTED}|${EXPECTED_ACCEPTED}"
if [[ "$COUNTS" != "$EXPECTED" ]]; then
  echo "Sender-wide rate invariant failed: expected ${EXPECTED}, got ${COUNTS}" >&2
  exit 1
fi

echo "PASS: ${ATTEMPTS} concurrent cross-chat sends -> exactly ${EXPECTED_ACCEPTED} messages and ${EXPECTED_ACCEPTED} push jobs."
