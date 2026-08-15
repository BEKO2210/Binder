# Binder

**A relationship-first dating app with a fast discovery loop, mutual matching and safety built into the architecture.**

Binder is an independent implementation. It does not use Tinder source code, private APIs, trademarks or copied assets.

## Current status

Phase 0 is frozen as the last stable interaction proof. Phase 1 is complete on the `phase/1-identity` development branch and remains unmerged until explicitly approved.

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
- generated Supabase TypeScript schema types
- Android Expo bundle verification in CI
- local Supabase migration replay, 16 pgTAP privacy/RLS tests and app-schema DB lint in CI

The discovery deck still uses demo profiles. Real candidate discovery, swipe persistence and atomic mutual matching belong to Phase 2.

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
1. **Identity** — Supabase Auth, 18+ onboarding, profile editor, compressed photo storage, privacy/RLS gates. *(verified on development branch)*
2. **Matching** — server-side discovery, decisions and atomic mutual matches. *(next)*
3. **Conversation** — realtime chat, notifications, unmatch, block and report flows.
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

Binder currently uses Supabase Postgres + Auth + Storage with Row Level Security. The app contains only the publishable client credential. Raw birth dates and exact coordinates remain private; public profile data and distance are projected server-side.

Phase 2 will add atomic swipe/match persistence in Postgres so simultaneous reciprocal likes create exactly one match record and one downstream match event.

## License

No project license has been selected yet.
