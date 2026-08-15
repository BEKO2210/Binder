# Binder Architecture

## Client

Android-first React Native app via Expo SDK 57. iOS remains possible from the same codebase.

The swipe gesture uses React Native primitives. Phase 2 replaces demo profiles with server discovery. A card is removed only after `record_decision` succeeds; a failed request springs the card back so visual state cannot get ahead of durable state.

Location access is foreground-only. The client sends current coordinates to the protected `set_my_location` RPC and receives only rounded distance in discovery results. Raw coordinates are never returned to another client.

## Backend

Binder uses Supabase Postgres, Auth and Storage. The mobile client contains only a publishable key and has no service-role credential.

### Public tables

- `profiles` — public-facing profile fields owned by one auth user
- `user_private` — birth date and exact PostGIS location; self-readable only
- `user_preferences` — age, gender and distance discovery preferences
- `profile_media` — metadata for private Storage objects
- `decisions` — immutable pairwise `bind` / `pass` decisions
- `matches` — one canonical match row per user pair
- `blocks` — directional block action with reciprocal visibility effects
- `reports` — append-only user reports

### Private tables

- `private.match_events` — server-only outbox for exactly-once match-created events

## Security boundary

Every user-owned public table has Row Level Security. SQL privileges are separately reduced; RLS is not used as a substitute for grants.

Clients may read only their own decision rows and active matches in which they participate. They have no direct INSERT/UPDATE/DELETE privilege on `decisions` or `matches`.

The privileged public RPC surface is deliberately narrow:

- `get_public_profile(target_user_id)` — safe public projection with calculated age
- `distance_to_user(target_user_id)` — server-calculated rounded distance
- `get_discovery_batch(limit)` — server-filtered candidate projection
- `record_decision(target_user_id, decision)` — the only client path that can create decisions/matches

Supporting helpers and the match event outbox live in the non-exposed `private` schema.

## Discovery invariant

A candidate may be returned only if all of these hold at query time:

- viewer and target are different users
- both completed onboarding
- both have a location refreshed within the last 30 days
- both users' gender preferences accept the other
- both users' configured age ranges accept the other
- distance is within the stricter of the two configured maximum distances
- the target has a primary profile image
- neither user blocks the other
- the viewer has not already decided on the target
- there is no active match for the pair

Ranking is intentionally explainable: shared-interest count first, then shorter distance, profile freshness and a deterministic user-id tie break. There is no global attractiveness or Elo score.

## Decision invariant

For one ordered pair `(actor_id, target_id)` there is at most one durable decision.

A retry of the same decision is idempotent. A client may not silently change an existing `pass` into a `bind` or vice versa.

The decision is written only by `record_decision`. The mobile client never determines mutuality itself.

## Atomic match invariant

The dangerous race is two users binding each other at the same time. A unique constraint alone prevents duplicate matches, but without serialization both transactions could insert their own decision and then fail to see the other uncommitted decision, producing zero matches.

Binder therefore serializes every mutation for one user pair before decision/match logic:

1. canonicalize the UUID pair as `low_user = least(a,b)` and `high_user = greatest(a,b)`
2. acquire a transaction-scoped Postgres advisory lock derived from that canonical pair
3. read/replay an existing decision if present
4. otherwise validate that the target is still discoverable
5. insert the new decision
6. if it is a bind, check the reciprocal decision while the pair lock is still held
7. create `matches(user_low,user_high)` with a unique pair constraint

`matches` also enforces `user_low < user_high`, so the same pair has only one representable identity.

## Exactly-once match event invariant

An AFTER INSERT trigger on `matches` writes `private.match_events(match_id, 'created')`.

The outbox has a unique `(match_id, event_type)` constraint. Retries of `record_decision` cannot create another match row and therefore cannot create another `created` event.

This outbox is the future source for Phase 3 push notifications. Push delivery must consume this server event instead of treating a client response as proof that a new match was created.

## Block invariant

A block is stronger than discovery and matching.

Block insertion acquires the same canonical pair lock used by `record_decision`. After the block is inserted, any active match for that pair is changed to `blocked` and receives `ended_at`.

Because block and match mutations serialize on the same pair lock, a concurrent bind cannot race around a block and leave an active match behind.

Both users lose public-profile/discovery visibility through existing reciprocal block rules. Blocked matches disappear through match RLS.

## Location model

Exact device coordinates are stored only in `user_private.location` as PostGIS geography. Discovery uses `ST_DWithin` server-side and returns a rounded kilometer value.

Exact coordinates must never be emitted into analytics, match events, chat metadata or public profile payloads.

## Verification gates

Phase 2 is not accepted by TypeScript alone. CI replays every database migration from zero and runs:

- Phase 1 privacy/RLS tests
- Phase 2 discovery, decision, match, block and permission assertions
- 40 pgTAP assertions total
- a separate multi-session concurrency test
- schema lint for Binder-owned `public` and `private` schemas

The concurrency test creates 8 independent user pairs and starts both reciprocal binds concurrently: 16 database sessions. The required result is exactly 16 decisions, 8 matches and 8 match-created events. Two more concurrent retry rounds must leave those counts unchanged.

## Scaling path

Phase 0: local interaction proof. *(frozen)*

Phase 1: Supabase Auth + profiles + Storage + privacy boundary. *(merged)*

Phase 2: live server discovery + decisions + atomic matches + exactly-once outbox. *(verified on development branch)*

Phase 3: match list + Realtime chat + push delivery from the outbox + unmatch/report flows.

Phase 4: moderation, rate limits and broader adversarial safety gates.

Phase 5: ranking experiments behind feature flags and real retention instrumentation.
