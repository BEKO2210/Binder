# Binder Architecture

## Client

Android-first React Native app via Expo SDK 57. iOS remains possible from the same codebase.

`App.tsx` must export `src/Root`; CI verifies this exact entrypoint so Auth and 18+ onboarding cannot be bypassed by accidentally mounting a feature screen directly.

The authenticated root exposes three areas: Discover, Matches and Profile. Opening an active match replaces the tab shell with the conversation screen until the user returns or the conversation is ended.

Discovery removes a card only after `record_decision` succeeds. Chat follows the same durable-first rule: a message bubble is treated as sent only after `send_message` confirms it server-side. Network retry reuses the same `client_message_id`.

Location access remains foreground-only. Raw coordinates are sent only to `set_my_location`; discovery returns rounded distance, never another user's coordinates.

## Backend

Binder uses Supabase Postgres, Auth, Storage and Realtime. The mobile client contains only a publishable credential and has no service-role secret.

### Public tables

- `profiles` — public-facing profile fields
- `user_private` — birth date and exact PostGIS location; self-readable only
- `user_preferences` — discovery preferences
- `profile_media` — metadata for private Storage objects
- `decisions` — immutable `bind` / `pass` decisions
- `matches` — canonical pair row, status `active`, `blocked` or `unmatched`
- `messages` — persisted match messages with idempotent client IDs
- `match_read_state` — per-user read watermark for an active match
- `device_tokens` — push tokens owned by the currently authenticated account
- `blocks` — directional block action with reciprocal effects
- `reports` — append-only user reports

### Private tables

- `private.match_events` — exactly-once match-created outbox
- `private.push_outbox` — exactly-once `new_match` / `new_message` delivery jobs
- `private.report_context` — moderation snapshot of the reported profile and optional message

## Security boundary

RLS and SQL privileges are separate gates.

Clients cannot directly insert messages, write match status, insert reports, or insert device tokens. Conversation mutations go through a narrow RPC surface that validates `auth.uid()`, match membership, current state and inputs.

Relevant public RPCs:

- `get_public_profile(target_user_id)` — safe profile projection
- `distance_to_user(target_user_id)` — server-calculated rounded distance
- `get_discovery_batch(limit)` — filtered discovery projection
- `record_decision(target_user_id, decision)` — decision/match mutation
- `get_my_matches()` — safe active-match inbox projection
- `send_message(match_id, client_message_id, body)` — only message write path
- `mark_match_read(match_id)` — member-only read watermark
- `unmatch(match_id)` — terminal conversation transition
- `report_user(...)` — validated report context + optional block
- `register_push_token(token, platform)` / `unregister_push_token(token)` — token ownership boundary

Server helpers and outboxes remain in the non-exposed `private` schema.

## Discovery and match invariants

Discovery requires completed onboarding, fresh locations, reciprocal preference compatibility, distance compatibility, a primary photo, no block, no prior viewer decision and no active match.

One ordered user pair has at most one durable decision. Mutual matching is database-owned.

For reciprocal binds, the canonical user pair is serialized with a transaction-scoped Postgres advisory lock before the reciprocal check. A unique `(user_low,user_high)` match identity prevents duplicate matches; serialization additionally prevents the zero-match race where simultaneous transactions cannot see each other's uncommitted decision.

An AFTER INSERT trigger creates one `private.match_events(..., 'created')` row. A uniqueness constraint makes this event exactly-once for the match.

## Conversation invariant

Normal chat exists only for an active match.

`messages` has no authenticated INSERT privilege. `send_message` validates membership and active status, then serializes against both abuse and lifecycle races:

1. resolve an already-committed `(sender_id, client_message_id)` retry if it exists
2. acquire a sender-wide transaction advisory lock
3. re-check the idempotency key after waiting for that lock
4. lock the match row with `FOR UPDATE`
5. require the caller to be a member and the match to still be `active`
6. enforce sender-wide 20/minute and 300/hour limits
7. insert exactly one message

The sender-wide lock matters because the rate limit spans all conversations, not one match. Parallel sends across different chats cannot each observe a stale count and collectively exceed the limit.

The match row lock serializes send with Unmatch/Block. If Send wins, it commits before the terminal transition can lock the match. If Unmatch/Block wins, the later send sees a non-active match and is rejected.

Terminal match timestamps use `clock_timestamp()` after the row lock is acquired, representing the actual transition moment rather than PostgreSQL's transaction-start `now()` value.

## Message idempotency invariant

`messages` has `UNIQUE(sender_id, client_message_id)`.

The client creates a cryptographically random UUID once per send attempt and preserves it across retry. `send_message` checks the key both before and after waiting on locks. Multiple simultaneous retries therefore resolve to one persisted message and one message outbox event.

Changing the payload while reusing the same client ID is rejected.

## Realtime invariant

`public.messages` is included in the `supabase_realtime` publication.

The client subscribes to Postgres Changes filtered by `match_id`. Delivery remains constrained by the same message SELECT RLS: only members of the currently active match can read rows.

Realtime is transport, not authority. A received event is merely a notification of an already committed database row.

## Read-state invariant

Unread count includes every incoming message when no read state exists. Once `match_read_state` exists, only incoming rows newer than `last_read_at` count.

This intentionally avoids using match creation time as a fallback boundary: PostgreSQL transaction timestamps can be equal for a freshly-created match and its first message.

## Unmatch and block invariant

`unmatch(match_id)` is member-only and idempotent. It changes an active match to `unmatched` and records `ended_at` at the actual terminal transition.

Block is stronger than discovery, matching and messaging. Block insertion uses the canonical pair serialization inherited from Phase 2; any active match becomes `blocked` immediately. Blocked/unmatched conversations disappear through RLS and inbox queries.

## Reporting invariant

A report can target a profile interaction or a message in a match shared by reporter and reported user.

`report_user` validates the relationship between report target, match and optional message. It stores the user-facing report plus a private moderation snapshot containing the reported profile and, when supplied, the reported message body. `p_block=true` inserts the block in the same RPC transaction.

Clients cannot read `private.report_context` or moderation internals.

## Push invariant and current boundary

Match creation and message insertion create private push-outbox jobs from database triggers, never from client claims. Partial unique indexes ensure one job per recipient/match or recipient/message.

Push token registration is opt-in. Re-registering the same device token moves ownership to the currently authenticated account so a previous account on the device does not remain the notification owner.

The repository and database **do not yet claim end-to-end remote push delivery**. A real Expo/EAS project ID, platform credentials and a server dispatcher still have to be connected. Realtime chat does not depend on that external setup.

## Location model

Exact coordinates live only in `user_private.location` as PostGIS geography. Discovery uses server-side spatial predicates and returns approximate kilometers. Exact coordinates must never enter analytics, match events, message payloads, report snapshots or push payloads.

## Verification gates

Phase 3 CI replays all migrations from an empty Supabase database and runs:

- 77 pgTAP assertions across Phases 1–3
- Phase 2 reciprocal-bind concurrency regression
- 12 simultaneous retries of one message: required result 1 message / 1 push job
- 8 independent send-vs-unmatch races: no duplicate and no post-end message
- 24 simultaneous sends by one user across two matches: exactly 20 accepted / 20 push jobs
- Binder-schema database lint with errors failing CI
- production-entrypoint verification
- TypeScript compile
- Android Expo/Metro bundle export

## Scaling path

Phase 0: local interaction proof. *(frozen)*

Phase 1: Auth + profiles + Storage + privacy boundary. *(merged)*

Phase 2: live discovery + decisions + atomic matches. *(merged)*

Phase 3: match inbox + persisted Realtime chat + unread state + unmatch/block/report + push outbox groundwork. *(verified on development branch)*

Phase 4: moderation operations, deletion/retention, broader abuse controls and adversarial safety gates.

Phase 5: real beta testers, crash/performance hardening and ranking instrumentation.
