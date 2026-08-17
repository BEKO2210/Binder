# Making money with Binder

Written 2026-08-17 at the owner's request. Until today the working agreement
said "Binder stays one free product, no paid surfaces, ever". The owner lifted
that rule: revenue is now allowed to be planned. What follows is the plan, not
a paywall — the order of the options is deliberate, because the wrong first
move on a dating app kills the thing that makes it work: a deck with people in
it.

## The one rule that survives

**Nothing that costs money may decide who sees whom.** The moment reach is for
sale, the deck stops being an honest answer to "who fits both sides" and
becomes an auction. Every option below leaves matching untouched.

## What Binder can sell, in the order it should try them

### 1. Supporter tier — cosmetic and convenience only (month 1 after launch)

A recurring "Binder Supporter" at €2.99/month or €24/year that buys:

- accent themes beyond the five bundled ones, and an app icon to match
- read receipts *both ways* (opt-in, symmetric — never one-sided surveillance)
- "who I passed" history and a longer undo window
- profile insights: how often the profile was shown, how far it reached
- an early-access channel for new surfaces

Why first: it needs no new counterparty, no ad network, no data sharing, and it
cannot distort matching. At a 2 % conversion of a 50,000-user base that is
about €3,000/month — modest, but it pays the infrastructure many times over
(Supabase Pro is €25/month).

**Store mechanics**: Google Play Billing is mandatory for digital goods sold in
the app. Budget 15 % platform fee on the first $1M/year, 30 % above.

### 2. Boosted visibility done honestly — *not* recommended, listed so it is a decision

Every large app sells reach: Tinder Boost, Bumble Spotlight. It is the single
biggest revenue line in the category and the single fastest way to make the
deck feel rigged. If it is ever built, the honest version is: a boost widens
the *radius* or the *age band* for an hour, and never re-orders people inside
the same audience. Anything else contradicts the rule above.

### 3. Local partners instead of ads (month 3+)

A dating app knows two things advertisers pay for and users tolerate: the city,
and that two people just matched. That is a date-venue business, not an ad
business.

- **Match reward**: when two people match, both get one offer from a local
  partner — a café, a bar, a mini-golf place — for a first meeting. Partners pay
  a flat monthly listing fee per city (€49–149) or per redeemed code (€2–5).
- **No profile data leaves Binder.** The partner learns "a code was redeemed",
  nothing else. This is the difference between a partner programme and an ad
  network, and it is worth defending in the store listing.
- Starting city: Stuttgart region — the owner's own catchment, where partner
  acquisition can be done by hand and the story is checkable.

At 500 matches a day in one city and a 10 % redemption at €3, that is roughly
€4,500/month per city, and it grows with matches rather than with attention.

### 4. Events (month 6+)

Binder-branded singles evenings with a partner venue. Ticket €10–15, venue pays
a fee for the traffic. Low volume, high margin, and it produces exactly the
content that makes a dating app spread: photos of real people who met through
it.

### 5. The stack itself (opportunistic, highest ceiling)

Binder is a complete, audited, production dating stack: Postgres with RLS,
pgTAP suites, moderation dashboard, push reliability, admin session
revalidation, design contract, crawler, diagnostics. Niche dating apps
(communities, hobbies, regions) pay far more for that than consumers pay for
features.

- **White-label licence**: €5,000–15,000 setup plus €500–1,500/month per
  operator.
- **Or as a template product**: a one-off licence at €499–1,999, sold to
  developers, no support promised.

One licence equals roughly a thousand supporter subscriptions. This is the line
with the highest revenue per hour of work, and it needs no user growth at all.

### 6. If it truly goes viral

- **Sponsored city launches**: a regional brand pays to be the partner of a
  launch city.
- **Anonymised, aggregated trend reporting** — city-level only, never anything
  that can be traced to a person, and only if the privacy policy says so
  before the first report is sold.
- **Acquisition**: the realistic exit for a dating app with traction is being
  bought by a larger operator. What makes that valuable is exactly the boring
  material this repository already has: green gates, audit trails, a moderation
  process and no legal debt.

## What to build first, concretely

1. **Nothing yet.** Ship the current app, get real users, keep the deck full.
   Revenue features on an empty deck are wasted work.
2. Add **Google Play Billing** and the supporter tier only once daily matches
   are consistently non-zero.
3. Start the **partner programme** in one city, by hand, with five venues and
   paper codes if necessary, before a line of code is written for it.
4. Put the **white-label licence** on the site immediately — it costs nothing to
   advertise and it can land at any time.

## What this costs to keep running today

| Item | Cost |
| --- | --- |
| Supabase (free tier today, Pro when users arrive) | €0 → €25/month |
| Play Console (one-off) | €25 |
| Domain and site | ~€15/year |
| Push (FCM) | €0 |
| Total until real traffic | effectively €0 |

Break-even is therefore one white-label licence, or roughly ten supporters, or
one partner venue. That is the number worth remembering: **Binder is cheap
enough that any of these options makes it self-sustaining.**

## Legal groundwork before the first euro

- Impressum and terms already exist; they need a paid-services section.
- Play requires the billing API for digital goods — a link to an external
  payment page is a policy violation and gets apps removed.
- The partner programme needs its own short data section: what a redeemed code
  transmits, and that it is not tied to a profile.
- German consumer law: a subscription needs a cancellation button that is at
  most two taps from the settings screen.
