# Binder Product Contract v0

## Mission

Binder is a relationship-first dating product. The interaction can feel as immediate as modern swipe apps, but the product, branding, copy, ranking and implementation are our own.

We do not copy proprietary Tinder code, private APIs, trademarks, artwork or pixel-identical screens. We reproduce useful public product behavior through an independent implementation.

## Launch rule: genuinely free

At launch, every feature we ship is available without payment. We do not show fake locked buttons, blurred likes, upgrade nags or "coming Pro" banners.

If Binder later introduces paid plans, existing promises must not silently change. Monetization should add scale, convenience or optional visibility features instead of deliberately damaging the free core.

## Core loop

1. User completes an adult-only profile.
2. Binder returns a privacy-safe ranked discovery batch.
3. User chooses Bind or Pass.
4. A Bind is private until interest is mutual.
5. Mutual interest creates exactly one Match.
6. Only matched users can start a normal conversation.
7. Either side can unmatch, block or report.

## MVP feature set

### P0 — required before public users

- Adult access / age gate
- Account creation and sign-in
- Profile: name, birth date, gender, dating intent, bio, interests
- 2-6 profile photos
- Approximate discovery distance; never expose exact coordinates
- Discovery preferences: age range, distance, people shown
- Bind / Pass
- Atomic mutual-match creation
- Match list
- 1:1 realtime chat for matches
- Unmatch
- Block
- Report profile/message/photo
- Account deletion and data deletion path
- Basic admin moderation queue
- Rate limits and abuse controls

### P1 — after the core is stable

- Profile prompts
- Read receipts / typing state only if privacy trade-off is accepted
- Explore-style interest lanes using our own taxonomy and UI
- Photo verification / liveness provider
- Push notifications
- Better ranking from reciprocal preference signals
- Pause profile / incognito controls

### P2 — possible later monetization

Nothing in P2 is visible in the initial product.

Potential future additions:

- Additional discovery controls
- Travel mode
- Undo
- Optional profile visibility boost
- Advanced filters
- Supporter plan

Paid design must be reviewed against safety, fairness and marketplace policies before release.

## Deliberate differences from Tinder

- Brand language is Bind / Pass / It's a Bind.
- Ranking optimizes for reciprocal relevance and healthy conversations, not raw swipe volume.
- Exact location is never displayed or returned to another client.
- No random direct messages before a match.
- No artificial scarcity in the initial free launch.
- Safety actions are first-class domain operations, not UI-only flags.

## Product metrics

Do not optimize only for swipes.

Primary health metrics:

- completed profiles / signups
- discovery-to-mutual-match rate
- matches that exchange at least one message each way
- conversations still active after 24h / 7d
- block/report rate per 1,000 matches
- median report handling time
- account deletion success rate

## Reverse-engineering boundary

Allowed research:

- public app behavior
- official help pages
- public store listings
- user-visible interaction patterns
- black-box timing and state transitions on accounts we control

Not part of this project:

- extracting or redistributing proprietary source code
- bypassing Tinder authentication or access controls
- calling undocumented private Tinder APIs
- copying protected assets or confusing users into thinking Binder is Tinder
