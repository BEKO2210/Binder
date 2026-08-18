#!/usr/bin/env bash
set -euo pipefail

EMAIL="phase4-delete-$(date +%s)-$RANDOM@binder.test"
PASSWORD='Binder-Delete-E2E-2026!'
FUNCTION_LOG='/tmp/binder-delete-account-function.log'

cleanup() {
  if [[ -n "${FUNCTION_PID:-}" ]]; then kill "$FUNCTION_PID" 2>/dev/null || true; fi
  supabase stop --no-backup >/dev/null 2>&1 || true
}
trap cleanup EXIT

supabase start >/dev/null
supabase status -o env \
  --override-name api.url=API_URL \
  --override-name auth.anon_key=ANON_KEY \
  --override-name auth.service_role_key=SERVICE_ROLE_KEY \
  > /tmp/binder-local.env
# shellcheck disable=SC1091
source /tmp/binder-local.env

: "${API_URL:?missing local Supabase API URL}"
: "${ANON_KEY:?missing local anon/publishable-compatible JWT key}"
: "${SERVICE_ROLE_KEY:?missing local service-role JWT key}"

ADMIN_RESPONSE="$(curl --fail-with-body --silent --show-error \
  --request POST "${API_URL}/auth/v1/admin/users" \
  --header "apikey: ${SERVICE_ROLE_KEY}" \
  --header "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"email_confirm\":true}")"
USER_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"${ADMIN_RESPONSE}")"

TOKEN_RESPONSE="$(curl --fail-with-body --silent --show-error \
  --request POST "${API_URL}/auth/v1/token?grant_type=password" \
  --header "apikey: ${ANON_KEY}" \
  --header 'Content-Type: application/json' \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"
ACCESS_TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"${TOKEN_RESPONSE}")"

curl --fail-with-body --silent --show-error \
  --request POST "${API_URL}/rest/v1/rpc/accept_legal_terms" \
  --header "apikey: ${ANON_KEY}" \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{"p_terms_version":"2026-08-15","p_privacy_version":"2026-08-15"}' >/dev/null

printf 'Binder deletion integration media' > /tmp/binder-delete.webp
curl --fail-with-body --silent --show-error \
  --request POST "${API_URL}/storage/v1/object/profile-media/${USER_ID}/delete-integration.webp" \
  --header "apikey: ${ANON_KEY}" \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header 'Content-Type: image/webp' \
  --data-binary @/tmp/binder-delete.webp >/dev/null

BEFORE="$(psql "${DB_URL}" -X -At -F '|' -c "select (select count(*) from auth.users where id='${USER_ID}'::uuid),(select count(*) from storage.objects where bucket_id='profile-media' and name='${USER_ID}/delete-integration.webp'),(select status from private.account_safety where user_id='${USER_ID}'::uuid);")"
if [[ "${BEFORE}" != '1|1|active' ]]; then
  echo "Deletion integration fixture invalid before function call: ${BEFORE}" >&2
  exit 1
fi

supabase functions serve delete-account >"${FUNCTION_LOG}" 2>&1 &
FUNCTION_PID=$!
# `curl --output /dev/null URL` succeeds on any HTTP answer, including the 502
# the gateway returns while the function is still booting — so this loop used to
# fall through on the first try and the test raced the runtime. It waits for a
# status the function itself produced: a 401 means it is up and asking for a
# token, which is exactly what "ready" looks like here.
FUNCTION_READY=''
for _ in $(seq 1 90); do
  READY_CODE="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    "${API_URL}/functions/v1/delete-account" || true)"
  case "${READY_CODE}" in
    ''|000|502|503|504) ;;
    404) ;;  # Kong answers before `functions serve` has registered the route.
    *) FUNCTION_READY="${READY_CODE}"; break ;;
  esac
  if ! kill -0 "${FUNCTION_PID}" 2>/dev/null; then
    cat "${FUNCTION_LOG}" >&2
    echo "delete-account function exited before it became ready" >&2
    exit 1
  fi
  sleep 1
done

echo "delete-account readiness probe settled on HTTP ${FUNCTION_READY:-none}" >&2

if [[ -z "${FUNCTION_READY}" ]]; then
  cat "${FUNCTION_LOG}" >&2
  echo "delete-account did not become ready in 90s (last status ${READY_CODE:-none})" >&2
  exit 1
fi

HTTP_CODE="$(curl --silent --show-error \
  --output /tmp/binder-delete-response.json \
  --write-out '%{http_code}' \
  --request POST "${API_URL}/functions/v1/delete-account" \
  --header "apikey: ${ANON_KEY}" \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header 'Content-Type: application/json' \
  --data '{}')"

if [[ "${HTTP_CODE}" != '200' ]]; then
  cat /tmp/binder-delete-response.json >&2
  echo "--- function log (${FUNCTION_LOG}) ---" >&2
  cat "${FUNCTION_LOG}" >&2 || true
  echo "--- end of function log ---" >&2
  echo "delete-account returned HTTP ${HTTP_CODE}" >&2
  exit 1
fi

python3 - <<'PY'
import json
with open('/tmp/binder-delete-response.json', encoding='utf-8') as f:
    response = json.load(f)
if response.get('deleted') is not True:
    raise SystemExit(f"unexpected deletion response: {response}")
PY

AFTER="$(psql "${DB_URL}" -X -At -F '|' -c "select (select count(*) from auth.users where id='${USER_ID}'::uuid),(select count(*) from storage.objects where bucket_id='profile-media' and name='${USER_ID}/delete-integration.webp'),(select count(*) from private.account_safety where user_id='${USER_ID}'::uuid),(select count(*) from public.legal_acceptances where user_id='${USER_ID}'::uuid);")"
if [[ "${AFTER}" != '0|0|0|0' ]]; then
  echo "Deletion invariant failed after function call: ${AFTER}" >&2
  exit 1
fi

echo "PASS: authenticated Edge deletion removed Auth identity, Storage media and cascading account state."