# Binder Roadmap — Free Product Completion

Binder will not have a Pro, Premium, Boost, paid filter, paid color theme, paid read receipt, paid visibility tier or other monetized mode. The product remains free. Phase 6 is therefore **not monetization**; it is the start of final product completion.

## Non-negotiable product rule

- No Pro/Premium tier.
- No paywall around matching, messaging, profile controls, safety, notifications, themes or media.
- No artificial daily limits introduced to manufacture a future upgrade.
- No blurred likes, paid boosts or paid ranking priority.
- Product decisions after Phase 5 optimize quality, safety, retention and usability — not conversion to payment.

---

## Phase 6 — Product Completion + Visual System

Goal: make Binder feel like a finished consumer app rather than a technically complete beta.

### 6.1 Professional visual identity

- Create a Binder symbol/monogram that works without text at 24 px and at store-icon size.
- Create full wordmark + compact mark + monochrome variants.
- Replace generic/default app icon assets with a real Android adaptive icon foreground/background pair.
- Add Android 13 monochrome themed icon support.
- Create a branded splash/loading state.
- Establish one canonical icon family and remove mixed Unicode/emoji/generic icons from controls.
- Establish a single typography system with explicit display/title/body/label/caption scales.
- Rework every screen against shared design tokens: background, surface, elevated surface, border, text, muted text, positive, warning and destructive.
- Enforce semantic color meaning: lime/positive never means danger; pink/red only means destructive/safety-critical commitment; warning has its own token.
- Audit all buttons for hierarchy, minimum 48 dp touch target, pressed/disabled/loading states and focus/accessibility behavior.
- Add intentional empty, loading, offline, denied-permission, moderation-pending and error states.
- Add motion rules and respect Reduce Motion.
- Add haptics only where they communicate state, never as decoration.

Acceptance gates:
- no raw emoji/Unicode used as a production control icon;
- all UI colors come from central tokens;
- all repeated button/card/input styles use shared components;
- WCAG AA contrast for normal text and actionable controls;
- visual review at small Android phone, 412 px phone and large phone widths;
- Android adaptive icon renders correctly on circle, squircle and rounded-square launchers.

### 6.2 Profile media gallery

- Increase profile support from one primary photo to a real gallery of up to 6 images.
- Reorder photos with explicit primary-photo selection.
- Remove/replace images while preserving the invariant that a completed profile always has one usable primary image.
- Every new/replaced image returns to `pending` moderation state.
- Discovery never exposes pending/rejected/removed media.
- Add clear review-state UI per image.

Image pipeline:
- client-side resize before upload;
- max long edge: 1080 px unless device/image testing proves a higher value is materially better;
- WebP around 80–82% quality;
- strip unnecessary metadata/EXIF before persistence;
- target practical upload size rather than original-phone-photo size;
- benchmark quality on faces, hair, dark scenes, gradients and textural backgrounds;
- target median profile image well below 1 MB while preserving visibly good quality;
- never upload the full original first and compress later.

Hard tests:
- six-image limit cannot be bypassed by concurrent requests;
- reorder is atomic and positions remain unique;
- primary image cannot point at pending/rejected media for cross-user discovery;
- replace/remove cannot leave a completed profile with zero valid media;
- compression orientation is correct and no EXIF rotation regression occurs.

### 6.3 Profile settings

Create a proper Profile Settings area rather than mixing all controls on one screen.

Sections:
- Profile: first name, bio, interests, gender/profile fields allowed by product policy.
- Discovery: interested-in, age range, max distance.
- Photos: gallery, reorder, moderation state.
- Account: email/session, sign out, account deletion.
- Safety & privacy: blocked users, public policies, diagnostics choice.

Keep birth date immutable after onboarding unless a future verified correction process is explicitly designed.

### 6.4 App settings and personalization

Create a dedicated Settings screen.

User controls:
- haptics/vibration: on/off;
- reduced motion: system/default + explicit Binder override where safe;
- notification master toggle plus per-category toggles;
- notification sound/vibration behavior where platform allows it;
- quiet hours;
- appearance: system/dark plus a small curated set of accent themes;
- font-size/accessibility behavior follows OS scaling;
- diagnostics opt-in remains explicit and off by default.

Color personalization rule:
- users may change the accent family from a curated accessible palette;
- destructive/warning/safety colors remain fixed semantic tokens and are never recolored by themes.

### 6.5 UI consistency sweep

Audit and rebuild:
- Auth
- Legal Gate
- Onboarding
- Discovery
- Match celebration
- Matches inbox
- Chat
- Profile
- Settings
- Beta Program
- Safety/report flows
- Delete-account confirmation

Every screen must have consistent:
- typography hierarchy;
- spacing rhythm;
- radii;
- icon size/stroke;
- button hierarchy;
- loading behavior;
- error behavior;
- keyboard behavior;
- accessibility labels.

---

## Phase 7 — Push Notifications + Communication Reliability

Goal: finish the communication loop without requiring the user to keep Binder open.

### 7.1 Real push delivery

Finish the existing Phase-3 push groundwork end-to-end:
- real EAS project ID;
- Android FCM credentials;
- iOS APNs path kept compatible even though Android is first;
- production dispatcher consumes the private outbox idempotently;
- retry/backoff and delivery receipts;
- stale/invalid device tokens disabled automatically;
- block/unmatch/account-deletion rechecked immediately before delivery;
- no message body in lock-screen push by default;
- deep link into the correct Matches/Chat surface;
- foreground notification behavior deliberately defined.

Notification categories:
- new match;
- new message;
- moderation/photo status where useful;
- safety/account alerts;
- optional product/beta notices only with explicit user control.

Hard tests:
- one event -> at most one logical notification per recipient/device;
- retries do not duplicate delivery records;
- blocked/unmatched users receive no late push;
- token transferred to another account cannot notify the prior account;
- quiet-hours/category toggles are enforced server-side before send.

### 7.2 Chat reliability polish

- reconnect/resubscribe cleanly after app background/foreground;
- deterministic pagination and no duplicate bubbles;
- delivery/send-state UI that reflects server truth;
- retry failed send with the same idempotency key;
- keyboard/insets/device rotation edge cases;
- long-message rendering and copy behavior;
- optional typing/read-presence only if it can be implemented without weakening privacy or reliability.

---

## Phase 8 — Release Candidate Hardening

Goal: produce a store-ready Binder release, not merely a green development branch.

### 8.1 Real device and account matrix

Run end-to-end two-account tests on real Android devices:
- register/login;
- accept legal gate;
- onboard both users;
- upload/compress/reorder multiple photos;
- moderate photos;
- location/discovery;
- Bind/Pass;
- mutual match;
- push for new match;
- chat + push;
- unread/read state;
- report before match;
- report message;
- block;
- unmatch;
- profile/settings changes;
- diagnostics opt-in/out;
- delete account;
- reinstall/sign-in edge cases.

### 8.2 Performance

Set measured budgets for:
- cold start;
- warm start;
- Discovery first usable card;
- Matches load;
- Chat history load;
- image decode/cache memory;
- APK/AAB size;
- JS bundle size;
- long list/frame stability.

No new dependency is accepted without measuring its impact on build size, startup and runtime memory.

### 8.3 Network resilience

Test explicitly:
- airplane mode;
- 2G/high latency simulation;
- request timeout;
- Supabase unavailable;
- upload interrupted halfway;
- app killed during upload/send;
- token expired;
- location denied/revoked;
- notification permission denied/revoked.

No destructive or social action should appear successful until server state confirms it.

### 8.4 Accessibility

- screen-reader labels for every action/icon;
- large font scaling without clipped controls;
- minimum touch targets;
- contrast gates;
- reduce-motion support;
- no color-only status communication;
- keyboard/IME accessibility.

---

## Phase 9 — Store Release + Operations

Goal: ship the free Binder product safely.

### 9.1 Google Play release

- signed release AAB with durable upload/signing-key process;
- correct application ID/versionCode/versionName discipline;
- adult-only target audience;
- Google Play Restrict Minor Access configured;
- accurate Data Safety form;
- accurate content rating for dating/UGC/messaging;
- live Privacy URL;
- live Terms URL;
- live external Account Deletion URL;
- store listing screenshots generated from the final visual system, not beta UI;
- professional feature graphic and launcher icon;
- closed test -> staged release -> public release only after gates pass.

### 9.2 Moderation operations

- documented reviewer workflow for photo/report queue;
- SLA/priority for underage, violence and sexual-safety cases;
- operator audit trail review;
- repeat-offender handling;
- account suspension/reinstatement procedure;
- explicit legal escalation path when required.

Candidate implementation: `docs/PHASE8-ADMIN-STRATA.md` defines the owner-only
bootstrap, moderator permissions, photo/report queues and immutable audit
boundary. It is not production until its migration, invitation function and
static dashboard pass the exact-commit activation runbook.

### 9.3 Production monitoring

Use the existing first-party privacy-preserving telemetry to watch:
- onboarding completion;
- discovery load failures;
- decision -> match rate;
- match -> first-message rate;
- report/block rates;
- startup/load performance;
- crash/render-error counts;
- push-delivery health.

No advertising ID or third-party behavioral analytics SDK is required.

---

## Phase 10 — Post-launch Quality, still free

Only after real usage exists:
- ranking quality experiments based on existing coarse/privacy-safe signals;
- localization;
- richer accessibility;
- additional profile prompts/interests if users actually need them;
- smarter abuse detection with false-positive measurement;
- storage/cost optimization based on real media distribution;
- optional convenience features requested by users.

This phase is **not monetization**. Binder remains one free product.

---

## Strata execution model for Phases 6–9

These phases are large enough to use the Strata discipline:

1. clean branch/worktree before each run;
2. define the master task as an outcome, not a list of edits;
3. independent `--verify` commands overrule any agent claim that the task is done;
4. never weaken a verifier to obtain green status;
5. cap generations/budget;
6. keep each product phase on its own branch and do not merge until the exact final head is green.

Suggested verifier families:

```text
npm run typecheck
npm run bundlecheck
node scripts/verify-entrypoint.mjs
node scripts/verify-safety-contract.mjs
node scripts/verify-beta-contract.mjs
Supabase migration replay + pgTAP
matching/chat concurrency scripts
account-deletion E2E
release APK/AAB embedded-bundle check
visual-token/icon/design-system static checks
```

The final definition of done is not "the UI looks finished". It is: **the exact branch head passes the independent functional, safety, visual-system, performance and release verifiers defined for that phase.**
