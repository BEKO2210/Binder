#!/usr/bin/env bash
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ATTEMPTS=12
RUN_DIR="$(mktemp -d)"
trap 'rm -rf "$RUN_DIR"' EXIT

psql "$DB_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
select set_config('request.jwt.claims','{"role":"service_role"}',false);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('f7555555-5555-4555-8555-555555555555','authenticated','authenticated','phase7-race-a@binder.test','{}','{}',now(),now()),
('f7666666-6666-4666-8666-666666666666','authenticated','authenticated','phase7-race-b@binder.test','{}','{}',now(),now());
insert into public.legal_acceptances(user_id,terms_version,privacy_version) values
('f7555555-5555-4555-8555-555555555555','2026-08-15','2026-08-15'),
('f7666666-6666-4666-8666-666666666666','2026-08-15','2026-08-15');
insert into public.device_tokens(user_id,token,platform,installation_id)
values('f7666666-6666-4666-8666-666666666666','ExponentPushToken[phase7-concurrency-device]','android','f7b00000-0000-4000-8000-000000000099');
insert into public.matches(id,user_low,user_high,status)
values('f7000000-0000-4000-8000-000000000099','f7555555-5555-4555-8555-555555555555','f7666666-6666-4666-8666-666666666666','active');
delete from private.push_outbox;
insert into public.messages(id,match_id,sender_id,client_message_id,body)
values('f7000000-0000-4000-8000-000000000199','f7000000-0000-4000-8000-000000000099','f7555555-5555-4555-8555-555555555555','f7000000-0000-4000-8000-000000000299','Concurrency proof');
SQL

claim_one() {
  local attempt="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -At -c \
    "select delivery_id from public.claim_push_deliveries(gen_random_uuid(),1);" \
    >"$RUN_DIR/claim-${attempt}.txt"
}

echo "Racing ${ATTEMPTS} independent dispatch workers..."
pids=()
for attempt in $(seq 1 "$ATTEMPTS"); do
  claim_one "$attempt" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done

NON_EMPTY="$(find "$RUN_DIR" -type f -name 'claim-*.txt' -size +0c | wc -l | tr -d ' ')"
COUNTS="$(psql "$DB_URL" -X -At -F '|' -c "
select
  (select count(*) from private.push_outbox where message_id='f7000000-0000-4000-8000-000000000199'),
  (select count(*) from private.push_deliveries),
  (select count(*) from private.push_deliveries where status='sending'),
  (select sum(attempts) from private.push_deliveries);
")"

if [[ "$NON_EMPTY" != '1' ]]; then
  echo "Expected exactly one dispatcher to claim a row, got ${NON_EMPTY}" >&2
  exit 1
fi
if [[ "$COUNTS" != '1|1|1|1' ]]; then
  echo "Expected one logical event, delivery, claim and attempt; got ${COUNTS}" >&2
  exit 1
fi

echo "PASS: ${ATTEMPTS} concurrent dispatchers -> one logical event, one device delivery, one claim."
