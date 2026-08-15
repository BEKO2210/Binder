# Binder

**A relationship-first dating app with mutual matching, conversation safety and explicit account control built into the architecture.**

Binder is an independent implementation. It does not use Tinder source code, private APIs, trademarks or copied assets.

## Current status

Phases 1–4 are merged to `main`; Phase 0 remains frozen as the original interaction proof. Phase 5 is being hardened on `phase/5-beta` in draft PR #5 and is not merged yet.

The production Binder Supabase project is synchronized through Phase 4, including the authenticated `delete-account` Edge Function. Phase 5 database migrations remain intentionally undeployed until the Phase 5 branch passes its complete gate and is approved for merge.

### Phase 1 — identity

- Supabase Auth with persistent React Native sessions
- server-enforced 18+ onboarding baseline
- profile/preferences and client-compressed WebP profile images
- private raw birth date and exact PostGIS location
- RLS plus reduced SQL grants and adversarial privacy tests

### Phase 2 — matching

- foreground-location discovery with reciprocal age, preference and distance checks
- persistent immutable `Bind` / `Pass` decisions
- canonical pair locks before mutuality checks
- exactly one match + exactly one match-created event under concurrent reciprocal likes
- reciprocal block semantics and server-only match mutation paths

### Phase 3 — conversation

- Matches inbox, signed profile media, last-message preview and unread state
- persisted 1:1 Realtime chat protected by message RLS
- idempotent server-confirmed sends
- 20 messages/minute and 300/hour sender-wide limits, serialized across concurrent chats
- send-vs-unmatch/block serialization
- Unmatch, Block, profile/message reporting and immutable report evidence snapshots
- private device-token registry and exactly-once push-outbox groundwork

Remote push delivery is **not** claimed end-to-end yet. Real EAS/platform credentials plus the dispatcher remain an external release gate; chat and Realtime do not depend on remote push.

### Phase 4 — safety gate

- versioned Terms & Community Rules + Privacy acceptance **before profile/photo/message UGC**
- fail-closed Legal Gate in the app before onboarding or normal tabs
- account safety state: `active`, `suspended`, `deletion_requested`
- new/replaced profile photos forced to `pending`; only approved media can be shown to other users
- private moderation queue for photo reviews and safety reports
- underage reports receive highest queue priority
- server-only moderation actions with immutable action log
- account restrictions immediately remove discovery visibility, close active matches and disable push tokens
- authenticated Delete Account Edge Function that removes profile media and Supabase Auth identity
- public external deletion path for users who no longer have the app
- pre-match report + block flow from Discovery
- public Binder product/safety site with Privacy, Terms and Account Deletion pages
- exact high/critical npm-audit leaf gate; the only documented exception is the current transitive Metro `image-size` build-tool advisory chain

### Phase 5 — beta hardening

- first-party beta observability with no third-party analytics SDK
- private ranking batches/impressions with position, interest overlap and **10 km distance buckets**, never raw coordinates, profile text or media paths
- server-authored funnel events for onboarding, decisions, matches, first messages and reports
- optional client diagnostics that are **off by default**, contain only fixed event names/durations/counts/outcomes and are deleted immediately when the user opts out
- private in-app beta feedback
- crash fallback instead of a blank render failure; raw exception messages and component stacks are not sent to telemetry
- three real Phase 4 foreign-key index advisor findings fixed
- measured Android Hermes baseline and CI bundle-size budget
- documented beta operator runbook in `docs/BETA-RUNBOOK.md`

## Verification

The Phase 5 gate extends all earlier regressions with:

- app entrypoint contract
- public policy-site contract, broken-link checks and tracking-script denylist
- Phase 4 safety-wiring contract
- Phase 5 privacy/telemetry contract
- production dependency audit with advisory-level allowlist
- Deno typecheck for the account-deletion Edge Function
- TypeScript strict compile
- Android Expo/Metro export
- measured Android export baseline: **2.39 MiB** on the Phase 5 branch
- CI export budget: **2.75 MiB** total Android export
- complete local Supabase migration replay from an empty database
- Phase 5 pgTAP coverage for diagnostics opt-in/out, private feedback, ranking privacy, funnel authorship and retention behavior
- existing reciprocal-match, conversation-race and sender-wide rate-limit stress regressions
- account-deletion integration across Auth + Storage + Edge Function
- database lint restricted to Binder-owned `public` and `private` schemas

Phase 5 is not considered complete until the latest branch head has both Binder CI and Binder Database Tests green. No Phase 5 migration is deployed to production before that gate and merge approval.

## Public site

Binder ships a static, dependency-free GitHub Pages site in `site/`:

- product + safety overview
- Privacy Policy
- Terms & Community Rules
- external Account Deletion resource

The Privacy page separates authoritative first-party beta product measurement from optional technical client diagnostics. Optional diagnostics are disabled by default; ranking measurement stores coarse distance buckets rather than coordinates. Policy pages contain no analytics or third-party tracking scripts.

## Run it

Requirements: Node.js 22.13+ and npm.

```bash
npm install
npm run typecheck
npm run bundlecheck
npm run android
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
- Binder is 18+ and public release remains blocked on the required store-side adult-access configuration.
- Account deletion is a product surface, not a support-only workaround.
- Binder reproduces useful public interaction patterns independently instead of copying proprietary implementation details.
- Beta measurement must not become a reason to leak profile, chat or precise-location content.

## Build phases

0. **Interaction proof** — swipe deck and local mutual-match state. *(frozen)*
1. **Identity** — Auth, 18+ onboarding, profile/media and privacy/RLS gates. *(merged)*
2. **Matching** — server discovery, durable decisions and atomic mutual matches. *(merged)*
3. **Conversation** — Realtime chat, unread state, unmatch, block/report and push groundwork. *(merged)*
4. **Safety gate** — legal/UGC gate, moderation, account deletion, public policies and broader adversarial tests. *(merged)*
5. **Beta** — privacy-preserving ranking/funnel instrumentation, feedback and crash/performance hardening. *(draft PR)*
6. **Monetization later** — only after the free core has real usage and retention data.

## Design language

- positive decision: **Bind**
- negative decision: **Pass**
- mutual match: **It's a Bind**

Current visual direction: dark, editorial, high contrast and intentionally restrained. Lime means progress/trust; pink means destructive or safety-critical commitment. The UI is an independent Binder system, not a Tinder skin.

## Architecture docs

- `docs/PRODUCT.md` — product contract and scope
- `docs/ARCHITECTURE.md` — backend boundaries and concurrency invariants
- `docs/SAFETY.md` — release-blocking dating safety requirements
- `docs/PLAY-RELEASE.md` — repository-backed and external Google Play release gates
- `docs/BETA-RUNBOOK.md` — Phase 5 beta operations, moderation and metric handling
- `docs/REVERSE_ENGINEERING.md` — independent public-behavior implementation boundary

## Backend

Binder uses Supabase Postgres + Auth + Storage + Realtime with Row Level Security. The mobile app contains only the publishable client credential. Raw birth dates and exact coordinates remain private; candidate generation, calculated age, distance, match creation and conversation mutations are server-enforced.

## License

No project license has been selected yet.
