# Test accounts (wave O)

The deck could never be exercised before: the only two production accounts were
already matched with each other. The owner asked for test accounts on
2026-08-17, so two exist now. They are production rows, and they are labelled
everywhere a human can see them.

## Who they are

| Account | User id | Email | Profile |
| --- | --- | --- | --- |
| Claude (Testkonto) | `18bd1d01-2a21-4b01-9e59-f44deac49492` | `belkis.aslani+binder.claude@gmail.com` | man, 34, Freiberg, photo reads **TESTKONTO CLAUDE — KEIN ECHTER NUTZER** |
| Codex (Testkonto) | `9f13d0ff-ae7d-4871-97b5-598e3952f893` | `belkis.aslani+binder.codex@gmail.com` | man, 37, Freiberg, photo reads **TESTKONTO CODEX — KEIN ECHTER NUTZER** |

Both carry the bio "Testkonto für Binder. Kein echter Nutzer", both accept the
current legal versions, both have one approved photo, and both are visible to
the owner's account so discovery has something to show.

Passwords live in the Infisical vault (`infra/dev`), never in this repo:

```
vault get BINDER_TEST_CLAUDE_PASSWORD
vault get BINDER_TEST_CODEX_PASSWORD
```

## Acting as one of them

Sign-in and RPCs go through the same public API the app uses — anon key,
password grant, PostgREST. No service key is involved, so anything that works
this way works for a real user too.

```
scripts/as-test-user.sh claude rpc get_discovery_batch '{"p_limit":5}'
scripts/as-test-user.sh codex  rpc record_decision '{"p_target_user_id":"<uuid>","p_decision":"bind"}'
scripts/as-test-user.sh codex  rpc send_message '{"p_match_id":"<uuid>","p_client_message_id":"<uuid>","p_body":"…"}'
```

## Removing them

One statement removes the accounts and everything they produced — decisions,
matches, messages, media rows, diagnostics — because every table cascades from
`auth.users`:

```sql
delete from auth.users
where id in ('18bd1d01-2a21-4b01-9e59-f44deac49492','9f13d0ff-ae7d-4871-97b5-598e3952f893');
```

The two storage objects under `profile-media/<user id>/` are removed with the
rows only if the storage cleanup runs; delete them in the Supabase storage
browser, or with the service key, when you retire the accounts. Also delete the
two vault entries.

## What was proven with them on 2026-08-17 (S23 Ultra, build v0.5.4)

| Step | Evidence |
| --- | --- |
| A real candidate appears in the deck | Card "Claude (Testkonto) 34", 0 km, photo, bio, interest chips |
| Bind is recorded server-side | `decisions` row, actor = owner account, target = test account |
| Reciprocal bind creates a match | `record_decision` returned `matched: true`, `match_created: true` |
| The match celebration is real, not local state | Celebration shown for "Codex (Testkonto)" after the server confirmed |
| Push arrives for the other side's match | "It's a Bind — Open Binder to see your new match." banner on the device |
| First message sends | Bubble with "Sent", day separator, personalised composer placeholder |
| Realtime delivery works | Reply sent through the API appeared in the open chat within seconds |
| Diagnostics reach the server | 5 client events within seconds of switching diagnostics on |
| Feedback reaches the server | `submit_beta_feedback` row, visible in the daily summary |
| The diagnostics gate holds | A signed-in non-admin calling `admin_diagnostics_health` gets `42501 Admin permission required.` |
