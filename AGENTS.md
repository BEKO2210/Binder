# AGENTS.md — the working agreement for Binder

This is the only document in the repository. Everything an agent or a human
needs is here: the rules, the gates, how to release, how to add a language, how
to test with real accounts, what the app collects, and how it can earn money.
The roadmaps and phase reports that lived in `docs/` were consolidated here on
2026-08-17; git history keeps them.

Human owner: Belkis (GitHub `BEKO2210`).

## What Binder is

An Android dating app in React Native (Expo SDK 57) on Supabase. Identity,
discovery with a mutual-interest deck, matching, conversation, safety and
moderation, settings, profile control. Deliberately small and deliberately
finished: every surface has a loading, empty, error and offline state, and the
server is the truth for every destructive or social action.

## Non-negotiable rules

1. **Nothing that costs money may decide who sees whom.** Revenue is allowed
   (see *Making money*); buying reach is not. A paid feature may be cosmetic,
   convenient or informational, never a change to who appears in someone else's
   deck. No paid surface ships before daily matches are consistently non-zero.
2. **Never weaken a gate.** CI steps, verifiers, pgTAP and concurrency suites
   and `npm test` may become stricter, never removed or softened to get green. A
   budget number moves only when the owner decides it and the measurement that
   justified it is written down — that happened once, for the Skia bundle
   budgets (JS 4.20 → 4.90 MiB, total 5.25 → 5.90 MiB, after measuring
   3.99 → 4.55 MiB and 4.95 → 5.51 MiB).
3. **No secrets in the repo, in logs or in chat.** `google-services.json` is the
   only committed credential-like file (public by design). GitHub Actions
   secret: `EXPO_TOKEN`. Edge Function secret: `BINDER_PUSH_DISPATCH_SECRET`.
   Everything else lives in the Infisical vault (`vault get <name>`).
4. **Production Supabase** (`sbohsxtzitqhyswznhec`, PG17, eu-central-1) changes
   only with the owner's explicit GO and only after all gates are green on the
   exact candidate commit. Never delete outbox or delivery rows — they are the
   audit trail. Migration bookkeeping is synchronized; plain `supabase db push`
   works, and history is never repaired without checking `supabase migration list`.
5. **Never claim something passed that was not executed.** A measurement or a
   screenshot from the S23 or the Tab S9, or it did not happen.
6. **A worklet may only call worklets.** `verify-worklet-contract.mjs` enforces
   it; the photo pager once killed the process because `nextPhotoPage` called a
   plain function on the UI thread.
7. **Every user-visible string lives in `src/i18n/locales/en.json`** and is read
   through `t()` from `useBinderTheme()`. The German Impressum in `AboutScreen`
   is the one documented exception — § 5 DDG requires it in German whatever the
   interface language is.
8. **Press feedback belongs on controls, not on media.** A hot zone over a photo
   passes `pressedSurface={false} pressScale={false}`; an icon button over a
   photo takes `overMedia`.
9. **Text over a photo comes from the dark palette in both schemes.** A photo is
   not a surface whose brightness the theme controls.
10. **UI discipline:** design tokens only (no raw hex, sizes, radii or durations
    in `src/screens` or `src/components` — CI enforces), warning and destructive
    colours never restyled, 48 dp touch targets, reduced motion respected via
    `src/lib/motionPolicy.ts`, no competitor names in product copy.

## Gates — all of them, before every push

```
npm run typecheck && npm run typecheck:tests && npm test
node scripts/verify-design-contract.mjs      # no literal colours/sizes/radii/durations
node scripts/verify-worklet-contract.mjs     # a worklet may only call worklets
node scripts/verify-i18n.mjs                 # locale registry matches the files on disk
node scripts/verify-i18n-coverage.mjs        # no user-visible English left in the screens
node scripts/verify-safety-contract.mjs
node scripts/verify-phase5-contract.mjs
node scripts/verify-phase6-design.mjs
node scripts/verify-phase6-media.mjs
node scripts/verify-phase6-settings.mjs
node scripts/verify-phase7-push.mjs
node scripts/verify-admin-dashboard.mjs
node scripts/verify-brand-assets.mjs
node scripts/verify-entrypoint.mjs
node scripts/verify-site.mjs
```

`tests/designTokens.test.ts` walks every semantic colour pairing in both
schemes — including the pressed, disabled and over-media states — and fails
under WCAG AA. Fix the token, never the test. `supabase test db` runs the pgTAP
suites, including the admin diagnostics gate and the quiet-hours rule.

## How work runs

- Directly on `main`. One concern per commit series, gates before every push.
- Commit messages: meaningful prose, why and what, no emoji.
- **One improvement per run.** A run touches one behaviour; a second problem
  found on the way becomes the next run, not a bigger commit. A red gate ends
  the run: revert, write down why, move on. The app stays shippable after every
  run.
- Anything a user can see is built, installed on the S23 and screenshotted.
- Codex does mechanical and review work under a precise brief, and its output is
  verified against these gates before it is committed. It has been wrong in ways
  that pass a metric and break the product: one "contrast fix" lightened the
  photo scrim until text was readable to the checker and the gradient that makes
  a photograph legible was gone.

## Releasing

```
npm run release                 # patch bump, APK
npm run release -- --bundle     # APK + AAB for the store
npm run release -- --minor      # or --major, or --keep-version
```

Raises the version in `app.json`, `package.json` and the generated
`android/app/build.gradle`, builds signed artifacts and stages them in
`/home/belkis/Binder-Release/` as `Binder-v<version>-vc<code>.apk|aab`. Never
hand-edit a version.

- Upload key: `/home/belkis/Android APP KEY/BINDER APP KEY.jks`, alias `key0`,
  SHA-1 `16:DF:DF:3E:28:30:76:BE:74:F8:A9:E6:75:0E:C8:B8:2D:AD:D2:DF`.
- Play App Signing is active; a locally built APK can never update a store
  install, and sideloading needs the Play build uninstalled first.
- Gradle JDK `/home/belkis/.local/jdk/jdk-21.0.12+8`, `ANDROID_HOME=~/Android/Sdk`.
  `android/` is generated by `expo prebuild` and gitignored but carries
  `keystore.properties` and the `signingConfigs.release` block — check both
  after any `--clean`.
- Dependencies must match the Expo SDK line; use `npx expo install`.
  `package-lock.json` is committed and CI installs with `npm ci`.

## Languages

English is the source of truth. Adding one: copy `src/i18n/locales/en.json`,
translate the values, set `$meta` (`name`, `endonym`, `flag`), save as
`<code>.json`, run `npm run i18n:sync`. The picker appears in App settings by
itself. Fifteen languages are bundled: English, German, French, Italian,
Portuguese (Brazil), Spanish, Dutch, Polish, Turkish, Indonesian, Arabic,
Hindi, Japanese, Korean and Simplified Chinese — 580 keys each.

A language ships inside the build. Adding one today means a new APK/AAB, which
is fine for a store release and wrong for a quick fix; if that becomes a
nuisance, the locale files can be fetched from Supabase at start-up and cached,
with the bundled copy as the fallback. Arabic renders correctly but the layout
is still left-to-right: real RTL support (`I18nManager`, mirrored paddings and
icons) is its own piece of work and is not done.

- Missing or empty strings fall back to English: a half-finished translation
  degrades, it does not break a screen.
- Placeholders (`{name}`, `{count}`) are the only substitution; no sentence is
  assembled from fragments.
- Dates, times, distances and counts go through `src/lib/format.ts` with the
  active locale.

## Push in production

Activation conditions, unchanged since phase 7: **FCM v1** credentials attached
to the Expo project, a **Supabase Cron** job driving the dispatcher, the
**dispatch secret** held in the vault and set as the Edge Function secret, and
**device evidence** recorded for every row before the feature is called done.
Deliveries move `queued → ticketed → delivered` through Expo receipts;
permanent failures dead-letter with their reason and are never silently
retried. The dispatcher never touches a message body — the verifier fails the
build if it references one.

## Devices and evidence

- S23 Ultra `R5CW604HG1R`, Tab S9 Ultra `R52W7007RHF`, both over USB.
- `adb` needs a udev rule for Samsung on this machine:
  `/etc/udev/rules.d/51-android.rules` with
  `SUBSYSTEM=="usb", ATTR{idVendor}=="04e8", MODE="0664", GROUP="plugdev"`,
  then `udevadm control --reload-rules && udevadm trigger` and `adb kill-server`.
- `python3 scripts/ui-crawl.py --all-devices --themes dark light` walks the app,
  taps every clickable node once and audits labels and 48 dp targets. It reads
  the override display density, ignores controls clipped by a scroll container
  or still in motion, and never taps a destructive label.
- `scripts/measure-interaction-frames.sh <serial> <name> [seconds]` prints a
  frame-timing row; `scripts/measure-gallery-memory.sh` does the same for memory.

Measured on the S23, build v0.5.40: cold start median 336 ms (371 ms before
Skia), match celebration 4.82 % janky frames with zero missed vsyncs, card-to-
profile expansion 2.04 %, discovery loading surface 0.00 %, reduced motion zero
frames rendered. Universal APK 124 MiB; a Play install downloads its own ABI
(+10.85 MiB against the pre-Skia build).

## Test accounts

Two labelled accounts exist in production: `Claude (Testkonto)`
`18bd1d01-2a21-4b01-9e59-f44deac49492` and `Codex (Testkonto)`
`9f13d0ff-ae7d-4871-97b5-598e3952f893` (switched to `woman` so the owner's own
filter has a candidate). Passwords: `vault get BINDER_TEST_CLAUDE_PASSWORD`,
`vault get BINDER_TEST_CODEX_PASSWORD`.

```
scripts/as-test-user.sh claude rpc get_discovery_batch '{"p_limit":5}'
scripts/as-test-user.sh codex  rpc record_decision '{"p_target_user_id":"<uuid>","p_decision":"bind"}'
```

Removing them and everything they produced is one statement:

```sql
delete from auth.users where id in
  ('18bd1d01-2a21-4b01-9e59-f44deac49492','9f13d0ff-ae7d-4871-97b5-598e3952f893');
```

## Store screenshots and the promo film

`scripts/stage-demo-profiles.mjs create|remove docs/demo-profiles.json` stages
presentable profiles for a shoot and removes them afterwards — it can only
remove accounts tagged `binder_demo_profile` in auth metadata.
`scripts/generate-demo-portraits.mjs` produces the portraits: **Binder generates
faces rather than presenting a real person's likeness as a fictional profile.**
`scripts/store-frames.sh <in> <out>` turns captures into 1080×1920 listing
artwork with the system status bar and gesture pill cropped away.

The promo film is a Remotion project in `/home/belkis/binder-promo`; both
renders (with music, and sound effects only) are staged in
`/home/belkis/Binder-Release/promo/`, and a 1280×720 version is embedded on the
public site.

## What the app collects

One balanced-accuracy location point, overwritten on every refresh — never a
track, never a history. First name, email, date of birth (the age is shown, the
date is not), gender and preferences, photos, messages. Optional diagnostics are
off by default and carry screen, duration, outcome, platform, app version and a
random session id — no message content, no photos, no coordinates, no stack
traces, which `verify-phase7-push.mjs` and `verify-phase5-contract.mjs` enforce.
No advertising identifier, no third-party analytics SDK. Sessions live in the
platform keystore, photos are served as signed URLs, and retention is enforced
in the database by `private.prune_beta_data()` (client events 30 days, ranking
batches 90, feedback and server events 180). Deleting the account cascades
through every table; only the moderation audit trail survives, without the
deleted account's content.

Play data-safety answers: collected, not shared; encrypted in transit; deletion
available in the app and at
`https://beko2210.github.io/Binder/delete-account.html`.

## Admin and diagnostics

`https://beko2210.github.io/Binder/admin/` — invitation-only membership,
per-permission checks, immediate revocation when an Auth session is deleted.
Tabs: photos, reports, moderators, audit, and **Diagnose**, which reads the
opt-in telemetry through four gated RPCs (`admin_diagnostics_summary`,
`_health`, `_client_errors`, `_feedback`). A signed-in non-admin gets
`42501 Admin permission required.` The dashboard may never read a diagnostics
table directly; the verifier fails the build if it tries.

## Making money

In the order to try it: a cosmetic supporter tier (~€2.99/month, themes, icons,
symmetric read receipts, pass history, profile insights); a local partner
programme that pays per redeemed code and learns nothing about a profile;
events with a partner venue; and the highest revenue per hour of work — a
white-label licence of this stack (€5,000–15,000 setup plus €500–1,500/month),
which needs no user growth at all. Break-even is one licence, ten supporters or
one partner venue; running costs today are effectively zero. Boosted visibility
is a deliberate no: it contradicts rule 1. Google Play Billing is mandatory for
digital goods, and a subscription needs a cancellation path at most two taps
from settings.

## Lessons that cost real time

1. **Never hand a function style to an animated component.** Reanimated drops
   layout properties; it collapsed the tab bar into the left edge.
2. **Edge-to-edge Android does not resize the window for the keyboard.** The
   chat is driven by `useReanimatedKeyboardAnimation` on the UI thread.
3. **One gesture owns one control.** Three detectors sharing an accumulator made
   the filter dial drop the handle you grabbed.
4. **Chrome spans the screen, content stays in the column** — a tab bar that
   stops at the content width reads as a floating bar on a tablet.
5. **A worklet that calls a plain function kills the app** (rule 6).
6. **`SIGNED_OUT` is not proof of an expired session.** Supabase emits it when a
   token refresh fails, which happens whenever the phone is offline long enough;
   Binder asks the server before it believes it.
7. **A refusal from the server carries a code or a status; a request that never
   arrived carries neither.** That, not the message text, is how offline is
   detected.
8. **expo-symbols renders the Android glyph as text that follows the system font
   scale.** `BinderIcon` draws the glyph itself with scaling off, or every icon
   is clipped at 200 %.
9. **Verify on the device, not in the diff.**

## Open

- One manual tap of a push notification while the app is closed, to close the
  last row of the device evidence.
- German copy for the Play listing.
- The listing's own screenshots, shot with staged profiles and framed.
