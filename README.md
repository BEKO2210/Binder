# Binder

**A relationship-first dating app with a fast discovery loop, mutual matching and safety built into the architecture.**

Binder is an independent implementation. It does not use Tinder source code, private APIs, trademarks or copied assets.

## Current status

Phase 0 is frozen. Phase 1 and Phase 2 are merged to `main`. Phase 3 is complete on the `phase/3-conversation` development branch and remains unmerged until explicitly approved.

Phase 1 includes identity, 18+ onboarding, profile/preferences, compressed private photos and privacy/RLS boundaries.

Phase 2 adds live location-based discovery, persistent `Bind` / `Pass` decisions and race-safe atomic mutual matching.

Phase 3 adds:

- `App.tsx` locked to the real Auth/Onboarding `Root` entrypoint by CI
- Matches inbox with signed profile photos, last-message preview and unread badges
- persisted 1:1 messages available only to members of an active match
- Supabase Realtime Postgres Changes filtered by `match_id` and protected by message RLS
- idempotent client message IDs and server-confirmed sends instead of optimistic fake success
- 20 messages/minute and 300/hour sender-wide limits, serialized across concurrent chats
- send-vs-unmatch/block serialization so no new message can commit after a conversation ends
- idempotent Unmatch and immediate Block match deactivation
- profile/message reporting with server-captured moderation snapshots and optional atomic block
- private push-token registry plus exactly-once `new_match` / `new_message` push outbox jobs
- push opt-in UI that degrades safely when this build has no EAS project ID
- Phase 3 Supabase TypeScript types generated from the live database
- foreign-key/index hardening for conversation and outbox tables

## Phase 3 verification

The development branch is gated by:

- production entrypoint verification
- TypeScript compile
- Android Expo/Metro bundle export
- complete local Supabase migration replay from an empty database
- **77 pgTAP assertions** across identity, matching and conversations
- Phase 2 reciprocal-match concurrency regression
- **12 simultaneous retries of one message → exactly 1 message + 1 push job**
- **8 send-vs-unmatch races → no duplicate or post-end messages**
- **24 simultaneous sends by one user across two chats → exactly 20 accepted + 20 push jobs**
- database lint restricted to Binder-owned `public` and `private` schemas

The tested Phase 3 database migrations are already deployed to the Binder Supabase project. Normal authenticated clients cannot directly insert messages, update matches, insert reports or insert device tokens; those mutations go through the intended server-side boundaries.

### Remote push status

The database outbox, token registration and app opt-in path are implemented. **Remote push delivery is not claimed end-to-end yet.** A real Expo/EAS project ID plus Android/iOS push credentials and the server dispatcher must be connected before remote notifications become a release gate. Chat and realtime messaging do not depend on remote push.

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

Environment variables:

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
EXPO_PUBLIC_EAS_PROJECT_ID=   # optional until remote push is connected
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
2. **Matching** — server-side discovery, persistent decisions and race-safe atomic mutual matches. *(merged to main)*
3. **Conversation** — realtime chat, unread state, unmatch, block/report and push groundwork. *(verified on development branch)*
4. **Safety gate** — moderation operations, account deletion, broader abuse controls and adversarial tests. *(next)*
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

Binder uses Supabase Postgres + Auth + Storage + Realtime with Row Level Security. The app contains only the publishable client credential. Raw birth dates and exact coordinates remain private; candidate generation, calculated age, distance, match creation and conversation mutations are enforced server-side.

## License

No project license has been selected yet.
