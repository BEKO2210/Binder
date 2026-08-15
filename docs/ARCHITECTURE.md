# Binder Architecture

## Client

Binder is Android-first React Native via Expo SDK 57; iOS remains possible from the same codebase.

`App.tsx` must export `src/Root`; CI locks this entrypoint so Auth, the legal gate and onboarding cannot be bypassed by accidentally mounting a feature screen directly.

Authenticated flow is fail-closed:

1. resolve Supabase session
2. load the current server legal-policy versions
3. require explicit Terms & Community Rules + Privacy acceptance when the current versions are not accepted
4. only then resolve onboarding state
5. expose Discover / Matches / Profile

A network or policy-state error never falls through into onboarding or normal UGC screens.

Discovery removes a card only after `record_decision` succeeds. Chat is durable-first too: a message is considered sent only after `send_message` confirms it server-side. Retry reuses the same `client_message_id`.

Location remains foreground-only. Raw coordinates go only to `set_my_location`; discovery returns rounded distance, never another user's coordinates.

## Backend

Binder uses Supabase Postgres, Auth, Storage and Realtime. The mobile client contains only a publishable credential and no service-role secret.

### Public tables

- `profiles` — user-facing profile fields
- `user_private` — raw birth date + exact PostGIS location; self-readable only
- `user_preferences` — discovery preferences
- `profile_media` — private Storage metadata + moderation state
- `legal_acceptances` — accepted Terms/Privacy versions for the authenticated user
- `decisions` — immutable `bind` / `pass` decisions
- `matches` — canonical pair row with `active`, `blocked` or `unmatched` state
- `messages` — persisted match messages with idempotent client IDs
- `match_read_state` — per-user read watermark
- `device_tokens` — push token owned by the currently authenticated account
- `blocks` — directional block with reciprocal product effects
- `reports` — append-only safety reports

### Private tables

- `private.account_safety` — `active`, `suspended`, `deletion_requested`
- `private.moderation_cases` — prioritized photo/report review queue
- `private.moderation_actions` — immutable operator action log
- `private.match_events` — exactly-once match-created outbox
- `private.push_outbox` — exactly-once `new_match` / `new_message` delivery jobs
- `private.report_context` — evidence snapshot of reported profile/message context

No normal authenticated client can read moderation cases/actions or directly mutate moderation state.

## Legal / UGC invariant

Profile text, profile media and messages are UGC. The current legal-policy versions therefore form a server-side precondition, not merely an app checkbox.

`accept_legal_terms(terms_version, privacy_version)` only accepts exactly the versions currently declared by the backend. Direct INSERT into `legal_acceptances` is not granted to clients.

Before creating or replacing profile UGC or sending a new message, the server requires:

- authenticated caller
- account status `active`
- current Terms version accepted
- current Privacy version accepted

The app mirrors this with `LegalGateScreen`, but the database remains authoritative.

## Account-safety invariant

Every Auth user receives one `private.account_safety` row.

A transition away from `active` is terminal for normal product visibility at that moment:

- profile `onboarding_complete` becomes false
- active matches become `unmatched`
- device tokens are disabled
- discovery/profile projection logic rejects the account
- new UGC writes are rejected

The safety transition and sender-wide message mutation share the sender advisory-lock domain so account restriction cannot race around a new message commit.

`prepare_account_deletion()` performs immediate product deactivation. Full account removal is completed by the authenticated `delete-account` Edge Function, which removes profile-media objects and then deletes the Supabase Auth user with an admin-only credential held server-side.

The public external deletion resource remains available even when the app is no longer installed.

## Media moderation invariant

New or replaced profile media is always forced to `pending` by a server trigger. A client cannot self-assign `approved`, `rejected` or `removed`.

Each new/replaced media item creates a private `photo_review` moderation case. Other users can receive only approved profile media. The owner can still read their own pending/rejected state and see the status in Profile.

`private.moderate_case(...)` is service-role only and supports explicit operator outcomes such as approve/reject/remove media, dismiss/warn, or suspend an account. Every terminal moderation decision writes an immutable `private.moderation_actions` record.

## Reporting / moderation invariant

`report_user(...)` validates target, match and optional message relationships, stores the user-facing report and snapshots relevant evidence into `private.report_context`.

Every report also creates a private moderation case. Priority is deterministic: underage concerns are highest priority, followed by violence, sexual content, harassment and normal/default reports.

`p_block=true` inserts the block within the same server RPC transaction. The reported/blocked person is not given the reporter identity through the product.

Discovery also exposes a pre-match report+block surface so a user does not need to match before reaching safety controls.

## Discovery and match invariants

Discovery requires:

- both accounts active
- both current legal versions accepted
- completed onboarding
- fresh locations
- reciprocal preference compatibility
- reciprocal age compatibility
- distance compatibility
- approved primary media for both sides
- no block
- no prior viewer decision
- no active pair match

Mutual matching remains database-owned. The canonical user pair is serialized with a transaction advisory lock before reciprocal decision checks. A unique `(user_low,user_high)` identity prevents duplicates; serialization also prevents the simultaneous zero-match race.

An AFTER INSERT trigger creates one private match-created event, protected by uniqueness.

## Conversation invariant

Normal chat exists only for an active match between active/current-policy accounts.

`messages` has no authenticated INSERT privilege. `send_message`:

1. resolves an existing `(sender_id, client_message_id)` retry
2. acquires the sender-wide advisory lock
3. rechecks the retry key
4. requires active account + current legal acceptance
5. locks the match row
6. requires active membership and an active/current-policy peer
7. enforces sender-wide 20/minute + 300/hour limits
8. inserts exactly one message

The match row lock serializes Send against Unmatch/Block. Terminal transitions use `clock_timestamp()` so `ended_at` reflects the actual transition after lock acquisition rather than PostgreSQL transaction-start time.

## Realtime invariant

`public.messages` is in the `supabase_realtime` publication. The client subscribes to Postgres Changes filtered by `match_id`, but Realtime is only transport: message SELECT RLS remains the read authority.

## Push boundary

Match/message/moderation/safety commits create idempotent private push-outbox jobs from database triggers, never from client claims. Phase 7 expands each logical job into one durable delivery row per current device, then rechecks account, match, token ownership, category and quiet-hours gates immediately before claiming it. Expo tickets and receipts drive bounded retry, invalid-token disablement and dead-letter state without storing message content in push payloads or logs.

The candidate implementation does not itself claim end-to-end delivery. A real linked EAS project ID, FCM/APNs credentials, deployed dispatcher/Cron and the completed two-physical-device matrix remain mandatory release gates.

## Dependency / runtime separation

The mobile app and Supabase Edge Functions are different runtimes:

- Expo/React Native code is checked by TypeScript + Android Metro bundle
- `supabase/functions/**` is excluded from mobile `tsc`
- the account-deletion Edge Function is independently checked by Deno using its local `deno.json`

Production npm audit is evaluated by leaf advisory severity. New unapproved High/Critical advisories fail CI; the current exact Metro `image-size` build-tool advisory chain is documented rather than hidden by a blanket audit bypass.

## Verification gates

Phase 4 replays every migration from an empty local Supabase database and runs:

- **108 pgTAP assertions** across identity, matching, conversation, legal/safety and moderation
- Phase 2 reciprocal-bind concurrency regression
- 12 concurrent retries of one message → exactly one message / one push job
- 8 send-vs-unmatch races → no duplicate or post-end messages
- 24 parallel cross-chat sends by one sender → exactly 20 accepted / 20 push jobs
- Binder-owned schema lint with error-level failures
- app entrypoint contract
- public policy-site contract
- Phase 4 safety-wiring contract
- advisory-level production dependency audit
- Deno Edge Function typecheck
- strict TypeScript compile
- Android Expo/Metro bundle

## Deployment sequencing

Phase 4 is intentionally not deployed to the production Binder Supabase project before the compatible app branch is approved. The mandatory legal gate is a breaking backend contract for older Phase 3 clients.

Safe order after explicit approval:

1. merge the compatible Phase 4 code
2. apply the tested Phase 4 migrations
3. deploy the verified account-deletion Edge Function
4. regenerate TypeScript database types from the live schema
5. verify production advisors/grants and post-merge CI
6. publish/verify GitHub Pages and release-store configuration

## Scaling path

Phase 0: interaction proof. *(frozen)*

Phase 1: Auth + profiles + Storage + privacy boundary. *(merged)*

Phase 2: live discovery + decisions + atomic matches. *(merged)*

Phase 3: inbox + Realtime chat + unread state + unmatch/block/report + push groundwork. *(merged)*

Phase 4: legal UGC gate + moderation + account deletion + public safety policies + expanded adversarial gates. *(development branch)*

Phase 5: real beta testers, crash/performance hardening and ranking instrumentation.
