# Binder Architecture v0

## Client

Android-first React Native app via Expo SDK 57. iOS remains possible from the same codebase.

The first prototype intentionally uses only React Native primitives for the card gesture so the core interaction is not coupled to a swipe dependency.

## Backend target

Supabase is the initial backend target because the free tier currently provides Postgres, Auth, Storage and Realtime in one system. The client must never contain a service-role secret.

### Domain tables

- profiles
- profile_photos
- interests
- profile_interests
- discovery_preferences
- decisions
- matches
- messages
- blocks
- reports
- moderation_actions
- device_tokens

## Invariants

### Decisions

A user may have at most one current decision toward a given profile in the active discovery epoch.

### Matches

A match exists only when both users have an active positive decision toward each other.

Match creation must happen atomically in the database. The mobile client must not decide that a match exists by comparing two client-side responses.

Represent a pair canonically as `(user_low, user_high)` and enforce a unique constraint so races cannot create duplicate matches.

### Messages

A message insert is permitted only when:

- the sender is one member of the match,
- the match is active,
- neither member blocks the other,
- the sender is not currently rate-limited.

### Blocks

A block is stronger than discovery, matching and messaging. Once active, both directions must disappear from discovery and messaging access immediately.

### Reports

Reports are append-only user events. Users may not read moderation notes or other users' reports.

## Location model

Never expose raw device coordinates through the public profile API.

Recommended initial model:

1. device sends current coordinates to a protected server-side function,
2. server converts them to a coarse spatial cell / geography value,
3. ranking queries distance server-side,
4. client receives only rounded distance bands or approximate kilometers,
5. stale location expires and must be refreshed.

Exact coordinates must not be stored in analytics events or chat metadata.

## Discovery pipeline

Candidate generation filters first:

- not self
- adult + active + discoverable
- preference compatibility
- within configured distance
- not previously blocked in either direction
- not already an active match
- exclude recently passed profiles according to replay policy

Then rank with an explainable score:

`score = reciprocal_preferences + interest_overlap + activity_quality + freshness - repetition_penalty`

Do not use protected traits as hidden desirability scores. Do not implement a global attractiveness/Elo number.

## Security boundary

Use Postgres Row Level Security on every user-owned table. Client API keys are publishable keys only. Privileged moderation and atomic match operations belong in database functions or server-side functions with explicit authorization.

## Scaling path

Phase 0: local demo data.

Phase 1: Supabase Auth + profiles + Storage.

Phase 2: server-side discovery RPC + decisions + atomic matches.

Phase 3: Realtime chat + push + moderation.

Phase 4: ranking experiments behind feature flags.

This sequence lets every phase be tested independently instead of shipping a single giant implementation.
