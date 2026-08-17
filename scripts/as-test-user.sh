#!/usr/bin/env bash
# Acts as one of the labelled test accounts through the same public API the app
# uses — password sign-in, then RPC. No service key anywhere in this path, so
# whatever works here works for a real user too.
#
# usage: as-test-user.sh <claude|codex> rpc <function> '<json args>'
#        as-test-user.sh <claude|codex> get '<path+query>'
#        as-test-user.sh <claude|codex> post '<path>' '<json body>'
set -euo pipefail

# Passwords come from the vault, never from a file in the repo.
PW_SOURCE=vault
URL="https://sbohsxtzitqhyswznhec.supabase.co"
ANON=$(~/.local/bin/supabase projects api-keys --project-ref sbohsxtzitqhyswznhec 2>/dev/null \
  | python3 -c 'import sys,json;print(next(k["api_key"] for k in json.load(sys.stdin)["keys"] if k["id"]=="anon"))')

who="$1"; shift
case "$who" in
  claude) EMAIL="belkis.aslani+binder.claude@gmail.com"; PW=$(vault get BINDER_TEST_CLAUDE_PASSWORD) ;;
  codex)  EMAIL="belkis.aslani+binder.codex@gmail.com";  PW=$(vault get BINDER_TEST_CODEX_PASSWORD) ;;
  *) echo "unknown test user: $who" >&2; exit 2 ;;
esac

TOKEN=$(curl -s -X POST "${URL}/auth/v1/token?grant_type=password" -H "apikey: ${ANON}" \
  -H 'Content-Type: application/json' -d "{\"email\":\"${EMAIL}\",\"password\":\"${PW}\"}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("access_token") or "")')
[ -n "$TOKEN" ] || { echo "sign-in failed for $who" >&2; exit 1; }

mode="$1"; shift
case "$mode" in
  rpc)
    fn="$1"; body="${2:-}"; [ -n "$body" ] || body='{}'
    curl -s -X POST "${URL}/rest/v1/rpc/${fn}" -H "apikey: ${ANON}" -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' -d "$body"
    ;;
  get)
    curl -s "${URL}/rest/v1/$1" -H "apikey: ${ANON}" -H "Authorization: Bearer ${TOKEN}"
    ;;
  post)
    curl -s -X POST "${URL}/rest/v1/$1" -H "apikey: ${ANON}" -H "Authorization: Bearer ${TOKEN}" \
      -H 'Content-Type: application/json' -H 'Prefer: return=representation' -d "$2"
    ;;
  *) echo "unknown mode: $mode" >&2; exit 2 ;;
esac
echo
