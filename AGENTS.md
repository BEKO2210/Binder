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
   justified it is written down — that has happened twice. Skia: JS 4.20 → 4.90
   MiB, total 5.25 → 5.90 MiB, after measuring 3.99 → 4.55 MiB and 4.95 → 5.51
   MiB. Fifteen languages: JS 4.90 → 5.35 MiB, total 5.90 → 6.35 MiB, after
   exporting the same tree with only `en.json` bundled (4.63 MiB JS / 5.59 MiB
   total) and with all fifteen (5.02 / 5.98) — 28 KiB per language. The interest
   catalogue (300 entries × 15 languages, 2026-08-18) measured 5.02 → 5.18 MiB
   JS and 5.98 → 6.14 total: it fits inside the unchanged budgets, which now
   carry 0.17 / 0.21 MiB of headroom — anyone adding a dependency reads that
   number first.
3. **No secrets in the repo, in logs or in chat.** `google-services.json` is the
   only committed credential-like file (public by design). GitHub Actions
   secret: `EXPO_TOKEN`. Edge Function secret: `BINDER_PUSH_DISPATCH_SECRET`.
   Everything else lives in the Infisical vault (`vault get <name>`).
4. **Production Supabase** (`sbohsxtzitqhyswznhec`, PG17, eu-central-1) changes
   only with the owner's explicit GO and only after all gates are green on the
   exact candidate commit. Never delete outbox or delivery rows — they are the
   audit trail. Migration bookkeeping is synchronized; plain `supabase db push`
   works, and history is never repaired without checking `supabase migration list`.
   **Standing GO since 2026-08-18** for the work leading up to the Play release:
   the owner has approved production changes in advance rather than one at a
   time. That removes the waiting, not the care — a schema change still gets a
   dump of what it touches beforehand, a Codex review of the migration, and a
   measurement afterwards, and anything that destroys data is still asked about
   first. A blanket approval is not a reason to be quicker; it is a reason to be
   the one who checks, because nobody else is going to.
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
node scripts/verify-request-deadlines.mjs    # no awaited request without a ceiling
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
node scripts/build-site-languages.mjs --check  # site/languages.html matches the locales
node scripts/build-push-copy.mjs --check     # the dispatcher's notification copy matches the locales
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

Release builds are minified. `expo-build-properties` turns R8 and resource
shrinking on in `app.json`, which is where it survives a prebuild; the generated
`android/gradle.properties` carries the two flags. The mapping file rides inside
the AAB (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`), so
Play picks it up on upload with nothing to do by hand, and the release script
stages a copy next to the artefacts for reading a crash locally with `retrace`.
Measured on vc95: APK 128.59 → 121.25 MiB, AAB 98.80 → 96.04 MiB, build about
1m30s → 11m. (A moment of confusion is written down here on purpose: the same
files read 127.14 and 100.71 in MB rather than MiB, which looked like a second,
larger build. Same artefacts, different unit — when a size does not add up,
check the unit before the build.) **`expo prebuild` writes the release signing config back to the debug key**
— the `signingConfigs.release` block that reads `keystore.properties` has to be
restored afterwards, and the build refuses to run without it.

Minification is the kind of change that breaks by reflection rather than by
compiler, so vc95 was walked on both phones before it was called good: cold
start, deck, match celebration (Skia), chat with the keyboard, voice recording,
sending and playback, the photo picker through upload, sign-out and the Google
sheet. Push delivery under R8 has not been re-tested.

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

Each bundled language costs about 28 KiB of JS payload (measured, see rule 2),
so the budget has room for roughly a dozen more before that is a decision again.

The public site advertises the languages, and it cannot lie about them:
`site/languages.html` and the language block on the home page are generated from
the locale files by `npm run site:languages`, and CI fails if they drift from
what actually ships.

- Missing or empty strings fall back to English: a half-finished translation
  degrades, it does not break a screen.
- **A notification is product copy too.** The words live under `push.*` in the
  locale files like everything else. The dispatcher runs on Deno and cannot read
  them at runtime, so `npm run push:copy` generates them into
  `supabase/functions/dispatch-push/copy.ts`, and `--check` fails the build if
  the two drift. The database contributes only the recipient's language, which
  the client sends with the rest of the notification preferences; the English
  text stays in the migration as the fallback for a row that has none.
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

**None exist any more.** `Claude (Testkonto)` and `Codex (Testkonto)` were
deleted from production on 2026-08-18 at the owner's request, together with
their photos in storage — production now holds only real people. The passwords
in the vault (`BINDER_TEST_CLAUDE_PASSWORD`, `BINDER_TEST_CODEX_PASSWORD`) and
`scripts/as-test-user.sh` still work; they just have no accounts to sign in to.

Recreating one is two commands now, and both label what they make:

```
node scripts/stage-test-account.mjs create              # prints a throwaway password
node scripts/stage-demo-profiles.mjs create docs/demo-profiles.json
...
node scripts/stage-demo-profiles.mjs remove docs/demo-profiles.json
node scripts/stage-test-account.mjs remove
```

The account is called `Testlauf (Testkonto)`, carries `binder_demo_profile` in
auth metadata like the demo profiles, and stands in Freiberg so the deck has
somebody in it without widening anybody's search radius. The portraits for the
demo profiles live in `~/Binder-Roadmap/demo-portraits/` — generated faces, not
photographs of real people. It must be labelled in the profile name the way the
old two were, so nobody has to guess later which rows are real. Whatever is created, delete it again when the work is done: a dating
app whose database is half test accounts cannot answer "how many real people
signed up" — and every fake profile in discovery is a real person's wasted
swipe.

## The signing key — the one thing GitHub cannot replace

`BEKO2210/Binder` holds everything needed to rebuild the app **except** the
upload key, and `android/` is generated and gitignored, so
`android/keystore.properties` disappears with any `expo prebuild --clean`.
Without that key the app on Play can never be updated again by us.

It is backed up in the vault, base64-encoded: `BINDER_UPLOAD_KEYSTORE_B64` and
`BINDER_KEYSTORE_PROPERTIES_B64`. Restoring was tested, not assumed — the
restored keystore opens with the stored password and its certificate is
`58:CF:B5:C8…`, the same one the shipped APKs carry. **The key never goes into
a repository**, public or private.

Two guards now sit in `scripts/release-build.mjs`, because
`android/app/build.gradle` silently falls back to the *debug* key when
`keystore.properties` is missing — a "release" that installs fine, is rejected
by Play, and carries a certificate Google does not know for sign-in:

- the build refuses to start if `android/keystore.properties` is missing;
- after the build, the APK's certificate is read with `apksigner` and compared
  with the upload key's SHA-1, and a mismatch fails the run.

## The Firebase API key in google-services.json

GitHub's secret scanner flags it, and it is right that the string is public —
it ships inside every APK and anyone can unzip the app and read it. It is an
identifier, not a password, and what it actually permits was measured rather
than assumed: anonymous sign-up `ADMIN_ONLY_OPERATION`, email sign-up
`OPERATION_NOT_ALLOWED`, and Firestore, Storage and Remote Config are not
provisioned in this project at all (404). Binder's data lives in Supabase.

It is nevertheless restricted in Google Cloud to the Android package plus the
three signing certificates, and to the messaging APIs. Verified from here: a
plain request now answers
`PERMISSION_DENIED — Requests from this Android client application <empty> are blocked`.
The scanning alert is resolved as won't-fix with that reasoning.

**Push was re-tested under the restriction on 2026-08-18** and it survives it,
measured on the S23 with the Play install v0.7.5-vc58:

- A fresh registration, not a cached one. `pm clear` wiped the app data, Google
  sign-in came back, notifications were allowed in the Matches prompt, and
  `public.device_tokens` gained a new row — `ExponentPushToken[hSigEuMF…]`,
  created 00:42:33 UTC. The contrast is what makes it proof: a plain app start
  nine minutes earlier returned the *same* token as the day before, so Play
  services really did hold a cache and `pm clear` really did invalidate it. The
  old token then came back from Expo as `DeviceNotRegistered`, which a device
  keeps only when FCM has issued it a different registration.
- Two real notifications went the whole way — a row in `private.push_outbox`,
  the minute cron, the `dispatch-push` function, Expo, FCM, the phone — and both
  reached `delivered` through Expo receipts (outbox 81 and 82). The second one
  arrived while the app process was killed, and tapping it cold-started the app
  onto the `profile` route.
- Nothing in logcat mentioned `PERMISSION_DENIED`, a blocked API or a Firebase
  Installations failure.

Probing the key from here separates the two refusals it can give: both
`firebaseinstallations.googleapis.com` and `fcmregistrations.googleapis.com`
answer past the API check (the Android-client rule blocks the first, an argument
check the second), where an API left out of the list answers "Requests to this
API … are blocked". So the API list is not too narrow.

What that test does **not** cover, and nobody should read into it: a token
rotation on a running install, a real uninstall/reinstall from Play, other
Android or Play-services versions. Still open as well: the **Browser key (auto
created by Firebase)** in the same project is unused by this app and should be
restricted or deleted.

## Store screenshots and the promo film

`scripts/stage-demo-profiles.mjs create|remove docs/demo-profiles.json` stages
presentable profiles for a shoot and removes them afterwards — it can only
remove accounts tagged `binder_demo_profile` in auth metadata.
`scripts/generate-demo-portraits.mjs` produces the portraits: **Binder generates
faces rather than presenting a real person's likeness as a fictional profile.**
`python3 scripts/store-assets.py <captures> <out>` turns captures into the whole
listing kit: 1080×1920 phone frames with the system status bar and gesture pill
cropped away, the 512×512 icon and the 1024×500 feature graphic. Captions live
in a sibling `NN-name.txt` (line 1 eyebrow, line 2 headline), and the device
sits on the same axis in every frame — a listing where the phone jumps between
screenshots reads as separate posters. It replaced a bash/ImageMagick version
that could not run here, and needs only Pillow.

The promo film is a Remotion project in `/home/belkis/binder-promo`, backed up
as the private repo `BEKO2210/binder-promo`, with two compositions off one
timeline: `BinderPromo` (1920×1080) for the site and
YouTube, `BinderPromoVertical` (1080×1920) for phones. The scenes read their own
stage size, so the vertical cut is a composition and not a crop. Renders are
staged in `/home/belkis/Binder-Release/promo/`, and a 1280×720 version is
embedded on the public site. Play accepts no video upload — only a YouTube link
in the listing.

## Email verification, its ceiling, and Google sign-in

Sign-up requires a confirmed address, and the whole path was tested end to end
on 2026-08-17 against a real inbox: sign-up returns a user without a session,
the mail arrives, the verify link answers 303 and `email_confirmed_at` is set.
Test accounts and inbox removed afterwards. Two facts came out of that test and
both now have an answer in the repo:

0. **Solved on 2026-08-17:** mail leaves through the Brevo relay as
   `Binder <no-reply@it-handwerk-stuttgart.de>` (domain already DKIM-signed in
   Cloudflare, SPF now includes `spf.brevo.com`), the hourly limit is 60, the
   four branded templates are live, and both deep links are in the redirect
   allow list. Proven by a real sign-up: branded mail delivered, link answered
   303 to `binder://confirm-email`, `email_confirmed_at` set, test account and
   inbox deleted. Brevo cannot switch off open/click measurement on
   transactional mail — only anonymise it, which is what the account does, and
   the privacy policy names Brevo and says so. **Amazon SES is the planned
   move** precisely because it measures nothing.

1. **The built-in Supabase mailer allowed two mails an hour.** A third sign-up in
   the same hour was refused with `over_email_send_rate_limit` (HTTP 429) —
   measured, not assumed. The fix is custom SMTP on the project. Brevo already
   authenticates `it-handwerk-stuttgart.de` (DKIM CNAMEs and the brevo-code TXT
   are in Cloudflare), so the sender is `no-reply@it-handwerk-stuttgart.de` and
   the credentials are the existing Brevo SMTP relay ones. **Setting this on the
   project needs the owner's Supabase access token** (rule 4: production config
   is his call), and until it is set, two confirmations an hour is the ceiling.
2. **The confirmation link now comes back into the app.** Sign-up passes
   `emailRedirectTo: binder://confirm-email`; `parseAuthCallback` accepts that
   host and `reset-password`, both PKCE-code-only, and a confirmation link can
   never unlock the password screen (tested). The URL still has to be added to
   the project's redirect allow list, or Supabase falls back to the site URL.

`auth.errors.rateLimit` exists in all fifteen locales, so somebody who hits the
ceiling reads their own language instead of "email rate limit exceeded".

`npm run mail:templates` generates the four branded mails in
`supabase/templates/` (confirm, magic link, recovery, address change): Binder's
dark ground, the lime button, the logo as a hosted PNG, table markup because a
mail client is a hostile renderer. CI fails if they drift from the generator.

**Google sign-in** is built in and deliberately invisible until it is
configured: `isGoogleSignInConfigured()` gates the button on
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, so no build ever shows a button that opens
a Google sheet and then fails. It removes the confirmation mail entirely —
Google has already proven the address — which also makes it the sign-in path
that survives a spent mail budget. What is still needed, all of it in the
owner's consoles: the Google provider enabled in Firebase (which creates the
web and Android OAuth clients), a refreshed `google-services.json`, the Play
app-signing SHA-1 registered on the Android client, and the web client id both
in Supabase's Google provider and in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
**Proven twice on the S23**: locally with v0.7.2-vc55, and from a Play install
with v0.7.5-vc58. The sheet opens, the account is chosen, the app lands in
Discover, and the owner's account carries both identities
(`app_metadata.providers = ['email','google']`) — Supabase linked Google to the
existing address rather than creating a second account.

**Three signing certificates are registered, and that is not one too many.**
Google matches package name plus signing certificate, so every certificate a
build can carry needs its own Android OAuth client:
`16dfdf3e…` (upload key, what a locally built APK carries), `f2bedb75…` (what
Play actually signs releases with) and `2aaaf1ab…` (the value the Play Console
displayed). The store build failed with DEVELOPER_ERROR until `f2bedb75…` was
added — and that value was read off the delivered APK with
`apksigner verify --print-certs` after pulling it from the phone via
`adb shell pm path`, not off a console page. **When a store install fails at
the Google sheet, read the certificate from the artefact, not from the UI.**
`auth.google.signature` names this failure in all fifteen languages and the
numeric code is logged, so the next time it is a log line.

## What the app collects

One balanced-accuracy location point, overwritten on every refresh — never a
track, never a history. First name, email, date of birth (the age is shown, the
date is not), gender and preferences, photos, messages. Since 2026-08-18 also
ten optional self-disclosed profile attributes (height, smoking, drinking,
drugs, exercise, diet, beliefs, children, wish for children, car — beliefs is
a GDPR Art. 9 category) and the filters a person sets over them. The audio
waves add voice recordings: RECORD_AUDIO is in the manifest as of vc75
(expo-audio; the image picker's remove-override is gone) — recordings ship
with waves 7/8 and the store's data-safety form must name attributes AND
voice before the next Play upload. Optional diagnostics are
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
10. **An auth event is not a sign-in.** Supabase emits `TOKEN_REFRESHED`,
    `USER_UPDATED`, `INITIAL_SESSION` and `SIGNED_IN` for a session nobody left,
    and `Root` discarded the legal gate, the open chat, the tab and the profile
    route on every one of them. An access token lasts an hour, so it threw the
    person back to Discover roughly hourly — and out of a running photo upload
    whenever the refresh landed during one, which is how a tester reported it
    ("two photos at once"). Only the user id behind the session may decide that.
11. **A request that never answers is worse than one that fails.** A failure
    reaches the screen; silence keeps a full-screen loading state forever. The
    legal gate had a retry for a bad answer and nothing at all for no answer,
    and that is what left "Checking Binder safety rules…" standing with no tab
    bar and no way out. Anything blocking a full-screen state needs a deadline.
12. **The diagnostics are evidence.** The proof that the call hung rather than
    failed was a *missing* `legal_gate_load` row in `private.beta_client_events`
    — neither `ok` nor `error`. Read that table before theorising.
13. **A per-account preference and a per-device permission are two claims.**
    `notifications.enabled` is stored per account and reaches every device; the
    Android permission belongs to one installation. Answering a refused
    permission by writing the preference would switch push off on the person's
    other phone. The screens read the device and say what they find; only a tap
    writes the preference.
14. **A deadline that has rejected can never resolve.** Wrapping a request and
    then waiting only on the wrapper throws away an answer that arrives a second
    late — the person keeps an error screen while the app holds the data. The
    request keeps its own handler; the deadline only decides when to stop
    waiting. And a Supabase query builder is lazy, so two watchers on the
    builder itself send the query twice: `Promise.resolve` it once first.
15. **Most of the ways push dies are returned, not thrown.** A refused
    permission and a dead network come back as ordinary values from
    `refreshPushRegistration`, so catching exceptions alone leaves the quietest
    failures quiet. And a granted permission proves nothing on its own — a
    registration that never reached the server looks identical from outside,
    which is why both screens now re-register while they are open. That call is
    an upsert on the installation id, so asking again is free and repairs it.

## Open

- **The privacy policy and the Play data-safety form do not yet name the ten
  profile attributes.** Since 2026-08-18 the app stores height, smoking,
  drinking, drugs, exercise, diet, beliefs, children, wish for children and
  car — all optional self-disclosures, but beliefs is a GDPR Art. 9 category
  and every one of them must be listed before the next store build ships.
  Voice recordings join that list with the audio waves.
- German copy for the Play listing.
- The listing's own screenshots, shot with staged profiles and framed —
  after the profile waves, since the profile looks different now.
