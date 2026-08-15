# Binder Safety Baseline

Dating safety is part of the data model and authorization layer, not a checklist added at the end.

## Age access

Binder is 18+.

Implemented technical baseline:

- birth date is private and server-validated before onboarding can complete;
- under-18 dates are rejected server-side;
- age shown to another user is calculated server-side rather than exposing raw birth date;
- an underage safety report enters the moderation queue at the highest current priority.

This does **not** make Binder publicly releasable by itself. Before Google Play public distribution, Binder must also configure the store-side minor-access restriction required for core dating/matchmaking apps. A typed birth date is not treated as identity-grade proof of age; any future stronger assurance provider should store the minimum verification result rather than raw identity documents by default.

## Legal gate before UGC

Before a signed-in account may create profile text, upload/replace profile media or send a new message, the backend requires acceptance of the current Terms & Community Rules and Privacy versions.

The app presents the same gate before onboarding. It cannot be skipped, and backend enforcement prevents an older or modified client from bypassing the UI.

Policy version changes can therefore force re-acceptance before further UGC without rewriting existing profile tables.

## Blocking

Blocking must and currently does:

- immediately remove both users from each other's product visibility;
- prevent new discovery/matching interaction;
- prevent new messages;
- terminally close an active match;
- remain server-enforced;
- avoid exposing the blocker identity as a notification to the blocked user.

## Reporting

Users can report from an active conversation and, in Phase 4, directly from a discovery profile before matching.

Current report reasons include spam/scam, harassment, underage concern, fake/impersonation, sexual content, violence and other. Reports store immutable user-facing records plus private evidence context for moderation where available.

Submitting a report can atomically block the reported account from the reporter.

## Moderation

Phase 4 adds a private moderation queue for:

- new/replaced profile media;
- safety reports.

Normal authenticated clients cannot read the queue or call the moderator action function.

Profile media states are server-controlled: `pending`, `approved`, `rejected`, `removed`. A new/replaced photo is forced to `pending`; other users receive only approved media.

Service-role moderation actions support approval/rejection/removal, dismiss/warn and suspension. Every terminal operator action creates an immutable moderation action log.

A public release still needs a real operational moderation/escalation process: staffing/ownership, response expectations, repeat-offender policy and legally required escalation procedures. A database queue by itself is not an operations team.

## Location privacy

- Never show exact latitude/longitude to another user.
- Never expose a precise location timestamp as a social feature.
- Show only rounded distance.
- Do not store a routine/location history for ranking.
- Request foreground location; background location is not part of the current product.

Exact coordinates remain in the private PostGIS location field and are used server-side for discovery distance predicates.

## Messaging abuse controls

Current controls:

- only active matches may message;
- account and peer must remain active and on current policy versions;
- sender-wide 20/minute + 300/hour limits;
- sender-wide locking prevents parallel chats from bypassing the limit;
- idempotent client IDs prevent network retry duplicates;
- Send serializes with Unmatch/Block so a message cannot commit after conversation end;
- report, unmatch and block remain accessible without contacting support.

Future content heuristics can be added server-side without replacing these authorization invariants.

## Photos and user-generated content

Implemented:

- image compression before upload (max 1080 px edge, WebP ~80%);
- file-size and MIME restrictions;
- owner-scoped Storage paths/policies;
- private bucket + signed URLs;
- server-controlled moderation state;
- pending media hidden from other users;
- private photo-review queue;
- server-only approve/reject/remove pipeline.

Future public-release operations still require a documented review/escalation process and repeat-offender handling.

## Account restriction and deletion

Phase 4 distinguishes immediate product deactivation from permanent account removal.

`account_safety` states are private. Moving an account away from `active` immediately:

- hides the profile from normal discovery/projections;
- closes active matches;
- disables device push tokens;
- rejects new UGC.

For user deletion, the app invokes an authenticated server Edge Function. It first requests terminal product deactivation, removes profile-media Storage objects, then deletes the Supabase Auth identity. Database foreign keys cascade normal product data according to the schema.

The public GitHub Pages deletion resource provides an external request path for users who no longer have the app.

Binder is **delete-by-default**. The system does not silently retain a blanket copy of reports/messages after account deletion. If a specific future legal/safety hold is legitimately required, it must be implemented as an explicit minimized operator process and reflected in the privacy policy rather than hidden inside ordinary product tables.

## Public policy surfaces

Phase 4 includes dependency-free public pages for:

- product/safety overview;
- Privacy Policy;
- Terms & Community Rules;
- Account Deletion.

The policy-site CI contract checks required pages/links and rejects common third-party tracking script patterns. The app links to the same public policy resources.

## Release gate

Binder does not go to a public dating audience until all of these are true:

### Repository-backed

- 18+ backend gate passes adversarial tests;
- current policies are required before UGC;
- report works before and after match;
- block works in both directions;
- unmatch works;
- exact location is absent from public client payloads;
- RLS/SQL-grant adversarial tests pass;
- account deactivation/deletion flow is verified;
- photo moderation state + moderation queue + server action log exist;
- Privacy/Terms/deletion resources exist and match implementation;
- dependency, Deno, TypeScript and Android bundle gates pass;
- matching/chat concurrency regressions remain green.

### External / operational

- Google Play minor-access restriction configured for the dating app;
- Play Data safety/content-rating declarations match the shipped behavior;
- privacy/deletion URLs are live and reachable;
- real moderation ownership/escalation procedure exists;
- remote-push credentials/dispatcher are configured if the release claims remote notifications;
- any stronger age-assurance requirement chosen for the release is operational and privacy-reviewed.
