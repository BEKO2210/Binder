# Binder

**A relationship-first dating app with a fast discovery loop, mutual matching and safety built into the architecture.**

Binder is an independent implementation. It does not use Tinder source code, private APIs, trademarks or copied assets.

## Current status

Phase 0 is in the repository now:

- Expo 57 / React Native 0.86 foundation
- Android-first configuration with iOS path preserved
- working draggable profile-card deck
- Bind / Pass actions
- mutual-like demo producing an `It's a Bind` match state
- strict TypeScript
- product, architecture and safety contracts

The current profiles are demo data only. Backend authentication, persistence and real user data come in the next phase.

## Run it

Requirements: Node.js 22.13+ and npm.

```bash
npm install
npm run typecheck
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

1. **Interaction proof** — swipe deck and local mutual-match state. *(current)*
2. **Identity** — Supabase Auth, profile editor, photo storage, onboarding.
3. **Matching** — server-side discovery, decisions and atomic mutual matches.
4. **Conversation** — realtime chat, notifications, unmatch, block and report.
5. **Safety gate** — age-access, moderation, rate limits, deletion and adversarial RLS tests.
6. **Beta** — real testers, ranking instrumentation and crash/performance hardening.
7. **Monetization later** — only after the free core has real usage and retention data.

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

## Backend direction

Supabase is the planned first backend: Postgres + Auth + Storage + Realtime with Row Level Security. The app will contain only publishable client credentials; privileged operations and atomic matching stay server-side.

## License

No project license has been selected yet.
