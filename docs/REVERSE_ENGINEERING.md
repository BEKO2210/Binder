# Binder — Public-Behavior Reverse Engineering Map

Updated: 2026-08-15

The purpose of this document is to study public product behavior and independently implement the useful mechanics. It is not a plan to extract proprietary code, use undocumented private APIs, copy trademarks/assets or create a pixel-identical Tinder client.

## What Tinder publicly exposes today

Based on Tinder's public Help Center, current product behavior includes:

| Public behavior | What it does conceptually | Binder decision |
| --- | --- | --- |
| Discovery + Like/Nope | Sequential profile decisions | Build independently as Bind / Pass |
| Mutual match | Opens a relationship between two positive decisions | Core invariant; server-atomic |
| Likes You | Shows incoming positive interest before deciding | Later beta feature; free while shipped free |
| Rewind | Undo the previous decision | Later; no need to gate initially |
| Passport | Discover people around a selected location | Later; requires anti-spam and location design |
| Super Like | Strong positive signal / priority surfacing | Not required for MVP |
| Boost | Temporary visibility increase | Not required for MVP; ranking fairness review first |
| Top Picks | Curated recommendations | Later, only after ranking quality can be measured |
| Explore | Interest/theme-based discovery lanes | Good concept; build our own taxonomy and UI |
| Profile blocking | Prevents two profiles seeing each other | Required safety primitive |
| Safety/reporting surfaces | Reporting, age/safety tooling | Required before public beta |

## Behavioral state machine we will reproduce

### Discovery decision

`UNSEEN -> PASS`

or

`UNSEEN -> BIND_PENDING`

A positive decision remains private unless the other side has a positive decision.

### Mutual match

If A has an active Bind toward B and B has an active Bind toward A:

`BIND_PENDING(A,B) + BIND_PENDING(B,A) -> ACTIVE_MATCH(A,B)`

The transition is a server-side transaction with one canonical pair key. Clients never manufacture matches locally in production.

### Conversation

`ACTIVE_MATCH -> CHAT_ALLOWED`

Only members of an active, unblocked match can read/write messages.

### Unmatch

`ACTIVE_MATCH -> ENDED_MATCH`

Conversation access ends. Historical retention is handled by the privacy/moderation policy, not by leaving a chat endpoint readable.

### Block

`ANY_RELATIONSHIP -> BLOCKED`

Block dominates discovery, matching and messaging. It is checked server-side in both directions.

## Black-box tests for our own implementation

These are tests we should run on Binder once the backend exists:

1. A binds B; B has not acted -> no match visible to either user.
2. B binds A concurrently from two devices -> exactly one match row exists.
3. A rapidly sends duplicate Bind requests -> idempotent result.
4. A passes B -> B's positive decision must not reveal itself to A unless product rules explicitly permit Likes You.
5. A blocks B before B binds A -> no match can be created afterward.
6. A blocks B after an active match -> new messages fail server-side immediately.
7. A changes discovery radius -> exact coordinates never appear in B's API payload.
8. A deletes account -> A stops appearing in new discovery batches immediately.
9. Replay/retry of an old API request -> cannot recreate an ended/blocked relationship incorrectly.
10. Two app instances race on the same swipe -> database constraints preserve one valid decision state.

## Binder-specific product changes

We intentionally diverge where copying a competitor would make the product worse:

- Binder measures healthy mutual conversations, not raw swipe count, as a primary quality metric.
- No global attractiveness/Elo score.
- Exact location never leaves the protected backend boundary.
- Initial release has no fake premium locks or blurred paid teasers.
- Safety actions are backend authorization changes, not only front-end buttons.
- Branding and copy use Binder vocabulary rather than Tinder terminology.

## Public sources used for the feature map

- Tinder Help Center — subscriptions/premium features
- Tinder Help Center — Rewind
- Tinder Help Center — Likes You
- Tinder Help Center — Super Like
- Tinder Help Center — Boost
- Tinder Help Center — Explore
- Tinder Help Center — blocking and safety/reporting

The implementation must remain independent even when a public interaction pattern is similar.
