# Binder

**A relationship-first dating app with a fast discovery loop, mutual matching and safety built into the architecture.**

Binder is an independent implementation. It does not use Tinder source code, private APIs, trademarks or copied assets.

## Current status

Phase 0 is frozen. Phase 1 is merged to `main` as the stable identity baseline. Phase 2 is complete on the `phase/2-matching` development branch and remains unmerged until explicitly approved.

Phase 1 includes:

- Expo 57 / React Native 0.86, Android-first with the iOS path preserved
- Supabase Auth with persistent React Native sessions
- mandatory server-enforced 18+ onboarding
- profile editor, interests and discovery preferences
- profile images compressed client-side to a maximum 1080 px edge, WebP at 80% quality before upload
- private profile-media bucket with owner-scoped writes
- exact birth date and exact PostGIS coordinates isolated from public profile data
- safe server projections for calculated age and distance
- reciprocal block visibility rules and report storage
- strict RLS plus a reduced SQL privilege allowlist

Phase 2 adds:

- live foreground-location discovery instead of demo profiles
- server-side reciprocal gender, age and distance filtering
- stale-location rejection and rounded kilometer output only
- persistent immutable `Bind` / `Pass` decisions
- no direct client writes to decision or match tables
- canonical `(user_low, user_high)` match identity with a database unique constraint
- pair-level transaction serialization before reciprocal decision checks
- exactly-once private `match_created` outbox event generation
- block operations serialized on the same pair lock and active matches deactivated immediately
- private profile photos delivered through short-lived signed URLs
- Supabase TypeScript types generated from the live Phase 2 database

## Verification

The Phase 2 development branch is gated by:

- TypeScript compile
- Android Expo/Metro bundle export
- complete local Supabase migration replay from an empty database
- 40 pgTAP assertions across Phase 1 and Phase 2
- a parallel race test with 8 independent reciprocal pairs / 16 concurrent database sessions
- two additional concurrent idempotency retry rounds
- database lint restricted to Binder-owned `public` and `private` schemas

The concurrency invariant is strict: 8 simultaneous reciprocal pairs must produce exactly 16 decisions, 8 matches and 8 private match-created events. Retry rounds must not increase any of those counts.

## Run it

Requirements: Node.js 22.13+ and npm.

```bash
npm install
npm run typecheck
npm run bundlecheck
npm run android
```

You can also start the Expo development server with:

```bash
npm start
```

## Product principles

- The initial launch is genuinely free.
- Mutual interest is required before normal chat.
- Exact user location is never exposed to another client.
- Blocking and reporting are server-enforced operations.
- Binder is 18+ and the public release must satisfy current store age-access requirements.
- We reproduce useful public interaction patterns independently instead of copying proprietary implementation details.

## Build phases

0. **Interaction proof** — swipe deck and local mutual-match state. *(frozen)*
1. **Identity** — Supabase Auth, 18+ onboarding, profile editor, compressed photo storage, privacy/RLS gates. *(merged to main)*
2. **Matching** — server-side discovery, persistent decisions and race-safe atomic mutual matches. *(verified on development branch)*
3. **Conversation** — realtime chat, notifications, unmatch, block and report flows. *(next)*
4. **Safety gate** — moderation, rate limits, deletion and broader adversarial tests.
5. **Beta** — real testers, ranking instrumentation and crash/performance hardening.
6. **Monetization later** — only after the free core has real usage and retention data.

## Design language

The working vocabulary is deliberately Binder-specific:

- positive decision: **Bind**
- negative decision: **Pass**
- mutual match: **It's a Bind**

Current visual direction: dark, editorial, high contrast, lime accent. This is a starting system, not a Tinder skin.

## Architecture docs

- `docs/PRODUCT.md` — product contract and scope
- `docs/ARCHITECTURE.md` — backend boundaries and matching invariants
- `docs/SAFETY.md` — release-blocking dating safety requirements
- `docs/REVERSE_ENGINEERING.md` — independent public-behavior implementation boundary

## Backend

Binder uses Supabase Postgres + Auth + Storage with Row Level Security. The app contains only the publishable client credential. Raw birth dates and exact coordinates remain private; candidate generation, calculated age, distance and match creation are server-side.

Phase 2 is already deployed to the Binder Supabase project, while the app code remains isolated on its development branch until the repository merge is explicitly approved.

## License

No project license has been selected yet.
