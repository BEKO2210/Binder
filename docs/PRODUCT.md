# Binder Product Contract v0

## Mission

Binder is a relationship-first dating product. The interaction can feel as immediate as modern swipe apps, but the product, branding, copy, ranking and implementation are our own.

We do not copy proprietary Tinder code, private APIs, trademarks, artwork or pixel-identical screens. We reproduce useful public product behavior through an independent implementation.

## Product rule: genuinely free

Binder is one free product. There is no Pro, Premium, Supporter or paid feature tier in the product roadmap.

We do not show fake locked buttons, blurred likes, upgrade nags, paid boosts or "coming Pro" banners. Matching, messaging, safety, notifications, settings, themes and profile media remain product capabilities rather than paywall candidates.

Future roadmap decisions may improve quality, scale, accessibility, localization, safety or operations, but the product must not deliberately degrade the free experience to manufacture an upgrade path.

## Core loop

1. User completes an adult-only profile.
2. Binder returns a privacy-safe ranked discovery batch.
3. User chooses Bind or Pass.
4. A Bind is private until interest is mutual.
5. Mutual interest creates exactly one Match.
6. Only matched users can start a normal conversation.
7. Either side can unmatch, block or report.

## Required product set

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

### P1 — product completion and reliability

- Professional shared visual system
- Multi-photo profile management with client-side compression and moderation state
- Profile and app settings
- Push notifications with user preferences and quiet hours
- Profile prompts
- Read receipts / typing state only if privacy trade-off is accepted
- Better ranking from reciprocal preference signals
- Pause profile / incognito controls
- Accessibility, localization and real-device reliability work

### P2 — post-launch quality

- Explore-style interest lanes using our own taxonomy and UI
- Photo verification / liveness provider if the privacy trade-off is acceptable
- Additional discovery controls and filters where they improve match relevance
- Network/offline resilience
- Storage and media efficiency
- Moderation and anti-abuse automation
- Ranking improvements based on measured healthy outcomes

None of these items create a paid tier.

## Deliberate differences from Tinder

- Brand language is Bind / Pass / It's a Bind.
- Ranking optimizes for reciprocal relevance and healthy conversations, not raw swipe volume.
- Exact location is never displayed or returned to another client.
- No random direct messages before a match.
- No artificial scarcity or paid ranking boost.
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
